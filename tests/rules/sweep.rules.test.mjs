// Narrowing invariant: a deterministic, seeded mutation sweep. For every generated write, the new rules
// must never ALLOW what the previous rules DENIED. Faithful payloads are mutated 1-3 times (owner, level,
// status, stage, uid, keys, maps, extra fields, writer) and replayed on both rulesets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { doc, updateDoc } from 'firebase/firestore';
import { attempt, clearData, clientFor, closeClients, seedDocs, setRules } from './harness.mjs';
import { ACCOUNTS, OWNERS3, approval, clientAttach, clientFinalDocs, clientNewApproval, clientRewind, clientSign, identity, project, world } from './world.mjs';
import { writeObserved } from './report.mjs';

const CASES = Number(process.env.RULES_SWEEP || 500);
const SEED = Number(process.env.RULES_SWEEP_SEED || 20261024);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
const pick = list => list[Math.floor(rng() * list.length)];

const S2 = ['ITEL', 'SYMC'];
const states = {
  pending: () => project(),
  pendingPartial: () => project({ designApproval: approval({ planningApproved: ['ITEL'] }) }),
  om: () => project({ designApproval: approval({ stage: 'OM', planningApproved: S2, omApproved: ['ITEL'] }) }),
  completed: () => project({ designApproval: approval({ stage: 'Completed', planningApproved: S2, omApproved: S2 }) }),
  rejected: () => project({ designApproval: approval({ stage: 'Rejected', planningApproved: ['ITEL'] }), status: 'Rejected' }),
  legacy: () => project({ designApproval: approval({ snapshot: false }) }),
  three: () => project({ owners: OWNERS3, designApproval: approval({ owners: OWNERS3, stage: 'OM', planningApproved: OWNERS3, omApproved: ['ITEL', 'SYMC'] }) }),
  none: () => project({ designApproval: null, approvalDraft: { designNotes: 'n' } }),
};
const actors = ['ADM', 'ADM-E', 'PLN', 'MGT', 'DSG', 'SUB', 'DSG-X', 'CRT-N', 'PLN-N', 'VWR-G', 'DSG-U'];
const ROLES = { Planning: { approveOM: true }, Management: { approvePlanning: true }, Viewer: { approvePlanning: true } };

const da = p => (p.designApproval && typeof p.designApproval === 'object' && !p.designApproval._methodName ? p.designApproval : null);
const entries = a => ['planningSignOffs', 'omSignOffs'].flatMap(map => Object.keys(a[map] ?? {}).map(owner => [map, owner]));
const mutations = [
  (p) => { const a = da(p); if (a) a.approvalStage = pick(['Planning', 'OM', 'Completed', 'Rejected']); },
  (p) => { const a = da(p); if (a) a.status = pick(['Pending Approval', 'Approved', 'Rejected', 'Draft']); },
  (p) => { p.status = pick(['Pending Approval', 'Approved', 'Rejected', 'Draft']); },
  (p) => { const a = da(p); if (!a) return; const e = entries(a); if (!e.length) return; const [m, o] = pick(e); a[m][o].owner = pick(OWNERS3); },
  (p) => { const a = da(p); if (!a) return; const e = entries(a); if (!e.length) return; const [m, o] = pick(e); a[m][o].level = a[m][o].level === 'OM' ? 'Planning' : 'OM'; },
  (p) => { const a = da(p); if (!a) return; const e = entries(a); if (!e.length) return; const [m, o] = pick(e); a[m][o].status = pick(['Approved', 'Rejected', 'Pending']); },
  (p) => { const a = da(p); if (!a) return; const e = entries(a); if (!e.length) return; const [m, o] = pick(e); a[m][o].signedByUid = pick(['X', 'PLN', 'MGT', 'DSG', 'ADM']); },
  (p) => { const a = da(p); if (!a) return; const keys = Object.keys(a); delete a[pick(keys)]; },
  (p) => { const a = da(p); if (a) a.zzz = 1; },
  (p) => { const a = da(p); if (!a) return; const m = pick(['planningSignOffs', 'omSignOffs']); if (a[m]) a[m][pick(OWNERS3)] = { owner: pick(OWNERS3), level: pick(['Planning', 'OM']), status: pick(['Approved', 'Pending']) }; },
  (p) => { const a = da(p); if (a) a[pick(['planningSignOffs', 'omSignOffs', 'ownerSignOffs'])] = {}; },
  (p) => { const a = da(p); if (a) a[pick(['documentNumber', 'contractorName', 'designNotes', 'snapshotId', 'requestedByUid'])] = 'tampered'; },
  (p) => { const a = da(p); if (a) { a.finalApprovedAt = 'x'; a.finalApprovedBy = 'y'; } },
  (p) => { const a = da(p); if (a) a.rejectionReason = pick(['r', '']); },
  (p) => { const a = da(p); if (a) a.finalDocuments = { pdfFileId: 'f', pdfName: 'n', createdAt: 'x', createdBy: pick(['PLN', 'MGT', 'DSG', 'ADM']) }; },
  (p) => { p.owners = [pick(OWNERS3)]; },
  (p) => { p.approvalDraft = { designNotes: 'x' }; },
];

function baseWrite(proj, actorName) {
  const a = proj.designApproval;
  const uid = ACCOUNTS[actorName].uid;
  const kinds = a ? ['sign', 'sign', 'sign', 'rewind', 'attach', 'final', 'status'] : ['attach', 'attach', 'status'];
  const kind = pick(kinds);
  const participating = a ? Object.keys(a.planningSignOffs ?? {}) : S2;
  if (kind === 'sign') return clientSign(proj, participating.length ? participating : S2, { owner: pick(participating.length ? participating : S2), level: pick(['Planning', 'OM']), approve: rng() > 0.2, uid });
  if (kind === 'rewind') return clientRewind(proj, participating.length ? participating : S2, pick(['Draft', 'Planning', 'OM']));
  if (kind === 'attach') return clientAttach(clientNewApproval({ uid, owners: S2 }));
  if (kind === 'final') return clientFinalDocs(uid);
  return { status: pick(['Pending Approval', 'Approved', 'Draft']) };
}

function generate() {
  const stateName = pick(Object.keys(states));
  const actorName = pick(actors);
  const proj = states[stateName]();
  const payload = baseWrite(proj, actorName);
  const applied = [];
  for (let i = 0, n = 1 + Math.floor(rng() * 3); i < n; i += 1) { const m = Math.floor(rng() * mutations.length); mutations[m](payload); applied.push(m); }
  return { stateName, actorName, build: () => structuredClone(states[stateName]()), payload, applied };
}

test(`narrowing sweep: ${CASES} seeded mutations, no write the previous rules denied is allowed by the new rules`, { timeout: 3_600_000 }, async () => {
  const cases = Array.from({ length: CASES }, generate);
  const results = cases.map(() => ({}));
  for (const which of ['before', 'after']) {
    await setRules(which);
    for (const [i, c] of cases.entries()) {
      await clearData();
      await seedDocs(world({ proj: c.build(), roles: ROLES }));
      const db = clientFor(identity(c.actorName));
      results[i][which] = await attempt(() => updateDoc(doc(db, 'projects/P'), structuredClone(c.payload)));
      await closeClients();
    }
  }
  const violations = []; const tally = {};
  cases.forEach((c, i) => {
    const key = `${results[i].before}/${results[i].after}`;
    tally[key] = (tally[key] ?? 0) + 1;
    if (results[i].before !== 'ALLOW' && results[i].after === 'ALLOW') violations.push(`#${i} ${c.stateName}/${c.actorName} mutations ${c.applied.join(',')}: old ${results[i].before} new ${results[i].after}  payload ${JSON.stringify(c.payload).slice(0, 400)}`);
  });
  writeObserved('sweep', cases.map((c, i) => ({ id: `#${i}`, title: `${c.stateName}/${c.actorName} mut ${c.applied.join(',')}`, declared: ['-', '-'], before: results[i].before, after: results[i].after, category: 'SWEEP' })));
  console.log(`sweep tally (old/new): ${JSON.stringify(tally)}`);
  assert.deepEqual(violations, []);
});
