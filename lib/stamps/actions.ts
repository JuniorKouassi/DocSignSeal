'use server';

import { and, eq } from 'drizzle-orm';
import { getCurrentContext } from '../auth/dal';
import { db } from '../db/client';
import { stamps, stampPermissions } from '../db/schema';
import { storeFile } from '../files/store';
import { getStamp } from './queries';

export type StampFormState = { errors?: Record<string, string> } | undefined;

function requireAdmin(role: string) {
  if (role !== 'owner' && role !== 'admin') throw new Error('Only an owner or admin can manage stamps.');
}

export async function uploadStamp(_state: StampFormState, formData: FormData): Promise<StampFormState> {
  const { user, membership, organization } = await getCurrentContext();
  requireAdmin(membership.role);

  const name = String(formData.get('name') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'seal');
  const defaultInk = String(formData.get('defaultInk') ?? '#1B3FA8');
  const requiresCountersignature = formData.get('requiresCountersignature') === 'on';
  const file = formData.get('file');

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = 'Name this stamp.';
  // UploadStampForm.tsx always converts whatever image was picked into a
  // transparent PNG client-side (lib/shared/imageToPng.ts) before this ever
  // runs -- a non-PNG mime here means that step was skipped or failed, not
  // that the user picked the "wrong" format themselves.
  if (!(file instanceof File) || file.size === 0) errors.file = 'Choose an image.';
  else if (file.type !== 'image/png') errors.file = 'Could not process this image. Try a different file.';
  if (Object.keys(errors).length) return { errors };

  const bytes = Buffer.from(await (file as File).arrayBuffer());
  const stored = await storeFile({ organizationId: organization.id, bytes, mime: 'image/png', extension: 'png' });

  const [stamp] = await db.insert(stamps).values({
    organizationId: organization.id,
    name,
    fileId: stored.id,
    kind: kind as 'seal' | 'mention' | 'header' | 'custom',
    defaultInk,
    requiresCountersignature,
  }).returning({ id: stamps.id });

  // Without this, a stamp is unusable by anyone -- including the admin who
  // just uploaded it -- until someone separately visits this page and
  // checks a box for themselves. That's not "inferring permission from
  // role" (HANDOFF.md non-negotiable #6, still fully enforced everywhere a
  // stamp is applied): it's one real, explicit stamp_permissions row,
  // written once, for the person who just created the asset.
  await db.insert(stampPermissions).values({
    stampId: stamp.id,
    userId: user.id,
    canApply: true,
    grantedBy: user.id,
  });

  return undefined;
}

export async function archiveStamp(stampId: string) {
  const { membership, organization } = await getCurrentContext();
  requireAdmin(membership.role);

  const stamp = await getStamp(stampId, organization.id);
  if (!stamp) return;

  await db.update(stamps).set({ archivedAt: new Date() }).where(eq(stamps.id, stampId));
}

/* Absence of a row means no access (spec/schema-and-api.md) -- granting
   upserts a row, revoking deletes it outright, rather than writing
   can_apply: false, so there's exactly one way to represent "no access". */
export async function setStampPermission(stampId: string, userId: string, canApply: boolean) {
  const { user, membership, organization } = await getCurrentContext();
  requireAdmin(membership.role);

  const stamp = await getStamp(stampId, organization.id);
  if (!stamp) throw new Error('Stamp not found.');

  if (canApply) {
    await db.insert(stampPermissions)
      .values({ stampId, userId, canApply: true, grantedBy: user.id })
      .onConflictDoUpdate({
        target: [stampPermissions.stampId, stampPermissions.userId],
        set: { canApply: true, grantedBy: user.id, grantedAt: new Date() },
      });
  } else {
    await db.delete(stampPermissions)
      .where(and(eq(stampPermissions.stampId, stampId), eq(stampPermissions.userId, userId)));
  }
}
