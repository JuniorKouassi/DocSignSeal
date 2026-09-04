import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { signatures } from '../db/schema';

export async function listSignatures(userId: string) {
  return db.select().from(signatures)
    .where(eq(signatures.userId, userId))
    .orderBy(desc(signatures.isDefault), desc(signatures.createdAt));
}

export async function getSignature(signatureId: string, userId: string) {
  const rows = await db.select().from(signatures)
    .where(and(eq(signatures.id, signatureId), eq(signatures.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
