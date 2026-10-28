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
  assert.deepEqual(result.routes[0].cells, ['Route', 'ITEL, UIH', 48, '-', 123]);
  assert.equal(result.routes[1].cells[1], 'SYMC'); assert.equal(result.routes[1].cells[4], 'ไม่ได้บันทึกไว้');
  assert.deepEqual(result.enclosures[0].cells, ['Box', 'Closure', 'ITEL, UIH']); assert.equal(result.enclosures[1].cells[1], '-'); assert.equal(result.loops[0].cells[1], 50);
  assert.doesNotThrow(() => summarizeSnapshot({ collections: { routes: null } } as any));
});
test('route distance is the drawn path, independent of the stored length and ML marks', () => {
  const s = snapshot();
  Object.assign(s.collections, {
    routes: [
      { id: 'zero', name: 'Zero stored', totalLength: 0, path: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }] },
      { id: 'marks', name: 'Marks differ', markStart: 100, markEnd: 1600, totalLength: 1500, path: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 }, { lat: 0, lng: 0.03 }] },
      { id: 'huge', name: 'Stored ignored', totalLength: 250000, path: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }] },
      { id: 'ends', name: 'No path', totalLength: 900, startEnclosureId: 'a', endEnclosureId: 'b', path: [] },
      { id: 'bad', name: 'Bad points', totalLength: 900, path: [{ lat: 'x', lng: 0 }, { lat: 0, lng: 0 }] },
      { id: 'none', name: 'Nothing' },
    ],
    enclosures: [{ id: 'a', name: 'A', position: { lat: 0, lng: 0 } }, { id: 'b', name: 'B', position: { lat: 0, lng: 0.02 } }],
  });
  const km = summarizeSnapshot(s).routes.map(row => row.cells[3]);
  assert.deepEqual(km, ['1.11', '3.34', '1.11', '2.22', '-', '-']);
});

test('9/25: malformed non-finite path uses endpoint fallback or unknown, stored column unchanged', () => {
  const s = snapshot();
  const path = [{ lat: 1.7e308, lng: 0 }, { lat: -1.7e308, lng: 0 }];
  Object.assign(s.collections, { routes: [
    { id: 'unknown', totalLength: 900, path },
    { id: 'fallback', totalLength: 900, path, startEnclosureId: 'a', endEnclosureId: 'b' },
  ], enclosures: [{ id: 'a', position: { lat: 0, lng: 0 } }, { id: 'b', position: { lat: 0, lng: .02 } }] });
  const rows = summarizeSnapshot(s).routes;
  assert.deepEqual(rows.map(r => r.cells[3]), ['-', '2.22']);
  assert.deepEqual(rows.map(r => r.cells[4]), [900, 900]);
});
