import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/auth/session';

/* Optimistic check only: cookie presence, no database round trip. Real
   authorization happens in the DAL (lib/auth/dal.ts) on every protected
   request — this just avoids a flash of the dashboard for a logged-out
   visitor or of the login form for a logged-in one. */
const PROTECTED_PREFIXES = ['/dashboard'];
const AUTH_PAGES = ['/login', '/signup'];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (AUTH_PAGES.includes(pathname) && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.(?:ico|png|svg)$).*)'],
};
