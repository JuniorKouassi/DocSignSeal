import 'server-only';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { files } from '../db/schema';
import { encryptFile, decryptFile } from '../storage/encryption';
import { generateStorageKey, putObject, getObject } from '../storage/s3';

/* Single place that turns raw bytes into a row in `files` plus an encrypted
   object in the bucket. Every feature that accepts an upload (templates now;
   signatures, stamps, and documents later) should go through this rather
   than talking to S3 or the files table directly. */
export async function storeFile(opts: {
  organizationId: string;
  bytes: Buffer;
  mime: string;
  extension?: string;
  pageCount?: number;
}) {
  const sha256 = createHash('sha256').update(opts.bytes).digest('hex');
  const { ciphertext, wrappedKey } = encryptFile(opts.bytes);
  const storageKey = generateStorageKey(opts.organizationId, opts.extension ?? '');

  await putObject(storageKey, ciphertext, opts.mime);

  const [file] = await db.insert(files).values({
    organizationId: opts.organizationId,
    storageKey,
    mime: opts.mime,
    bytes: opts.bytes.length,
    sha256,
    pageCount: opts.pageCount,
    encryptedKey: wrappedKey,
  }).returning();

  return file;
}

export async function readFileBytes(fileId: string, organizationId: string): Promise<Buffer> {
  const rows = await db.select().from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  const file = rows[0];
  if (!file || file.organizationId !== organizationId) {
    throw new Error('File not found');
  }
  const ciphertext = await getObject(file.storageKey);
  return decryptFile(ciphertext, file.encryptedKey);
}

export async function getFileMeta(fileId: string, organizationId: string) {
  const rows = await db.select().from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  const file = rows[0];
  if (!file || file.organizationId !== organizationId) return null;
  return file;
}
