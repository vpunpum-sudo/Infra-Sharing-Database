// Submit/attach (S), final documents (F), backfill (S5.B), forged new approvals and status writes (D18-D22), project create (C).
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ACCOUNTS, OWNERS3, approval, approvedEntry, clientAttach, clientBackfill, clientFinalDocs, clientNewApproval, pendingMap, project, snapshotDoc, usersDocs } from './world.mjs';
import { fx, inTransaction, merge, ref, scen, update } from './fixtures.base.mjs';
import { deleteField } from 'firebase/firestore';

const S2 = ['ITEL', 'SYMC'];
const draft = { designNotes: 'n', contractorName: 'c', routeEnclosureSelections: { route_1: ['enc_1'] } };
const noApproval = (extra = {}) => project({ designApproval: null, approvalDraft: draft, ...extra });
const prj = (options = {}, projectOptions = {}) => project({ designApproval: approval(options), ...projectOptions });
const completed = () => prj({ stage: 'Completed', planningApproved: S2, omApproved: S2 });
// A rejection with no Approved entry (the only signer rejected), and one that followed an approval.
const rejectedOnly = (approved = []) => {
  const a = approval({ stage: 'Rejected', planningApproved: approved, rejectionReason: 'Not acceptable' });
  a.planningSignOffs.SYMC = { owner: 'SYMC', level: 'Planning', status: 'Rejected', signedByUid: 'MGT' };
  return project({ designApproval: a, status: 'Rejected' });
};
const rejectedProject = () => rejectedOnly();
const attachBy = (actor, mutate = () => {}) => ctx => { const n = clientNewApproval({ uid: ACCOUNTS[actor].uid }); mutate(n); return update(ctx, clientAttach(n), actor); };

fx('S1', 'misc', 'DSG submits a new approval on a project with no designApproval', { build: scen({ proj: noApproval() }), run: attachBy('DSG') });
fx('S2', 'misc', 'DSG resubmits after rejection', { build: scen({ proj: rejectedProject() }), run: attachBy('DSG') });
fx('S1.ADM', 'misc', 'ADM submits a new approval on a project with no designApproval', { build: scen({ proj: noApproval() }), run: attachBy('ADM') });
fx('S2.ADM', 'misc', 'ADM resubmits after rejection', { build: scen({ proj: rejectedProject() }), run: attachBy('ADM') });
fx('S2.ADM-E', 'misc', 'ADM-E (email-only Admin) resubmits after rejection', { build: scen({ proj: rejectedProject() }), run: attachBy('ADM-E') });
fx('S2b', 'misc', 'DSG resubmits after a rejection that followed an approval (needs an Admin today, and still does)', { build: scen({ proj: rejectedOnly(['ITEL']) }), run: attachBy('DSG') });
fx('S3', 'misc', 'Attach in a transaction after the snapshot documents are written', {
  build: scen({ proj: noApproval() }), run: ctx => inTransaction(ctx, clientAttach(clientNewApproval({ uid: 'DSG' })), 'DSG') });
fx('S4', 'misc', 'DSG replaces a legacy Pending approval without snapshotId with a valid Pending shape', {
  build: scen({ proj: prj({ snapshot: false }) }), run: attachBy('DSG') });

// S5: legacy snapshot backfill, PR #91 matrix B1-B15 (declared per row).
const legacyP = (over = {}) => project({ designApproval: approval({ snapshot: false, ...over }) });
const meta = (extra = {}) => ({ id: 'snap_backfill', projectId: 'P', approvalId: 'ap_1', backfill: true, createdByUid: 'ADM', createdAt: '2026-10-23T00:00:00.000Z', ...extra });
const backfillWorld = ({ proj = legacyP(), metadata = meta() } = {}) => scen({ proj, snap: null, extra: metadata ? { 'projects/P/approvalSnapshots/snap_backfill': metadata } : {} });
const backfill = (actor, over = {}, snapshotId = 'snap_backfill', uid = ACCOUNTS[actor].uid, email = `${uid.toLowerCase()}@example.test`) =>
  ctx => update(ctx, { ...clientBackfill(snapshotId, uid, email), ...over }, actor);
fx('S5.B1', 'misc', 'Valid Admin backfill', { build: backfillWorld(), run: backfill('ADM') });
fx('S5.B2', 'misc', 'snapshotBackfilledAt as a string', { build: backfillWorld(), run: backfill('ADM', { 'designApproval.snapshotBackfilledAt': '2026-10-23T00:00:00.000Z' }) });
fx('S5.B3', 'misc', 'snapshotBackfilledByEmail not the token email', { build: backfillWorld(), run: backfill('ADM', { 'designApproval.snapshotBackfilledByEmail': 'other@example.test' }) });
fx('S5.B4', 'misc', 'snapshotBackfilledByUid not the caller', { build: backfillWorld(), run: backfill('ADM', { 'designApproval.snapshotBackfilledByUid': 'PLN' }) });
fx('S5.B5', 'misc', 'Backfill that also changes contractorName', { build: backfillWorld(), run: backfill('ADM', { 'designApproval.contractorName': 'Tampered' }) });
fx('S5.B6', 'misc', 'Backfill that also changes top-level status', { build: backfillWorld(), run: backfill('ADM', { status: 'Approved' }) });
fx('S5.B7', 'misc', 'Backfill missing the email key', { build: backfillWorld(), run: ctx => update(ctx, (() => { const p = clientBackfill('snap_backfill', 'ADM', 'a'); delete p['designApproval.snapshotBackfilledByEmail']; return p; })(), 'ADM') });
fx('S5.B8', 'misc', 'Backfill with an extra key', { build: backfillWorld(), run: backfill('ADM', { 'designApproval.snapshotBackfilledByName': 'Admin' }) });
fx('S5.B9', 'misc', 'Snapshot id equal to the approval id', { build: backfillWorld({ metadata: meta({ id: 'ap_1' }) }), run: backfill('ADM', {}, 'ap_1') });
fx('S5.B10', 'misc', 'Metadata backfill flag false', { build: backfillWorld({ metadata: meta({ backfill: false }) }), run: backfill('ADM') });
fx('S5.B11', 'misc', 'Metadata approvalId other', { build: backfillWorld({ metadata: meta({ approvalId: 'ap_other' }) }), run: backfill('ADM') });
fx('S5.B12', 'misc', 'Metadata missing', { build: backfillWorld({ metadata: null }), run: backfill('ADM') });
fx('S5.B13', 'misc', 'Approval already has a snapshotId', { build: backfillWorld({ proj: prj({ snapshot: true }) }), run: backfill('ADM') });
fx('S5.B14', 'misc', 'PLN (not an editor) backfills', { build: backfillWorld(), run: backfill('PLN') });
fx('S5.B15', 'misc', 'DSG-X (not a member) backfills', { build: backfillWorld(), run: backfill('DSG-X') });

// S6: ordinary project edits keep working.
fx('S6.DSG', 'misc', 'DSG renames the project and merges owners', { build: scen(), run: async ctx => { await update(ctx, { name: 'Renamed' }, 'DSG'); await merge(ctx, { owners: ['ITEL', 'SYMC', 'UIH'], owner: 'ITEL' }, 'DSG'); } });
fx('S6.CRT-N', 'misc', 'Creator CRT-N renames the project', { build: scen({ proj: project({ uid: 'CRT-N' }) }), run: ctx => update(ctx, { name: 'Renamed' }, 'CRT-N') });
fx('S6.ADM', 'misc', 'ADM renames the project', { build: scen(), run: ctx => update(ctx, { name: 'Renamed' }, 'ADM') });
fx('S6b', 'misc', 'DSG setDoc({approvalDraft}, {merge}) on an existing project', { build: scen(), run: ctx => merge(ctx, { approvalDraft: { designNotes: 'n' } }, 'DSG') });
fx('S6c.CRT-N', 'misc', 'Creator CRT-N merges approvalDraft', { build: scen({ proj: project({ uid: 'CRT-N' }) }), run: ctx => merge(ctx, { approvalDraft: { designNotes: 'n' } }, 'CRT-N') });
fx('S6c.ADM', 'misc', 'ADM merges approvalDraft', { build: scen(), run: ctx => merge(ctx, { approvalDraft: { designNotes: 'n' } }, 'ADM') });
fx('S6d', 'misc', 'PLN (member, neither creator nor editor) merges approvalDraft', { build: scen(), run: ctx => merge(ctx, { approvalDraft: { designNotes: 'n' } }, 'PLN') });

fx('S2b.ADM', 'misc', 'ADM resubmits after a rejection that followed an approval', { build: scen({ proj: rejectedOnly(['ITEL']) }), run: attachBy('ADM') });

// DEL: deleting a project is unchanged
const removeProject = actor => ctx => deleteDoc(doc(ctx.as(actor), 'projects/P'));
fx('DEL.creator', 'misc', 'The creator deletes the project', { op: 'delete', build: scen({ proj: project({ uid: 'CRT-N' }) }), run: removeProject('CRT-N') });
fx('DEL.ADM', 'misc', 'ADM deletes the project', { op: 'delete', build: scen(), run: removeProject('ADM') });
fx('DEL.PLN', 'misc', 'A member who is neither creator nor Admin cannot delete', { op: 'delete', build: scen(), run: removeProject('PLN') });
fx('DEL.DSG-X', 'misc', 'A non-member cannot delete', { op: 'delete', build: scen(), run: removeProject('DSG-X') });

// GATE: a user without an owner field never matches a project that lists an empty owner
const renameBy = actor => ctx => update(ctx, { name: 'Renamed' }, actor);
const withOwners = fields => { const p = project(); delete p.owners; delete p.owner; Object.assign(p, fields); return p; };
fx('GATE1', 'misc', "Design user without an owner field edits a project whose owners is ['']", { build: scen({ proj: withOwners({ owners: [''] }) }), run: renameBy('DSG-NO') });
fx('GATE2', 'misc', "Design user without an owner field edits a project whose owner is ''", { build: scen({ proj: withOwners({ owner: '' }) }), run: renameBy('DSG-NO') });
fx('GATE3', 'misc', 'Design user without an owner field edits a normal project', { build: scen(), run: renameBy('DSG-NO') });
fx('GATE4', 'misc', "The same user changes only the status of a project whose owners is ['']", {
  build: scen({ proj: withOwners({ owners: [''] }) }), run: ctx => update(ctx, { status: 'Approved' }, 'DSG-NO') });

// F: final documents
const withUserId = id => ({ [`users/${id}`]: { ...ACCOUNTS[id].doc, id: 'DIFFERENT-STORED-ID' } });
fx('F1', 'misc', 'Final documents by the last signer MGT; createdBy equals the uid though the stored users id differs', {
  build: scen({ proj: completed(), extra: withUserId('MGT') }), run: ctx => update(ctx, clientFinalDocs('MGT'), 'MGT') });
fx('F2', 'misc', 'Final documents by DSG', { build: scen({ proj: completed() }), run: ctx => update(ctx, clientFinalDocs('DSG'), 'DSG') });

// D18-D22: forged new approvals, final fields and status-only writes
fx('D18.approved', 'misc', 'DSG writes a new approval whose status is Approved', {
  build: scen({ proj: noApproval() }), run: attachBy('DSG', n => { n.status = 'Approved'; }) });
fx('D18.completed', 'misc', 'DSG writes a new approval at stage Completed', {
  build: scen({ proj: noApproval() }), run: attachBy('DSG', n => { n.approvalStage = 'Completed'; }) });
fx('D18.entries', 'misc', 'DSG writes a new approval with Approved entries', {
  build: scen({ proj: noApproval() }), run: attachBy('DSG', n => { n.planningSignOffs.ITEL = approvedEntry('ITEL', 'Planning', 'DSG'); }) });
fx('D19', 'misc', 'DSG writes a new approval over a Pending approval with a snapshotId', { build: scen(), run: attachBy('DSG') });
fx('D19a', 'misc', 'ADM writes a new approval over a Pending approval with a snapshotId', { build: scen(), run: attachBy('ADM') });
fx('D19b', 'misc', 'DSG writes a new approval over an Approved approval with a snapshotId', { build: scen({ proj: completed() }), run: attachBy('DSG') });
fx('D19c', 'misc', 'ADM writes a new approval over an Approved approval with a snapshotId', { build: scen({ proj: completed() }), run: attachBy('ADM') });
for (const [name, mutate] of [
  ['emptyMaps', n => { n.planningSignOffs = {}; n.omSignOffs = {}; n.ownerSignOffs = {}; }],
  ['unsupportedOwner', n => { n.planningSignOffs.XYZ = { owner: 'XYZ', level: 'Planning', status: 'Pending' }; n.omSignOffs.XYZ = { owner: 'XYZ', level: 'OM', status: 'Pending' }; n.ownerSignOffs = n.planningSignOffs; }],
  ['mismatchedKeys', n => { delete n.omSignOffs.SYMC; }],
  ['nonPending', n => { n.planningSignOffs.ITEL = { owner: 'ITEL', level: 'Planning', status: 'Approved' }; n.ownerSignOffs = n.planningSignOffs; }],
  ['badOwnerSignOffs', n => { n.ownerSignOffs = pendingMap(['ITEL'], 'Planning'); }],
  ['requestedByUid', n => { n.requestedByUid = 'SOMEONE-ELSE'; }],
  ['finalApproved', n => { n.finalApprovedAt = 'x'; n.finalApprovedBy = 'y'; }],
  ['finalDocuments', n => { n.finalDocuments = { pdfFileId: 'f', pdfName: 'a', createdAt: 'x', createdBy: 'DSG' }; }],
]) fx(`D20.${name}`, 'misc', `New approval shape violation: ${name}`, { build: scen({ proj: noApproval() }), run: attachBy('DSG', mutate) });
fx('D21.finalApprovedOutside', 'misc', 'Forged finalApprovedAt/By outside completion', {
  build: scen(), run: ctx => update(ctx, { 'designApproval.finalApprovedAt': 'x', 'designApproval.finalApprovedBy': 'y' }, 'DSG') });
fx('D21.finalDocsEarly', 'misc', 'finalDocuments before completion', { build: scen(), run: ctx => update(ctx, clientFinalDocs('DSG'), 'DSG') });
fx('D21.finalDocsWrongUid', 'misc', 'finalDocuments with createdBy not the uid', { build: scen({ proj: completed() }), run: ctx => update(ctx, clientFinalDocs('SOMEONE-ELSE'), 'DSG') });
fx('D21.finalDocsOverwrite', 'misc', 'finalDocuments overwritten by a non-Admin', {
  build: scen({ proj: (() => { const p = completed(); p.designApproval.finalDocuments = { pdfFileId: 'f0', pdfName: 'old', createdAt: 'x', createdBy: 'ADM' }; return p; })() }), run: ctx => update(ctx, clientFinalDocs('DSG'), 'DSG') });
fx('D22', 'misc', 'Status-only write by DSG', { build: scen(), run: ctx => update(ctx, { status: 'Approved' }, 'DSG') });
fx('D22b', 'misc', 'Status-only write by ADM (pinned)', { build: scen(), run: ctx => update(ctx, { status: 'Approved' }, 'ADM') });

// C: project create. All write a NEW project Q.
const newProjectPayload = (uid, extra = {}) => ({ id: 'Q', name: 'New project', uid, createdAt: '2026-10-01T00:00:00.000Z', owners: ['ITEL'], owner: 'ITEL', ...extra });
const create = (actor, payload) => ctx => setDoc(doc(ctx.as(actor), 'projects/Q'), payload);
const submitShape = uid => ({ status: 'Pending Approval', designApproval: clientNewApproval({ id: 'ap_q', uid }) });
const legacyApproval = () => { const a = approval({ snapshot: false }); delete a.approvalStage; return a; };
fx('C1', 'create', 'PLN creates a project with the dashboard payload', { build: scen(), run: create('PLN', newProjectPayload('PLN')) });
fx('C1b', 'create', 'PLN migrates a legacy project with no designApproval', { build: scen(), run: create('PLN', { ...newProjectPayload('PLN'), legacyField: 'x', owner: 'ITEL' }) });
fx('C1c', 'create', 'setDoc({approvalDraft}, merge) on an absent project by PLN', { build: scen(), run: ctx => setDoc(doc(ctx.as('PLN'), 'projects/Q'), { approvalDraft: draft }, { merge: true }) });
fx('C1d', 'create', 'The same merge on an absent project by ADM', { build: scen(), run: ctx => setDoc(doc(ctx.as('ADM'), 'projects/Q'), { approvalDraft: draft }, { merge: true }) });
fx('C1e', 'create', 'Create from a payload that lacks uid', { build: scen(), run: create('PLN', (() => { const p = newProjectPayload('PLN'); delete p.uid; return p; })()) });
fx('C2', 'create', 'PLN creates a project carrying a valid Pending submit-shape designApproval', { build: scen(), run: create('PLN', newProjectPayload('PLN', submitShape('PLN'))) });
fx('C3', 'create', 'PLN creates a project carrying an Approved designApproval (forged)', {
  build: scen(), run: create('PLN', newProjectPayload('PLN', { status: 'Approved', designApproval: approval({ stage: 'Completed', planningApproved: S2, omApproved: S2 }) })) });
fx('C4', 'create', 'PLN migrates a legacy-shaped project carrying its old designApproval', { build: scen(), run: create('PLN', newProjectPayload('PLN', { designApproval: legacyApproval() })) });
fx('C4b', 'create', 'PLN creates a project carrying an empty-map designApproval', {
  build: scen(), run: create('PLN', newProjectPayload('PLN', { designApproval: { ...approval(), planningSignOffs: {}, omSignOffs: {}, ownerSignOffs: {} } })) });
fx('C5', 'create', 'ADM creates a project carrying a Pending submit-shape designApproval', { build: scen(), run: create('ADM', newProjectPayload('ADM', submitShape('ADM'))) });
fx('C6', 'create', 'ADM creates a project carrying an Approved designApproval', {
  build: scen(), run: create('ADM', newProjectPayload('ADM', { status: 'Approved', designApproval: approval({ stage: 'Completed', planningApproved: S2, omApproved: S2 }) })) });
fx('C7', 'create', 'ADM migrates a legacy-shaped project carrying its old designApproval', { build: scen(), run: create('ADM', newProjectPayload('ADM', { designApproval: legacyApproval() })) });
fx('C8', 'create', 'ADM-E creates a project carrying a designApproval', { build: scen(), run: create('ADM-E', newProjectPayload('ADM-E', submitShape('ADM-E'))) });
