import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleSnapshotFromDocs } from './approvalSnapshotReader';
import { IncompleteApprovalSnapshotError, snapshotCollections, resolveApprovalSnapshot } from './approvalSnapshot';
import { snapshot } from './approvalHistory.testFixtures';
function fixture() {
  const s = snapshot(); s.collections.routes = [{ id: 'r', name: 'R', path: [], cores: [], capacity: 1 }]; s.metadata.ids!.routes = ['r'];
  const metadata = { id: 'a', data: s.metadata };
  const children = Object.fromEntries(snapshotCollections.map(name => [name, s.collections[name].map(data => ({ id: data.id, data: { projectId: 'project', approvalId: 'a', data } }))]));
  return { s, metadata, children };
}
test('reader: normal/backfill and chunked assembly have resolver parity', () => {
  const { s, metadata, children } = fixture();
  assert.deepEqual(assembleSnapshotFromDocs('project', 'a', 'a', metadata, [], children), resolveApprovalSnapshot(s.metadata, s.collections, [], { snapshotId: 'a', approvalId: 'a' }));
  const backfill = { ...metadata, id: 'snap', data: { ...metadata.data, id: 'snap', backfill: true as const } };
  assert.equal(assembleSnapshotFromDocs('project', 'snap', 'a', backfill, [], children).metadata.backfill, true);
  const chunked = { ...metadata, data: { ...metadata.data, ids: undefined, idIndex: { mode: 'chunked' as const, chunkCount: 1 } } };
  const chunks = [{ id: '0', data: { collection: 'routes', ids: ['r'], projectId: 'project', approvalId: 'a' } }];
  assert.equal(assembleSnapshotFromDocs('project', 'a', 'a', chunked, chunks, children).collections.routes.length, 1);
  assert.throws(() => assembleSnapshotFromDocs('project', 'a', 'a', chunked, [{ ...chunks[0], data: { ...chunks[0].data, projectId: 'other' } }], children), IncompleteApprovalSnapshotError);
  assert.throws(() => assembleSnapshotFromDocs('project', 'a', 'a', chunked, [{ ...chunks[0], data: { ...chunks[0].data, approvalId: 'other' } }], children), IncompleteApprovalSnapshotError);
  assert.throws(() => assembleSnapshotFromDocs('project', 'a', 'a', chunked, [{ ...chunks[0], id: '2' }], children), IncompleteApprovalSnapshotError);
});
test('reader: missing metadata/children and every wrapper identity mismatch fail atomically', () => {
  const { metadata, children } = fixture();
  for (const m of [null, { ...metadata, id: 'wrong' }, ...['id', 'projectId', 'approvalId'].map(k => ({ ...metadata, data: { ...metadata.data, [k]: 'wrong' } }))]) assert.throws(() => assembleSnapshotFromDocs('project', 'a', 'a', m, [], children), IncompleteApprovalSnapshotError);
  for (const patch of [{ projectId: 'wrong' }, { approvalId: 'wrong' }, { data: { id: 'wrong' } }, { data: null }]) {
    const changed = structuredClone(children); Object.assign(changed.routes[0].data, patch);
    assert.throws(() => assembleSnapshotFromDocs('project', 'a', 'a', metadata, [], changed), IncompleteApprovalSnapshotError);
  }
  assert.throws(() => assembleSnapshotFromDocs('project', 'a', 'a', metadata, [], { ...children, routes: [] }), IncompleteApprovalSnapshotError);
  assert.throws(() => assembleSnapshotFromDocs('project', 'a', 'a', metadata, [], { ...children, loops: undefined }), IncompleteApprovalSnapshotError);
});
