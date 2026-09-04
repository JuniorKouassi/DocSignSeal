import 'server-only';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { annotations, documentFields, documents, documentSigners } from '../db/schema';

/* Documents is the working list: everything not yet completed (draft, sent,
   in_progress, declined, voided, expired). Once a document reaches
   'completed' it moves to the Templates tab's register instead -- see
   listCompletedDocuments. */
export async function listDocuments(organizationId: string) {
  return db.select().from(documents)
    .where(and(eq(documents.organizationId, organizationId), ne(documents.status, 'completed')))
    .orderBy(desc(documents.createdAt));
}

/* Everything that's reached 'completed' -- what the Templates tab now
   shows: a register of finished, sealed documents, not the reusable
   field-layout list it used to be. */
export async function listCompletedDocuments(organizationId: string) {
  return db.select().from(documents)
    .where(and(eq(documents.organizationId, organizationId), eq(documents.status, 'completed')))
    .orderBy(desc(documents.completedAt));
}

export async function getDocument(documentId: string, organizationId: string) {
  const rows = await db.select().from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDocumentSigners(documentId: string) {
  return db.select().from(documentSigners)
    .where(eq(documentSigners.documentId, documentId))
    .orderBy(asc(documentSigners.orderIndex));
}

/* Every field on the document, each paired with its owning signer's status.
   The signer view needs both: this signer's own fields (editable), and every
   other signer's fields, visible only once that signer has actually signed
   -- never writable, per spec. */
export async function getDocumentFieldsWithSignerStatus(documentId: string) {
  const rows = await db.select({ field: documentFields, signerStatus: documentSigners.status })
    .from(documentFields)
    .innerJoin(documentSigners, eq(documentSigners.id, documentFields.signerId))
    .where(eq(documentFields.documentId, documentId))
    .orderBy(asc(documentFields.page), asc(documentFields.sortOrder));
  return rows.map((r) => ({ ...r.field, signerStatus: r.signerStatus }));
}

export async function listAnnotations(documentId: string) {
  return db.select().from(annotations).where(eq(annotations.documentId, documentId));
}
