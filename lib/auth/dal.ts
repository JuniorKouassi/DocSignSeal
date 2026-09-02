import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getSessionUser } from './session';
import { db } from '../db/client';
import { memberships, organizations } from '../db/schema';

/* Data Access Layer. Every protected page/action/route calls one of these
   rather than reading the cookie directly, so the auth check lives in one
   place. cache() memoizes per request: many components can call this in the
   same render without hitting the database repeatedly.

   getContextOrNull() never redirects -- it's the one route handlers use,
   since a route handler should return 401/403, not a redirect. Pages and
   Server Actions use verifySession()/getCurrentContext(), which redirect. */
export const getContextOrNull = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;

  const rows = await db
    .select({ membership: memberships, organization: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, user.id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return { user, membership: row.membership, organization: row.organization };
});

export async function verifySession() {
  const context = await getContextOrNull();
  if (!context) redirect('/login');
  return context.user;
}

/* A user's organization and role in it. MVP scope is one organization per
   user (created at signup); the memberships table already supports more, so
   inviting a user into a second organization later needs no schema change,
   only a picker here. */
export async function getCurrentContext() {
  const context = await getContextOrNull();
  if (!context) redirect('/login');
  return context;
}
