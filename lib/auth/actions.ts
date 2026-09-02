'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../../src/password.mjs';
import { createSession, destroySession } from './session';
import { db } from '../db/client';
import { memberships, organizations, users } from '../db/schema';

export type FormState = {
  errors?: Record<string, string>;
  message?: string;
} | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'org';
}

export async function signup(_state: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const organizationName = String(formData.get('organizationName') ?? '').trim();

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  if (organizationName.length < 2) errors.organizationName = 'Enter your organization’s name.';
  if (Object.keys(errors).length) return { errors };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return { errors: { email: 'An account with this email already exists.' } };

  const passwordHash = await hashPassword(password);

  const baseSlug = slugify(organizationName);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!clash.length) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const [user] = await db.insert(users).values({ name, email, passwordHash }).returning({ id: users.id });
  const [organization] = await db.insert(organizations).values({ name: organizationName, slug }).returning({ id: organizations.id });
  await db.insert(memberships).values({ userId: user.id, organizationId: organization.id, role: 'owner' });

  await createSession(user.id);
  redirect('/dashboard');
}

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
  if (!ok || !user) return { message: 'Invalid email or password.' };

  await createSession(user.id);
  redirect('/dashboard');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
