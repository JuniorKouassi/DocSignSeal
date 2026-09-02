import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { documents, documentSigners } from '../db/schema';

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
