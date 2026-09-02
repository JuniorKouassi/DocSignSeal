import {
  customType,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* citext: case-insensitive text, used for email so 'A@b.com' and 'a@b.com'
   collide the way a real inbox does. Requires `CREATE EXTENSION citext`,
   applied via the first migration. */
const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  locale: text('locale').notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_unique').on(t.email),
]);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  plan: text('plan').notNull().default('trial'),
  eidasLevel: text('eidas_level').notNull().default('ses'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('organizations_slug_unique').on(t.slug),
]);

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  role: membershipRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('memberships_user_org_unique').on(t.userId, t.organizationId),
]);

/* Sessions: same shape as the signer tokens in src/audit.mjs — the raw token
   lives only in the browser cookie, the database keeps its SHA-256 hash, so a
   database leak alone can't be used to impersonate a logged-in user. */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
]);

export const schema = { users, organizations, memberships, sessions };
