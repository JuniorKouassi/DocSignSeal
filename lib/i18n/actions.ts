'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getContextOrNull } from '../auth/dal';
import { db } from '../db/client';
import { users } from '../db/schema';
import { isSupportedLocale, LOCALE_COOKIE } from './shared';

export async function setLocale(locale: string): Promise<void> {
  if (!isSupportedLocale(locale)) return;

  const context = await getContextOrNull();
  if (context) {
    await db.update(users).set({ locale }).where(eq(users.id, context.user.id));
  }

  // Always set the cookie too, even when logged in: it's what /login and
  // /signup read before there's a session to carry a saved preference.
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  revalidatePath('/', 'layout');
}
