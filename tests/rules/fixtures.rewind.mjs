// Rewind fixtures (WP, WX, WC, WR, WF, WD, W8-W10). Faithful payloads are ports of handleRewindApproval.
import { ACCOUNTS, OWNERS3, approval, approvedEntry, clientRewind, clientSign, pendingEntry, pendingMap, project, snapshotDoc } from './world.mjs';
import { fx, scen, sequence, update } from './fixtures.base.mjs';

const S2 = ['ITEL', 'SYMC'];
const run = steps => ctx => sequence(ctx, steps);
const rewind = (actor, target, participating = S2) => ({ as: actor, payload: proj => clientRewind(proj, participating, target) });
const craft = (actor, target, mutate, participating = S2) => ({ as: actor, payload: proj => { const p = clientRewind(proj, participating, target); mutate(p, proj); return p; } });
const prj = (options = {}, projectOptions = {}) => project({ designApproval: approval(options), ...projectOptions });
const completed = (extra = {}) => prj({ stage: 'Completed', planningApproved: S2, omApproved: S2, ...extra });
const atOm = () => prj({ stage: 'OM', planningApproved: S2, omApproved: ['ITEL'] });
const rejected = (extra = {}) => project({ designApproval: approval({ stage: 'Rejected', planningApproved: ['ITEL'], rejectionReason: 'Earlier reason', ...extra }), status: 'Rejected' });
const pending = () => prj({ planningApproved: ['ITEL'] });
const withFinal = p => { p.designApproval.finalDocuments = { pdfFileId: 'f1', pdfName: 'a.pdf', createdAt: 'x', createdBy: 'ADM' }; p.designApproval.rejectionReason = 'old reason'; return p; };

fx('WP1', 'rewind', 'ADM rewinds Completed to Draft with populated approvalDraft and total distance', { build: scen({ proj: completed() }), run: run([rewind('ADM', 'Draft')]) });
fx('WP2', 'rewind', 'Completed to Planning, retaining finalDocuments and a rejectionReason', { build: scen({ proj: withFinal(completed()) }), run: run([rewind('ADM', 'Planning')]) });
fx('WP3', 'rewind', 'Completed to OM (planning and ownerSignOffs unchanged, omSignOffs reset)', { build: scen({ proj: completed() }), run: run([rewind('ADM', 'OM')]) });
fx('WP4', 'rewind', 'OM to Draft', { build: scen({ proj: atOm() }), run: run([rewind('ADM', 'Draft')]) });
fx('WP5', 'rewind', 'OM to Planning', { build: scen({ proj: atOm() }), run: run([rewind('ADM', 'Planning')]) });
fx('WP6', 'rewind', 'Rejected to Draft', { build: scen({ proj: rejected() }), run: run([rewind('ADM', 'Draft')]) });
fx('WP7', 'rewind', 'Rejected to Planning, retaining the rejection reason', { build: scen({ proj: rejected() }), run: run([rewind('ADM', 'Planning')]) });
fx('WP8', 'rewind', 'Planning (Pending) to Draft', { build: scen({ proj: pending() }), run: run([rewind('ADM', 'Draft')]) });
const three = (extra = {}) => project({ owners: OWNERS3, designApproval: approval({ owners: OWNERS3, stage: 'Completed', planningApproved: OWNERS3, omApproved: OWNERS3, ...extra }) });
fx('WP9a', 'rewind', 'Three-owner populated rewind to Planning', { build: scen({ proj: three() }), run: run([rewind('ADM', 'Planning', OWNERS3)]) });
fx('WP9b', 'rewind', 'Three-owner populated rewind to OM', { build: scen({ proj: three() }), run: run([rewind('ADM', 'OM', OWNERS3)]) });
fx('WP9c', 'rewind', 'Legacy (no snapshot) rewind with the project-owner key set', {
  build: scen({ proj: project({ designApproval: approval({ snapshot: false, stage: 'Completed', planningApproved: S2, omApproved: S2 }) }) }), run: run([rewind('ADM', 'Planning')]) });

// A legacy approval whose maps keep a stale Pending SYMC key while the project lists only ITEL (O1/O2 state), completed by ITEL.
const staleKeysCompleted = () => { const a = approval({ snapshot: false, stage: 'Completed', planningApproved: ['ITEL'], omApproved: ['ITEL'] }); a.planningSignOffs.SYMC = { owner: 'SYMC', level: 'Planning', status: 'Pending' }; a.omSignOffs.SYMC = { owner: 'SYMC', level: 'OM', status: 'Pending' }; return project({ owners: ['ITEL'], designApproval: a }); };
fx('WP10a', 'rewind', 'Admin rewinds the stale-key legacy approval from Completed to OM (Planning keeps its stale key)', { build: scen({ proj: staleKeysCompleted() }), run: run([rewind('ADM', 'OM', ['ITEL'])]) });
fx('WP10b', 'rewind', 'Admin rewinds the stale-key legacy approval from Completed to Planning', { build: scen({ proj: staleKeysCompleted() }), run: run([rewind('ADM', 'Planning', ['ITEL'])]) });
for (const staleStatus of ['Pending', 'Rejected']) {
  const p = project({ owners: ['ITEL'], designApproval: approval({ snapshot: false }) });
  p.designApproval.planningSignOffs.SYMC.status = staleStatus;
  fx(`WP10.completeThenRewind.${staleStatus}`, 'rewind', `O1/O2 flow with stale ${staleStatus} SYMC: ITEL signs both levels then Admin rewinds to OM`, {
    build: scen({ proj: p, roles: { Planning: { approveOM: true } } }),
    run: run([
      { as: 'PLN', payload: proj => clientSign(proj, ['ITEL'], { owner: 'ITEL', level: 'Planning', uid: 'PLN' }) },
      { as: 'PLN', payload: proj => clientSign(proj, ['ITEL'], { owner: 'ITEL', level: 'OM', uid: 'PLN' }) },
      rewind('ADM', 'OM', ['ITEL']),
    ]),
  });
}
fx('WX7', 'rewind', "Rewind to Planning with snapshot metadata whose projectId is another project's", {
  build: scen({ proj: completed(), snap: snapshotDoc('ap_1', S2, { projectId: 'OTHER' }) }), run: run([rewind('ADM', 'Planning')]) });
fx('WX8', 'rewind', 'Rewind to Planning with snapshot metadata that belongs to another approval', {
  build: scen({ proj: completed(), snap: snapshotDoc('ap_1', S2, { approvalId: 'other' }) }), run: run([rewind('ADM', 'Planning')]) });
for (const [id, extra] of [['WX7.om', { projectId: 'OTHER' }], ['WX8.om', { approvalId: 'other' }]]) {
  fx(id, 'rewind', 'Rewind to OM cannot trust snapshot owners with mismatched identity', {
    build: scen({ proj: completed(), snap: snapshotDoc('ap_1', S2, extra) }), run: run([rewind('ADM', 'OM')]),
  });
}

// Not permitted source/target pairs: the older rules let an Admin write them.
// The state needs an Approved entry: with none, the write would be a no-op, not a rewind.
fx('WX1', 'rewind', 'Rewind-shaped write Planning to Planning (resets an Approved entry)', { build: scen({ proj: pending() }), run: run([rewind('ADM', 'Planning')]) });
fx('WX2', 'rewind', 'Planning to OM', { build: scen({ proj: prj() }), run: run([rewind('ADM', 'OM')]) });
fx('WX3', 'rewind', 'OM to OM', { build: scen({ proj: atOm() }), run: run([rewind('ADM', 'OM')]) });
fx('WX4', 'rewind', 'Rejected to OM', { build: scen({ proj: rejected() }), run: run([rewind('ADM', 'OM')]) });
const legacyRejected = () => { const p = project({ designApproval: approval({ snapshot: false, stage: 'Rejected' }), status: 'Rejected' }); delete p.designApproval.approvalStage; return p; };
fx('WX5', 'rewind', 'Legacy Rejected approval without approvalStage rewound to Planning', { build: scen({ proj: legacyRejected() }), run: run([rewind('ADM', 'Planning')]) });
fx('WX6', 'rewind', 'Same legacy approval rewound to Draft', { build: scen({ proj: legacyRejected() }), run: run([rewind('ADM', 'Draft')]) });

// Rewinds that also change content: already denied by the older rules.
for (const [id, field, change] of [['WC1', 'documentNumber', 'FORGED'], ['WC2', 'contractorName', 'Forged'], ['WC3', 'designNotes', 'Forged'], ['WC4', 'snapshotId', 'forged'], ['WC5', 'unknownKey', 'x']]) {
  fx(id, 'rewind', `ADM rewind that also changes ${field}`, { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { p.designApproval[field] = change; })]) });
}
// Forged reset shapes: the older rules let a users-document Admin write them.
fx('WR1', 'rewind', 'Rewind to Planning with a reset entry set to Approved', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { p.designApproval.planningSignOffs.ITEL = approvedEntry('ITEL', 'Planning', 'ADM'); })]) });
fx('WR2', 'rewind', 'Reset entry set to Rejected', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { p.designApproval.omSignOffs.ITEL = { owner: 'ITEL', level: 'OM', status: 'Rejected' }; })]) });
fx('WR3', 'rewind', 'Pending entry carrying a forged signedByUid', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { p.designApproval.planningSignOffs.ITEL.signedByUid = 'ADM'; })]) });
fx('WR4a', 'rewind', 'Reset maps with different key sets', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { delete p.designApproval.omSignOffs.SYMC; })]) });
fx('WR4b', 'rewind', 'Reset map with an unsupported owner key', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { p.designApproval.planningSignOffs.XYZ = { owner: 'XYZ', level: 'Planning', status: 'Pending' }; p.designApproval.omSignOffs.XYZ = { owner: 'XYZ', level: 'OM', status: 'Pending' }; })]) });
fx('WR4c', 'rewind', 'Reset maps empty', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { p.designApproval.planningSignOffs = {}; p.designApproval.omSignOffs = {}; p.designApproval.ownerSignOffs = {}; })]) });
fx('WR5a', 'rewind', 'Rewind to OM that also changes planningSignOffs', { build: scen({ proj: completed() }), run: run([craft('ADM', 'OM', p => { p.designApproval.planningSignOffs.ITEL = { owner: 'ITEL', level: 'Planning', status: 'Pending' }; })]) });
fx('WR5b', 'rewind', 'Rewind to OM that also changes ownerSignOffs', { build: scen({ proj: completed() }), run: run([craft('ADM', 'OM', p => { p.designApproval.ownerSignOffs = {}; })]) });
fx('WF1', 'rewind', 'Rewind retains finalApprovedAt/By', { build: scen({ proj: completed() }), run: run([craft('ADM', 'Planning', (p, proj) => { p.designApproval.finalApprovedAt = proj.designApproval.finalApprovedAt; p.designApproval.finalApprovedBy = proj.designApproval.finalApprovedBy; })]) });
fx('WF2', 'rewind', 'Rewind that also changes finalDocuments', { build: scen({ proj: completed() }), run: run([craft('ADM', 'Planning', p => { p.designApproval.finalDocuments = { pdfFileId: 'x', pdfName: 'x', createdAt: 'x', createdBy: 'ADM' }; })]) });
fx('WD1', 'rewind', 'Rewind to Planning leaves approvalDraft present', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Planning', p => { p.approvalDraft = { designNotes: 'x' }; })]) });
fx('WD2', 'rewind', "Rewind to Draft with approvalDraft.designNotes not equal to the previous approval's", { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Draft', p => { p.approvalDraft.designNotes = 'tampered'; })]) });
fx('WD3a', 'rewind', 'Rewind to Draft without approvalDraft', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Draft', p => { delete p.approvalDraft; })]) });
fx('WD3b', 'rewind', "Rewind to Draft with top-level status not 'Draft'", { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Draft', p => { p.status = 'Pending Approval'; })]) });
fx('WD4', 'rewind', 'Rewind to Draft with an extra key in approvalDraft', { build: scen({ proj: atOm() }), run: run([craft('ADM', 'Draft', p => { p.approvalDraft.extra = 1; })]) });

// Who may rewind
fx('W8.a', 'rewind', 'Non-Admin rewinds OM to Planning', { build: scen({ proj: atOm() }), run: run([rewind('MGT', 'Planning')]) });
fx('W8.b', 'rewind', 'Non-Admin rewinds Completed to OM', { build: scen({ proj: completed() }), run: run([rewind('MGT', 'OM')]) });
fx('W8.c', 'rewind', 'Non-Admin turns Approved entries to Pending (Design editor)', { build: scen({ proj: atOm() }), run: run([rewind('DSG', 'Planning')]) });
fx('W9', 'rewind', 'ADM-E rewinds Rejected to Planning with no Approved entries', { build: scen({ proj: project({ designApproval: approval({ stage: 'Rejected' }), status: 'Rejected' }) }), run: run([rewind('ADM-E', 'Planning')]) });
fx('W10.a', 'rewind', 'ADM-E rewinds a Completed approval', { build: scen({ proj: completed() }), run: run([rewind('ADM-E', 'Planning')]) });
fx('W10.b', 'rewind', 'ADM-E rewinds to Draft', { build: scen({ proj: atOm() }), run: run([rewind('ADM-E', 'Draft')]) });
