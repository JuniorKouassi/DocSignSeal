'use server';

import { eq } from 'drizzle-orm';
import { getCurrentContext } from '../auth/dal';
import { db } from '../db/client';
import { signatures } from '../db/schema';
import { storeFile } from '../files/store';
import { getSignature } from './queries';

// No server-side redirect() on success: createSignature is called both from
// a <form action> on the Draw/Type screens (which does want to navigate back
// to the list) and directly from useCreateSignatureFromFile's startTransition
// for Gallery/Scan/Upload (which stays on the list and just refreshes it) --
// a thrown NEXT_REDIRECT would land in that second caller's try/catch and
// read as a failure. `ok: true` lets each caller decide what "success" means.
export type SignatureFormState = { errors?: Record<string, string> } | { ok: true } | undefined;

/* Every capture method -- draw, type, gallery, scan -- converges here as a
   plain PNG file plus optional stroke data, same shape uploadStamp already
   uses for stamps. Gallery- and scan-sourced images are stored exactly as
   picked/captured (no background removal in this pass -- see HANDOFF.md's
   "known gaps" precedent for the Unicode-font fallback, same treatment). */
export async function createSignature(_state: SignatureFormState, formData: FormData): Promise<SignatureFormState> {
  const { user, organization } = await getCurrentContext();

  const kind = formData.get('kind') === 'initials' ? 'initials' : 'signature';
  const file = formData.get('file');
  const strokeDataRaw = formData.get('strokeData');
  const isDefault = formData.get('isDefault') === 'on';

  const errors: Record<string, string> = {};
  if (!(file instanceof File) || file.size === 0) errors.file = 'Draw, type, or choose a signature image first.';
  else if (file.type !== 'image/png') errors.file = 'Only PNG is supported.';
  if (Object.keys(errors).length) return { errors };

  const bytes = Buffer.from(await (file as File).arrayBuffer());
  const stored = await storeFile({ organizationId: organization.id, bytes, mime: 'image/png', extension: 'png' });

  let strokeData: { x: number; y: number }[][] | null = null;
  if (typeof strokeDataRaw === 'string' && strokeDataRaw) {
    try {
      strokeData = JSON.parse(strokeDataRaw);
    } catch {
      // Malformed client payload -- keep the signature, just without replayable stroke data.
    }
  }

  await db.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(signatures).set({ isDefault: false }).where(eq(signatures.userId, user.id));
    }
    await tx.insert(signatures).values({
      userId: user.id,
      kind,
      fileId: stored.id,
      strokeData,
      isDefault,
    });
  });

  return { ok: true };
}

export async function deleteSignature(signatureId: string) {
  const { user } = await getCurrentContext();
  const signature = await getSignature(signatureId, user.id);
  if (!signature) return;
  await db.delete(signatures).where(eq(signatures.id, signatureId));
}

export async function setDefaultSignature(signatureId: string) {
  const { user } = await getCurrentContext();
  const signature = await getSignature(signatureId, user.id);
  if (!signature) return;

  await db.transaction(async (tx) => {
    await tx.update(signatures).set({ isDefault: false }).where(eq(signatures.userId, user.id));
    await tx.update(signatures).set({ isDefault: true }).where(eq(signatures.id, signatureId));
  });
}
