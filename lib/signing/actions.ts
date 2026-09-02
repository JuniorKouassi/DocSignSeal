'use server';

import { and, eq, ne } from 'drizzle-orm';
import { appendAuditEvent, resolveSignerToken } from '../audit/store';
import { db } from '../db/client';
import { documents, documentFields, documentSigners } from '../db/schema';
import { storeFile } from '../files/store';
import { completeDocumentIfAllSigned } from '../documents/complete';

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

    // draft ──send──> sent ──first view──> in_progress, per the status
    // transition diagram in spec/schema-and-api.md.
    await db.update(documents)
      .set({ status: 'in_progress' })
      .where(and(eq(documents.id, document.id), eq(documents.status, 'sent')));
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

function fieldSatisfied(field: typeof documentFields.$inferSelect): boolean {
  switch (field.type) {
    case 'signature':
    case 'initials':
      return Array.isArray(field.strokeData) && field.strokeData.length > 0;
    case 'attachment':
      return field.valueFileId != null;
    case 'checkbox':
      return field.valueText === 'true';
    default:
      return typeof field.valueText === 'string' && field.valueText.trim().length > 0;
  }
}

/* spec/schema-and-api.md: POST /sign/:token/complete { consent: true,
   signature_field_id }. Marks this signer done, then checks whether every
   signer on the document is now done -- if so, triggers HANDOFF.md build
   step 6 (flatten, seal, store, document.completed). */
export async function completeSigning(rawToken: string, consent: boolean, signatureFieldId: string): Promise<SaveFieldResult> {
  if (!consent) return { ok: false, error: 'Consent is required to complete signing.' };

  const resolution = await resolveSignerToken(rawToken);
  if (!resolution.ok) return { ok: false, error: resolution.reason };
  if (!resolution.editable) return { ok: false, error: 'Not your turn to sign yet.' };

  const { document, signer } = resolution;

  const myFields = await db.select().from(documentFields)
    .where(and(eq(documentFields.documentId, document.id), eq(documentFields.signerId, signer.id)));

  const signatureField = myFields.find((f) => f.id === signatureFieldId && (f.type === 'signature' || f.type === 'initials'));
  if (!signatureField) return { ok: false, error: 'Choose a valid signature field.' };
  if (!Array.isArray(signatureField.strokeData) || signatureField.strokeData.length === 0) {
    return { ok: false, error: 'Draw your signature first.' };
  }

  const missing = myFields.filter((f) => f.required && !fieldSatisfied(f));
  if (missing.length) {
    return { ok: false, error: `Fill in ${missing.length} more required field${missing.length === 1 ? '' : 's'} first.` };
  }

  const [claimed] = await db.update(documentSigners)
    .set({ status: 'signed', signedAt: new Date() })
    .where(and(eq(documentSigners.id, signer.id), ne(documentSigners.status, 'signed')))
    .returning({ id: documentSigners.id });
  if (!claimed) return { ok: false, error: 'You already signed this document.' };

  await appendAuditEvent({
    document_id: document.id,
    signer_id: signer.id,
    event: 'signer.signed',
    actor: signer.email,
    meta: { signature_field_id: signatureFieldId, consent: true },
  });

  await completeDocumentIfAllSigned(document.id);

  return { ok: true };
}
