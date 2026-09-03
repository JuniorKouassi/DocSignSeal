import 'server-only';
import { cache } from 'react';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { schema } from './schema';

/* Pool over WebSocket, not the plain neon-http driver: the audit chain
   (src/audit.mjs's appendEvent) needs a real transaction that holds a
   `SELECT ... FOR UPDATE` lock on the document row across a read and a
   write, which neon-http's stateless per-query HTTP calls cannot do.
   Still serverless-friendly -- this is Neon's documented way to get real
   transactions from a serverless/edge runtime.

   No `ws` package/neonConfig.webSocketConstructor override needed: both
   Cloudflare Workers and Node 22+ (local dev) provide a native global
   WebSocket, which is all the underlying driver needs.

   Memoized with React's cache(), NOT a plain module-level singleton: a
   Cloudflare Workers isolate handles many requests over its lifetime, and
   a plain `let instance` would hand the Pool's WebSocket -- opened during
   one request -- to a later, unrelated request. Workers explicitly
   forbids that ("Cannot perform I/O on behalf of a different request"),
   which is exactly the crash this caused in production (the signup
   Server Action succeeded, but the following /dashboard request reused
   the cached Pool and hung until the runtime killed it). cache() scopes
   the memoized value to the current request's lifetime, so each request
   gets its own Pool and the next one can't see it -- still just one
   connection per request, shared across every query within it.

   Lazily constructed: Next.js's build-time page-data collection imports
   every route module to read its config, without calling any handler.
   Throwing here at module scope (as this used to) meant no route could
   build until DATABASE_URL existed, even ones that never touch the
   database. Connecting only happens the first time a query actually runs. */

type Db = ReturnType<typeof drizzle<typeof schema>>;

const getDb = cache((): Db => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool, { schema });
});

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
