// Signing fixtures: faithful sign-off payloads (G, LS, N, O, RT, M) and crafted forgeries (D).
import { ACCOUNTS, OWNERS3, approval, approvedEntry, clientSign, pendingMap, project, snapshotDoc } from './world.mjs';
import { fx, scen, sequence, update } from './fixtures.base.mjs';

const S2 = ['ITEL', 'SYMC'];
const uidOf = actor => ACCOUNTS[actor].uid;
/** One faithful client sign step. `participating` is the owner set the client derives. */
const sign = (actor, owner, level, over = {}) => ({
  as: actor,
  payload: proj => clientSign(proj, over.participating ?? S2, { owner, level, uid: over.uid ?? uidOf(actor), ...over.options }),
});
/** A single crafted write: the faithful payload with a mutation applied. */
const craft = (actor, owner, level, mutate, over = {}) => ({
  as: actor,
  payload: proj => { const p = clientSign(proj, over.participating ?? S2, { owner, level, uid: over.uid ?? uidOf(actor), ...over.options }); mutate(p, proj); return p; },
});
const run = steps => ctx => sequence(ctx, steps);
const ap = options => approval(options);
const prj = (options = {}, projectOptions = {}) => project({ designApproval: ap(options), ...projectOptions });
const noSnap = { snap: null };
const planningDone = { stage: 'OM', planningApproved: S2 };
const lastOm = { stage: 'OM', planningApproved: S2, omApproved: ['ITEL'] };
const three = { owners: OWNERS3 };
const snapOf = (owners, extra) => snapshotDoc('ap_1', owners, extra);
const snapNoOwners = () => { const d = snapshotDoc('ap_1', S2); delete d.participatingOwners; return d; };
const drop = (path, p) => { const keys = path.split('.'); let o = p; for (const k of keys.slice(0, -1)) o = o[k]; delete o[keys.at(-1)]; };

// ---------- G: faithful flows ----------
fx('G1', 'sign', 'PLN signs Planning for ITEL', { build: scen(), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('G2', 'sign', 'MGT with saved approvePlanning signs the last Planning entry for SYMC', {
  build: scen({ proj: prj({ planningApproved: ['ITEL'] }), roles: { Management: { approvePlanning: true } } }),
  run: run([sign('MGT', 'SYMC', 'Planning')]) });
fx('G3', 'sign', 'MGT signs O&M for SYMC after Planning is complete', { build: scen({ proj: prj(planningDone) }), run: run([sign('MGT', 'SYMC', 'OM')]) });
fx('G4', 'sign', 'Last O&M signature (two owners): Completed with final fields', { build: scen({ proj: prj(lastOm) }), run: run([sign('MGT', 'SYMC', 'OM')]) });
fx('G4b', 'sign', 'Last O&M signature (three owners)', {
  build: scen({ proj: project({ owners: OWNERS3, designApproval: ap({ ...three, stage: 'OM', planningApproved: OWNERS3, omApproved: ['ITEL', 'SYMC'] }) }) }),
  run: run([sign('ADM', 'UIH', 'OM', { participating: OWNERS3 })]) });
fx('G5', 'sign', 'PLN rejects at Planning with a reason', { build: scen(), run: run([{ as: 'PLN', payload: proj => clientSign(proj, S2, { owner: 'ITEL', level: 'Planning', approve: false, uid: 'PLN', comment: 'Rejected: drawing incomplete' }) }]) });
fx('G6', 'sign', 'MGT rejects at O&M', { build: scen({ proj: prj(planningDone) }), run: run([{ as: 'MGT', payload: proj => clientSign(proj, S2, { owner: 'SYMC', level: 'OM', approve: false, uid: 'MGT', comment: 'No' }) }]) });
fx('G7', 'sign', 'DSG (default approvePlanning) signs Planning for ITEL via the editor path', { build: scen(), run: run([sign('DSG', 'ITEL', 'Planning')]) });
fx('G7b', 'sign', 'SUB with saved approvePlanning signs Planning for ITEL', { build: scen({ roles: { 'Sub-contract': { approvePlanning: true } } }), run: run([sign('SUB', 'ITEL', 'Planning')]) });
fx('G7c', 'sign', 'DSG-M (isApproved missing) signs Planning for ITEL', { build: scen(), run: run([sign('DSG-M', 'ITEL', 'Planning')]) });
fx('G8', 'sign', 'CRT-N (creator, owner None) signs Planning for SYMC (known-permissive)', { build: scen({ proj: project({ uid: 'CRT-N' }) }), run: run([sign('CRT-N', 'SYMC', 'Planning')]) });
fx('G8b', 'sign', 'CRT-V (Viewer creator with saved approvePlanning, Owner ITEL) signs ITEL', {
  build: scen({ proj: project({ uid: 'CRT-V' }), roles: { Viewer: { approvePlanning: true } } }), run: run([sign('CRT-V', 'ITEL', 'Planning')]) });
fx('G9', 'sign', 'ADM completes a populated three-owner approval at O&M', {
  build: scen({ proj: project({ owners: OWNERS3, designApproval: ap({ ...three, stage: 'OM', planningApproved: OWNERS3, omApproved: ['ITEL', 'SYMC'] }) }) }),
  run: run([sign('ADM', 'UIH', 'OM', { participating: OWNERS3 })]) });
fx('G9a', 'sign', 'ADM signs Planning for UIH (three owners)', {
  build: scen({ proj: project({ owners: OWNERS3, designApproval: ap({ ...three, planningApproved: ['ITEL', 'SYMC'] }) }) }),
  run: run([sign('ADM', 'UIH', 'Planning', { participating: OWNERS3 })]) });
fx('G9b', 'sign', 'ADM signs an O&M entry while Planning is not complete (pinned Admin latitude)', { build: scen(), run: run([sign('ADM', 'SYMC', 'OM')]) });
fx('G10', 'sign', 'ADM-E signs a Pending entry with built-in Admin defaults', { build: scen(), run: run([sign('ADM-E', 'ITEL', 'Planning')]) });
const completed3 = () => project({ owners: OWNERS3, designApproval: ap({ ...three, stage: 'Completed', planningApproved: OWNERS3, omApproved: OWNERS3 }) });
fx('G11', 'sign', 'ADM corrects an Approved entry to Approved at Completed (three owners)', { build: scen({ proj: completed3() }), run: run([sign('ADM', 'ITEL', 'OM', { participating: OWNERS3, options: { fullName: 'Corrected Name' } })]) });
fx('G12', 'sign', 'ADM corrects Approved to Rejected', { build: scen({ proj: completed3() }), run: run([{ as: 'ADM', payload: proj => clientSign(proj, OWNERS3, { owner: 'ITEL', level: 'OM', approve: false, uid: 'ADM', comment: 'Wrong' }) }]) });
const completed2 = () => prj({ stage: 'Completed', planningApproved: S2, omApproved: S2 });
fx('G13', 'sign', 'ADM-E corrects Approved to Approved', { build: scen({ proj: completed2() }), run: run([sign('ADM-E', 'ITEL', 'OM')]) });
fx('G14', 'sign', 'ADM-E corrects Approved to Rejected (hasAdminRole gate)', { build: scen({ proj: completed2() }), run: run([{ as: 'ADM-E', payload: proj => clientSign(proj, S2, { owner: 'ITEL', level: 'OM', approve: false, uid: 'ADM-E', comment: 'x' }) }]) });
fx('G15', 'sign', 'Saved role document missing the key falls back to the default', { build: scen({ roles: { Planning: { viewMap: true } } }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('G16', 'sign', 'Legacy approval without snapshot: full sign flow to completion', {
  build: scen({ proj: prj({ snapshot: false }), roles: { Planning: { approvePlanning: true, approveOM: true }, Management: { approvePlanning: true, approveOM: true } } }),
  run: run([sign('PLN', 'ITEL', 'Planning'), sign('MGT', 'SYMC', 'Planning'), sign('PLN', 'ITEL', 'OM'), sign('MGT', 'SYMC', 'OM')]) });
fx('G17', 'sign', 'Snapshot lists only ITEL while project owners are [ITEL, SYMC]; ITEL alone completes', {
  build: scen({ proj: project({ designApproval: ap({ owners: ['ITEL'] }) }), snap: snapOf(['ITEL']), roles: { Planning: { approveOM: true } } }),
  run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL'] }), sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });

fx('L1', 'sign', 'Worst case: snapshot-backed three-owner O&M completion by MGT with a saved Management role document', {
  build: scen({ proj: project({ owners: OWNERS3, designApproval: ap({ ...three, stage: 'OM', planningApproved: OWNERS3, omApproved: ['ITEL', 'UIH'] }) }), roles: { Management: { approveOM: true, viewMap: true } } }),
  run: run([sign('MGT', 'SYMC', 'OM', { participating: OWNERS3 })]) });

// ---------- LS: legacy stage fallback ----------
const legacyNoStage = (options = {}, projectOptions = {}) => { const a = ap({ snapshot: false, ...options }); delete a.approvalStage; return project({ designApproval: a, ...projectOptions }); };
fx('LS1', 'sign', 'Pending legacy approval with no approvalStage: PLN signs Planning', { build: scen({ proj: legacyNoStage() }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('LS1b', 'sign', 'Same with the top-level status field absent', {
  build: scen({ proj: (() => { const p = legacyNoStage(); delete p.status; return p; })() }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('LS1c', 'sign', 'Legacy no-stage: the last Planning entry moves the client to OM', {
  build: scen({ proj: legacyNoStage({ planningApproved: ['ITEL'] }), roles: { Management: { approvePlanning: true } } }), run: run([sign('MGT', 'SYMC', 'Planning')]) });
fx('LS2', 'sign', 'Legacy no-stage approval whose project status is Approved: PLN signs', {
  build: scen({ proj: legacyNoStage({}, { status: 'Approved' }) }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('LS2b', 'sign', 'Legacy Approved, no stage, project Approved: PLN rewrites an Approved entry', {
  build: scen({ proj: (() => { const a = ap({ snapshot: false, stage: 'Completed', planningApproved: S2, omApproved: S2 }); delete a.approvalStage; return project({ designApproval: a }); })() }),
  run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('LS3', 'sign', 'Same completed legacy state: ADM corrects an Approved entry', {
  build: scen({ proj: (() => { const a = ap({ snapshot: false, stage: 'Completed', planningApproved: S2, omApproved: S2 }); delete a.approvalStage; return project({ designApproval: a }); })() }),
  run: run([sign('ADM', 'ITEL', 'OM')]) });

// ---------- N: map normalisation ----------
const withoutKey = (key, options = {}) => { const a = ap(options); delete a[key]; return project({ designApproval: a }); };
fx('N1', 'sign', 'Missing O&M map: PLN signs Planning; client writes omSignOffs {}', { build: scen({ proj: withoutKey('omSignOffs') }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('N2', 'sign', 'Missing Planning map: ADM signs an O&M entry; client writes planningSignOffs {}', { build: scen({ proj: withoutKey('planningSignOffs') }), run: run([sign('ADM', 'ITEL', 'OM')]) });
fx('N3', 'sign', 'Both maps absent: PLN signs Planning', {
  build: scen({ proj: (() => { const a = ap(); delete a.planningSignOffs; delete a.omSignOffs; return project({ designApproval: a }); })() }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('N4', 'sign', 'Untouched map absent to non-empty (omSignOffs gains Pending entries)', {
  build: scen({ proj: withoutKey('omSignOffs') }), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.omSignOffs = pendingMap(S2, 'OM'); })]) });
fx('N5', 'sign', 'Untouched map present to {} (wiped)', { build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.omSignOffs = {}; })]) });
fx('N6', 'sign', 'ownerSignOffs absent stays absent', { build: scen({ proj: withoutKey('ownerSignOffs') }), run: run([sign('PLN', 'ITEL', 'Planning')]) });

// ---------- O / RT: owner-set sources ----------
const staleSymc = (status = 'Pending') => { const a = ap({ snapshot: false }); a.planningSignOffs.SYMC = { owner: 'SYMC', level: 'Planning', status }; a.omSignOffs.SYMC = { owner: 'SYMC', level: 'OM', status: status === 'Rejected' ? 'Pending' : status }; return project({ owners: ['ITEL'], designApproval: a }); };
const ownerRoles = { Planning: { approveOM: true } };
fx('O1', 'sign', 'Owners [ITEL], stale Pending SYMC key, no snapshot: ITEL signs Planning then O&M to Completed', {
  build: scen({ proj: staleSymc(), roles: ownerRoles }), run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL'] }), sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });
fx('O2', 'sign', 'Same with a stale Rejected SYMC entry (does not reject, as in the client)', {
  build: scen({ proj: staleSymc('Rejected'), roles: ownerRoles }), run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL'] }), sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });
const onlyItelKeys = () => { const a = ap({ snapshot: false, owners: ['ITEL'] }); return project({ owners: S2, designApproval: a }); };
fx('O3', 'sign', 'Owners [ITEL, SYMC], only ITEL entries, no snapshot: ITEL signs Planning, stage Planning', { build: scen({ proj: onlyItelKeys() }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('O4', 'sign', 'Same state: the write sets OM (a missing owner entry cannot reduce the set)', {
  build: scen({ proj: onlyItelKeys() }), run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL'] })]) });
const noOwners = (approvalOptions = {}, uid = 'PLN') => { const p = project({ uid, designApproval: ap({ snapshot: false, ...approvalOptions }) }); delete p.owners; delete p.owner; return p; };
fx('O5', 'sign', 'No project owners, entries {ITEL, SYMC}: ITEL signs Planning, faithful stage Planning', { build: scen({ proj: noOwners() }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('O6', 'sign', 'No project owners: ITEL-only completion with SYMC Pending', {
  build: scen({ proj: noOwners({ stage: 'OM', planningApproved: ['ITEL'], omApproved: [] }), roles: ownerRoles }),
  run: run([craft('PLN', 'ITEL', 'OM', () => {}, { participating: ['ITEL'] })]) });
fx('O7', 'sign', 'No project owners, target creates its own entry (R includes the target)', {
  build: scen({ proj: noOwners({ owners: ['SYMC'] }) }), run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL', 'SYMC'] })]) });
fx('O8', 'sign', 'Owners [ITEL], SYMC signs (target not a project owner)', {
  build: scen({ proj: project({ uid: 'MGT', owners: ['ITEL'], designApproval: ap({ snapshot: false, owners: ['ITEL', 'SYMC'] }) }), roles: { Management: { approvePlanning: true } } }),
  run: run([sign('MGT', 'SYMC', 'Planning', { participating: ['ITEL'] })]) });
const rtState = () => { const a = ap({ snapshot: false, owners: S2 }); const p = project({ uid: 'PLN', designApproval: a }); delete p.owners; delete p.owner; return p; };
fx('RT1', 'sign', 'No owners/snapshot, client owners [ITEL] but keys {ITEL, SYMC}: ITEL signs both levels (stricter-than-client)', {
  build: scen({ proj: rtState(), roles: ownerRoles }),
  run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL'] }), sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });
fx('RT2', 'sign', 'No owners/snapshot, route owners [ITEL, SYMC] but keys {ITEL}: ITEL completes (looser-than-client)', {
  build: scen({ proj: (() => { const p = project({ uid: 'PLN', designApproval: ap({ snapshot: false, owners: ['ITEL'] }) }); delete p.owners; delete p.owner; return p; })(), roles: ownerRoles }),
  run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL'] }), sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });
fx('RT3', 'sign', 'RT1 state after the documented Admin recovery (rewind to Planning with keys {ITEL})', {
  build: scen({ proj: (() => { const a = ap({ snapshot: false, owners: S2, stage: 'Rejected' }); const p = project({ uid: 'PLN', designApproval: a, status: 'Rejected' }); delete p.owners; delete p.owner; return p; })(), roles: ownerRoles }),
  run: async ctx => {
    const { clientRewind } = await import('./world.mjs');
    await sequence(ctx, [{ as: 'ADM', payload: proj => clientRewind(proj, ['ITEL'], 'Planning') }, sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL'] }), sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]);
  } });

// ---------- M: malformed owner metadata ----------
const advance = (actor = 'PLN', owner = 'ITEL') => sign(actor, owner, 'Planning', { participating: ['ITEL'] }); // approves the only participant => OM
const nonAdvance = (actor = 'PLN', owner = 'ITEL') => sign(actor, owner, 'Planning'); // SYMC still Pending => Planning
const withSnapOwners = (owners, extra) => scen({ snap: snapOf(owners, extra) });
fx('M1', 'sign', 'Snapshot participatingOwners []: PLN non-completing sign', { build: withSnapOwners([]), run: run([nonAdvance()]) });
fx('M2', 'sign', 'Same snapshot: the vacuous-every write sets Completed', { build: withSnapOwners([]), run: run([sign('PLN', 'ITEL', 'Planning', { participating: [] })]) });
fx('M3', 'sign', "Snapshot ['ITEL','XYZ']: PLN signs ITEL Planning, stage Planning", { build: withSnapOwners(['ITEL', 'XYZ']), run: run([sign('PLN', 'ITEL', 'Planning', { participating: ['ITEL', 'XYZ'] })]) });
fx('M4', 'sign', "Snapshot ['ITEL','XYZ']: the write advances to OM", { build: withSnapOwners(['ITEL', 'XYZ']), run: run([advance()]) });
for (const [suffix, extra, removeField] of [['a', { participatingOwners: 'ITEL' }], ['b', { participatingOwners: { ITEL: true } }], ['c', null, true]]) {
  const snap = removeField ? snapNoOwners() : snapOf(S2, extra);
  fx(`M5${suffix}`, 'sign', `Snapshot participatingOwners malformed (${suffix}): non-advancing sign`, { build: scen({ snap }), run: run([nonAdvance()]) });
  fx(`M5${{ a: 'd', b: 'e', c: 'f' }[suffix]}`, 'sign', `Snapshot participatingOwners malformed (${suffix}): advancing write`, { build: scen({ snap }), run: run([advance()]) });
}
fx('M6', 'sign', 'Malformed snapshot owners: PLN rejects', { build: withSnapOwners([]), run: run([{ as: 'PLN', payload: proj => clientSign(proj, S2, { owner: 'ITEL', level: 'Planning', approve: false, uid: 'PLN', comment: 'No' }) }]) });
fx('M7', 'sign', 'Malformed snapshot owners: non-Admin signs an O&M-level entry', { build: withSnapOwners([]), run: run([sign('MGT', 'SYMC', 'OM')]) });
fx('M8', 'sign', "Snapshot ['ITEL','XYZ'] and target SYMC: non-advancing sign", {
  build: scen({ snap: snapOf(['ITEL', 'XYZ']), roles: { Management: { approvePlanning: true } } }), run: run([sign('MGT', 'SYMC', 'Planning', { participating: ['ITEL', 'XYZ'] })]) });
const legacyWith = ownersValue => { const p = project({ uid: 'PLN', designApproval: ap({ snapshot: false }) }); p.owners = ownersValue; return p; };
fx('M9', 'sign', "No snapshot, project owners ['XYZ']: PLN non-advancing sign", { build: scen({ proj: legacyWith(['XYZ']) }), run: run([nonAdvance()]) });
fx('M10a', 'sign', 'No snapshot, project owners is a string: non-advancing sign', { build: scen({ proj: legacyWith('ITEL') }), run: run([nonAdvance()]) });
fx('M10b', 'sign', 'No snapshot, project owners is a map: non-advancing sign', { build: scen({ proj: legacyWith({ ITEL: true }) }), run: run([nonAdvance()]) });
fx('M10c', 'sign', 'No snapshot, project owners is a string: advancing write', { build: scen({ proj: legacyWith('ITEL') }), run: run([advance()]) });
fx('M10d', 'sign', 'No snapshot, project owners is a map: advancing write', { build: scen({ proj: legacyWith({ ITEL: true }) }), run: run([advance()]) });

// ---------- D: forgeries and closed holes ----------
fx('D1', 'sign', 'MGT signs the ITEL entry (wrong owner)', { build: scen({ proj: prj(planningDone) }), run: run([sign('MGT', 'ITEL', 'OM')]) });
fx('D2', 'sign', 'PLN without approveOM signs O&M', { build: scen({ proj: prj(planningDone) }), run: run([sign('PLN', 'ITEL', 'OM')]) });
fx('D3', 'sign', 'MGT without approvePlanning signs Planning', { build: scen(), run: run([sign('MGT', 'SYMC', 'Planning')]) });
fx('D4', 'sign', 'PLN with saved approvePlanning false signs Planning (revoked)', { build: scen({ roles: { Planning: { approvePlanning: false } } }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('D4b', 'sign', 'ADM with saved Admin approveOM false signs O&M', { build: scen({ proj: prj(planningDone), roles: { Admin: { approveOM: false } } }), run: run([sign('ADM', 'ITEL', 'OM')]) });
fx('D5', 'sign', 'Forged signedByUid (another uid)', { build: scen(), run: run([sign('PLN', 'ITEL', 'Planning', { uid: 'SOMEONE-ELSE' })]) });
fx('D5b', 'sign', 'Forged signedByUid (missing)', { build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { delete p.designApproval.planningSignOffs.ITEL.signedByUid; })]) });
fx('D6', 'sign', 'PLN writes the ITEL and SYMC entries in one write', {
  build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.planningSignOffs.SYMC = approvedEntry('SYMC', 'Planning', 'PLN'); p.designApproval.approvalStage = 'OM'; })]) });
fx('D7', 'sign', 'MGT signs an O&M entry while a Planning entry is Pending', { build: scen({ proj: prj({ planningApproved: ['ITEL'] }) }), run: run([sign('MGT', 'SYMC', 'OM')]) });
fx('D8', 'sign', 'Jump to Completed with partial entries', {
  build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.approvalStage = 'Completed'; p.designApproval.status = 'Approved'; p.status = 'Approved'; p.designApproval.finalApprovedAt = 'x'; p.designApproval.finalApprovedBy = 'y'; })]) });
fx('D8m', 'sign', 'Approval status and project status mismatch', {
  build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.status = 'Approved'; })]) });
fx('D8c1', 'sign', 'Snapshot [ITEL, SYMC] with only ITEL entries and ITEL-only completion', {
  build: scen({ proj: project({ designApproval: ap({ owners: ['ITEL'], stage: 'OM', planningApproved: ['ITEL'] }) }), snap: snapOf(S2), roles: ownerRoles }),
  run: run([sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });
fx('D8c2', 'sign', 'Snapshot [ITEL] and the target owner is SYMC', {
  build: scen({ snap: snapOf(['ITEL']), roles: { Management: { approvePlanning: true } } }), run: run([sign('MGT', 'SYMC', 'Planning')]) });
fx('D8c3', 'sign', 'Snapshot document missing though snapshotId is set', { build: scen({ snap: null }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('D8c4', 'sign', 'Snapshot approvalId does not match the approval id', { build: scen({ snap: snapOf(S2, { approvalId: 'other' }) }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
for (const [name, mutate] of [['documentNumber', p => { p.designApproval.documentNumber = 'FORGED'; }], ['contractorName', p => { p.designApproval.contractorName = 'Forged'; }],
  ['designNotes', p => { p.designApproval.designNotes = 'Forged'; }], ['requestedBy', p => { p.designApproval.requestedBy = 'Forged'; }],
  ['snapshotId', p => { p.designApproval.snapshotId = 'forged'; }], ['routeEnclosureSelections', p => { p.designApproval.routeEnclosureSelections = { r: ['e'] }; }]]) {
  fx(`D9.${name}`, 'sign', `Sign write that also changes ${name}`, { build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', mutate)]) });
}
// ---------- G18/D23: the outcome must be the one the data supports ----------
const rejectedWithSymc = () => { const a = ap({ stage: 'Rejected', rejectionReason: 'SYMC says no' }); a.planningSignOffs.SYMC = { owner: 'SYMC', level: 'Planning', status: 'Rejected', signedByUid: 'MGT' }; return project({ designApproval: a, status: 'Rejected' }); };
fx('G18', 'sign', 'ADM approves ITEL while SYMC is Rejected: the client keeps the approval Rejected', { build: scen({ proj: rejectedWithSymc() }), run: run([sign('ADM', 'ITEL', 'Planning')]) });
fx('D23.unreject', 'sign', 'ADM approves ITEL while SYMC is Rejected but claims Pending/Planning (un-rejects)', {
  build: scen({ proj: rejectedWithSymc() }),
  run: run([craft('ADM', 'ITEL', 'Planning', p => { p.designApproval.approvalStage = 'Planning'; p.designApproval.status = 'Pending Approval'; p.status = 'Pending Approval'; p.designApproval.rejectionReason = ''; })]) });
fx('D23.completeClaimOM', 'sign', 'The last signer completes both levels but claims Pending/OM', {
  build: scen({ proj: prj(lastOm) }),
  run: run([craft('MGT', 'SYMC', 'OM', p => { p.designApproval.approvalStage = 'OM'; p.designApproval.status = 'Pending Approval'; p.status = 'Pending Approval'; delete p.designApproval.finalApprovedAt; delete p.designApproval.finalApprovedBy; })]) });
fx('D23.claimPlanning', 'sign', 'The last Planning signer completes Planning but claims Planning', {
  build: scen({ proj: prj({ planningApproved: ['ITEL'] }), roles: { Management: { approvePlanning: true } } }),
  run: run([craft('MGT', 'SYMC', 'Planning', p => { p.designApproval.approvalStage = 'Planning'; })]) });

// ---------- round 2: owner expansion after the approval progressed, and snapshot identity ----------
// A project edit may add an owner while an approval is in flight (ProjectsDashboard.handleSaveProject), so the
// required set is recomputed from the current owners on every sign.
const expandedAtOm = () => { const a = ap({ snapshot: false, owners: ['ITEL'], stage: 'OM', planningApproved: ['ITEL'] }); return project({ owners: ['ITEL'], designApproval: a }); };
// Replay the actual allowed project edit before signing; this is not just an inconsistent seeded stage.
const addSymc = { as: 'DSG', payload: () => ({ owners: S2 }) };
fx('D24.ownerExpansion', 'sign', 'Owners [ITEL] at OM, then SYMC is added to the project: ITEL alone completes', {
  build: scen({ proj: expandedAtOm(), roles: ownerRoles }), run: run([addSymc, sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });
fx('D24.nonCompletingOm', 'sign', 'After owner expansion an O&M entry is denied even when it does not claim completion', {
  build: scen({ proj: expandedAtOm(), roles: ownerRoles }),
  run: run([addSymc, craft('PLN', 'ITEL', 'OM', p => { p.designApproval.approvalStage = 'OM'; }, { participating: S2 })]) });
fx('D24.malformedAtOm', 'sign', 'Malformed snapshot owners with the stage already OM: a non-Admin completes', {
  build: scen({ proj: prj({ stage: 'OM', planningApproved: S2, omApproved: ['ITEL'] }), snap: snapOf([]) }), run: run([sign('MGT', 'SYMC', 'OM')]) });
fx('D24.malformedOmRejection', 'sign', 'Malformed owners at stored OM cannot admit a non-Admin O&M rejection', {
  build: scen({ proj: prj({ stage: 'OM', planningApproved: S2 }), snap: snapOf([]) }),
  run: run([sign('MGT', 'SYMC', 'OM', { options: { approve: false } })]) });
const staleRejected = () => { const a = ap({ snapshot: false }); a.planningSignOffs.SYMC = { owner: 'SYMC', level: 'Planning', status: 'Rejected', signedByUid: 'MGT' }; return project({ owners: ['ITEL'], designApproval: a }); };
fx('G19', 'sign', 'A stale Rejected SYMC entry becomes required after an owner edit: PLN approves ITEL and the client writes Rejected', {
  build: scen({ proj: staleRejected() }), run: run([addSymc, sign('PLN', 'ITEL', 'Planning')]) });
fx('D25.pendingForged', 'sign', 'After owner expansion PLN cannot hide the required rejection by claiming Pending/Planning', {
  build: scen({ proj: staleRejected() }),
  run: run([addSymc, craft('PLN', 'ITEL', 'Planning', p => { p.status = 'Pending Approval'; p.designApproval.status = 'Pending Approval'; p.designApproval.approvalStage = 'Planning'; p.designApproval.rejectionReason = ''; })]) });
fx('D25.completionBlocked', 'sign', 'Same state: the Rejected required entry still stops a completion claim', {
  build: scen({ proj: (() => { const p = staleRejected(); p.owners = S2; p.designApproval.planningSignOffs.ITEL = approvedEntry('ITEL', 'Planning', 'PLN'); p.designApproval.approvalStage = 'OM'; return p; })(), roles: ownerRoles }),
  run: run([sign('PLN', 'ITEL', 'OM', { participating: ['ITEL'] })]) });
fx('D26.snapshotOtherProject', 'sign', "Snapshot metadata whose projectId is another project's", { build: scen({ snap: snapOf(S2, { projectId: 'OTHER' }) }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('D9b', 'sign', 'Sign write that adds an unknown key', { build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.extra = 'x'; })]) });
fx('D10.ownerSignOffs', 'sign', 'Non-Admin sign that changes ownerSignOffs', { build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.ownerSignOffs = { ITEL: approvedEntry('ITEL', 'Planning', 'PLN') }; })]) });
fx('D10.gainKey', 'sign', 'Non-Admin sign that gains a sign-off key', { build: scen({ proj: prj({ owners: ['ITEL'] }) }), run: run([craft('PLN', 'ITEL', 'Planning', p => { p.designApproval.planningSignOffs.UIH = { owner: 'UIH', level: 'Planning', status: 'Pending' }; })]) });
fx('D10.loseKey', 'sign', 'Non-Admin sign that loses a sign-off key', { build: scen(), run: run([craft('PLN', 'ITEL', 'Planning', p => { delete p.designApproval.omSignOffs.SYMC; })]) });
fx('D11.om', 'sign', 'DSG signs O&M', { build: scen({ proj: prj(planningDone) }), run: run([sign('DSG', 'ITEL', 'OM')]) });
fx('D11.symc', 'sign', 'DSG signs SYMC', { build: scen(), run: run([sign('DSG', 'SYMC', 'Planning')]) });
fx('D11.revoked', 'sign', 'DSG with saved approvePlanning false', { build: scen({ roles: { Design: { approvePlanning: false } } }), run: run([sign('DSG', 'ITEL', 'Planning')]) });
fx('D12', 'sign', 'SUB with default permissions signs', { build: scen(), run: run([sign('SUB', 'ITEL', 'Planning')]) });
fx('D13', 'sign', 'DSG-U (isApproved false) signs', { build: scen(), run: run([sign('DSG-U', 'ITEL', 'Planning')]) });
fx('D13b', 'sign', 'MGT-U (unapproved, not an editor) signs', { build: scen({ proj: prj(planningDone) }), run: run([sign('MGT-U', 'SYMC', 'OM')]) });
fx('D13c', 'sign', 'PLN-M (isApproved missing, not an editor) signs', { build: scen(), run: run([sign('PLN-M', 'ITEL', 'Planning')]) });
fx('D14', 'sign', 'PLN-N (owner None, non-creator, non-editor) signs', { build: scen(), run: run([sign('PLN-N', 'ITEL', 'Planning')]) });
fx('D15', 'sign', 'VWR-G (permission-granted Viewer, not creator) signs', { build: scen({ roles: { Viewer: { approvePlanning: true } } }), run: run([sign('VWR-G', 'ITEL', 'Planning')]) });
fx('D15b', 'sign', 'CRT-V (Viewer creator) without the permission signs', { build: scen({ proj: project({ uid: 'CRT-V' }) }), run: run([sign('CRT-V', 'ITEL', 'Planning')]) });
fx('D16', 'sign', 'DSG-X (not a member) writes an approval field', { build: scen(), run: run([sign('DSG-X', 'ITEL', 'Planning')]) });
fx('D17.reopen', 'sign', 'PLN signs a Rejected-stage entry to reopen', {
  build: scen({ proj: project({ designApproval: ap({ stage: 'Rejected' }), status: 'Rejected' }) }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('D17.rewrite', 'sign', 'PLN rewrites an Approved entry in Completed as Approved', { build: scen({ proj: completed2() }), run: run([sign('PLN', 'ITEL', 'Planning')]) });
fx('D17b', 'sign', 'PLN changes an Approved entry to Rejected in Completed', {
  build: scen({ proj: completed2() }), run: run([{ as: 'PLN', payload: proj => clientSign(proj, S2, { owner: 'ITEL', level: 'Planning', approve: false, uid: 'PLN', comment: 'x' }) }]) });
export { drop };
