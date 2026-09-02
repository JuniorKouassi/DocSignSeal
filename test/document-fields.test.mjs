import { readFile } from 'node:fs/promises';
import { toAnnotation } from '../src/document-fields.mjs';
import { flatten } from '../src/flatten.mjs';
import { appendEvent, verifyChain, sealDocument } from '../src/audit.mjs';

// End-to-end sanity check of the step-6 pipeline: real document_field-shaped
// rows -> toAnnotation() -> the real, tested flatten() -> a real sealed PDF.

console.log('1. attachment field skipped:', toAnnotation({ type: 'attachment', page: 1, x: 0, y: 0, w: 1, h: 1, sortOrder: 0 }) === null);
console.log('2. empty signature skipped :', toAnnotation({ type: 'signature', strokeData: [], page: 1, x: 0, y: 0, w: 1, h: 1, sortOrder: 0 }) === null);

const fields = [
  { type: 'fullname', page: 1, x: 10, y: 10, w: 30, h: 5, sortOrder: 0, valueText: 'Junior Kouassi' },
  { type: 'date', page: 1, x: 10, y: 20, w: 20, h: 5, sortOrder: 1, valueText: '2026-09-03' },
  { type: 'checkbox', page: 1, x: 10, y: 30, w: 4, h: 4, sortOrder: 2, valueText: 'true' },
  { type: 'number', page: 1, x: 10, y: 40, w: 15, h: 5, sortOrder: 3, valueText: '42' },
  {
    type: 'signature', page: 1, x: 10, y: 50, w: 22, h: 6, sortOrder: 4,
    strokeData: [[{ x: 0, y: 50 }, { x: 30, y: 20 }, { x: 60, y: 60 }, { x: 90, y: 30 }]],
  },
];

const annotations = fields.map(toAnnotation).filter((a) => a !== null);
console.log('3. drawable annotations    :', annotations.length === 5);

const sourceBytes = await readFile(new URL('../design/flatten-example-output.pdf', import.meta.url));

// document.completed's audit chain, computed the same way lib/audit/store.ts does.
const db = { events: [] };
const store = {
  lastEvent: async () => db.events.at(-1) ?? null,
  insertEvent: async (e) => { db.events.push(e); },
  listEvents: async () => db.events,
};
await appendEvent(store, { document_id: 'doc_test', event: 'document.sent', actor: 'sender@example.com' });
await appendEvent(store, { document_id: 'doc_test', event: 'signer.signed', actor: 'junior@example.com' });
const chain = await verifyChain(store, 'doc_test');
console.log('4. chain intact before seal:', chain.ok);

const certificate = {
  documentTitle: 'Test document',
  documentId: 'doc_test',
  signers: [{ name: 'Junior Kouassi', email: 'junior@example.com', status: 'signed', signed_at: new Date().toISOString(), auth_method: 'link_only', ip: '203.0.113.7' }],
  events: db.events,
};

const { bytes, sha256 } = await flatten({ sourceBytes, annotations, certificate });
console.log('5. output is a real PDF   :', Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-');
console.log('6. output larger than src :', bytes.length > sourceBytes.length);
console.log('7. sha256 looks right     :', /^[0-9a-f]{64}$/.test(sha256));

const seal = sealDocument(chain.head, sha256);
console.log('8. seal looks right       :', /^[0-9a-f]{64}$/.test(seal));

const forgedSeal = sealDocument(chain.head, 'a'.repeat(64));
console.log('9. seal binds file hash   :', seal !== forgedSeal);
