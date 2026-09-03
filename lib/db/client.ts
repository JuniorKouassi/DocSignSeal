import 'server-only';
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

   Lazily constructed: Next.js's build-time page-data collection imports
   every route module to read its config, without calling any handler.
   Throwing here at module scope (as this used to) meant no route could
   build until DATABASE_URL existed, even ones that never touch the
   database. Connecting only happens the first time a query actually runs. */

type Db = ReturnType<typeof drizzle<typeof schema>>;
let instance: Db | null = null;

function getDb(): Db {
  if (instance) return instance;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  instance = drizzle(pool, { schema });
  return instance;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
