import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSnapshot } from './approvalSnapshotSummary';
import { snapshot } from './approvalHistory.testFixtures';
test('6: exact counts, stored lengths only, owner fallback, type names and malformed rows', () => {
  const s = snapshot();
  Object.assign(s.collections, { routes: [
    { id: 'r', name: 'Route', totalLength: 123, capacity: 48, owners: ['UIH', 'ITEL'] },
    { id: 'r2', name: 'No length', path: [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }], cores: [{ owner: 'SYMC' }, { owner: 'SYMC' }, { owner: 'None' }] }, null, 4, { name: 'no-id' }],
    enclosures: [{ id: 'e', name: 'Box', enclosureTypeId: 'type', trayAssignments: { 1: 'ITEL', 2: 'ITEL' }, portAssignments: { 3: { owner: 'UIH' } } }, { id: 'e2', name: 'Unknown' }],
    loops: [{ id: 'l', name: 'Loop', length: 50 }], enclosureTypes: [{ id: 'type', name: 'Closure' }] });
  const result = summarizeSnapshot(s);
  assert.deepEqual(result.counts, { routes: 2, enclosures: 2, loops: 1 }); assert.equal(result.skippedMalformed, 3);
  assert.deepEqual(result.routes[0].cells, ['Route', 'ITEL, UIH', 48, 123]);
  assert.equal(result.routes[1].cells[1], 'SYMC'); assert.equal(result.routes[1].cells[3], 'ไม่ได้บันทึกไว้');
  assert.deepEqual(result.enclosures[0].cells, ['Box', 'Closure', 'ITEL, UIH']); assert.equal(result.enclosures[1].cells[1], '-'); assert.equal(result.loops[0].cells[1], 50);
  assert.doesNotThrow(() => summarizeSnapshot({ collections: { routes: null } } as any));
});
