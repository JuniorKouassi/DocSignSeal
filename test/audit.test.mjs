import { appendEvent, verifyChain, issueToken, resolveToken, signWebhook, verifyWebhook, sealDocument } from '../src/audit.mjs';

// in-memory store standing in for Postgres
const db = { events: [], signers: [], docs: {} };
const store = {
  lastEvent: async d => db.events.filter(e => e.document_id === d).at(-1),
  insertEvent: async e => { db.events.push({ id: db.events.length + 1, ...e }); },
  listEvents: async d => db.events.filter(e => e.document_id === d),
  findSignerByTokenHash: async h => db.signers.find(s => s.token_hash === h),
  getDocument: async id => db.docs[id],
  listSigners: async d => db.signers.filter(s => s.document_id === d)
};

const DOC = 'doc_01J9K2';
db.docs[DOC] = { id: DOC, status: 'sent', routing: 'sequential', expires_at: null };

for (const ev of ['document.sent','signer.viewed','stamp.applied','signer.signed'])
  await appendEvent(store, { document_id: DOC, event: ev, actor: 'j@usdi.fc', ip: '193.83.11.4' });

console.log('1. intact chain      :', await verifyChain(store, DOC));

// tamper: rewrite an old event the way an insider would
db.events[1].actor = 'someone.else@example.com';
const broken = await verifyChain(store, DOC);
console.log('2. after tampering   :', broken.ok, '|', broken.reason, '| at row', broken.brokenAt);
db.events[1].actor = 'j@usdi.fc';

// tokens and sequential routing
const a = issueToken(), b = issueToken();
db.signers.push(
  { document_id: DOC, order_index: 0, name: 'Junior', status: 'pending', token_hash: a.token_hash },
  { document_id: DOC, order_index: 1, name: 'Chargé d Affaires', status: 'pending', token_hash: b.token_hash }
);

const first  = await resolveToken(store, a.raw);
const second = await resolveToken(store, b.raw);
console.log('3. signer 1 editable :', first.editable);
console.log('4. signer 2 editable :', second.editable, '| waiting for', second.waitingFor);
console.log('5. forged token      :', await resolveToken(store, 'x'.repeat(43)));

// webhooks
const body = { event: 'document.completed', document_id: DOC };
const h = signWebhook('whsec_test', body);
const headers = { 'x-dss-timestamp': h['X-DSS-Timestamp'], 'x-dss-signature': h['X-DSS-Signature'] };
console.log('6. webhook valid     :', verifyWebhook('whsec_test', JSON.stringify(body), headers));
console.log('7. wrong secret      :', verifyWebhook('whsec_wrong', JSON.stringify(body), headers));
console.log('8. replayed 10 min   :',
  verifyWebhook('whsec_test', JSON.stringify(body),
    { ...headers, 'x-dss-timestamp': String(Number(headers['x-dss-timestamp']) - 600) }));

const head = (await verifyChain(store, DOC)).head;
console.log('9. document seal     :', sealDocument(head, '8572eb955c53c4cc101d13e36ff61415').slice(0, 32) + '...');
