# DocSignSeal: handoff

You are picking up a project that already has its data model, its evidence layer, and its PDF engine written and tested. Your job is to build the application around them. Read this file completely before writing code.

## What the product is

An e-signature platform: upload a document, place fields, send it to one or more people, they sign in turn, everyone gets back a sealed PDF with a certificate of completion. Plus organisation-controlled stamps, and file conversion (Word to PDF, PDF to Word, spreadsheets to CSV).

**Who it is for.** Embassies, diplomatic missions, associations and federations, and small businesses in Austria and francophone West Africa. The buyer cares about evidence and control, not about pretty PDFs.

**What makes it different from the fifty other signing tools:** stamps are controlled organisational assets with per-person permissions and a usage record. Nobody else does this. It is the reason an institution pays.

## Name and domain

DocSignSeal. Domain docsignseal.com. Note that `signseal.io` is an unrelated competitor in the same category, so never shorten the product name to "SignSeal" anywhere in code, copy, or metadata.

## What is already built

| File | What it is | State |
|---|---|---|
| `spec/schema-and-api.md` | Postgres schema, REST contract, status machine, retention rules, stamps and annotations addendum | Authoritative. Follow it. |
| `src/audit.mjs` | Audit hash chain, signer tokens, sequential routing enforcement, webhook signing | Written and tested |
| `src/flatten.mjs` | Burns fields, signatures, stamps, ink, dates into a PDF and appends the certificate | Written and tested |
| `test/audit.test.mjs` | Nine checks including tamper detection and replay rejection | Passing |
| `design/tokens.css` | Colour, type, spacing, status and ink tokens | Use these, do not invent colours |
| `design/mobile-ui.html` | Clickable mobile mockup, all four tabs, language picker | Reference for layout and copy |
| `design/signing-flow.html` | Clickable prototype of field placement and signing | Reference for interaction |
| `locales/` | English, French, German dictionaries plus the list of 20 supported locales | Starting point |

Run `npm install && node test/audit.test.mjs` first to confirm the environment works.

## Stack

- Next.js (App Router) on Vercel for web app and marketing site
- Postgres, any host. Use UUID primary keys as in the spec.
- Cloudflare R2 or S3 for files, EU region, per file encryption key wrapped by KMS
- A separate container running Gotenberg for conversions. Never in a serverless function.
- Expo React Native later, sharing the same API. Do not start it yet.

## Build order

Do these in order. Do not start the next until the previous works end to end.

1. **Auth, organisations, memberships.** Multi tenant from the first commit. Every query filtered by organisation.
2. **Upload and templates.** File to R2, page count, render pages to images for the builder.
3. **Field builder.** Drag fields onto pages, assign to signer roles, `PUT /fields` replaces the whole set atomically.
4. **Documents, signers, tokens.** Create from a template, issue tokens with `issueToken()`, send email.
5. **Signer view.** Resolve token with `resolveToken()`, render only that signer's editable fields, save values incrementally.
6. **Complete and seal.** Call `flatten()`, then `sealDocument()`, store the completed file, write `document.completed`.
7. **Stamps.** Library, per person permissions, the permission check on every application.
8. **Conversions.** Separate service. Queue, job table, webhook on completion.

MVP is done when: a user uploads a PDF, places fields for two signers, sends it, both sign from a link on a phone, and both receive a sealed PDF whose certificate page lists the audit trail and whose chain verifies.

## Non-negotiables

These are decisions already made after discussion. Do not relitigate them in code.

1. **Field positions are percentages of the page, never pixels.** Pixels break across devices and DPI.
2. **Signers never send coordinates.** They send values keyed by field id. The server decides placement. Otherwise a signer can move their signature onto a clause they did not agree to.
3. **A signer may only write to their own fields.** Enforced server side, not in the UI.
4. **Never rasterise the PDF.** The original content stream stays intact and annotations are drawn as PDF objects. A signed page should come out within a few kilobytes of the source and stay searchable.
5. **The audit chain is append only.** Enforce with a database trigger. `appendEvent` must run inside a transaction that locks the document row with `SELECT ... FOR UPDATE`, or concurrent appends fork the chain.
6. **Stamp permission is explicit per person.** Never inherited from being an org admin. An admin is not entitled to the ambassador's seal.
7. **Status is never blue.** Blue is the brand. Signed is green, waiting amber, declined red, draft grey. Always pair colour with a word.
8. **The document page is always pure white.** Tints belong to the app chrome, never to the paper.
9. **Signature ink is its own token,** more saturated than brand blue, and blue is the default because in francophone administrative practice a blue signature marks an original.
10. **Terminal states are terminal.** completed, declined, voided, expired. Enforce it, because "someone signed a voided document" ends the conversation with a serious client.

## Known gaps to handle

- **Unicode fonts.** `flatten()` falls back to Helvetica, which is Latin-1 only. Bengali, Hindi, Chinese, Japanese and Russian text will silently fail to draw. Ship a Noto TTF and pass `fontBytes`.
- **This is a Simple Electronic Signature.** Flattening plus hashing is not a PAdES cryptographic signature. Advanced and Qualified signatures require a qualified trust service provider, for example A-Trust in Austria. That integration is the eventual moat, but it is out of MVP scope.
- **Concurrency test missing.** Fire ten simultaneous `appendEvent` calls and confirm the chain still verifies before trusting it in production.
- **Legal strings are not general translation work.** The consent sentence, the decline notice, and the certificate of completion need human review per language. Keep them out of any machine translation pipeline.

## Language

Twenty locales, English primary: English, French, German, Spanish, Chinese, Bengali, Portuguese, Russian, Hindi, Indonesian, Japanese, Swahili, Turkish, Dutch, Italian, Hungarian, Croatian, Swedish, Norwegian, Danish. None are right to left, so no layout mirroring is needed.

Norwegian should be `nb` (Bokmål) in code, labelled Norsk in the UI. The product name is never translated.

The picker pattern is already set by a sister product: search field, flag, native name, locale code on the right, selected row filled in navy. Match it.

## Working style

Ask before adding a dependency. Prefer a stdlib solution. Write the test alongside the feature, not after. When a decision in this file conflicts with something that seems easier, follow this file and raise the conflict rather than quietly doing it the easy way.
