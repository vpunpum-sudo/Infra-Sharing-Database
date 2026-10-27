// Accounts, project states and the faithful client write payloads used by the fixtures.
// Payload builders are ports of the real client code; the source lines are noted in the
// spec. They are NOT adjusted to satisfy the rules in either direction.
import { deleteField, serverTimestamp } from 'firebase/firestore';

export const DB_PROJECT = 'projects/P';
export const ADMIN_EMAIL = 'vpunpum@gmail.com'; // email-only Admin (firestore.rules isAdmin)

// name -> identity and users document (null = no users document)
const user = (uid, role, owner, extra = {}) => ({ id: uid, email: `${uid.toLowerCase()}@example.test`, role, owner, isApproved: true, ...extra });
export const ACCOUNTS = {
  ADM: { uid: 'ADM', doc: user('ADM', 'Admin', 'None') },
  'ADM-E': { uid: 'ADM-E', email: ADMIN_EMAIL, doc: null },
  PLN: { uid: 'PLN', doc: user('PLN', 'Planning', 'ITEL') },
  'PLN-M': { uid: 'PLN-M', doc: (() => { const d = user('PLN-M', 'Planning', 'ITEL'); delete d.isApproved; return d; })() },
  MGT: { uid: 'MGT', doc: user('MGT', 'Management', 'SYMC') },
  'MGT-U': { uid: 'MGT-U', doc: user('MGT-U', 'Management', 'SYMC', { isApproved: false }) },
  DSG: { uid: 'DSG', doc: user('DSG', 'Design', 'ITEL') },
  'DSG-M': { uid: 'DSG-M', doc: (() => { const d = user('DSG-M', 'Design', 'ITEL'); delete d.isApproved; return d; })() },
  'DSG-NO': { uid: 'DSG-NO', doc: (() => { const d = user('DSG-NO', 'Design', 'ITEL'); delete d.owner; return d; })() },
  'DSG-U': { uid: 'DSG-U', doc: user('DSG-U', 'Design', 'ITEL', { isApproved: false }) },
  'DSG-X': { uid: 'DSG-X', doc: user('DSG-X', 'Design', 'UIH') },
  SUB: { uid: 'SUB', doc: user('SUB', 'Sub-contract', 'ITEL') },
  'CRT-N': { uid: 'CRT-N', doc: user('CRT-N', 'Planning', 'None') },
  'PLN-N': { uid: 'PLN-N', doc: user('PLN-N', 'Planning', 'None') },
  'VWR-G': { uid: 'VWR-G', doc: user('VWR-G', 'Viewer', 'ITEL') },
  'CRT-V': { uid: 'CRT-V', doc: user('CRT-V', 'Viewer', 'ITEL') },
  CREATOR: { uid: 'CREATOR', doc: user('CREATOR', 'Planning', 'ITEL') },
};
export const identity = name => ({ uid: ACCOUNTS[name].uid, email: ACCOUNTS[name].email ?? `${ACCOUNTS[name].uid.toLowerCase()}@example.test` });
export const usersDocs = () => Object.fromEntries(Object.values(ACCOUNTS).filter(a => a.doc).map(a => [`users/${a.uid}`, a.doc]));

export const OWNERS3 = ['ITEL', 'SYMC', 'UIH'];
export const pendingEntry = (owner, level) => ({ owner, level, status: 'Pending' });
export const pendingMap = (owners, level) => Object.fromEntries(owners.map(owner => [owner, pendingEntry(owner, level)]));
export const approvedEntry = (owner, level, uid = 'SIGNER', extra = {}) =>
  ({ owner, level, status: 'Approved', signedBy: 'Some Signer', signedByEmail: 's@example.test', signedByUid: uid, position: 'Engineer', role: 'Planning', signedAt: '2026-10-01T00:00:00.000Z', comment: 'ok', signatureDataUrl: 'data:image/png;base64,AAAA', ...extra });
export const approvedMap = (owners, level) => Object.fromEntries(owners.map(owner => [owner, approvedEntry(owner, level)]));

/** Snapshot-backed Pending approval at Planning (the default fixture state). */
export function approval({ id = 'ap_1', owners = ['ITEL', 'SYMC'], stage = 'Planning', planningApproved = [], omApproved = [], snapshot = true, ...rest } = {}) {
  const planning = { ...pendingMap(owners, 'Planning'), ...Object.fromEntries(planningApproved.map(o => [o, approvedEntry(o, 'Planning')])) };
  const om = { ...pendingMap(owners, 'OM'), ...Object.fromEntries(omApproved.map(o => [o, approvedEntry(o, 'OM')])) };
  const completed = stage === 'Completed';
  return {
    id, ...(snapshot ? { snapshotId: id, snapshotCreatedAt: '2026-10-01T00:00:00.000Z' } : {}),
    documentNumber: 'APP-2610-001', status: completed ? 'Approved' : stage === 'Rejected' ? 'Rejected' : 'Pending Approval', approvalStage: stage,
    requestedBy: 'Requester', requestedByEmail: 'r@example.test', requestedByUid: 'CREATOR', requestedAt: '2026-10-01T00:00:00.000Z',
    designNotes: 'Frozen notes', contractorName: 'Contractor A', contractorContact: 'C', contractorPhone: '081', contractorPoNumber: 'PO1',
    contractorScope: 'Scope', estimatedInstallationDate: '2026-12-01', totalOperationDistanceKm: 1.5,
    routeEnclosureSelections: { route_1: ['enc_1'] },
    planningSignOffs: planning, omSignOffs: om, ownerSignOffs: planning,
    ...(completed ? { finalApprovedAt: '2026-10-02T00:00:00.000Z', finalApprovedBy: 'Some Signer' } : {}),
    ...rest,
  };
}
export function project({ status, designApproval, ...rest } = {}) {
  const base = { id: 'P', name: 'Synthetic project', routeCode: 'RC-1', uid: 'CREATOR', owners: ['ITEL', 'SYMC'], owner: 'ITEL', createdAt: '2026-09-01T00:00:00.000Z' };
  const body = { ...base, ...rest };
  if (designApproval !== null) body.designApproval = designApproval ?? approval();
  body.status = status ?? (body.designApproval ? (body.designApproval.status ?? 'Pending Approval') : 'Draft');
  return body;
}
export const snapshotDoc = (id = 'ap_1', owners = ['ITEL', 'SYMC'], extra = {}) =>
  ({ id, projectId: 'P', approvalId: id, createdAt: '2026-10-01T00:00:00.000Z', createdByUid: 'CREATOR', schemaVersion: 1, participatingOwners: owners, project: { id: 'P', name: 'Synthetic project' }, ...extra });

/** Seed documents for a scenario: users, the project and (when snapshot-backed) its snapshot metadata. */
export function world({ proj = project(), snap, roles = {}, extra = {} } = {}) {
  const docs = { ...usersDocs() };
  docs[DB_PROJECT] = proj;
  const ap = proj.designApproval;
  if (snap !== null) {
    if (snap) docs[`${DB_PROJECT}/approvalSnapshots/${ap?.snapshotId ?? 'ap_1'}`] = snap;
    else if (ap?.snapshotId) docs[`${DB_PROJECT}/approvalSnapshots/${ap.snapshotId}`] = snapshotDoc(ap.snapshotId, ap.planningSignOffs ? Object.keys(ap.planningSignOffs) : ['ITEL', 'SYMC']);
  }
  for (const [role, permissions] of Object.entries(roles)) docs[`rolePermissions/${role}`] = { permissions, updatedAt: 'x', updatedBy: 'ADM' };
  return { ...docs, ...extra };
}

// ---- faithful client payloads ----
/** Port of handleConfirmSignature (DesignApprovalModal.tsx ~1527-1631). `participating` is what the client derives. */
export function clientSign(proj, participating, { owner, level, approve = true, uid, comment = 'ok', now = '2026-10-03T00:00:00.000Z', fullName = 'Real Signer', extra = {} }) {
  const b = proj.designApproval;
  const entry = { owner, level, status: approve ? 'Approved' : 'Rejected', signedBy: fullName, signedByEmail: 's@example.test', signedByUid: uid,
    position: 'Engineer', role: 'Planning', signedAt: now, comment, signatureDataUrl: 'data:image/png;base64,AAAA', ...extra };
  const nextPlanning = { ...(b.planningSignOffs || {}) };
  const nextOm = { ...(b.omSignOffs || {}) };
  if (level === 'Planning') nextPlanning[owner] = entry; else nextOm[owner] = entry;
  const anyRej = participating.some(o => nextPlanning[o]?.status === 'Rejected') || participating.some(o => nextOm[o]?.status === 'Rejected') || !approve;
  const allP = participating.every(o => nextPlanning[o]?.status === 'Approved');
  const allOm = allP && participating.every(o => nextOm[o]?.status === 'Approved');
  const [stage, status] = anyRej ? ['Rejected', 'Rejected'] : allOm ? ['Completed', 'Approved'] : allP ? ['OM', 'Pending Approval'] : ['Planning', 'Pending Approval'];
  const { finalApprovedAt, finalApprovedBy, ...existing } = b;
  const reasonPatch = anyRej ? { rejectionReason: comment.trim() } : (existing.rejectionReason ? { rejectionReason: '' } : {});
  const updated = { ...existing, status, approvalStage: stage, ...reasonPatch, planningSignOffs: nextPlanning, omSignOffs: nextOm,
    ...(allOm ? { finalApprovedAt: finalApprovedAt || now, finalApprovedBy: fullName } : {}) };
  return { status, designApproval: updated };
}

/** Port of handleRewindApproval (DesignApprovalModal.tsx ~1328-1376). */
export function clientRewind(proj, participating, target) {
  const pending = level => Object.fromEntries(participating.map(owner => [owner, { owner, level, status: 'Pending' }]));
  const { finalApprovedAt, finalApprovedBy, ...prev } = proj.designApproval;
  const draft = {
    designNotes: prev.designNotes || '', contractorName: prev.contractorName || '', contractorContact: prev.contractorContact || '',
    contractorPhone: prev.contractorPhone || '', contractorPoNumber: prev.contractorPoNumber || '', contractorScope: prev.contractorScope || '',
    estimatedInstallationDate: prev.estimatedInstallationDate || '', routeEnclosureSelections: prev.routeEnclosureSelections || {},
    ...(prev.totalOperationDistanceKm != null ? { totalOperationDistanceKm: prev.totalOperationDistanceKm } : {}),
  };
  const updated = target === 'Draft' ? deleteField() : {
    ...prev, status: 'Pending Approval', approvalStage: target,
    planningSignOffs: target === 'Planning' ? pending('Planning') : prev.planningSignOffs,
    omSignOffs: pending('OM'),
    ownerSignOffs: target === 'Planning' ? pending('Planning') : prev.ownerSignOffs,
  };
  return { status: target === 'Draft' ? 'Draft' : 'Pending Approval', designApproval: updated, approvalDraft: target === 'Draft' ? draft : deleteField() };
}

/** The new approval the submit handler builds (DesignApprovalModal.tsx ~1410-1450). */
export function clientNewApproval({ id = 'ap_2', owners = ['ITEL', 'SYMC'], uid, snapshot = true } = {}) {
  const planning = pendingMap(owners, 'Planning');
  return {
    id, documentNumber: 'APP-2610-002', status: 'Pending Approval', approvalStage: 'Planning', requestedBy: 'Requester', requestedByEmail: 'r@example.test',
    requestedByUid: uid, requestedAt: '2026-10-05T00:00:00.000Z', designNotes: 'Note', contractorName: 'Contractor B', contractorContact: '', contractorPhone: '',
    contractorPoNumber: '', contractorScope: '', totalOperationDistanceKm: 2, estimatedInstallationDate: '2026-12-01',
    routeEnclosureSelections: { route_1: ['enc_1'] }, planningSignOffs: planning, omSignOffs: pendingMap(owners, 'OM'), ownerSignOffs: planning,
    ...(snapshot ? { snapshotId: id, snapshotCreatedAt: '2026-10-05T00:00:00.000Z' } : {}),
  };
}
/** planApprovalAttach patch (approvalSnapshot.ts:259-263) as written by attachApprovalSnapshot. */
export const clientAttach = newApproval => ({ status: 'Pending Approval', designApproval: newApproval, approvalDraft: deleteField() });

/** createFinalDocuments (DesignApprovalModal.tsx ~1691). */
export const clientFinalDocs = uid => ({ 'designApproval.finalDocuments': { pdfFileId: 'f1', pdfName: 'a.pdf', kmzFileId: 'f2', kmzName: 'a.kmz', createdAt: '2026-10-04T00:00:00.000Z', createdBy: uid } });

/** planSnapshotBackfill (approvalSnapshot.ts:34-44). */
export const clientBackfill = (snapshotId, uid, email) => ({
  'designApproval.snapshotId': snapshotId, 'designApproval.snapshotCreatedAt': '2026-10-23T00:00:00.000Z',
  'designApproval.snapshotBackfilledAt': serverTimestamp(), 'designApproval.snapshotBackfilledByUid': uid, 'designApproval.snapshotBackfilledByEmail': email,
});
