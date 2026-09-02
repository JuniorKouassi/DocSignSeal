import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/* DocSignSeal evidence layer.

   Three things live here, and they are the parts a court or a procurement
   officer will actually look at:
     1. the audit chain, which makes the log tamper evident
     2. signer tokens, which control who can open a signing link
     3. webhook signatures, so integrators can trust what you send them

   Storage is injected. Pass any object with the four methods used below and
   this works on Postgres, D1, or a test double. */

/* ------------------------------------------------------------------ *
 * 1. Audit chain
 * ------------------------------------------------------------------ */

/* Each entry hashes the previous entry's hash together with its own contents.
   Change one field of one old row and every hash after it stops matching, which
   is the difference between a log that claims something happened and one that
   can show it was not edited afterwards.

   Canonical serialisation matters: JSON key order must be fixed, or the same
   event hashes differently on two machines and verification fails for no
   reason. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export function hashEvent(prevHash, e) {
  const payload = [
    prevHash ?? '',
    e.document_id,
    e.signer_id ?? '',
    e.event,
    e.actor ?? '',
    e.ip ?? '',
    e.created_at,
    canonical(e.meta ?? {})
  ].join('\u001f');
  return createHash('sha256').update(payload).digest('hex');
}

export async function appendEvent(store, e) {
  const created_at = e.created_at ?? new Date().toISOString();
  const last = await store.lastEvent(e.document_id);
  const entry = { ...e, created_at, prev_hash: last ? last.hash : null };
  entry.hash = hashEvent(entry.prev_hash, entry);
  await store.insertEvent(entry);
  return entry;
}

/* Returns { ok } or { ok: false, brokenAt, reason } naming the first bad row.
   Run it on every download of a completed document and expose it as an
   endpoint, so a recipient can check the chain themselves. */
export async function verifyChain(store, documentId) {
  const events = await store.listEvents(documentId);
  let prev = null;
  for (const e of events) {
    if ((e.prev_hash ?? null) !== prev) {
      return { ok: false, brokenAt: e.id, reason: 'chain link does not match previous hash' };
    }
    if (hashEvent(prev, e) !== e.hash) {
      return { ok: false, brokenAt: e.id, reason: 'entry contents do not match its hash' };
    }
    prev = e.hash;
  }
  return { ok: true, length: events.length, head: prev };
}

/* ------------------------------------------------------------------ *
 * 2. Signer tokens
 * ------------------------------------------------------------------ */

/* The raw token goes in the email link and is never stored. Only its hash is
   kept, so a database leak does not hand an attacker every open signing link.
   The token stays valid until the signer signs, declines, or the document
   expires: people close the tab and come back, and a single use token turns
   that into a support ticket. */
export function issueToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, token_hash: createHash('sha256').update(raw).digest('hex') };
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function resolveToken(store, raw, now = new Date()) {
  if (typeof raw !== 'string' || raw.length < 32) return { ok: false, reason: 'malformed' };
  const hash = createHash('sha256').update(raw).digest('hex');

  const signer = await store.findSignerByTokenHash(hash);
  if (!signer || !safeEqualHex(signer.token_hash, hash)) return { ok: false, reason: 'not_found' };

  const doc = await store.getDocument(signer.document_id);
  if (!doc) return { ok: false, reason: 'not_found' };

  if (doc.expires_at && new Date(doc.expires_at) < now) return { ok: false, reason: 'expired' };
  if (['voided', 'declined'].includes(doc.status))      return { ok: false, reason: doc.status };
  if (signer.status === 'signed')                        return { ok: false, reason: 'already_signed' };

  /* Sequential routing: a later signer's link resolves but must not become
     fillable until everyone before them has finished. Enforced here, on the
     server, never in the client. */
  const others = await store.listSigners(signer.document_id);
  const blocking = others.filter(s => s.order_index < signer.order_index && s.status !== 'signed');
  if (doc.routing === 'sequential' && blocking.length) {
    return { ok: true, signer, document: doc, editable: false, waitingFor: blocking[0].name };
  }

  return { ok: true, signer, document: doc, editable: true };
}

/* ------------------------------------------------------------------ *
 * 3. Webhooks
 * ------------------------------------------------------------------ */

/* Timestamp is inside the signed payload, so a captured request cannot be
   replayed later. Receivers should reject anything older than five minutes. */
export function signWebhook(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  const payload = `${timestamp}.${typeof body === 'string' ? body : JSON.stringify(body)}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return { 'X-DSS-Timestamp': String(timestamp), 'X-DSS-Signature': `v1=${signature}` };
}

export function verifyWebhook(secret, rawBody, headers, toleranceSeconds = 300) {
  const ts = Number(headers['x-dss-timestamp']);
  const given = String(headers['x-dss-signature'] || '').replace(/^v1=/, '');
  if (!ts || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  try { return safeEqualHex(expected, given); } catch { return false; }
}

/* ------------------------------------------------------------------ *
 * 4. Sealing
 * ------------------------------------------------------------------ */

/* Binds the audit chain to the actual bytes of the flattened PDF. Without this
   the two are separate claims and either could be swapped for the other; with
   it, the number printed on the certificate covers both. Feed it the sha256
   returned by the flattening engine. */
export function sealDocument(headHash, pdfSha256) {
  return createHash('sha256')
    .update((headHash ?? 'GENESIS') + '\u001e' + pdfSha256)
    .digest('hex');
}
