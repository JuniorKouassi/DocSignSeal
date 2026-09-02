import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { memberships, users } from '../db/schema';

export async function listOrgMembers(organizationId: string) {
  const rows = await db.select({ userId: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(asc(users.name));
  return rows;
}
