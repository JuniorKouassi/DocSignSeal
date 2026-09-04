import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { flatten } from '../../src/flatten.mjs';
import { sealDocument } from '../../src/audit.mjs';
import { toAnnotation } from '../../src/document-fields.mjs';
import { db } from '../db/client';
import { annotations, documents, documentFields, documentSigners, signatures, stamps } from '../db/schema';
import { readFileBytes, storeFile } from '../files/store';
import { appendAuditEvent, getDocumentAuditEvents, verifyDocumentChain } from '../audit/store';

/* HANDOFF.md build step 6: "Call flatten(), then sealDocument(), store the
   completed file, write document.completed." Called after every
   signer.signed transition; a no-op unless this was the last signer.
   Guarded by a conditional UPDATE (status must still be sent/in_progress)
   so two signers completing at nearly the same instant under parallel
   routing can't both flatten and seal the document. */
export async function completeDocumentIfAllSigned(documentId: string) {
  const signers = await db.select().from(documentSigners).where(eq(documentSigners.documentId, documentId));
  if (signers.length === 0 || !signers.every((s) => s.status === 'signed')) return { completed: false as const };

  const docs = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const doc = docs[0];
  if (!doc || doc.status === 'completed') return { completed: doc?.status === 'completed', alreadyCompleted: true } as const;

  const fields = await db.select().from(documentFields).where(eq(documentFields.documentId, documentId));
  const fieldAnnotations = fields
    .map(toAnnotation)
    .filter((a): a is NonNullable<ReturnType<typeof toAnnotation>> => a !== null);

  // Freely-placed marks (build step 7's stamps, plus signatures and dates
  // placed via the "sign it ourselves" annotate view) -- unlike
  // document_fields, no placeholder existed in advance for any of these.
  // Stamps and signatures both reference an asset (a stamp's or a personal
  // signature's PNG); dates carry their text directly on the row.
  const placedRows = await db.select().from(annotations)
    .where(and(eq(annotations.documentId, documentId), inArray(annotations.type, ['stamp', 'signature', 'date'])));

  const assets: Record<string, Uint8Array> = {};
  const placedAnnotations = [];
  for (const row of placedRows) {
    if (row.type === 'date') {
      placedAnnotations.push({
        type: 'date',
        value_text: row.valueText,
        page: row.page,
        x: row.x, y: row.y, w: row.w, h: row.h,
        rotation: row.rotation,
        z_index: row.zIndex,
        applied_to_all_pages: row.appliedToAllPages,
      });
      continue;
    }

    if (!row.refId) continue;
    const asset = row.type === 'stamp'
      ? (await db.select().from(stamps).where(eq(stamps.id, row.refId)).limit(1))[0]
      : (await db.select().from(signatures).where(eq(signatures.id, row.refId)).limit(1))[0];
    if (!asset) continue;
    if (!(asset.fileId in assets)) {
      assets[asset.fileId] = await readFileBytes(asset.fileId, doc.organizationId);
    }
    placedAnnotations.push({
      type: row.type,
      ref_file_id: asset.fileId,
      page: row.page,
      x: row.x, y: row.y, w: row.w, h: row.h,
      rotation: row.rotation,
      z_index: row.zIndex,
      applied_to_all_pages: row.appliedToAllPages,
    });
  }

  const allAnnotations = [...fieldAnnotations, ...placedAnnotations];

  const sourceBytes = await readFileBytes(doc.sourceFileId, doc.organizationId);
  const events = await getDocumentAuditEvents(documentId);

  const certificate = {
    documentTitle: doc.title,
    documentId: doc.id,
    signers: signers.map((s) => ({
      name: s.name,
      email: s.email,
      status: s.status,
      signed_at: s.signedAt ? s.signedAt.toISOString() : null,
      auth_method: s.authMethod,
      ip: s.ip ?? null,
    })),
    events,
  };

  // flatten.mjs is untyped JS; TS infers its options' types too narrowly
  // from their default values alone (e.g. `certificate = null` infers as
  // exactly `null`), not from how the function actually uses them.
  const { bytes, sha256 } = await flatten({ sourceBytes, annotations: allAnnotations, assets, certificate } as unknown as Parameters<typeof flatten>[0]);

  const chain = await verifyDocumentChain(documentId);
  const seal = sealDocument(chain.ok ? chain.head : null, sha256);

  const completedFile = await storeFile({
    organizationId: doc.organizationId,
    bytes: Buffer.from(bytes),
    mime: 'application/pdf',
    extension: 'pdf',
  });

  const [claimed] = await db.update(documents)
    .set({ status: 'completed', completedFileId: completedFile.id, completedAt: new Date(), contentSha256: sha256, seal })
    .where(and(eq(documents.id, documentId), inArray(documents.status, ['sent', 'in_progress'])))
    .returning({ id: documents.id });

  if (!claimed) return { completed: true as const, alreadyCompleted: true as const };

  await appendAuditEvent({ document_id: documentId, event: 'document.completed', actor: 'system', meta: { seal } });

  return { completed: true as const };
}
