import {
  bigint,
  bigserial,
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

/* Drizzle has no built-in inet helper either. */
const inet = customType<{ data: string }>({ dataType: () => 'inet' });

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member']);

export const fieldType = pgEnum('field_type', [
  'signature', 'initials', 'fullname', 'date', 'text', 'number', 'checkbox', 'dropdown', 'attachment',
]);

export const documentRouting = pgEnum('document_routing', ['sequential', 'parallel']);

export const documentStatus = pgEnum('document_status', [
  'draft', 'sent', 'in_progress', 'completed', 'declined', 'voided', 'expired',
]);

export const signerAuthMethod = pgEnum('signer_auth_method', [
  'link_only', 'email_otp', 'sms_otp', 'password', 'qes',
]);

export const signerStatus = pgEnum('signer_status', ['pending', 'viewed', 'signed', 'declined']);

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

/* One execution of a template's layout by real people. A document can also
   be created from a one-off file with no template (templateId null). */
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => templates.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  title: text('title').notNull(),
  sourceFileId: uuid('source_file_id').notNull().references(() => files.id),
  completedFileId: uuid('completed_file_id').references(() => files.id),
  routing: documentRouting('routing').notNull().default('sequential'),
  status: documentStatus('status').notNull().default('draft'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  contentSha256: text('content_sha256'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('documents_org_status_created_idx').on(t.organizationId, t.status, t.createdAt),
]);

export const documentSigners = pgTable('document_signers', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  name: text('name').notNull(),
  email: citext('email').notNull(),
  phone: text('phone'),
  roleLabel: text('role_label').notNull(),
  tokenHash: text('token_hash'),
  authMethod: signerAuthMethod('auth_method').notNull().default('link_only'),
  status: signerStatus('status').notNull().default('pending'),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  declineReason: text('decline_reason'),
}, (t) => [
  uniqueIndex('document_signers_document_order_unique').on(t.documentId, t.orderIndex),
  uniqueIndex('document_signers_token_hash_unique').on(t.tokenHash),
]);

/* Same shape as template_fields, copied over at document-creation time, plus
   the signer's actual value once they fill it in. */
export const documentFields = pgTable('document_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  signerId: uuid('signer_id').notNull().references(() => documentSigners.id, { onDelete: 'cascade' }),
  page: integer('page').notNull(),
  x: numeric('x', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  y: numeric('y', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  w: numeric('w', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  h: numeric('h', { precision: 6, scale: 3, mode: 'number' }).notNull(),
  type: fieldType('type').notNull(),
  required: boolean('required').notNull().default(true),
  meta: jsonb('meta').notNull().default({}).$type<Record<string, unknown>>(),
  sortOrder: integer('sort_order').notNull().default(0),
  valueText: text('value_text'),
  valueFileId: uuid('value_file_id').references(() => files.id),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  // Raw pointer path for drawn signatures -- biometric evidence in some jurisdictions.
  strokeData: jsonb('stroke_data').$type<{ x: number; y: number }[][] | null>(),
}, (t) => [
  index('document_fields_document_page_idx').on(t.documentId, t.page),
]);

/* Append only -- a database trigger (drizzle/0003_documents_signers_fields.sql)
   rejects any UPDATE or DELETE against this table. hash chains prev_hash, so
   rewriting one old row breaks verification of everything after it. */
export const auditEvents = pgTable('audit_events', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  signerId: uuid('signer_id').references(() => documentSigners.id),
  event: text('event').notNull(),
  actor: text('actor'),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  meta: jsonb('meta').notNull().default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  prevHash: text('prev_hash'),
  hash: text('hash').notNull(),
}, (t) => [
  index('audit_events_document_idx').on(t.documentId, t.id),
]);

export const schema = {
  users, organizations, memberships, sessions, files, templates, templateFields,
  documents, documentSigners, documentFields, auditEvents,
};
