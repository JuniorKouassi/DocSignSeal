'use server';

import { redirect } from 'next/navigation';
import { getCurrentContext } from '../auth/dal';
import { storeFile } from '../files/store';
import { db } from '../db/client';
import { templates } from '../db/schema';
import { getPageCount } from '../render/client';

export type UploadTemplateState = {
  errors?: Record<string, string>;
} | undefined;

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export async function uploadTemplate(_state: UploadTemplateState, formData: FormData): Promise<UploadTemplateState> {
  const { user, organization } = await getCurrentContext();

  const name = String(formData.get('name') ?? '').trim();
  const file = formData.get('file');
  const roleLabels = formData.getAll('roleLabel').map((v) => String(v).trim()).filter(Boolean);

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = 'Name this template.';
  if (!(file instanceof File) || file.size === 0) errors.file = 'Choose a PDF file.';
  else if (file.type !== 'application/pdf') errors.file = 'Only PDF files are supported right now.';
  else if (file.size > MAX_BYTES) errors.file = 'File is larger than 25MB.';
  if (roleLabels.length < 1) errors.roleLabel = 'Add at least one signer role.';
  if (Object.keys(errors).length) return { errors };

  const bytes = Buffer.from(await (file as File).arrayBuffer());

  let pageCount: number;
  try {
    pageCount = await getPageCount(bytes);
  } catch {
    return { errors: { file: 'Could not read this PDF. Is it valid?' } };
  }

  const storedFile = await storeFile({
    organizationId: organization.id,
    bytes,
    mime: 'application/pdf',
    extension: 'pdf',
    pageCount,
  });

  const [template] = await db.insert(templates).values({
    organizationId: organization.id,
    createdBy: user.id,
    name,
    fileId: storedFile.id,
    pageCount,
    signerRoles: roleLabels.map((label, index) => ({ index, label })),
  }).returning({ id: templates.id });

  redirect(`/dashboard/templates/${template.id}`);
}
