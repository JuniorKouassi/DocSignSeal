'use server';

import { eq } from 'drizzle-orm';
import { getCurrentContext } from '../auth/dal';
import { db } from '../db/client';
import { conversionJobs } from '../db/schema';
import { storeFile } from '../files/store';
import { convertOfficeDocumentToPdf } from '../gotenberg/client';

export type ConvertState = {
  errors?: Record<string, string>;
  jobId?: string;
} | undefined;

const ALLOWED_EXTENSIONS = ['doc', 'docx', 'odt', 'rtf'];
const MAX_BYTES = 25 * 1024 * 1024;

/* Build step 8, Word-to-PDF only (see lib/gotenberg/client.ts for why).
   Runs synchronously within the request rather than through a real queue --
   the conversion_jobs row still records the full queued/running/done/failed
   lifecycle from spec/schema-and-api.md, so switching to an actual
   background queue later needs no schema change, only a different caller. */
export async function convertWordToPdf(_state: ConvertState, formData: FormData): Promise<ConvertState> {
  const { user, organization } = await getCurrentContext();

  const file = formData.get('file');
  const errors: Record<string, string> = {};
  let extension: string | undefined;

  if (!(file instanceof File) || file.size === 0) {
    errors.file = 'Choose a Word document.';
  } else {
    extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      errors.file = 'Only .doc, .docx, .odt, or .rtf files are supported.';
    } else if (file.size > MAX_BYTES) {
      errors.file = 'File is larger than 25MB.';
    }
  }
  if (Object.keys(errors).length) return { errors };

  const upload = file as File;
  const bytes = Buffer.from(await upload.arrayBuffer());

  const sourceFile = await storeFile({
    organizationId: organization.id,
    bytes,
    mime: upload.type || 'application/octet-stream',
    extension,
  });

  const [job] = await db.insert(conversionJobs).values({
    organizationId: organization.id,
    userId: user.id,
    sourceFileId: sourceFile.id,
    targetFormat: 'pdf',
    status: 'running',
  }).returning();

  try {
    const pdfBytes = await convertOfficeDocumentToPdf(bytes, upload.name);
    const resultFile = await storeFile({ organizationId: organization.id, bytes: pdfBytes, mime: 'application/pdf', extension: 'pdf' });
    await db.update(conversionJobs)
      .set({ status: 'done', resultFileId: resultFile.id, finishedAt: new Date() })
      .where(eq(conversionJobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Conversion failed.';
    await db.update(conversionJobs)
      .set({ status: 'failed', error: message, finishedAt: new Date() })
      .where(eq(conversionJobs.id, job.id));
    return { errors: { file: message } };
  }

  return { jobId: job.id };
}
