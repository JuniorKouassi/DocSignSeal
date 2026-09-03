import { readFile, readdir } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

/* Applies drizzle/*.sql in order over a real Pool connection (WebSocket),
   NOT `drizzle-kit migrate`/`drizzle-kit push`. Both CLI commands default to
   @neondatabase/serverless's stateless HTTP driver for Neon hosts, which
   lacks real session/transaction semantics -- the same limitation that made
   lib/db/client.ts use Pool instead of neon-http for the app's own runtime
   queries (see that file's comment). In practice this showed up as
   `drizzle-kit migrate` silently applying migration files out of order and
   leaving the database in a half-applied state with no error message.

   No migration-tracking table: re-running this against an already-migrated
   database will fail loudly on the first `CREATE TYPE`/`CREATE TABLE` that
   already exists, which is the correct behavior -- there's no "already
   applied, skip" bookkeeping here, unlike a normal migration tool. */

const DIR = new URL('../drizzle/', import.meta.url);

const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  for (const file of files) {
    const sql = await readFile(new URL(file, DIR), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    console.log(`\n=== ${file} (${statements.length} statement(s)) ===`);
    for (const stmt of statements) {
      await client.query(stmt);
      console.log('  ok:', stmt.split('\n')[0].slice(0, 80));
    }
  }
  console.log('\nAll migrations applied successfully.');
} finally {
  client.release();
  await pool.end();
}
