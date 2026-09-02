# Signing platform: data model and API contract

Working spec. Postgres, UUID primary keys, soft deletes only where noted.

## Core principle

A **template** holds the layout. A **document** holds one execution of that layout by real people. Fields exist twice: once on the template as a definition, once on the document as an instance carrying a value. This is what lets you reuse a template a thousand times without copying files, and it is the single most common thing people get wrong when they build this.

---

## Schema

### users
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | citext unique | |
| password_hash | text | null if SSO only |
| name | text | |
| locale | text | 'fr', 'de', 'en' |
| created_at | timestamptz | |

### organizations, memberships
Add these on day one even for a single user product. Retrofitting multi tenancy later means touching every query.

organizations: id, name, slug, plan, eidas_level ('ses' default), created_at
memberships: user_id, organization_id, role ('owner','admin','member'), unique(user_id, organization_id)

### files
Every uploaded or generated blob. Never store paths in business tables, store a file id.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid fk | |
| storage_key | text | R2 or S3 object key |
| mime | text | |
| bytes | bigint | |
| sha256 | text | computed on upload |
| page_count | int | null for non PDF |
| encrypted_key | bytea | per file DEK, wrapped by KMS |
| created_at | timestamptz | |

### templates
id, organization_id, created_by, name, file_id, page_count, signer_roles jsonb, archived_at

`signer_roles` is an ordered array like `[{"index":0,"label":"Applicant"},{"index":1,"label":"Issuing office"}]`. Roles, not people. People arrive at document creation.

### template_fields
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| template_id | uuid fk cascade | |
| signer_index | int | which role fills it |
| page | int | 1 based |
| x, y, w, h | numeric(6,3) | **percent of page**, 0 to 100 |
| type | enum | signature, initials, fullname, date, text, number, checkbox, dropdown, attachment |
| required | bool default true | |
| meta | jsonb | placeholder, date format, dropdown options, max length, regex |
| sort_order | int | tab order for keyboard signers |

Index: `(template_id, page)`.

### documents
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid fk | |
| template_id | uuid fk null | null when a one off file is uploaded |
| created_by | uuid fk | |
| title | text | |
| source_file_id | uuid fk | the unsigned PDF |
| completed_file_id | uuid fk null | the flattened, sealed PDF |
| routing | enum | sequential, parallel |
| status | enum | draft, sent, in_progress, completed, declined, voided, expired |
| expires_at | timestamptz null | |
| completed_at | timestamptz null | |
| content_sha256 | text null | hash of the completed file |
| created_at | timestamptz | |

Index: `(organization_id, status, created_at desc)`.

### document_signers
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| document_id | uuid fk cascade | |
| order_index | int | routing order |
| name, email | text | |
| phone | text null | for SMS OTP |
| role_label | text | copied from template at send time |
| token_hash | text unique | sha256 of the link token, never store the token |
| auth_method | enum | link_only, email_otp, sms_otp, password, qes |
| status | enum | pending, viewed, signed, declined |
| viewed_at, signed_at | timestamptz null | |
| ip | inet null | |
| user_agent | text null | |
| decline_reason | text null | |

Unique: `(document_id, order_index)`.

### document_fields
Same shape as template_fields, plus:

- document_id, signer_id
- value_text (text null)
- value_file_id (uuid null, for signature images and attachments)
- signed_at (timestamptz null)
- stroke_data (jsonb null): raw pointer path for drawn signatures. Some jurisdictions treat this as biometric evidence, and it costs you nothing to keep.

### audit_events
Append only. No updates, no deletes, enforce with a trigger.

| column | type | notes |
|---|---|---|
| id | bigserial pk | |
| document_id | uuid fk | |
| signer_id | uuid fk null | |
| event | text | see list below |
| actor | text | email or 'system' |
| ip | inet null | |
| user_agent | text null | |
| meta | jsonb | |
| created_at | timestamptz default now() | |
| prev_hash | text null | |
| hash | text | sha256(prev_hash + event + actor + created_at + meta) |

The hash chain is cheap to implement and turns your audit log from a list of claims into tamper evident evidence. Do it from the first commit, because you cannot backfill it.

Events: `document.created`, `document.sent`, `signer.link_issued`, `signer.viewed`, `signer.authenticated`, `field.filled`, `signer.signed`, `signer.declined`, `document.completed`, `document.voided`, `document.downloaded`, `reminder.sent`.

### conversion_jobs
For the Word, PDF, CSV side of the product.

id, organization_id, user_id, source_file_id, target_format, status (queued, running, done, failed), result_file_id, error, created_at, finished_at

---

## API contract

REST, JSON, bearer tokens. Two audiences: the authenticated app, and the unauthenticated signer.

### Authenticated

```
POST   /api/templates                  create from an uploaded file
GET    /api/templates
GET    /api/templates/:id
PUT    /api/templates/:id/fields       replace the whole field set, atomically
DELETE /api/templates/:id

POST   /api/documents                  { template_id | file_id, title, signers[], routing, expires_at }
GET    /api/documents?status=&cursor=
GET    /api/documents/:id              includes signers, fields, audit
POST   /api/documents/:id/send         validates, issues tokens, sends first email
POST   /api/documents/:id/void         { reason }
POST   /api/documents/:id/remind       { signer_id }
GET    /api/documents/:id/download     ?version=signed|original|certificate
GET    /api/documents/:id/audit

POST   /api/conversions                { file_id, target_format }
GET    /api/conversions/:id
```

`PUT /fields` replacing the whole set beats per field PATCH endpoints. The builder holds the layout in memory anyway, and partial updates create ordering bugs that are painful to reproduce.

### Signer facing, no account

```
GET    /sign/:token                    resolve token, log view, return doc + that signer's fields only
POST   /sign/:token/auth               { code } when auth_method is otp
PATCH  /sign/:token/fields             { field_id: value, ... } incremental save
POST   /sign/:token/complete           { consent: true, signature_field_id }
POST   /sign/:token/decline            { reason }
```

Rules that matter:

- `GET /sign/:token` must return **only that signer's fields as editable**. Other signers' values are visible if already signed, never writable. Enforce server side, not in the UI.
- Tokens are 32 random bytes, base64url, stored only as a SHA-256 hash. Compare in constant time.
- A token stays valid until the signer signs, declines, or the document expires. Do not make it single use, people close the tab and come back.
- Rate limit `/sign/:token` by IP and by token. This endpoint is your most exposed surface.
- Never accept coordinates from the signer. They send values keyed by field id, nothing else.

### Webhooks

Signed with HMAC SHA-256 in an `X-Signature` header, timestamp included to block replay. Events: `document.sent`, `document.viewed`, `document.completed`, `document.declined`, `document.expired`, `conversion.done`.

Retry with exponential backoff for 24 hours, then park it and surface the failure in the dashboard.

---

## Status transitions

```
draft ──send──> sent ──first view──> in_progress ──all signed──> completed
  │                │                      │
  └──────────────void───────────────────┘
                   └──decline──> declined
                   └──expiry───> expired
```

Completed, declined, voided, and expired are terminal. Enforce that in a database check or a state machine in code, because "someone signed a voided document" is the bug that ends the conversation with a serious client.

---

## Retention and privacy

You will be handling identity documents and contracts for EU residents.

- Encrypt files at rest with a per file key wrapped by KMS. Deleting the wrapped key is your fastest path to honouring an erasure request.
- Pick an EU region and say so on the pricing page. For embassies, ministries, and Austrian SMEs this is a selling point, not a checkbox.
- Set a default retention window per organization, with the audit log kept longer than the file itself. The evidence outlives the document.
- Log access to completed files. `document.downloaded` belongs in the audit trail.

---

## Build order

1. Upload, template, field builder, `PUT /fields`
2. Documents, signers, tokens, the signer view
3. Flattening and the certificate page
4. Audit chain and webhooks
5. Conversions, which is a separate service and should never share a process with signing

---

# Addendum: stamps, annotations, and app structure

## App structure

Four tabs, mirroring what people already recognise from mobile PDF tools:

| Tab | Contents |
|---|---|
| Documents | Filters: waiting on you, waiting on others, drafts, completed |
| Signatures | Personal signature and initials library, drawn, typed, or scanned |
| Stamps | Organization stamp library, gated by permission |
| Settings | Account, organization, retention, language |

The status filters are what separates a signing product from a PDF annotator. A user opening the app should see what needs their attention before they see their files.

## Two object types, not one

**Fields** are placeholders the sender defines and a signer fills. They belong to a template, they are positioned before sending, they are required or optional.

**Annotations** are objects a user places freely at signing time: stamps, freehand ink, dates, text notes. No placeholder exists in advance. They carry a z index because a stamp overlapping a signature is normal practice, not an error.

Both burn into the same flattened PDF. Keep them in separate tables, because their permission models have nothing in common.

## signatures

Personal assets. One user, many signatures.

id, user_id, kind ('signature' | 'initials'), file_id (transparent PNG), stroke_data jsonb null, is_default bool, created_at

## stamps

Organization assets. This table is the product.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid fk | the stamp belongs to the org, never to a person |
| name | text | 'USDI-FC round seal' |
| file_id | uuid fk | transparent PNG or SVG |
| kind | enum | seal, mention ('Certified true copy'), header, custom |
| default_ink | text | hex, defaults to the org's ink colour |
| requires_countersignature | bool | when true, cannot be applied without a signature on the same page |
| archived_at | timestamptz null | archive, never delete: old documents reference it |

### stamp_permissions

| column | type |
|---|---|
| stamp_id | uuid fk |
| user_id | uuid fk |
| can_apply | bool |
| granted_by | uuid fk |
| granted_at | timestamptz |

Primary key (stamp_id, user_id). Absence of a row means no access. Never infer permission from org membership, an admin is not automatically entitled to the ambassador's seal.

Every application writes `stamp.applied` to the audit log with stamp_id, user_id, page, and coordinates. This is the entire reason an institution buys the product rather than using a free PDF app: the seal stops being a loose image file and becomes a controlled asset with a usage record.

## annotations

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| document_id | uuid fk | |
| created_by_signer_id | uuid fk null | null when the sender annotates |
| type | enum | stamp, signature, ink, date, text |
| ref_id | uuid null | stamp_id or signature_id when applicable |
| page | int | |
| x, y, w, h | numeric(6,3) | percent of page |
| rotation | numeric(5,2) default 0 | wet stamps are rarely straight, allow it |
| z_index | int | |
| ink_color | text | hex |
| value_text | text null | for date and text |
| stroke_data | jsonb null | for freehand ink |
| applied_to_all_pages | bool default false | see below |
| created_at | timestamptz | |

## Behaviours worth building

**Ink colour.** Black, blue, green, red, with blue as the default. In francophone administrative practice a blue signature marks an original and black reads as a copy. This is not decoration, it is a requirement.

**Apply to all pages.** One control that writes the same annotation to every page at identical coordinates. Store it as one row with `applied_to_all_pages = true` plus a page range, not as N duplicated rows, so that moving it later moves all of them. Essential for contracts and multi page notes.

**Rotation and z index.** A stamp laid over a signature must render over it, at a slight angle if the user wants. Fixed upright rectangles look like software, not like a sealed document.

**Locking.** Once a signer completes, their annotations become immutable. Enforce server side. In the competitor app every object stays editable forever, which is exactly why its "Signed" badge means nothing.

## API additions

```
GET    /api/stamps                       org stamps the caller may apply
POST   /api/stamps                       upload, admin only
PUT    /api/stamps/:id/permissions       { user_id, can_apply }
DELETE /api/stamps/:id                   archives, never hard deletes

POST   /sign/:token/annotations          place one, server checks stamp permission
PATCH  /sign/:token/annotations/:id      move or resize, rejected once signed
DELETE /sign/:token/annotations/:id      rejected once signed
```

`POST /annotations` with `type = 'stamp'` must verify the caller has a `stamp_permissions` row with `can_apply = true`, and that the stamp's organization matches the document's. Two checks, both server side, no exceptions.

## Export quality

Offer size options, but never by rasterising the page. The competitor exports a full page as a 24 KB JPEG, which destroys print legibility and throws away the text layer, so the document is no longer searchable and no longer a real PDF.

Correct approach: keep the original PDF content stream intact and draw annotations as PDF objects on top. Compress only the annotation images, which are small anyway. A signed page should come out within a few kilobytes of the original, fully vector, fully searchable, and identical when printed at A4.
