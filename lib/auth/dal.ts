import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getSessionUser } from './session';
import { db } from '../db/client';
import { memberships, organizations } from '../db/schema';

/* Data Access Layer. Every protected page/action/route calls verifySession()
   or getCurrentContext() rather than reading the cookie directly, so the auth
   check lives in one place. cache() memoizes per request: many components can
   call this in the same render without hitting the database repeatedly. */
export const verifySession = cache(async () => {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
});

/* A user's organization and role in it. MVP scope is one organization per
   user (created at signup); the memberships table already supports more, so
   inviting a user into a second organization later needs no schema change,
   only a picker here. */
export const getCurrentContext = cache(async () => {
  const user = await verifySession();

  const rows = await db
    .select({ membership: memberships, organization: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, user.id))
    .limit(1);

  const row = rows[0];
  if (!row) redirect('/login');

  return { user, membership: row.membership, organization: row.organization };
});
