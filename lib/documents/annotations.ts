'use server';

import { and, eq } from 'drizzle-orm';
import { getCurrentContext } from '../auth/dal';
import { db } from '../db/client';
import { annotations, documentFields } from '../db/schema';
import { appendAuditEvent } from '../audit/store';
import { canApplyStamp, getStamp } from '../stamps/queries';
import { getSignature } from '../signatures/queries';
import { getDocument } from './queries';

export type ApplyStampResult = { ok: true } | { ok: false; error: string };

const STAMP_DEFAULT_SIZE = { w: 15, h: 15 };

async function nextZIndex(documentId: string): Promise<number> {
  const existing = await db.select().from(annotations).where(eq(annotations.documentId, documentId));
  return existing.reduce((max, a) => Math.max(max, a.zIndex), 0) + 1;
}

/* POST /api/stamps (application side, not upload) in spec/schema-and-api.md's
   addendum: "must verify the caller has a stamp_permissions row with
   can_apply = true, and that the stamp's organization matches the
   document's. Two checks, both server side, no exceptions." Never inferred
   from org admin/owner role -- HANDOFF.md non-negotiable #6. */
export async function applyStamp(
  documentId: string,
  stampId: string,
  page: number,
  x: number,
  y: number,
  opts: { w?: number; h?: number; appliedToAllPages?: boolean; rotation?: number } = {}
): Promise<ApplyStampResult> {
  const { user, organization } = await getCurrentContext();

  const document = await getDocument(documentId, organization.id);
  if (!document) return { ok: false, error: 'Document not found.' };
  if (page < 1 || page > 1000 || !Number.isInteger(page)) return { ok: false, error: 'Invalid page.' };

  const stamp = await getStamp(stampId, organization.id);
  if (!stamp) return { ok: false, error: 'Stamp not found in this organization.' };

  const allowed = await canApplyStamp(stampId, user.id);
  if (!allowed) return { ok: false, error: 'You do not have permission to apply this stamp.' };

  if (stamp.requiresCountersignature) {
    const signedFieldsOnPage = await db.select().from(documentFields)
      .where(and(eq(documentFields.documentId, documentId), eq(documentFields.page, page)));
    const hasSignatureOnPage = signedFieldsOnPage.some((f) =>
      (f.type === 'signature' || f.type === 'initials') && Array.isArray(f.strokeData) && f.strokeData.length > 0
    );
    if (!hasSignatureOnPage) {
      return { ok: false, error: 'This stamp requires a signature on the same page first.' };
    }
  }

  await db.insert(annotations).values({
    documentId,
    createdBySignerId: null,
    type: 'stamp',
    refId: stampId,
    page,
    x, y,
    w: opts.w ?? STAMP_DEFAULT_SIZE.w,
    h: opts.h ?? STAMP_DEFAULT_SIZE.h,
    rotation: opts.rotation ?? 0,
    zIndex: await nextZIndex(documentId),
    inkColor: stamp.defaultInk,
    appliedToAllPages: opts.appliedToAllPages ?? false,
  });

  // Non-negotiable: the seal stops being a loose image and becomes a
  // controlled asset with a usage record. This event is the record.
  await appendAuditEvent({
    document_id: documentId,
    event: 'stamp.applied',
    actor: user.email,
    meta: { stamp_id: stampId, user_id: user.id, page, x, y },
  });

  return { ok: true };
}

/* Places one of the caller's own saved signatures (lib/signatures) onto a
   document they can see -- the "sign it ourselves" path, not the token-gated
   external signer one. Deliberately no countersignature/permission gate
   like applyStamp's: a signature is a personal asset, not an organisational
   one, so the only check that matters is that it belongs to the caller. */
export async function applySignature(
  documentId: string,
  signatureId: string,
  page: number,
  x: number,
  y: number,
  opts: { w?: number; h?: number; appliedToAllPages?: boolean; rotation?: number } = {}
): Promise<ApplyStampResult> {
  const { user, organization } = await getCurrentContext();

  const document = await getDocument(documentId, organization.id);
  if (!document) return { ok: false, error: 'Document not found.' };
  if (page < 1 || page > 1000 || !Number.isInteger(page)) return { ok: false, error: 'Invalid page.' };

  const signature = await getSignature(signatureId, user.id);
  if (!signature) return { ok: false, error: 'Signature not found.' };

  await db.insert(annotations).values({
    documentId,
    createdBySignerId: null,
    type: 'signature',
    refId: signatureId,
    page,
    x, y,
    w: opts.w ?? 20,
    h: opts.h ?? 10,
    rotation: opts.rotation ?? 0,
    zIndex: await nextZIndex(documentId),
    appliedToAllPages: opts.appliedToAllPages ?? false,
  });

  await appendAuditEvent({
    document_id: documentId,
    event: 'signature.placed',
    actor: user.email,
    meta: { signature_id: signatureId, page, x, y },
  });

  return { ok: true };
}

/* Today's date as a plain text mark -- no asset, so no permission check
   beyond "the document is yours to annotate" (checked via getDocument's
   organization scoping). */
export async function applyDate(
  documentId: string,
  page: number,
  x: number,
  y: number,
  opts: { w?: number; h?: number; appliedToAllPages?: boolean } = {}
): Promise<ApplyStampResult> {
  const { user, organization } = await getCurrentContext();

  const document = await getDocument(documentId, organization.id);
  if (!document) return { ok: false, error: 'Document not found.' };
  if (page < 1 || page > 1000 || !Number.isInteger(page)) return { ok: false, error: 'Invalid page.' };

  await db.insert(annotations).values({
    documentId,
    createdBySignerId: null,
    type: 'date',
    valueText: new Date().toLocaleDateString(),
    page,
    x, y,
    w: opts.w ?? 15,
    h: opts.h ?? 6,
    zIndex: await nextZIndex(documentId),
    appliedToAllPages: opts.appliedToAllPages ?? false,
  });

  await appendAuditEvent({ document_id: documentId, event: 'date.placed', actor: user.email, meta: { page, x, y } });

  return { ok: true };
}

export async function removeAnnotation(documentId: string, annotationId: string): Promise<ApplyStampResult> {
  const { organization } = await getCurrentContext();

  const document = await getDocument(documentId, organization.id);
  if (!document) return { ok: false, error: 'Document not found.' };
  if (document.status === 'completed') return { ok: false, error: 'Cannot edit a completed document.' };

  await db.delete(annotations).where(and(eq(annotations.id, annotationId), eq(annotations.documentId, documentId)));
  return { ok: true };
}
