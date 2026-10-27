// Budget scenarios L1-L4: the worst legitimate sign, snapshot batches, transactions, and a control ruleset
// that shows whether the emulator enforces the 10-document-read limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
import { attempt, clearData, clientFor, closeClients, seedDocs, setRules } from './harness.mjs';
import { OWNERS3, approval, clientBackfill, clientAttach, clientNewApproval, clientSign, identity, project, snapshotDoc, world } from './world.mjs';

const S2 = ['ITEL', 'SYMC'];
async function prepare(which, docs) { await setRules(which); await clearData(); await seedDocs(docs); }
const ref = (db, path = 'projects/P') => doc(db, path);

test('L1 worst-case legitimate sign: snapshot-backed three-owner O&M completion with a saved Management role', async () => {
  const proj = project({ owners: OWNERS3, designApproval: approval({ owners: OWNERS3, stage: 'OM', planningApproved: OWNERS3, omApproved: ['ITEL', 'UIH'] }) });
  const payload = clientSign(proj, OWNERS3, { owner: 'SYMC', level: 'OM', uid: 'MGT' });
  for (const which of ['before', 'after']) {
    await prepare(which, world({ proj, roles: { Management: { approveOM: true, viewMap: true } } }));
    assert.equal(await attempt(() => setDoc(ref(clientFor(identity('MGT'))), payload, { merge: true })), 'ALLOW', `${which} rules`);
    await closeClients();
  }
});

test('L3 the 450+70 child batch, the attach transaction and the backfill transaction replay as ALLOW under old and new rules', async () => {
  const empty = project({ designApproval: null, approvalDraft: { designNotes: 'n' } });
  for (const which of ['before', 'after']) {
    // submit: metadata, 520 route children in two batches (450 + 70), then the attach transaction
    await prepare(which, world({ proj: structuredClone(empty), snap: null }));
    const dsg = clientFor(identity('DSG'));
    const base = 'projects/P/approvalSnapshots/ap_2';
    assert.equal(await attempt(() => setDoc(doc(dsg, base), snapshotDoc('ap_2', S2, { createdByUid: 'DSG' }))), 'ALLOW', `${which}: metadata`);
    for (const [from, to] of [[0, 450], [450, 520]]) {
      assert.equal(await attempt(async () => {
        const batch = writeBatch(dsg);
        for (let i = from; i < to; i += 1) batch.set(doc(dsg, `${base}/routes/r${i}`), { projectId: 'P', approvalId: 'ap_2', data: { id: `r${i}`, name: `Route ${i}` } });
        await batch.commit();
      }), 'ALLOW', `${which}: batch ${from}-${to}`);
    }
    assert.equal(await attempt(() => runTransaction(dsg, async t => { await t.get(ref(dsg)); t.update(ref(dsg), clientAttach(clientNewApproval({ uid: 'DSG' }))); })), 'ALLOW', `${which}: attach transaction`);
    await closeClients();

    // legacy backfill transaction (Admin)
    const legacy = project({ designApproval: approval({ snapshot: false }) });
    await prepare(which, world({ proj: legacy, snap: null, extra: { 'projects/P/approvalSnapshots/snap_b': { id: 'snap_b', projectId: 'P', approvalId: 'ap_1', backfill: true, createdByUid: 'ADM', createdAt: 'x' } } }));
    const adm = clientFor(identity('ADM'));
    assert.equal(await attempt(() => runTransaction(adm, async t => { await t.get(ref(adm)); t.update(ref(adm), clientBackfill('snap_b', 'ADM', 'adm@example.test')); })), 'ALLOW', `${which}: backfill transaction`);
    await closeClients();
  }
});

test('L4 control ruleset: does the emulator enforce the 10-distinct-document read limit?', async () => {
  const get = n => `get(/databases/$(database)/documents/ctl/d${n}).data.v == 1`;
  const rules = count => `rules_version='2'; service cloud.firestore { match /databases/{database}/documents { match /ctl/{x} { allow read: if true; allow write: if ${Array.from({ length: count }, (_, i) => get(i)).join(' && ')}; } } }`;
  const seed = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`ctl/d${i}`, { v: 1 }]));
  const results = {};
  for (const count of [10, 11]) {
    await setRules('after', rules(count)); await clearData(); await seedDocs(seed);
    results[count] = await attempt(() => setDoc(doc(clientFor({ uid: 'u', email: 'u@x.test' }), 'ctl/w'), { v: 1 }));
    await closeClients();
  }
  console.log(`L4 control: 10 distinct gets -> ${results[10]}; 11 distinct gets -> ${results[11]}`);
  assert.equal(results[10], 'ALLOW');
  assert.ok(['ALLOW', 'DENY'].includes(results[11]));
});

test('L2 budget margin: the heaviest legitimate writes still ALLOW with 4 padding units (~40 expressions) added to the rule', async () => {
  const pad = Array(4).fill("(resource.data.status == 'Pending Approval' || true)").join(' && ');
  const { readFileSync } = await import('node:fs');
  const { RULE_FILES } = await import('./harness.mjs');
  const text = readFileSync(RULE_FILES.after, 'utf8');
  const padded = text.replace('projectUpdateAllowed(resource.data, projectId);\n      allow delete', `projectUpdateAllowed(resource.data, projectId) && ${pad};\n      allow delete`);
  assert.notEqual(padded, text, 'padding anchor not found in firestore.rules');
  const { FIXTURES } = await import('./fixtures.base.mjs');
  await import('./fixtures.sign.mjs'); await import('./fixtures.rewind.mjs');
  const worst = ['L1', 'G2', 'G4', 'G11', 'G13', 'G16', 'G17', 'G19', 'O1', 'WP5', 'WP7', 'WP9a', 'WP9b',
    'WP10.completeThenRewind.Pending', 'WP10.completeThenRewind.Rejected'];
  for (const id of worst) {
    const f = FIXTURES.find(item => item.id === id);
    await setRules('after', padded); await clearData();
    const built = f.build(); await seedDocs(built.docs);
    const cache = {}; const ctx = { ...built, as: n => (cache[n] ??= clientFor(identity(n))), get db() { return this.as(f.actor); } };
    assert.equal(await attempt(() => f.run(ctx)), 'ALLOW', `${id} must keep ~40 spare expressions`);
    await closeClients();
  }
});
