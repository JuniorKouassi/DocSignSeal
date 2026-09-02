import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { stamps, stampPermissions, users } from '../db/schema';

export async function listOrgStamps(organizationId: string) {
  return db.select().from(stamps)
    .where(and(eq(stamps.organizationId, organizationId), isNull(stamps.archivedAt)));
}

export async function getStamp(stampId: string, organizationId: string) {
  const rows = await db.select().from(stamps)
    .where(and(eq(stamps.id, stampId), eq(stamps.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

/* GET /api/stamps: "org stamps the caller may apply." */
export async function listApplicableStamps(organizationId: string, userId: string) {
  const rows = await db.select({ stamp: stamps })
    .from(stamps)
    .innerJoin(stampPermissions, and(eq(stampPermissions.stampId, stamps.id), eq(stampPermissions.userId, userId), eq(stampPermissions.canApply, true)))
    .where(and(eq(stamps.organizationId, organizationId), isNull(stamps.archivedAt)));
  return rows.map((r) => r.stamp);
}

export async function canApplyStamp(stampId: string, userId: string): Promise<boolean> {
  const rows = await db.select().from(stampPermissions)
    .where(and(eq(stampPermissions.stampId, stampId), eq(stampPermissions.userId, userId), eq(stampPermissions.canApply, true)))
    .limit(1);
  return rows.length > 0;
}

export async function listStampPermissions(stampId: string) {
  return db.select({ userId: users.id, name: users.name, email: users.email })
    .from(stampPermissions)
    .innerJoin(users, eq(users.id, stampPermissions.userId))
    .where(eq(stampPermissions.stampId, stampId));
}
