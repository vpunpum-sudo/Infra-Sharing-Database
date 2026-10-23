const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makeStore } = require('./fixtures/reminderStore');
const { deriveStageReminder: derive, resolveStagePermissions, reminderRecipients,
  reminderDeliveryId: idFor, errorCategory, runStageReminders: run, STAGE_PERMISSION_DEFAULTS } = require('./approvalReminders');
const { REMINDER_DEFAULTS: D, PROJECT_SELECT_FIELDS, reminderTransportOptions } = require('./approvalReminderConfig');
const DAY = 86400000, START = Date.parse('2026-01-01T00:00:00Z');
const iso = days => new Date(START + days * DAY).toISOString();
const user = (email = 'signer@example.test', owner = 'ITEL', role = 'Planning', extra = {}) => ({ email, owner, role, isApproved: true, ...extra });
const planner = user();
const admin = user('admin@example.test', 'None', 'Admin');
const perms = resolveStagePermissions();
function project(days = 0) {
  return { name: 'Fiber <A> & B', routeCode: 'RT-01', status: 'Pending Approval', owners: ['ITEL'],
    designApproval: { id: 'approval-1', documentNumber: 'DOC-1', status: 'Pending Approval', approvalStage: 'Planning', requestedAt: iso(days),
      planningSignOffs: { ITEL: { status: 'Pending' } }, omSignOffs: { ITEL: { status: 'Pending' } } } };
}
function omProject() {
  const p = project(); p.designApproval.approvalStage = 'OM';
  p.designApproval.planningSignOffs.ITEL = { status: 'Approved', signedAt: iso(2) }; return p;
}
function twoOwners() {
  const p = project(); p.owners.push('UIH'); p.designApproval.planningSignOffs.UIH = { status: 'Pending' };
  p.designApproval.omSignOffs.UIH = { status: 'Pending' }; return p;
}
function harness({ projects = { p: project() }, users = [planner], db, ...rest } = {}) {
  db ||= makeStore({ projects }); const sent = [], logs = [];
  const logger = { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) };
  return { db, sent, logs, logger, async run(days = 3, options = {}) {
    return run({ db, users, permissions: perms, now: () => START + days * DAY,
      mode: 'live', send: async message => { sent.push(message); }, logger,
      serverTimestamp: () => 'server-time', appUrl: 'https://app.example.test', ...rest, ...options });
  } };
}
function receiptId(p, days, email = planner.email, kind = 'stage-reminder', projectId = 'p') {
  const state = derive(p, START + days * DAY);
  return idFor(projectId, state, kind, kind === 'stage-reminder' ? state.reminderNumber : 0, email);
}
function putReceipt(db, id, data) { db.put('approvalEmailDeliveries/' + id, data); }

test('S1-S6 thresholds, fixed cadence, catch-up, max cap, future and zero elapsed', async () => {
  const h = harness();
  assert.equal((await h.run(2 + 23 / 24)).sent, 0);
  assert.equal((await h.run(3)).sent, 1);
  assert.equal((await h.run(3 + 1 / DAY)).alreadySent, 1);
  assert.equal((await h.run(5)).sent, 0);
  const id1 = h.sent[0].messageId;
  assert.equal((await h.run(6)).sent, 1); assert.notEqual(h.sent[1].messageId, id1);
  assert.equal((await h.run(9)).sent, 1);
  for (const days of [12, 30, 90]) assert.equal((await h.run(days)).sent, 0);
  const late = harness(); assert.equal((await late.run(30)).sent, 1);
  assert.match(late.sent[0].text, /3 จาก 3/); assert.equal((await late.run(90)).sent, 0);
  const catchup = harness({ users: [planner, admin] });
  assert.equal((await catchup.run(10)).sent, 2); assert.match(catchup.sent[0].text, /3 จาก 3/);
  assert.match(catchup.sent[1].subject, /ค้างเกิน 7 วัน/);
  const future = harness({ projects: { p: project(4) } });
  assert.equal((await future.run(3)).skipped['stage-start-unavailable'], 1);
  assert.match(JSON.stringify(future.logs), /stage-start-unavailable/);
  assert.equal((await harness().run(0)).sent, 0);
});

test('S7-S10 stage derives unsigned owners and latest valid Planning completion, then advances', async () => {
  const p = twoOwners(); p.designApproval.planningSignOffs.ITEL = { status: 'Approved', signedAt: iso(1) };
  const h = harness({ projects: { p }, users: [planner, user('uih@example.test', 'UIH')] });
  assert.equal((await h.run(3)).sent, 1); assert.equal(h.sent[0].to, 'uih@example.test');
  p.designApproval.planningSignOffs.UIH = { status: 'Approved', signedAt: iso(19) };
  p.designApproval.approvalStage = 'OM';
  h.db.put('projects/p', p);
  assert.equal((await h.run(20)).sent, 0);
  h.db.put('projects/p', { ...p, designApproval: { ...p.designApproval,
    planningSignOffs: { ITEL: { status: 'Approved', signedAt: iso(1) }, UIH: { status: 'Approved', signedAt: iso(2) } } } });
  const result = await h.run(5, { users: [user('manager@example.test', 'UIH', 'Management')] });
  assert.equal(result.sent, 1); assert.notEqual(h.sent[0].messageId, h.sent[1].messageId);
  assert.match(h.sent[1].text, /Management \(O&M\)/);
  for (const bad of [undefined, 'not-a-date', iso(30)]) {
    const invalid = structuredClone(p); invalid.designApproval.planningSignOffs.UIH.signedAt = bad;
    const x = harness({ projects: { p: invalid } });
    assert.equal((await x.run(20)).skipped['stage-start-unavailable'], 1);
  }
});

test('S11,S13 ineligible states, no configured owners, no approval, rejection at either level and full OM', async () => {
  const variants = [];
  for (const status of ['Rejected', 'Approved', 'Draft']) { const p = project(); p.status = status; variants.push(p); }
  for (const status of ['Rejected', 'Approved', 'Draft']) { const p = project(); p.designApproval.status = status; variants.push(p); }
  for (const stage of ['Rejected', 'Completed']) { const p = project(); p.designApproval.approvalStage = stage; variants.push(p); }
  for (const level of ['planningSignOffs', 'omSignOffs']) { const p = project(); p.designApproval[level].ITEL.status = 'Rejected'; variants.push(p); }
  const full = omProject(); full.designApproval.omSignOffs.ITEL.status = 'Approved'; variants.push(full);
  const noOwner = project(); noOwner.owners = []; delete noOwner.owner; variants.push(noOwner, {}, { ...project(), designApproval: undefined });
  for (const p of variants) assert.equal((await harness({ projects: { p } }).run(30)).sent, 0);
  const absentStatus = project(); delete absentStatus.status; absentStatus.owner = 'ITEL'; absentStatus.owners = [];
  assert.equal((await harness({ projects: { p: absentStatus } }).run(3)).sent, 1);
});

test('S12,S14 rewind reuses Planning clock/ids; Draft stops; resubmission makes fresh clock and ids', async () => {
  const p = project(); const h = harness();
  assert.equal((await h.run(9)).sent, 1);
  h.db.put('projects/p', omProject()); assert.equal((await h.run(10)).sent, 0);
  h.db.put('projects/p', p); assert.equal((await h.run(30)).alreadySent, 1);
  h.db.put('projects/p', { ...p, status: 'Draft' }); assert.equal((await h.run(30)).sent, 0);
  p.designApproval.id = 'resubmitted'; p.designApproval.requestedAt = iso(30); h.db.put('projects/p', p);
  assert.equal((await h.run(31)).sent, 0); assert.equal((await h.run(33)).sent, 1);
  assert.notEqual(h.sent[0].messageId, h.sent[1].messageId);
});

test('S15-S19 explicit owner/role/approval filters, default drift, overrides, normalization and Admin fallback', async () => {
  const state = derive(project(), START + 3 * DAY);
  const inputs = [planner, user('design@example.test', 'ITEL', 'Design'),
    ...['Management', 'Viewer', 'Sub-contract'].map(role => user(`${role}@example.test`, 'ITEL', role)),
    user('no@example.test', 'ITEL', 'Planning', { isApproved: false }), user('invalid'), user(''), user('ignored', 'ITEL', 'Planning', { email: undefined }),
    user('none@example.test', 'None'), user('missing@example.test', undefined, 'Planning', { owner: undefined }),
    user('other@example.test', 'UIH'), admin];
  assert.deepEqual(reminderRecipients(inputs, perms, state).reminders, ['design@example.test', planner.email]);
  assert.deepEqual(reminderRecipients([admin], perms, state).reminders, [admin.email]);
  assert.deepEqual(reminderRecipients([admin], { ...perms, Admin: { approvePlanning: false } }, state).reminders, []);
  assert.deepEqual(reminderRecipients([user(' A@X.com ', ' itel '), user('a@x.com')], perms, state).reminders, ['a@x.com']);
  const om = derive(omProject(), START + 5 * DAY);
  assert.deepEqual(reminderRecipients([...inputs, user('manager@example.test', 'ITEL', 'Management')], perms, om).reminders, ['management@example.test', 'manager@example.test']);
  const logs = [], logger = { warn: (...args) => logs.push(args) };
  const overridden = resolveStagePermissions({ Viewer: { permissions: { approveOM: true, unknown: true } },
    Design: { permissions: { approvePlanning: false } }, Planning: { permissions: 'malformed' } }, logger);
  assert.equal(overridden.Design.approvePlanning, false); assert.equal(overridden.Planning.approvePlanning, true);
  assert.deepEqual(reminderRecipients([planner, user('design@example.test', 'ITEL', 'Design')], overridden, state).reminders, [planner.email]);
  assert.equal(logs.length, 1);
  assert.deepEqual(reminderRecipients([user('viewer@example.test', 'ITEL', 'Viewer')], overridden, om).reminders, ['viewer@example.test']);
  const h = harness({ users: [user('viewer@example.test', 'ITEL', 'Viewer')], projects: { p: omProject() } });
  assert.equal((await h.run(5, { permissions: overridden })).sent, 1);
  const source = fs.readFileSync(__dirname + '/../src/constants.ts', 'utf8');
  for (const [role, defaults] of Object.entries(STAGE_PERMISSION_DEFAULTS)) {
    const block = source.match(new RegExp(`(?:'${role}'|${role}): \\{([\\s\\S]*?)\\n  \\}`))?.[1];
    assert.ok(block, role);
    for (const [key, value] of Object.entries(defaults)) assert.match(block, new RegExp(`${key}: ${value}`));
  }
});

test('S20 escalation threshold, one delivery per stage, independent reminder cap', async () => {
  const h = harness({ users: [planner, admin] });
  assert.equal((await h.run(6 + 23 / 24)).sent, 1);
  assert.equal((await h.run(7)).sent, 1); assert.match(h.sent.at(-1).subject, /ค้างเกิน 7 วัน/);
  assert.equal((await h.run(8)).sent, 0); assert.equal((await h.run(9)).sent, 1);
  assert.equal((await h.run(30)).sent, 0);
});

test('S20a earlier fallback receipt excludes only the Admin who actually received it, direct bounded lookup', async () => {
  const b = user('b-admin@example.test', 'None', 'Admin');
  const h = harness({ users: [admin] }); assert.equal((await h.run(3)).sent, 1);
  const before = h.db.events.getAll.length;
  const result = await h.run(7, { users: [planner, admin, b] });
  assert.equal(result.escalationExcluded, 1);
  assert.equal(h.sent.filter(m => m.to === admin.email).length, 1);
  assert.ok(h.sent.some(m => m.to === b.email));
  assert.equal(h.db.events.queries.filter(q => q.collection === 'approvalEmailDeliveries').length, 0);
  const exclusionReads = h.db.events.getAll.slice(before).filter(call => call.paths.length === 3);
  assert.equal(exclusionReads.length, 3); // candidate peek (3), then 3 ids for each of two Admins
});

test('S20b(a-c),S20c failed/busy/exhausted reminders preserve escalation eligibility; same-run success excludes', async () => {
  for (const status of ['failed', 'sending', 'exhausted']) {
    const h = harness({ users: [admin] });
    putReceipt(h.db, receiptId(project(), 7, admin.email), { status: status === 'exhausted' ? 'failed' : status,
      attempts: status === 'exhausted' ? 3 : 1, leaseUntil: START + 8 * DAY });
    let calls = 0;
    const result = await h.run(7, { send: async message => {
      h.sent.push(message); calls++;
      if (status === 'failed' && calls === 1) throw Object.assign(new Error('private provider output'), { code: 'ECONNRESET' });
    } });
    assert.equal(result.sent, 1); assert.match(h.sent.at(-1).subject, /ค้างเกิน 7 วัน/);
    assert.equal(result.escalationExcluded, 0);
  }
  const success = harness({ users: [admin] }); const result = await success.run(7);
  assert.equal(result.sent, 1); assert.equal(result.escalationExcluded, 1);
});

test('S20b(d-e) cap-deferred escalation stays eligible across later runs and is never sent twice', async () => {
  const a = user('a@example.test', 'None', 'Admin'), b = user('b@example.test', 'None', 'Admin');
  const h = harness({ users: [a, b] });
  const first = await h.run(7, { maxEmails: 1 });
  assert.equal(first.sent, 1); assert.equal(first.escalationExcluded, 1); assert.equal(first.deferredByCap, 2);
  assert.equal(h.sent[0].to, a.email);
  assert.equal((await h.run(7, { users: [planner, a, b], maxEmails: 10 })).sent, 2); // new signer + B escalation
  assert.equal(h.sent.filter(m => m.to === b.email).length, 1);
  assert.equal((await h.run(7, { users: [planner, a, b] })).sent, 0);
  assert.equal(h.sent.filter(m => m.to === a.email).length, 1);
  const x = harness({ users: [planner, admin] });
  assert.equal((await x.run(7, { maxEmails: 1 })).deferredByCap, 1);
  assert.equal((await x.run(7, { maxEmails: 1 })).sent, 1);
  assert.equal((await x.run(7, { maxEmails: 1 })).sent, 0);
});

test('S21,S24 repeat idempotency, expired lease recovery and live lease skip', async () => {
  const h = harness(); assert.equal((await h.run()).sent, 1); assert.equal((await h.run()).alreadySent, 1);
  assert.equal(h.sent.length, 1);
  const x = harness(); const id = receiptId(project(), 3);
  putReceipt(x.db, id, { status: 'sending', attempts: 1, leaseUntil: START + 4 * DAY });
  assert.equal((await x.run(3)).busy, 1); assert.equal(x.db.events.transactions, 0);
  assert.equal((await x.run(4)).sent, 1); assert.equal(x.db.data('approvalEmailDeliveries/' + id).attempts, 2);
});

test('S22 concurrent runs interleave with conflict retries; disabled conflict model exposes duplicate', async () => {
  for (const conflictModel of [true, false]) {
    const db = makeStore({ projects: { p: project() }, conflictModel });
    const h = harness({ db });
    const results = await Promise.all([h.run(), h.run()]);
    if (conflictModel) {
      assert.equal(h.sent.length, 1); assert.ok(db.events.conflicts > 0);
      assert.equal(results.reduce((n, r) => n + r.busy + r.alreadySent, 0), 1);
    } else { assert.equal(db.events.conflicts, 0); assert.ok(h.sent.length > 1); }
  }
});

test('S23,S26 three failed claims exhaust; three consecutive failures abort without throwing', async () => {
  const h = harness(); const send = async () => { throw Object.assign(new Error('private'), { code: 'EAUTH' }); };
  for (let i = 0; i < 3; i++) assert.equal((await h.run(3, { send })).failed, 1);
  assert.equal((await h.run(3, { send })).exhausted, 1);
  const record = h.db.data('approvalEmailDeliveries/' + receiptId(project(), 3));
  assert.equal(record.status, 'failed'); assert.equal(record.leaseUntil, 0); assert.equal(record.lastErrorCategory, 'smtp-auth');
  assert.equal(record.attempts, 3); assert.equal(record.lastError, undefined);
  const retry = harness(); await retry.run(3, { send }); assert.equal((await retry.run()).sent, 1);
  const x = harness({ users: Array.from({ length: 5 }, (_, i) => user(`u${i}@example.test`)) });
  const result = await x.run(3, { send }); assert.equal(result.failed, 3); assert.equal(result.deferredByAbort, 2);
});

test('S25 deterministic ids differ by every identity input, and have no clock/run input', () => {
  const state = derive(project(), START + 3 * DAY), base = idFor('p', state, 'stage-reminder', 1, planner.email);
  assert.equal(base, idFor('p', state, 'stage-reminder', 1, planner.email));
  const variations = [idFor('q', state, 'stage-reminder', 1, planner.email),
    idFor('p', { ...state, approvalId: 'new' }, 'stage-reminder', 1, planner.email),
    idFor('p', { ...state, stage: 'OM' }, 'stage-reminder', 1, planner.email),
    idFor('p', state, 'stage-reminder', 2, planner.email), idFor('p', state, 'stage-escalation', 0, planner.email),
    idFor('p', state, 'stage-reminder', 1, 'other@example.test')];
  assert.equal(new Set([base, ...variations]).size, 7);
  assert.equal(base, require('node:crypto').createHash('sha256').update(JSON.stringify([
    'approval-stage-reminder', 'p', 'approval-1', 'Planning', 'reminder', 1, planner.email])).digest('hex'));
});

test('S26a receipt-write retry succeeds, persistent ambiguity retains lease and permits bounded duplicate later', async () => {
  for (const permanent of [false, true]) {
    const h = harness(); let failures = 0;
    h.db.failSet = (_path, data) => data.status === 'sent' && (++failures <= (permanent ? Infinity : 1));
    const result = await h.run(3);
    assert.equal(result.sent, permanent ? 0 : 1); assert.equal(result.ambiguous, permanent ? 1 : 0);
    if (!permanent) assert.equal(failures, 2);
    else {
      const id = receiptId(project(), 3); const receipt = () => h.db.data('approvalEmailDeliveries/' + id);
      assert.equal(receipt().status, 'sending'); assert.equal(receipt().lastErrorCategory, 'receipt-write');
      assert.equal((await h.run(3)).busy, 1);
      await h.run(3 + 11 / 1440); assert.equal(receipt().attempts, 2);
      await h.run(3 + 22 / 1440); assert.equal(receipt().attempts, 3);
      assert.equal((await h.run(3 + 33 / 1440)).exhausted, 1);
      assert.equal(h.sent.length, 3); // SMTP accepted each time: accepted best-effort duplicate limitation.
      assert.ok(!JSON.stringify(h.logs).includes('exactly once'));
    }
  }
  const h = harness({ users: Array.from({ length: 5 }, (_, i) => user(`u${i}@example.test`)) });
  h.db.failSet = (_path, data) => data.status === 'sent';
  const result = await h.run(); assert.equal(result.ambiguous, 3); assert.equal(result.deferredByAbort, 2);
});

test('S26b recheck invalidates rejected, advanced, rewound, resubmitted, or changed due-number projects', async () => {
  for (const mutate of [p => { p.status = 'Rejected'; }, p => { p.designApproval.planningSignOffs.ITEL = { status: 'Approved', signedAt: iso(0) }; },
    p => { p.status = 'Draft'; }, p => { p.designApproval.id = 'new-request'; }, p => { p.designApproval.requestedAt = iso(1); }]) {
    const h = harness({ projects: { p: project(), q: project() } });
    h.db.beforeRecheck = id => { if (id === 'p') { const p = project(); mutate(p); h.db.put('projects/p', p); } };
    const result = await h.run(3); assert.equal(result.staleSkipped, 1); assert.equal(result.sent, 1);
    assert.equal(h.db.events.transactions, 1); assert.match(h.sent[0].text, /\/project\/q/);
  }
  const h = harness(); await h.run(); h.db.events.getAll.length = 0;
  await h.run(); assert.ok(!h.db.events.getAll.some(call => call.paths.some(p => p.startsWith('projects/'))));
});

test('S26c recheck removes approved-owner recipients and includes newly unsigned-owner recipients with own peek', async () => {
  for (const add of [false, true]) {
    const p = twoOwners(); if (add) p.designApproval.planningSignOffs.UIH.status = 'Approved';
    const h = harness({ projects: { p }, users: [planner, user('uih@example.test', 'UIH')] });
    h.db.beforeRecheck = () => {
      const fresh = structuredClone(p);
      fresh.designApproval.planningSignOffs[add ? 'UIH' : 'ITEL'].status = add ? 'Pending' : 'Approved';
      h.db.put('projects/p', fresh);
    };
    const result = await h.run(); assert.equal(result.sent, add ? 2 : 1); assert.equal(result.staleSkipped, add ? 0 : 1);
    assert.deepEqual(h.sent.map(m => m.to), add ? [planner.email, 'uih@example.test'] : ['uih@example.test']);
    assert.equal(h.db.events.getAll.filter(call => call.paths[0]?.startsWith('projects/')).length, 1);
    if (add) {
      const fresh = h.db.data('projects/p');
      assert.ok(h.db.events.docGets.includes('approvalEmailDeliveries/' + receiptId(fresh, 3, 'uih@example.test')));
    }
  }
});

test('S26d deadline stops new sends; transport uses finite SMTP timeouts', async () => {
  let time = START + 3 * DAY; const h = harness({ users: [planner, user('z@example.test')] });
  const result = await h.run(3, { now: () => time, send: async m => { h.sent.push(m); time += 480001; } });
  assert.equal(result.sent, 1); assert.equal(result.deferredByTime, 1);
  assert.deepEqual(reminderTransportOptions('sender', 'password'), {
    service: 'gmail', auth: { user: 'sender', pass: 'password' }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000 });
});

test('S28 dry-run reads/pre-filters receipts but never claims, writes, rechecks or sends; applies cap', async () => {
  const users = [planner, user('b@example.test'), user('z@example.test')]; const h = harness({ users });
  putReceipt(h.db, receiptId(project(), 3, 'b@example.test'), { status: 'sent' });
  const result = await h.run(3, { mode: 'dry-run', maxEmails: 1 });
  assert.equal(result.wouldSend, 1); assert.equal(result.alreadySent, 1); assert.equal(result.deferredByCap, 1);
  assert.equal(h.db.events.transactions, 0); assert.equal(h.db.events.writes.length, 0); assert.equal(h.sent.length, 0);
  assert.ok(!h.db.events.getAll.some(call => call.fieldMask)); assert.ok(!JSON.stringify(h.logs).includes('@'));
  const fallback = harness({ users: [admin] }); const dry = await fallback.run(7, { mode: 'dry-run' });
  assert.equal(dry.wouldSend, 1); assert.equal(dry.escalationExcluded, 1);
});

test('S29 order is oldest stage start, project id, then email; reminders precede escalations', async () => {
  const h = harness({ projects: { z: project(1), b: project(), a: project() }, users: [user('z@example.test'), user('a@example.test'), admin] });
  const result = await h.run(8, { maxEmails: 3 }); assert.equal(result.sent, 3); assert.equal(result.deferredByCap, 6);
  assert.deepEqual(h.sent.map(m => [m.to, m.text.match(/\/project\/([^\n]+)/)[1]]), [['a@example.test', 'a'], ['z@example.test', 'a'], ['a@example.test', 'b']]);
});

test('S29a exact multi-run progression: 3,3,1 sends; sent/busy/exhausted prefix cannot consume cap', async () => {
  const users = Array.from({ length: 12 }, (_, i) => user(`u${String(i + 1).padStart(2, '0')}@example.test`));
  const h = harness({ users }); const ids = users.map(u => receiptId(project(), 3, u.email));
  for (const position of [1, 4, 8, 11]) putReceipt(h.db, ids[position - 1], { status: 'sent', attempts: 1 });
  for (const position of [3, 10]) putReceipt(h.db, ids[position - 1], { status: 'sending', attempts: 1, leaseUntil: START + 3 * DAY + 600000 });
  putReceipt(h.db, ids[5], { status: 'failed', attempts: 3 });
  const results = [await h.run(3, { maxEmails: 3 }), await h.run(3 + 15 / 1440, { maxEmails: 3 }), await h.run(3 + 15 / 1440, { maxEmails: 3 })];
  assert.deepEqual(results.map(r => r.sent), [3, 3, 1]); assert.deepEqual(results.map(r => r.deferredByCap), [2, 1, 0]);
  assert.equal(results[0].alreadySent, 4); assert.equal(results[0].busy, 2); assert.equal(results[0].exhausted, 1);
  assert.deepEqual(h.sent.map(m => users.findIndex(u => u.email === m.to) + 1), [2, 5, 7, 3, 9, 10, 12]);
  assert.equal(new Set(h.sent.map(m => m.messageId)).size, 7); assert.equal(h.db.data('approvalEmailDeliveries/' + ids[5]).attempts, 3);
  for (const write of h.db.events.writes) assert.equal(write.data.email, undefined);
});

test('S29b >1000 sent prefix is prefiltered in chunks, and later recipients all make progress', async () => {
  const users = Array.from({ length: 10 }, (_, i) => user(`u${i}@example.test`));
  const projects = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`p${String(i).padStart(3, '0')}`, project()]));
  const h = harness({ projects, users });
  const ordered = Object.keys(projects).flatMap(id => users.map(u => receiptId(projects[id], 3, u.email, 'stage-reminder', id)));
  for (const id of ordered.slice(0, 1100)) putReceipt(h.db, id, { status: 'sent' });
  const first = await h.run(3, { maxEmails: 5 });
  assert.equal(first.sent, 5); assert.equal(first.alreadySent, 1100); assert.equal(first.deferredByCap, 95); assert.equal(h.db.events.transactions, 5);
  assert.deepEqual(h.sent.map(m => m.messageId), ordered.slice(1100, 1105).map(id => `<approval-reminder-${id}@gmail.com>`));
  const chunks = h.db.events.getAll.filter(c => !c.fieldMask); assert.ok(chunks.length >= 12); assert.ok(chunks.every(c => c.paths.length <= 100));
  for (let i = 0; i < 19; i++) await h.run(3, { maxEmails: 5 });
  assert.equal(h.sent.length, 100); assert.equal(new Set(h.sent.map(m => m.messageId)).size, 100);
});

test('S29c 5200 candidates read only first 5000 and warn; handled prefix beyond ceiling remains an accepted limitation', async () => {
  const users = Array.from({ length: 5200 }, (_, i) => user(`u${String(i).padStart(4, '0')}@example.test`));
  const h = harness({ users }); const result = await h.run(3, { maxEmails: 0 });
  const candidateReads = h.db.events.getAll.filter(call => !call.fieldMask);
  assert.equal(candidateReads.reduce((n, call) => n + call.paths.length, 0), 5000);
  assert.equal(result.candidateTruncated, true); assert.equal(result.truncated, true);
  assert.ok(h.logs.some(([message]) => message.startsWith('REMINDER CANDIDATES TRUNCATED')));
});

test('S30 projected pagination 100/100/50 and recheck mask; scan capped at 2000', async () => {
  const projects = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`p${String(i).padStart(4, '0')}`, project()]));
  const h = harness({ projects }); const result = await h.run(3, { maxEmails: 1 });
  assert.equal(result.projectsScanned, 250); assert.equal(result.dueItems, 250);
  const queries = h.db.events.queries.filter(q => q.collection === 'projects');
  assert.equal(queries.length, 3);
  assert.deepEqual(queries.map(q => q.cursor), [undefined, 'p0099', 'p0199']);
  for (const query of queries) {
    assert.deepEqual(query.filter, ['designApproval.status', '==', 'Pending Approval']);
    assert.equal(query.order, '__name__'); assert.equal(query.limit, 100); assert.deepEqual(query.fields, PROJECT_SELECT_FIELDS);
  }
  const recheck = h.db.events.getAll.find(call => call.fieldMask); assert.deepEqual(recheck.fieldMask, PROJECT_SELECT_FIELDS);
  for (const forbidden of ['signatureDataUrl', 'comment', 'signedBy', 'designNotes', 'rejectionReason']) assert.ok(!PROJECT_SELECT_FIELDS.some(f => f.includes(forbidden)));
  const large = harness({ projects: Object.fromEntries(Array.from({ length: 2101 }, (_, i) => [`p${String(i).padStart(4, '0')}`, project()])) });
  const truncated = await large.run(3, { maxEmails: 0 }); assert.equal(truncated.projectsScanned, 2000);
  assert.equal(truncated.scanTruncated, true); assert.equal(truncated.truncated, true);
  assert.equal(large.db.events.queries.filter(q => q.collection === 'projects').length, 20);
  assert.ok(large.logs.some(([message]) => message.startsWith('REMINDER SCAN TRUNCATED')));
});

test('S31 maxEmails zero and >100 clamping', async () => {
  const h = harness({ users: Array.from({ length: 105 }, (_, i) => user(`u${i}@example.test`)) });
  assert.equal((await h.run(3, { maxEmails: 0 })).sent, 0);
  assert.equal((await h.run(3, { maxEmails: 1000 })).sent, 100);
});

test('S32,S33 privacy sentinels never leave projected safe data, receipts or error categories', async () => {
  const p = project(); const sentinel = 'PRIVATE_SENTINEL';
  Object.assign(p, { designNotes: sentinel, contractorContact: sentinel });
  Object.assign(p.designApproval, { rejectionReason: sentinel, requestedByEmail: sentinel, designNotes: sentinel, contractorPhone: sentinel });
  Object.assign(p.designApproval.planningSignOffs.ITEL, { comment: sentinel, signatureDataUrl: sentinel, signedBy: sentinel, signedByEmail: sentinel });
  const recipient = 'private-recipient@example.test'; const h = harness({ projects: { p }, users: [user(recipient), admin] });
  let calls = 0;
  await h.run(7, { send: async m => { h.sent.push(m); if (++calls === 1) throw Object.assign(new Error(`${recipient} smtp.private.test ${sentinel}`), { code: 'EAUTH' }); } });
  const m = h.sent[0]; assert.equal(m.to, recipient); assert.match(m.subject, /เตือน:/);
  assert.match(m.text, /2 จาก 3/); assert.match(m.text, /https:\/\/app.example.test\/project\/p/);
  assert.match(m.html, /Fiber &lt;A&gt; &amp; B/); assert.match(h.sent[1].subject, /ค้างเกิน 7 วัน/);
  const outputs = JSON.stringify([h.logs, [...h.db.values].filter(([path]) => path.startsWith('approvalEmailDeliveries/')).map(([, data]) => data),
    h.sent.map(({ to, messageId, ...content }) => content)]);
  for (const privateValue of [sentinel, recipient, admin.email, 'smtp.private.test']) assert.ok(!outputs.includes(privateValue));
  assert.ok(!JSON.stringify(h.logs).includes('@'));
  const allowed = new Set(['projectId', 'approvalId', 'stage', 'kind', 'reminderNumber', 'status', 'attempts', 'leaseUntil', 'lastErrorCategory', 'updatedAt', 'sentAt']);
  for (const [path, data] of h.db.values) if (path.startsWith('approvalEmailDeliveries/')) for (const key of Object.keys(data)) assert.ok(allowed.has(key), key);
});

test('S33a error mapping uses structured codes only; raw message never affects category', () => {
  for (const [error, category] of [[{ code: 'EAUTH' }, 'smtp-auth'], [{ responseCode: 535 }, 'smtp-auth'],
    [{ code: 'EENVELOPE' }, 'smtp-recipient'], [{ responseCode: 550 }, 'smtp-recipient'],
    [{ responseCode: 421 }, 'smtp-rate-limit'], [{ code: 'ECONNRESET' }, 'network'], [{ code: 'ETIMEDOUT' }, 'timeout'],
    [{ message: 'EAUTH user@example.test' }, 'unknown']]) assert.equal(errorCategory(error), category);
});

test('Defaults are pinned in one object', () => {
  assert.deepEqual(D, { firstReminderDays: 3, repeatDays: 3, maxReminders: 3, escalationDays: 7,
    maxEmails: 40, maxCandidates: 5000, receiptChunkSize: 100, maxAttempts: 3, deadlineMs: 480000,
    pageSize: 100, maxPages: 20, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000, mode: 'dry-run' });
});


test('S26c new signer is included even when all original reminders were prefiltered and escalation starts recheck', async () => {
  const p = twoOwners(); p.designApproval.planningSignOffs.UIH.status = 'Approved';
  const h = harness({ projects: { p }, users: [user('uih@example.test', 'UIH'), admin] });
  putReceipt(h.db, receiptId(p, 7, admin.email), { status: 'sent' });
  h.db.beforeRecheck = () => { const fresh = structuredClone(p); fresh.designApproval.planningSignOffs.UIH.status = 'Pending'; h.db.put('projects/p', fresh); };
  const result = await h.run(7);
  assert.equal(result.sent, 1); assert.equal(h.sent[0].to, 'uih@example.test'); assert.equal(result.escalationExcluded, 1);
});


test('Receipt read failures are counted and fail safely; deadline is checked again after a slow transaction', async () => {
  const h = harness(); h.db.failGet = path => path.startsWith('approvalEmailDeliveries/');
  const result = await h.run(); assert.equal(result.sent, 0); assert.equal(result.skipped['receipt-unavailable'], 1);
  assert.ok(h.logs.some(([line]) => line === 'Reminder receipt read failed'));
  const { claimDelivery } = require('./deliveryClaims');
  const slow = harness(); let time = START + 3 * DAY;
  const deadline = await slow.run(3, { now: () => time, claim: async (...args) => {
    const claimed = await claimDelivery(...args); time += 480001; return claimed;
  } });
  assert.equal(deadline.sent, 0); assert.equal(deadline.deferredByTime, 1); assert.equal(slow.sent.length, 0);
});
