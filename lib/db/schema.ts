import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
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

/* Wrapped per-file data encryption key. Drizzle has no built-in bytea helper. */
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member']);

export const fieldType = pgEnum('field_type', [
  'signature', 'initials', 'fullname', 'date', 'text', 'number', 'checkbox', 'dropdown', 'attachment',
]);

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

/* Every uploaded or generated blob. Business tables reference files.id, never
   a storage path directly. */
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  bytes: bigint('bytes', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
  pageCount: integer('page_count'),
  encryptedKey: bytea('encrypted_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* signerRoles: ordered array like [{ index: 0, label: 'Applicant' }].
   Roles, not people -- people arrive at document creation (build step 4). */
export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  name: text('name').notNull(),
  fileId: uuid('file_id').notNull().references(() => files.id),
  pageCount: integer('page_count').notNull(),
  signerRoles: jsonb('signer_roles').notNull().$type<{ index: number; label: string }[]>(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* x, y, w, h are percent of the page (0-100), never pixels -- pixels break
   across devices and DPI (HANDOFF.md non-negotiable #1). */
export const templateFields = pgTable('template_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => templates.id, { onDelete: 'cascade' }),
  signerIndex: integer('signer_index').notNull(),
  page: integer('page').notNull(),
  x: numeric('x', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  y: numeric('y', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  w: numeric('w', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  h: numeric('h', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  type: fieldType('type').notNull(),
  required: boolean('required').notNull().default(true),
  meta: jsonb('meta').notNull().default({}).$type<Record<string, unknown>>(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  index('template_fields_template_page_idx').on(t.templateId, t.page),
]);

export const schema = { users, organizations, memberships, sessions, files, templates, templateFields };
