'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { issueToken } from '../../src/audit.mjs';
import { getCurrentContext } from '../auth/dal';
import { db } from '../db/client';
import { documents, documentFields, documentSigners } from '../db/schema';
import { getTemplate, getTemplateFields } from '../templates/queries';
import { appendAuditEvent } from '../audit/store';
import { sendSignerInvite } from '../email/send';
import { getDocument, getDocumentSigners } from './queries';

export type CreateDocumentState = { errors?: Record<string, string> } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createDocument(templateId: string, _state: CreateDocumentState, formData: FormData): Promise<CreateDocumentState> {
  const { user, organization } = await getCurrentContext();

  const template = await getTemplate(templateId, organization.id);
  if (!template) return { errors: { title: 'Template not found.' } };

  const title = String(formData.get('title') ?? '').trim();
  const routing = formData.get('routing') === 'parallel' ? 'parallel' : 'sequential';
  const expiresInDays = Number(formData.get('expiresInDays') ?? 14);

  const errors: Record<string, string> = {};
  if (title.length < 2) errors.title = 'Name this document.';

  const signerInputs = template.signerRoles.map((role) => ({
    role,
    name: String(formData.get(`signerName_${role.index}`) ?? '').trim(),
    email: String(formData.get(`signerEmail_${role.index}`) ?? '').trim().toLowerCase(),
  }));

  for (const s of signerInputs) {
    if (s.name.length < 1) errors[`signerName_${s.role.index}`] = `Enter a name for ${s.role.label}.`;
    if (!EMAIL_RE.test(s.email)) errors[`signerEmail_${s.role.index}`] = `Enter a valid email for ${s.role.label}.`;
  }
  if (Object.keys(errors).length) return { errors };

  const templateFieldRows = await getTemplateFields(templateId);

  const documentId = await db.transaction(async (tx) => {
    const [document] = await tx.insert(documents).values({
      organizationId: organization.id,
      templateId: template.id,
      createdBy: user.id,
      title,
      sourceFileId: template.fileId,
      routing,
      status: 'draft',
      expiresAt: expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null,
    }).returning({ id: documents.id });

    const insertedSigners = await tx.insert(documentSigners).values(signerInputs.map((s) => ({
      documentId: document.id,
      orderIndex: s.role.index,
      name: s.name,
      email: s.email,
      roleLabel: s.role.label,
      status: 'pending' as const,
    }))).returning({ id: documentSigners.id, orderIndex: documentSigners.orderIndex });

    const signerIdByRoleIndex = new Map(insertedSigners.map((s) => [s.orderIndex, s.id]));

    if (templateFieldRows.length) {
      await tx.insert(documentFields).values(templateFieldRows.map((f) => ({
        documentId: document.id,
        signerId: signerIdByRoleIndex.get(f.signerIndex)!,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        type: f.type,
        required: f.required,
        meta: f.meta,
        sortOrder: f.sortOrder,
      })));
    }

    return document.id;
  });

  await appendAuditEvent({ document_id: documentId, event: 'document.created', actor: user.email });

  redirect(`/dashboard/documents/${documentId}`);
}

export type SendDocumentResult = { ok: true } | { ok: false; error: string };

/* Issues a signer token the same way as spec/schema-and-api.md: 32 random
   bytes, only the SHA-256 hash stored, the raw value going out in an email
   and never persisted anywhere. */
export async function sendDocument(documentId: string): Promise<SendDocumentResult> {
  const { user, organization } = await getCurrentContext();

  const document = await getDocument(documentId, organization.id);
  if (!document) return { ok: false, error: 'Document not found.' };
  if (document.status !== 'draft') return { ok: false, error: 'Only a draft document can be sent.' };

  const signers = await getDocumentSigners(documentId);
  const tokensBySignerId = new Map(signers.map((s) => [s.id, issueToken()]));

  await db.transaction(async (tx) => {
    for (const signer of signers) {
      await tx.update(documentSigners)
        .set({ tokenHash: tokensBySignerId.get(signer.id)!.token_hash })
        .where(eq(documentSigners.id, signer.id));
    }
    await tx.update(documents).set({ status: 'sent' }).where(eq(documents.id, documentId));
  });

  await appendAuditEvent({ document_id: documentId, event: 'document.sent', actor: user.email });

  for (const signer of signers) {
    const raw = tokensBySignerId.get(signer.id)!.raw;
    await appendAuditEvent({ document_id: documentId, signer_id: signer.id, event: 'signer.link_issued', actor: 'system' });
    try {
      await sendSignerInvite({
        to: signer.email,
        signerName: signer.name,
        documentTitle: document.title,
        senderName: user.name,
        organizationName: organization.name,
        rawToken: raw,
      });
    } catch {
      // Best-effort for MVP: the link is issued and valid even if this
      // particular email attempt failed. A resend/reminder flow (spec's
      // reminder.sent event) is a later feature, not step 4's job.
    }
  }

  return { ok: true };
}

/* "Sign yourself": creates the document, issues the one signer's token, and
   redirects straight into /sign/[token] in the same request -- no send
   form, no email round-trip. Only valid for a single-signer template: with
   more than one role, the document genuinely needs someone else's name and
   email, which this shortcut has no form for. The document still passes
   through draft -> sent with the same audit events as the normal path
   (createDocument + sendDocument combined) so its audit trail and status
   machine look identical to any other document -- nothing downstream
   (getSigningView, sealDocument, the certificate) needs to know it was
   self-signed. */
export async function signAsSelf(templateId: string) {
  const { user, organization } = await getCurrentContext();

  const template = await getTemplate(templateId, organization.id);
  if (!template) throw new Error('Template not found.');
  if (template.signerRoles.length !== 1) {
    throw new Error('"Sign yourself" only works for a template with a single signer role.');
  }

  const templateFieldRows = await getTemplateFields(templateId);
  const role = template.signerRoles[0];

  const { documentId, signerId } = await db.transaction(async (tx) => {
    const [document] = await tx.insert(documents).values({
      organizationId: organization.id,
      templateId: template.id,
      createdBy: user.id,
      title: template.name,
      sourceFileId: template.fileId,
      routing: 'sequential',
      status: 'draft',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    }).returning({ id: documents.id });

    const [signer] = await tx.insert(documentSigners).values({
      documentId: document.id,
      orderIndex: role.index,
      name: user.name,
      email: user.email,
      roleLabel: role.label,
      status: 'pending',
    }).returning({ id: documentSigners.id });

    if (templateFieldRows.length) {
      await tx.insert(documentFields).values(templateFieldRows.map((f) => ({
        documentId: document.id,
        signerId: signer.id,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        type: f.type,
        required: f.required,
        meta: f.meta,
        sortOrder: f.sortOrder,
      })));
    }

    return { documentId: document.id, signerId: signer.id };
  });

  await appendAuditEvent({ document_id: documentId, event: 'document.created', actor: user.email });

  const { token_hash, raw } = issueToken();
  await db.transaction(async (tx) => {
    await tx.update(documentSigners).set({ tokenHash: token_hash }).where(eq(documentSigners.id, signerId));
    await tx.update(documents).set({ status: 'sent' }).where(eq(documents.id, documentId));
  });

  await appendAuditEvent({ document_id: documentId, event: 'document.sent', actor: user.email });
  await appendAuditEvent({ document_id: documentId, signer_id: signerId, event: 'signer.link_issued', actor: 'system' });

  redirect(`/sign/${raw}`);
}
