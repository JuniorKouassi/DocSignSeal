import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { annotations, documentFields, documents, documentSigners } from '../db/schema';

export async function listDocuments(organizationId: string) {
  return db.select().from(documents)
    .where(eq(documents.organizationId, organizationId))
    .orderBy(desc(documents.createdAt));
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
