import 'server-only';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { schema } from './schema';

/* Pool over WebSocket, not the plain neon-http driver: the audit chain
   (src/audit.mjs's appendEvent) needs a real transaction that holds a
   `SELECT ... FOR UPDATE` lock on the document row across a read and a
   write, which neon-http's stateless per-query HTTP calls cannot do.
   Still serverless-friendly -- this is Neon's documented way to get real
   transactions from a serverless/edge runtime. */
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
