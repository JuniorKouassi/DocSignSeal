import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { issueToken } from '../../src/audit.mjs';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'dss_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* Reuses issueToken() from the evidence layer (src/audit.mjs): same shape as a
   signer link, same reason — the raw value goes to the browser and is never
   stored, only its hash is. */
export async function createSession(userId: string) {
  const { raw, token_hash } = issueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({ userId, tokenHash: token_hash, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

/* Resolves the session cookie to a user, or null. Never throws on a missing
   or forged cookie — callers decide what to do (redirect, 401, etc). */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const hash = hashToken(raw);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hash))
    .limit(1);

  const row = rows[0];
  if (!row || !safeEqualHex(row.session.tokenHash, hash)) return null;
  if (row.session.expiresAt < new Date()) return null;

  return row.user;
}
