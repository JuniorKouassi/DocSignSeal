'use server';

import { redirect } from 'next/navigation';
import { and, eq, ne } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { issueToken } from '../../src/audit.mjs';
import { getCurrentContext } from '../auth/dal';
import { db } from '../db/client';
import { annotations, documents, documentFields, documentSigners, files } from '../db/schema';
import { getTemplate, getTemplateFields } from '../templates/queries';
import { appendAuditEvent } from '../audit/store';
import { sendSignerInvite } from '../email/send';
import { storeFile } from '../files/store';
import { getPageCount } from '../render/client';
import { convertOfficeDocumentToPdf } from '../gotenberg/client';
import { completeDocumentIfAllSigned } from './complete';
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

export type CreateSelfDocumentState = { errors?: Record<string, string> } | undefined;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
const OFFICE_EXTENSIONS = ['doc', 'docx', 'odt', 'rtf'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_PDF_MAX_EDGE = 1000; // points, ~US Letter/A4 scale -- a 4000x3000 camera photo used as-is would make an absurdly large page

/* A single photographed/picked page (the mobile "Scan" and "From Gallery"
   options) wrapped as its own one-page PDF, same as any other source file
   from here on. No text layer, no OCR -- this is a picture of a document,
   not a document; annotate/flatten only ever needs to draw marks on top of
   it, not read it. */
async function wrapImageAsPdf(bytes: Buffer, mime: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const image = mime === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const scale = Math.min(1, IMAGE_PDF_MAX_EDGE / Math.max(image.width, image.height));
  const width = image.width * scale;
  const height = image.height * scale;
  const page = pdf.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return Buffer.from(await pdf.save());
}

/* "Upload & sign": no template, no other signers, no email -- pick a PDF, a
   Word document, or a photo, land on its own annotate view
   (app/dashboard/documents/[id]/annotate) and place your own marks directly
   on it. The one signer is the uploader themselves; there is no token,
   since nothing outside this authenticated session ever needs to open this
   document. A Word file goes through the same Gotenberg conversion as
   lib/conversions/actions.ts's standalone "Convert a file" tool, and an
   image gets wrapped into a one-page PDF (wrapImageAsPdf) -- from here on
   the document is a PDF like any other, converted or not. */
export async function createSelfDocument(_state: CreateSelfDocumentState, formData: FormData): Promise<CreateSelfDocumentState> {
  const { user, organization } = await getCurrentContext();

  const title = String(formData.get('title') ?? '').trim();
  const file = formData.get('file');

  const errors: Record<string, string> = {};
  let extension: string | undefined;
  if (title.length < 2) errors.title = 'Name this document.';
  if (!(file instanceof File) || file.size === 0) {
    errors.file = 'Choose a file.';
  } else {
    const isPdf = file.type === 'application/pdf';
    const isImage = IMAGE_MIMES.includes(file.type);
    extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
    const isOffice = extension && OFFICE_EXTENSIONS.includes(extension);
    if (!isPdf && !isImage && !isOffice) errors.file = 'Only PDF, a photo, or .doc/.docx/.odt/.rtf files are supported.';
    else if (file.size > MAX_UPLOAD_BYTES) errors.file = 'File is larger than 25MB.';
  }
  if (Object.keys(errors).length) return { errors };

  const upload = file as File;
  const originalBytes = Buffer.from(await upload.arrayBuffer());
  const isPdf = upload.type === 'application/pdf';
  const isImage = IMAGE_MIMES.includes(upload.type);

  // A wrapped photo is already exactly one page -- known immediately,
  // no reason to also ask the render-service container to count it.
  let bytes: Buffer;
  let knownPageCount: number | null = null;
  if (isPdf) {
    bytes = originalBytes;
  } else if (isImage) {
    try {
      bytes = await wrapImageAsPdf(originalBytes, upload.type);
      knownPageCount = 1;
    } catch {
      return { errors: { file: 'Could not read this image.' } };
    }
  } else {
    try {
      bytes = await convertOfficeDocumentToPdf(originalBytes, upload.name);
    } catch {
      return { errors: { file: 'Could not convert this file to PDF. Is the conversion service reachable?' } };
    }
  }

  // getPageCount and storeFile each make their own outbound network call
  // (the render-service container; S3/R2) and don't depend on each other's
  // result -- pageCount only fills in a column on the row storeFile
  // inserts, it isn't needed to perform the upload itself. Running them
  // concurrently instead of back to back cuts one full network round trip
  // off the upload -- likely the single biggest code-level lever here;
  // Gotenberg conversion above (a real LibreOffice invocation) and a cold
  // Render container on either service are external latency this
  // application code can't compress further.
  const [pageCountOutcome, storedFile] = await Promise.all([
    knownPageCount !== null
      ? Promise.resolve({ ok: true as const, n: knownPageCount })
      : getPageCount(bytes).then((n) => ({ ok: true as const, n })).catch(() => ({ ok: false as const })),
    storeFile({ organizationId: organization.id, bytes, mime: 'application/pdf', extension: 'pdf' }),
  ]);

  if (!pageCountOutcome.ok) {
    return { errors: { file: 'Could not read this PDF. Is it valid?' } };
  }
  const pageCount = pageCountOutcome.n;
  await db.update(files).set({ pageCount }).where(eq(files.id, storedFile.id));

  const documentId = await db.transaction(async (tx) => {
    const [document] = await tx.insert(documents).values({
      organizationId: organization.id,
      createdBy: user.id,
      title,
      sourceFileId: storedFile.id,
      routing: 'sequential',
      status: 'draft',
    }).returning({ id: documents.id });

    await tx.insert(documentSigners).values({
      documentId: document.id,
      orderIndex: 0,
      name: user.name,
      email: user.email,
      roleLabel: 'You',
      status: 'pending',
    });

    return document.id;
  });

  await appendAuditEvent({ document_id: documentId, event: 'document.created', actor: user.email });
  await db.update(documents).set({ status: 'sent' }).where(eq(documents.id, documentId));
  await appendAuditEvent({ document_id: documentId, event: 'document.sent', actor: user.email });

  redirect(`/dashboard/documents/${documentId}/annotate`);
}

export type CompleteSelfSignedResult = { ok: true } | { ok: false; error: string };

/* The annotate view's "Save": marks the uploader's own signer row signed
   (an authenticated first-party action, not the token-gated
   completeSigning() in lib/signing/actions.ts -- there is no token here to
   resolve) once at least one signature annotation has been placed, then
   defers to the same completeDocumentIfAllSigned() every other document
   uses, so flatten/seal/certificate behave identically either way. */
export async function completeSelfSignedDocument(documentId: string): Promise<CompleteSelfSignedResult> {
  const { user, organization } = await getCurrentContext();

  const document = await getDocument(documentId, organization.id);
  if (!document) return { ok: false, error: 'Document not found.' };
  if (document.status === 'completed') return { ok: false, error: 'This document is already completed.' };

  const signers = await getDocumentSigners(documentId);
  const signer = signers.find((s) => s.email === user.email);
  if (!signer) return { ok: false, error: 'You are not a signer on this document.' };

  const placedSignatures = await db.select().from(annotations)
    .where(and(eq(annotations.documentId, documentId), eq(annotations.type, 'signature')));
  if (placedSignatures.length === 0) return { ok: false, error: 'Place your signature on the document first.' };

  const [claimed] = await db.update(documentSigners)
    .set({ status: 'signed', signedAt: new Date() })
    .where(and(eq(documentSigners.id, signer.id), ne(documentSigners.status, 'signed')))
    .returning({ id: documentSigners.id });
  if (!claimed) return { ok: false, error: 'You already signed this document.' };

  await appendAuditEvent({
    document_id: documentId,
    signer_id: signer.id,
    event: 'signer.signed',
    actor: signer.email,
    meta: { consent: true, method: 'self' },
  });

  await completeDocumentIfAllSigned(documentId);

  return { ok: true };
}
