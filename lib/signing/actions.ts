'use server';

import { eq } from 'drizzle-orm';
import { appendAuditEvent, resolveSignerToken } from '../audit/store';
import { db } from '../db/client';
import { documents, documentFields, documentSigners } from '../db/schema';
import { storeFile } from '../files/store';

/* Everything here is gated by the signer's own token, resolved fresh on
   every call -- never by a login session. This is the signer-facing half of
   spec/schema-and-api.md's API (the `/sign/:token/...` family), matching
   its rule: the signer sends a value keyed by field id, never a position,
   and the server decides whether that field is even theirs to write. */

export type SigningViewResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      editable: boolean;
      waitingFor?: string;
      document: typeof documents.$inferSelect;
      signer: typeof documentSigners.$inferSelect;
      fields: (typeof documentFields.$inferSelect & { signerStatus: string })[];
    };

export async function getSigningView(rawToken: string): Promise<SigningViewResult> {
  const resolution = await resolveSignerToken(rawToken);
  if (!resolution.ok) return { ok: false, reason: resolution.reason };

  const { document, signer, editable, waitingFor } = resolution;

  if (signer.status === 'pending') {
    await db.update(documentSigners)
      .set({ status: 'viewed', viewedAt: new Date() })
      .where(eq(documentSigners.id, signer.id));
    await appendAuditEvent({ document_id: document.id, signer_id: signer.id, event: 'signer.viewed', actor: signer.email });
  }

  const rows = await db.select({ field: documentFields, signerStatus: documentSigners.status })
    .from(documentFields)
    .innerJoin(documentSigners, eq(documentSigners.id, documentFields.signerId))
    .where(eq(documentFields.documentId, document.id));
  const fields = rows.map((r) => ({ ...r.field, signerStatus: r.signerStatus }));

  return { ok: true, editable: editable === true, waitingFor, document, signer, fields };
}

export type SaveFieldResult = { ok: true } | { ok: false; error: string };

export async function saveFieldValue(
  rawToken: string,
  fieldId: string,
  input: { valueText?: string; strokeData?: { x: number; y: number }[][] }
): Promise<SaveFieldResult> {
  const resolution = await resolveSignerToken(rawToken);
  if (!resolution.ok) return { ok: false, error: resolution.reason };
  if (!resolution.editable) return { ok: false, error: 'Not your turn to sign yet.' };

  const { document, signer } = resolution;

  const rows = await db.select().from(documentFields).where(eq(documentFields.id, fieldId)).limit(1);
  const field = rows[0];
  if (!field || field.documentId !== document.id || field.signerId !== signer.id) {
    return { ok: false, error: 'This field does not belong to you.' };
  }

  const isDrawn = field.type === 'signature' || field.type === 'initials';
  if (input.strokeData && !isDrawn) return { ok: false, error: 'This field is not drawable.' };
  if (input.valueText !== undefined && isDrawn) return { ok: false, error: 'This field needs a drawing, not text.' };

  await db.update(documentFields)
    .set({
      valueText: input.valueText ?? field.valueText,
      strokeData: input.strokeData ?? field.strokeData,
      signedAt: new Date(),
    })
    .where(eq(documentFields.id, fieldId));

  await appendAuditEvent({
    document_id: document.id,
    signer_id: signer.id,
    event: 'field.filled',
    actor: signer.email,
    meta: { field_id: fieldId, type: field.type },
  });

  return { ok: true };
}

export async function uploadAttachment(rawToken: string, fieldId: string, formData: FormData): Promise<SaveFieldResult> {
  const resolution = await resolveSignerToken(rawToken);
  if (!resolution.ok) return { ok: false, error: resolution.reason };
  if (!resolution.editable) return { ok: false, error: 'Not your turn to sign yet.' };

  const { document, signer } = resolution;

  const rows = await db.select().from(documentFields).where(eq(documentFields.id, fieldId)).limit(1);
  const field = rows[0];
  if (!field || field.documentId !== document.id || field.signerId !== signer.id) {
    return { ok: false, error: 'This field does not belong to you.' };
  }
  if (field.type !== 'attachment') return { ok: false, error: 'This field does not accept a file.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a file.' };
  if (file.size > 15 * 1024 * 1024) return { ok: false, error: 'File is larger than 15MB.' };

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.name.includes('.') ? file.name.split('.').pop() : undefined;
  const stored = await storeFile({ organizationId: document.organizationId, bytes, mime: file.type || 'application/octet-stream', extension });

  await db.update(documentFields)
    .set({ valueFileId: stored.id, signedAt: new Date() })
    .where(eq(documentFields.id, fieldId));

  await appendAuditEvent({
    document_id: document.id,
    signer_id: signer.id,
    event: 'field.filled',
    actor: signer.email,
    meta: { field_id: fieldId, type: 'attachment' },
  });

  return { ok: true };
}

export async function declineSigning(rawToken: string, reason: string): Promise<SaveFieldResult> {
  const resolution = await resolveSignerToken(rawToken);
  if (!resolution.ok) return { ok: false, error: resolution.reason };

  const { document, signer } = resolution;

  await db.update(documentSigners)
    .set({ status: 'declined', declineReason: reason })
    .where(eq(documentSigners.id, signer.id));
  await db.update(documents).set({ status: 'declined' }).where(eq(documents.id, document.id));

  await appendAuditEvent({
    document_id: document.id,
    signer_id: signer.id,
    event: 'signer.declined',
    actor: signer.email,
    meta: { reason },
  });

  return { ok: true };
}
