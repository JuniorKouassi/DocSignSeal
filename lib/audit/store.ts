import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { appendEvent, verifyChain, resolveToken } from '../../src/audit.mjs';
import { db } from '../db/client';
import { auditEvents, documents, documentSigners } from '../db/schema';

/* Adapts src/audit.mjs's storage-agnostic engine to Postgres via Drizzle.
   audit.mjs works in snake_case (document_id, token_hash, prev_hash, ...) to
   stay database-agnostic; this file is the only place that translates
   between that and Drizzle's camelCase schema. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Queryable = typeof db | Tx;

function buildStore(client: Queryable) {
  return {
    async lastEvent(documentId: string) {
      const rows = await client.select().from(auditEvents)
        .where(eq(auditEvents.documentId, documentId))
        .orderBy(desc(auditEvents.id))
        .limit(1);
      const row = rows[0];
      return row ? { ...row, created_at: row.createdAt.toISOString(), document_id: row.documentId, signer_id: row.signerId, prev_hash: row.prevHash } : null;
    },

    async insertEvent(entry: {
      document_id: string;
      signer_id?: string | null;
      event: string;
      actor?: string | null;
      ip?: string | null;
      meta?: Record<string, unknown>;
      created_at: string;
      prev_hash: string | null;
      hash: string;
    }) {
      await client.insert(auditEvents).values({
        documentId: entry.document_id,
        signerId: entry.signer_id ?? null,
        event: entry.event,
        actor: entry.actor ?? null,
        ip: entry.ip ?? null,
        meta: entry.meta ?? {},
        createdAt: new Date(entry.created_at),
        prevHash: entry.prev_hash,
        hash: entry.hash,
      });
    },

    async listEvents(documentId: string) {
      const rows = await client.select().from(auditEvents)
        .where(eq(auditEvents.documentId, documentId))
        .orderBy(auditEvents.id);
      return rows.map((row: typeof auditEvents.$inferSelect) => ({
        ...row,
        created_at: row.createdAt.toISOString(),
        document_id: row.documentId,
        signer_id: row.signerId,
        prev_hash: row.prevHash,
      }));
    },

    async findSignerByTokenHash(hash: string) {
      const rows = await client.select().from(documentSigners)
        .where(eq(documentSigners.tokenHash, hash))
        .limit(1);
      const row = rows[0];
      return row ? {
        ...row,
        document_id: row.documentId,
        order_index: row.orderIndex,
        token_hash: row.tokenHash,
      } : null;
    },

    async getDocument(documentId: string) {
      const rows = await client.select().from(documents).where(eq(documents.id, documentId)).limit(1);
      const row = rows[0];
      return row ? { ...row, expires_at: row.expiresAt } : null;
    },

    async listSigners(documentId: string) {
      const rows = await client.select().from(documentSigners)
        .where(eq(documentSigners.documentId, documentId));
      return rows.map((row: typeof documentSigners.$inferSelect) => ({
        ...row,
        document_id: row.documentId,
        order_index: row.orderIndex,
      }));
    },
  };
}

/* HANDOFF.md non-negotiable #5: appendEvent must run inside a transaction
   that locks the document row with SELECT ... FOR UPDATE, or concurrent
   appends fork the chain. The lock is held for the lifetime of this
   transaction, so the read-last-hash-then-insert that appendEvent() does
   is serialized against any other append on the same document. */
export async function appendAuditEvent(e: {
  document_id: string;
  signer_id?: string | null;
  event: string;
  actor?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from documents where id = ${e.document_id} for update`);
    return appendEvent(buildStore(tx), e);
  });
}

export async function verifyDocumentChain(documentId: string) {
  return verifyChain(buildStore(db), documentId);
}

export async function resolveSignerToken(rawToken: string) {
  return resolveToken(buildStore(db), rawToken);
}

export async function getDocumentAuditEvents(documentId: string) {
  return buildStore(db).listEvents(documentId);
}
