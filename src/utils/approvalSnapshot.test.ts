import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import type { ApprovalSnapshotCollections, DesignApproval, Project } from '../types';
import { buildProjectKml, exportFileName } from './kml';
import { ApprovalStateChangedError, backfillCommitMessage, backfillFailureMessage, backfillLockedAt, buildApprovalSnapshot, chooseApprovalSource, chunkSnapshotWrites, classifyBackfillFailure, firestoreErrorCode, formatBackfillNotice, getParticipatingOwners, isBackfilledApproval, nextSnapshotId, planSnapshotBackfill, remapApprovalDraftSelections, resolveBackfillLocker, sourceReadiness,
  IncompleteApprovalSnapshotError, nextApprovalId, planApprovalAttach, planIdIndex, projectForDocument,
  resolveApprovalFormValues, resolveApprovalSnapshot } from './approvalSnapshot';

test('backfill plans exactly five dotted fields for every approval status and rejects stale state', () => {
  const record = { snapshotId: 'snap_new', createdAt: '2026-10-22T12:00:00Z', uid: 'auth-u', email: 'u@example.com' };
  const at = Timestamp.fromMillis(1000);
  for (const status of ['Pending Approval', 'Approved', 'Rejected', 'Draft'] as const) {
    const current = { ...project, status, approvalDraft: { contractorName: 'Keep draft' },
      designApproval: { ...approval('a1', status), snapshotId: undefined, approvalStage: status === 'Approved' ? 'Completed' as const : 'Planning' as const,
        planningSignOffs: { UIH: { owner: 'UIH' as const, status: 'Approved' as const } },
        finalDocuments: { pdfFileId: 'pdf-1', pdfName: 'signed.pdf', createdAt: '2026-10-21', createdBy: 'u' } } };
    const before = structuredClone(current);
    assert.deepEqual(planSnapshotBackfill({ approvalId: 'a1' }, current, record, at), {
      'designApproval.snapshotId': 'snap_new', 'designApproval.snapshotCreatedAt': record.createdAt,
      'designApproval.snapshotBackfilledAt': at, 'designApproval.snapshotBackfilledByUid': 'auth-u',
      'designApproval.snapshotBackfilledByEmail': 'u@example.com'
    });
    assert.deepEqual(current, before);
  }
  for (const current of [
    { ...project, designApproval: undefined },
    { ...project, designApproval: approval('other') },
    { ...project, designApproval: approval('a1') },
    { ...project, designApproval: { ...approval('a1'), snapshotId: 'snap_other' } }
  ]) assert.throws(() => planSnapshotBackfill({ approvalId: 'a1' }, current, record, at), ApprovalStateChangedError);
  assert.throws(() => planSnapshotBackfill({ approvalId: 'a1' }, { ...project, designApproval: { ...approval('a1'), snapshotId: undefined } },
    { ...record, snapshotId: 'a1' }, at), ApprovalStateChangedError);
});

test('permission denial is state changed only after a successful server read proves it', () => {
  const expected = { approvalId: 'a1' };
  const matching = { ...project, designApproval: { ...approval('a1'), snapshotId: undefined } };
  for (const changed of [null, project, { ...matching, designApproval: approval('other') },
    { ...matching, designApproval: approval('a1') }])
    assert.equal(classifyBackfillFailure('permission-denied', expected, { ok: true, project: changed }), 'state-changed');
  for (const status of ['Pending Approval', 'Approved', 'Rejected', 'Draft'] as const)
    for (const draft of [undefined, { contractorName: 'Saved' }])
      assert.equal(classifyBackfillFailure('permission-denied', expected, { ok: true, project: {
        ...matching, approvalDraft: draft, designApproval: { ...matching.designApproval, status }
      } }), 'permission-error');
  for (const reread of [undefined, { ok: false } as const, { ok: true, project: matching } as const,
    { ok: true, project: null } as const])
    for (const code of ['unavailable', 'deadline-exceeded', 'aborted', undefined, ''])
      assert.equal(classifyBackfillFailure(code, expected, reread), 'failed');
  assert.equal(classifyBackfillFailure('permission-denied', expected, undefined), 'failed');
  assert.equal(classifyBackfillFailure('permission-denied', expected, { ok: false }), 'failed');
});

test('error codes and backfill result messages do not infer state from text', () => {
  assert.equal(firestoreErrorCode({ code: 'permission-denied' }), 'permission-denied');
  for (const error of [new Error('permission denied'), { code: 4 }, null]) assert.equal(firestoreErrorCode(error), undefined);
  assert.equal(backfillFailureMessage('state-changed', 'permission-denied', false), 'คำขอเปลี่ยนไปแล้ว (อาจมีผู้ล็อกก่อน หรือคำขอถูกยื่นใหม่/ถอยกลับ) กรุณาโหลดหน้าใหม่');
  assert.equal(backfillFailureMessage('permission-error', 'permission-denied', false), 'ไม่มีสิทธิ์ล็อกเอกสารนี้ (permission-denied) กรุณาติดต่อผู้ดูแลระบบ');
  assert.equal(backfillFailureMessage('failed', 'unavailable', false), 'ล็อกเอกสารไม่สำเร็จ (unavailable) กรุณากดล็อกอีกครั้ง');
  assert.equal(backfillFailureMessage('failed', undefined, true), 'ล็อกเอกสารไม่สำเร็จ และตรวจสอบสาเหตุไม่ได้ กรุณากดล็อกอีกครั้ง');
  assert.equal(backfillCommitMessage(false), 'ล็อกเอกสารสำเร็จ');
  assert.equal(backfillCommitMessage(true), 'ล็อกเอกสารสำเร็จแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ โปรดโหลดหน้าใหม่');
});

test('backfill snapshot keeps path identity separate from approval identity', () => {
  const id = nextSnapshotId();
  assert.match(id, /^snap_[0-9a-f-]{36}$/);
  assert.notEqual(id, nextSnapshotId());
  const snapshot = buildApprovalSnapshot(project, 'a1', '2026-10-22', 'u', ['UIH'], source(), id);
  assert.equal(snapshot.metadata.id, id);
  assert.equal(snapshot.metadata.approvalId, 'a1');
  assert.equal(snapshot.metadata.backfill, true);
  assert.equal(resolveApprovalSnapshot(snapshot.metadata, snapshot.collections, [], { snapshotId: id, approvalId: 'a1' }).metadata.id, id);
  const changedLive = source();
  changedLive.routes[0].name = 'Changed route';
  assert.equal(chooseApprovalSource(changedLive, { ...approval('a1'), snapshotId: id }, snapshot).routes[0].name, 'Route one');
  assert.throws(() => chooseApprovalSource(source(), approval('a1'), snapshot), IncompleteApprovalSnapshotError);
  assert.throws(() => resolveApprovalSnapshot(snapshot.metadata, snapshot.collections, [], { snapshotId: 'wrong', approvalId: 'a1' }), IncompleteApprovalSnapshotError);
  assert.throws(() => resolveApprovalSnapshot(snapshot.metadata, snapshot.collections, [], { snapshotId: id, approvalId: 'wrong' }), IncompleteApprovalSnapshotError);
  const normal = make();
  assert.equal(normal.metadata.backfill, undefined);
  assert.equal(resolveApprovalSnapshot(normal.metadata, normal.collections, [], { snapshotId: 'a1', approvalId: 'a1' }).metadata.id, 'a1');
});

test('backfill notice requires a server Timestamp and a verified locker profile identity', () => {
  const locked = { ...approval('a1'), snapshotId: 'snap_1', snapshotBackfilledAt: Timestamp.fromMillis(0),
    snapshotBackfilledByUid: 'auth-u', snapshotBackfilledByEmail: 'u@example.com' };
  assert.equal(isBackfilledApproval(locked), true);
  assert.equal(isBackfilledApproval(approval('a1')), false);
  assert.equal(backfillLockedAt(locked)?.toMillis(), 0);
  assert.equal(backfillLockedAt({ ...locked, snapshotBackfilledAt: { seconds: 0 } as never }), null);
  assert.equal(resolveBackfillLocker('auth-u', 'u@example.com', { id: 'auth-u', displayName: 'Admin Name' }), 'Admin Name');
  assert.equal(resolveBackfillLocker('auth-u', 'u@example.com', { id: 'other', displayName: 'Wrong' }), 'u@example.com');
  assert.equal(resolveBackfillLocker('auth-u', 'u@example.com', null), 'u@example.com');
  assert.match(formatBackfillNotice(locked, 'Admin Name'), /Admin Name.*เนื้อหาเป็นข้อมูลโครงการ ณ เวลาที่ล็อก/);
  assert.equal(formatBackfillNotice({ ...locked, snapshotBackfilledAt: undefined }, 'Admin Name'), 'กำลังยืนยันเวลาล็อกจากเซิร์ฟเวอร์…');
});

const project: Project = { id: 'p', name: 'Submitted name', routeCode: 'OLD', uid: 'u', owner: 'UIH', status: 'Draft',
  approvalDraft: { contractorName: 'Edited contractor' } };
const source = (): ApprovalSnapshotCollections => ({
  routes: [{ id: 'r1', name: 'Route one', path: [], capacity: 1, cores: [] }],
  enclosures: [{ id: 'e1', name: 'Enclosure one', position: { lat: 1, lng: 2 } }],
  loops: [], enclosureTypes: [{ id: 't1', name: 'Type one', color: 'red' }], fiberTypes: [], fiberColorConfigs: []
});
const approval = (id: string, status: DesignApproval['status'] = 'Pending Approval'): DesignApproval => ({
  id, documentNumber: 'D-1', status, requestedBy: 'User', requestedByUid: 'u', requestedAt: '2026-10-22', snapshotId: id
});
const make = () => buildApprovalSnapshot(project, 'a1', '2026-10-22', 'u', ['UIH'], source());

test('snapshot copies the ready view and submitted project header, and keeps historical sources fixed', () => {
  const live = source();
  const snapshot = buildApprovalSnapshot(project, 'a1', '2026-10-22', 'u', ['UIH'], live);
  live.routes[0].name = 'Changed route';
  live.enclosureTypes[0].name = 'Changed type';
  const changedProject = { ...project, name: 'New name', routeCode: 'NEW', owners: ['ITEL' as const] };
  const resolved = resolveApprovalSnapshot(snapshot.metadata, snapshot.collections);
  assert.equal(chooseApprovalSource(live, approval('a1'), resolved).routes[0].name, 'Route one');
  assert.equal(chooseApprovalSource(live, approval('a1'), resolved).enclosureTypes[0].name, 'Type one');
  assert.equal(projectForDocument(changedProject, resolved).name, 'Submitted name');
  assert.equal(projectForDocument(changedProject, resolved).routeCode, 'OLD');
  assert.equal(projectForDocument(changedProject, resolved).owners, undefined);
  const documentProject = projectForDocument(changedProject, resolved);
  assert.equal(exportFileName(documentProject, 'pdf'), 'OLD Submitted name.pdf');
  assert.equal(exportFileName(documentProject, 'kmz'), 'OLD Submitted name.kmz');
  const kml = buildProjectKml({ project: documentProject, ...resolved.collections }).kml;
  assert.match(kml, /Submitted name/);
  assert.doesNotMatch(kml, /New name/);
  assert.deepEqual(resolved.metadata.participatingOwners, ['UIH']);
  assert.deepEqual(getParticipatingOwners(changedProject, live.routes), ['ITEL']);
  assert.equal(chooseApprovalSource(live, approval('a1', 'Rejected'), resolved, true).routes[0].name, 'Changed route');
  assert.equal(chooseApprovalSource(live).routes[0].name, 'Changed route');
  assert.equal(chooseApprovalSource(live, { ...approval('legacy'), snapshotId: undefined }).routes[0].name, 'Changed route');
  assert.throws(() => chooseApprovalSource(live, approval('a1'), null), IncompleteApprovalSnapshotError);
});

test('inline index rejects missing, unexpected and duplicate child IDs and duplicate expected IDs', () => {
  const original = make();
  assert.deepEqual(original.metadata.ids?.routes, ['r1']);
  assert.equal(resolveApprovalSnapshot(original.metadata, original.collections).collections.routes[0].id, 'r1');
  assert.throws(() => resolveApprovalSnapshot(null, original.collections), /metadata/);
  for (const routes of [[], [{ ...original.collections.routes[0], id: 'other' }],
    [original.collections.routes[0], original.collections.routes[0]]]) {
    assert.throws(() => resolveApprovalSnapshot(original.metadata, { ...original.collections, routes }), /routes IDs/);
  }
  const badMetadata = structuredClone(original.metadata);
  badMetadata.ids!.routes = ['r1', 'r1'];
  assert.throws(() => resolveApprovalSnapshot(badMetadata, original.collections), /routes IDs/);
  assert.throws(() => resolveApprovalSnapshot(original.metadata, original.collections, [{ id: '0', data: { collection: 'routes', ids: [] } }]), /inline index/);
});

test('large index uses numbered chunks and rejects missing or extra chunks', () => {
  const large = source();
  large.loops = Array.from({ length: 520 }, (_, i) => ({ id: `${String(i).padStart(4, '0')}${'x'.repeat(510)}`,
    name: `Loop ${i}`, position: { lat: 1, lng: 2 }, routeId: 'r1', length: 1 }));
  const snapshot = buildApprovalSnapshot(project, 'large', '2026-10-22', 'u', ['UIH'], large);
  assert.equal(snapshot.metadata.ids, undefined);
  assert.equal(snapshot.metadata.idIndex?.mode, 'chunked');
  const chunks = snapshot.indexChunks.map((data, i) => ({ id: String(i), data }));
  assert.equal(resolveApprovalSnapshot(snapshot.metadata, snapshot.collections, chunks).collections.loops.length, 520);
  assert.throws(() => resolveApprovalSnapshot(snapshot.metadata, snapshot.collections, chunks.slice(1)), /index count/);
  assert.throws(() => resolveApprovalSnapshot(snapshot.metadata, snapshot.collections, [...chunks, { id: '99', data: chunks[0].data }]), /index count/);
  assert.throws(() => resolveApprovalSnapshot(snapshot.metadata, { ...snapshot.collections, loops: snapshot.collections.loops.slice(1) }, chunks), /loops IDs/);
});

test('inline index includes exactly 256 KiB and the next byte switches to chunks', () => {
  const ids = { routes: Array.from({ length: 260 }, (_, i) => `${i}_` + 'x'.repeat(1000)),
    enclosures: [], loops: [], enclosureTypes: [], fiberTypes: [], fiberColorConfigs: [] };
  const size = () => new TextEncoder().encode(JSON.stringify(ids)).length;
  const adjustment = 256 * 1024 - size();
  ids.routes[0] += 'x'.repeat(adjustment);
  assert.equal(size(), 256 * 1024);
  assert.ok(ids.routes[0].length <= 1500);
  assert.ok(planIdIndex(ids).ids);
  ids.routes[0] += 'x';
  assert.equal(size(), 256 * 1024 + 1);
  assert.equal(planIdIndex(ids).idIndex?.mode, 'chunked');
});

test('snapshot children are batched at 450 operations, including zero and more than 500', () => {
  assert.deepEqual(chunkSnapshotWrites([]), []);
  assert.deepEqual(chunkSnapshotWrites(Array.from({ length: 450 }, (_, i) => i)).map(group => group.length), [450]);
  assert.deepEqual(chunkSnapshotWrites(Array.from({ length: 551 }, (_, i) => i)).map(group => group.length), [450, 101]);
});

test('each submit attempt gets a new ID, including a retry after a failed snapshot write', () => {
  const failedAttempt = nextApprovalId();
  const retry = nextApprovalId();
  assert.notEqual(retry, failedAttempt);
  assert.equal(buildApprovalSnapshot(project, retry, '2026-10-22', 'u', ['UIH'], source()).metadata.approvalId, retry);
});

test('attach decisions preserve Draft and Rejected state on failure and reject stale sessions', () => {
  const pending = approval('new');
  const originalDraft = structuredClone(project);
  const planned = planApprovalAttach({ kind: 'none' }, project, pending);
  assert.equal(planned.status, 'Pending Approval');
  assert.equal(planned.designApproval?.id, 'new');
  assert.equal(planned.approvalDraft, undefined);
  assert.deepEqual(project, originalDraft);
  const rejected = { ...project, status: 'Rejected' as const, designApproval: {
    ...approval('old', 'Rejected'), rejectionReason: 'Revise', planningSignOffs: { UIH: { owner: 'UIH' as const, status: 'Rejected' as const } }
  }, approvalDraft: { contractorName: 'Newest edit' } };
  const originalRejected = structuredClone(rejected);
  assert.equal(planApprovalAttach({ kind: 'rejected', id: 'old' }, rejected, pending).designApproval?.id, 'new');
  for (const [expected, actual] of [
    [{ kind: 'none' as const }, { ...project, designApproval: approval('other') }],
    [{ kind: 'rejected' as const, id: 'old' }, { ...rejected, designApproval: approval('other', 'Rejected') }],
    [{ kind: 'rejected' as const, id: 'old' }, { ...rejected, designApproval: approval('old', 'Approved') }],
    [{ kind: 'rejected' as const, id: 'old' }, { ...rejected, status: 'Draft' as const }]
  ] as const) assert.throws(() => planApprovalAttach(expected, actual, pending), ApprovalStateChangedError);
  assert.deepEqual(rejected, originalRejected);
});

test('route cut and split remap only the editable draft, never a submitted approval', () => {
  const original = { ...project, approvalDraft: { routeEnclosureSelections: { r1: ['e1', 'e2'] } } };
  const draft = remapApprovalDraftSelections(original, 'r1', 'r2', ['e1'], ['e2']);
  assert.deepEqual(draft?.routeEnclosureSelections, { r1: ['e1'], r2: ['e2'] });
  const rejected = { ...original, status: 'Rejected' as const, designApproval: {
    ...approval('old', 'Rejected'), routeEnclosureSelections: { r1: ['e1', 'e2'] }
  } };
  const rejectedBefore = structuredClone(rejected.designApproval);
  assert.deepEqual(remapApprovalDraftSelections(rejected, 'r1', 'r2', ['e1'], ['e2'])?.routeEnclosureSelections,
    { r1: ['e1'], r2: ['e2'] });
  assert.deepEqual(rejected.designApproval, rejectedBefore);
  for (const status of ['Pending Approval', 'Approved'] as const) {
    assert.equal(remapApprovalDraftSelections({ ...rejected, status, designApproval: { ...rejected.designApproval, status } },
      'r1', 'r2', ['e1'], ['e2']), undefined);
  }
});

test('rejected resubmission inherits every unsaved field and custom route selection from the prior approval', () => {
  const rejected: Project = { ...project, status: 'Rejected', designApproval: {
    ...approval('old', 'Rejected'), designNotes: 'Original notes', contractorName: 'Original contractor',
    contractorContact: 'Original contact', contractorPhone: '123', contractorPoNumber: 'PO-1',
    contractorScope: 'Install', totalOperationDistanceKm: 14, estimatedInstallationDate: '2026-11-01',
    routeEnclosureSelections: { r1: ['e2'] }
  }, approvalDraft: undefined };
  const beforeSave = resolveApprovalFormValues(rejected);
  const afterOneFieldSave = resolveApprovalFormValues({ ...rejected, approvalDraft: { contractorName: 'New contractor' } });
  assert.deepEqual(afterOneFieldSave, { ...beforeSave, contractorName: 'New contractor' });
  assert.deepEqual(afterOneFieldSave.routeEnclosureSelections, { r1: ['e2'] });

  const explicitClears = resolveApprovalFormValues({ ...rejected, approvalDraft: {
    designNotes: '', totalOperationDistanceKm: 0, routeEnclosureSelections: {}
  } });
  assert.equal(explicitClears.designNotes, '');
  assert.equal(explicitClears.totalOperationDistanceKm, 0);
  assert.deepEqual(explicitClears.routeEnclosureSelections, {});
  assert.equal(explicitClears.contractorContact, 'Original contact');
});

test('pending and approved forms ignore stale drafts', () => {
  for (const status of ['Pending Approval', 'Approved'] as const) {
    const saved: Project = { ...project, status, designApproval: {
      ...approval('current', status), contractorName: 'Submitted', routeEnclosureSelections: { r1: ['e1'] }
    }, approvalDraft: { contractorName: 'Stale edit', routeEnclosureSelections: { r1: ['e2'] } } };
    assert.equal(resolveApprovalFormValues(saved).contractorName, 'Submitted');
    assert.deepEqual(resolveApprovalFormValues(saved).routeEnclosureSelections, { r1: ['e1'] });
  }
});

test('all six listeners must load and any named source error blocks submission', () => {
  const status = {
    routes: { loaded: false }, enclosures: { loaded: false }, loops: { loaded: false },
    enclosureTypes: { loaded: false }, fiberTypes: { loaded: false }, fiberColorConfigs: { loaded: false }
  };
  assert.deepEqual(sourceReadiness(status), { ready: false, loading: true, errorSource: undefined });
  for (const key of Object.keys(status) as Array<keyof typeof status>) status[key].loaded = true;
  assert.deepEqual(sourceReadiness(status), { ready: true, loading: false, errorSource: undefined });
  const failed = { ...status, fiberTypes: { loaded: false, error: 'permission-denied' } };
  assert.deepEqual(sourceReadiness(failed), { ready: false, loading: false, errorSource: 'fiberTypes' });
});
