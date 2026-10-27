// Socket-free tests of the actual rules outcome predicates. These do not compile Firestore rules
// or measure their budget; the emulator fixtures remain the integration/release gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { approval, clientSign, project, snapshotDoc } from './world.mjs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
function bodyOf(name) {
  const start = rules.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing rules function ${name}`);
  const open = rules.indexOf('{', start);
  let depth = 1;
  let end = open + 1;
  for (; depth; end++) {
    if (rules[end] === '{') depth++;
    if (rules[end] === '}') depth--;
    assert.ok(end < rules.length, `unterminated rules function ${name}`);
  }
  // Adapt the small rules syntax subset used here: list membership/size and type checks.
  return rules.slice(start, end)
    .replace(/r\.size\(\)/g, 'r.length')
    .replace(/required is list/g, 'Array.isArray(required)')
    .replace(/(a\.get\('[^']+', null\)) is string/g, "(typeof $1 === 'string')")
    .replace(/'([^']+)' in r/g, "r.includes('$1')")
    .replace(/owner in r/g, 'r.includes(owner)')
    .replace(/es in (\[[^\]]+\])/g, '$1.includes(es)')
    .replace(/request\.auth\.token\.email in (\[[^\]]+\])/g, '$1.includes(request.auth.token.email)');
}
function map(data) {
  const copy = Object.fromEntries(Object.entries(data).map(([k, v]) =>
    [k, v && typeof v === 'object' && !Array.isArray(v) ? map(v) : v]));
  Object.defineProperty(copy, 'get', { value: (key, fallback) =>
    Object.hasOwn(copy, key) ? copy[key] : fallback && typeof fallback === 'object' ? map(fallback) : fallback });
  return copy;
}
const names = ['allApproved', 'rejectedAny', 'stageSupported', 'nonAdminMaySign', 'snapshotOwners', 'signOutcomeAllowed'];
// Stub only the required-set I/O boundary; all outcome and non-Admin checks run from rules source.
const context = { resource: null, request: null, requiredFor: () => context.required };
const predicates = runInNewContext(`${names.map(bodyOf).join('\n')}\n({${names.join(',')}})`, context);
const { allApproved, stageSupported, nonAdminMaySign, snapshotOwners, signOutcomeAllowed } = predicates;

function outcome(proj, payload, required, level = 'Planning') {
  context.resource = { data: map(proj) };
  context.request = { resource: { data: map(payload) }, auth: { uid: 'PLN', token: { email: 'pln@example.test' } } };
  context.required = required;
  const key = level === 'Planning' ? 'planningSignOffs' : 'omSignOffs';
  return signOutcomeAllowed('P', 'ITEL', key, level, map(payload.designApproval[key].ITEL), map({ role: 'Planning' }));
}

test('stage outcomes match the client for every supported required set and Pending/Approved/Rejected map combination', () => {
  const owners = ['ITEL', 'SYMC', 'UIH'];
  const statuses = ['Pending', 'Approved', 'Rejected'];
  for (let mask = 1; mask < 8; mask++) {
    const required = owners.filter((_, i) => mask & (1 << i));
    for (let variant = 0; variant < 3 ** 6; variant++) {
      const planning = {}, om = {};
      for (let i = 0; i < 6; i++) {
        (i < 3 ? planning : om)[owners[i % 3]] = { status: statuses[Math.floor(variant / 3 ** i) % 3] };
      }
      // The faithful client derives the expected stage independently of the rules.
      const proj = project({ designApproval: approval({ planningSignOffs: planning, omSignOffs: om }) });
      const payload = clientSign(proj, required, { owner: required[0], level: 'Planning', uid: 'PLN' });
      const a = payload.designApproval;
      const pl = map(a.planningSignOffs), omMap = map(a.omSignOffs);
      const done = allApproved(required, pl);
      for (const claimed of ['Planning', 'OM', 'Completed', 'Rejected']) {
        assert.equal(stageSupported(required, claimed, false, done, pl, omMap), claimed === a.approvalStage,
          `owners ${required}, variant ${variant}, claim ${claimed}`);
      }
    }
  }
});

test('an O&M signature needs current required owners approved at Planning, regardless of stored OM stage', () => {
  const b = approval({ snapshot: false, owners: ['ITEL'], stage: 'OM', planningApproved: ['ITEL'] });
  context.resource = { data: map(project({ owners: ['ITEL', 'SYMC'], designApproval: b })) };
  for (const required of [['ITEL', 'SYMC'], []]) {
    const done = allApproved(required, map(b.planningSignOffs));
    assert.equal(done, false);
    for (const claimed of ['Planning', 'OM', 'Completed', 'Rejected']) {
      assert.equal(nonAdminMaySign('omSignOffs', 'ITEL', 'OM', claimed, 'OM', done), false);
    }
  }
  assert.equal(nonAdminMaySign('omSignOffs', 'ITEL', 'OM', 'Completed', 'OM',
    allApproved(['ITEL'], map(b.planningSignOffs))), true);
  const proj = project({ owners: ['ITEL', 'SYMC'], designApproval: b });
  const forged = clientSign(proj, ['ITEL'], { owner: 'ITEL', level: 'OM', uid: 'PLN' });
  assert.equal(outcome(proj, forged, ['ITEL', 'SYMC'], 'OM'), false);
  // Even an OM claim that avoids completion must satisfy the before-state precondition.
  delete forged.designApproval.finalApprovedAt;
  delete forged.designApproval.finalApprovedBy;
  forged.status = forged.designApproval.status = 'Pending Approval';
  forged.designApproval.approvalStage = 'OM';
  assert.equal(outcome(proj, forged, ['ITEL', 'SYMC'], 'OM'), false);
  assert.equal(outcome(proj, forged, null, 'OM'), false);
});

test('required rejections at either level override Pending, OM and Completed for every signer', () => {
  for (const level of ['Planning', 'OM']) {
    const b = approval({ snapshot: false });
    b[level === 'Planning' ? 'planningSignOffs' : 'omSignOffs'].SYMC.status = 'Rejected';
    const proj = project({ owners: ['ITEL', 'SYMC'], designApproval: b });
    const payload = clientSign(proj, ['ITEL', 'SYMC'], { owner: 'ITEL', level: 'Planning', uid: 'PLN' });
    const a = payload.designApproval;
    assert.equal(a.approvalStage, 'Rejected');
    assert.equal(outcome(proj, payload, ['ITEL', 'SYMC']), true);
    const pl = map(a.planningSignOffs), om = map(a.omSignOffs);
    for (const claimed of ['Planning', 'OM', 'Completed', 'Rejected']) {
      assert.equal(stageSupported(['ITEL', 'SYMC'], claimed, false, allApproved(['ITEL', 'SYMC'], pl), pl, om), claimed === 'Rejected');
    }
    // A stale rejection outside the required set must still allow ITEL alone to advance.
    assert.equal(stageSupported(['ITEL'], 'OM', false, true, pl, om), true);
    payload.status = a.status = 'Pending Approval';
    a.approvalStage = 'Planning';
    a.rejectionReason = '';
    assert.equal(outcome(proj, payload, ['ITEL', 'SYMC']), false);
  }
});

test('malformed owners cannot advance but still allow non-advancing Planning signatures and rejection', () => {
  const pl = map({ ITEL: { status: 'Approved' } });
  const om = map({ ITEL: { status: 'Approved' } });
  assert.equal(allApproved([], pl), false);
  for (const claimed of ['Planning', 'OM', 'Completed', 'Rejected']) {
    assert.equal(stageSupported([], claimed, false, false, pl, om), claimed === 'Planning');
    assert.equal(stageSupported([], claimed, true, false, pl, om), claimed === 'Rejected');
  }
});

test('snapshot owner metadata is usable only for the enclosing project and approval', () => {
  const a = approval();
  for (const extra of [{ projectId: 'OTHER' }, { approvalId: 'other' }, { projectId: null }, { approvalId: null }]) {
    assert.equal(snapshotOwners(map(snapshotDoc('ap_1', ['ITEL'], extra)), a, 'P'), false);
  }
  assert.deepEqual(snapshotOwners(map(snapshotDoc('ap_1', ['ITEL'])), a, 'P'), ['ITEL']);
});
