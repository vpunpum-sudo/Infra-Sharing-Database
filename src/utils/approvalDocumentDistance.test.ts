import test from 'node:test';
import assert from 'node:assert/strict';
import { documentRouteDistances, aggregateDistanceMeters, distanceWithUnit, resolveOperationKmInput, submittedOperationKm } from './approvalDocumentDistance';
import { summarizeSnapshot } from './approvalSnapshotSummary';
import { snapshot } from './approvalHistory.testFixtures';
const p = (lng: number) => ({ lat: 0, lng });

test('10–13: totals and groups sum unrounded segment metres, with unknowns and zero distinct', () => {
  const entries = [{ meters: 1004, group: 'A' }, { meters: undefined, group: 'B' }, { meters: 1004, group: 'A' }];
  assert.deepEqual(aggregateDistanceMeters(entries), { totalMeters: 2008, totalText: '2.01', knownCount: 2, unknownCount: 1,
    groups: [{ group: 'A', meters: 2008, text: '2.01' }, { group: 'B', meters: 0, text: '0.00' }] });
  assert.equal(aggregateDistanceMeters([4, 4, 4].map(meters => ({ meters }))).totalText, '0.01');
  const mix = aggregateDistanceMeters([{ meters: 1111.95 }, { meters: undefined }, { meters: 0 }]);
  assert.equal(mix.totalText, '1.11'); assert.equal(mix.knownCount, 2); assert.equal(mix.unknownCount, 1);
  const bad = [NaN, Infinity, -Infinity, -5, -.001, '12'];
  assert.deepEqual(aggregateDistanceMeters(bad.map(meters => ({ meters } as any))),
    { totalMeters: 0, totalText: '0.00', knownCount: 0, unknownCount: 6, groups: [] });
  // Split segments retain individual geometry even when they share one cable.
  const segments = documentRouteDistances([{ lineageId: 'c', path: [p(0), p(.01)] }, { lineageId: 'c', path: [p(.01), p(.02)] }], []);
  assert.equal(aggregateDistanceMeters(segments).totalText, '2.22');
  assert.deepEqual(documentRouteDistances(null, null), []);
  assert.deepEqual(documentRouteDistances([null, { path: [p(0), p(0)] }], []), [{ meters: undefined, text: '-' }, { meters: 0, text: '0.00' }]);
});

test('10: actual path rows round separately from totals', () => {
  for (const [meters, count, row, total] of [[1004, 2, '1.00', '2.01'], [4, 3, '0.00', '0.01']] as const) {
    const lng = meters / (6371e3 * Math.PI / 180);
    const rows = documentRouteDistances(Array.from({ length: count }, () => ({ path: [p(0), p(lng)] })), []);
    assert.deepEqual(rows.map(r => r.text), Array(count).fill(row));
    assert.equal(aggregateDistanceMeters(rows).totalText, total);
  }
});

test('14: unknown has no unit, zero keeps its unit', () => {
  assert.equal(distanceWithUnit('-', 'km'), '-');
  assert.equal(distanceWithUnit('1.11', 'km'), '1.11 km');
  assert.equal(distanceWithUnit('0.00', 'กม.'), '0.00 กม.');
});
const base = { current: '', touched: false, storedKm: undefined, ready: false, defaultKm: '4.45' };
test('15–18: readiness, untouched updates, edited empty input and stored zero/nonzero', () => {
  for (const defaultKm of ['0.00', '1.11']) assert.equal(resolveOperationKmInput({ ...base, defaultKm }), '');
  let current = resolveOperationKmInput({ ...base, ready: true }); assert.equal(current, '4.45');
  current = resolveOperationKmInput({ ...base, current, ready: true, defaultKm: '5.56' }); assert.equal(current, '5.56');
  for (const ready of [false, true]) for (const value of ['7', '']) {
    assert.equal(resolveOperationKmInput({ ...base, current: value, touched: true, ready }), value);
  }
  for (const storedKm of [0, 12.34]) assert.equal(resolveOperationKmInput({ ...base, current: String(storedKm), storedKm, ready: true }), String(storedKm));
});

test('19: submission is finite and non-negative; malformed defaults never autofill', () => {
  for (const input of ['', 'abc', '-1', 'NaN', 'Infinity']) assert.equal(submittedOperationKm(input, '4.45'), 4.45);
  assert.equal(submittedOperationKm('0', '4.45'), 0); assert.equal(submittedOperationKm('2.5', '4.45'), 2.5);
  for (const defaultKm of ['', '-', '-1', 'NaN', 'Infinity', ' ']) {
    assert.equal(submittedOperationKm('', defaultKm), 0);
    assert.equal(resolveOperationKmInput({ ...base, current: 'keep', ready: true, defaultKm }), 'keep');
  }
});

test('20: touched state is scoped to the current project, then reset before B loads', () => {
  let operationKmTouchedFor: string | null = 'A';
  assert.equal(resolveOperationKmInput({ ...base, current: '7', ready: true, touched: operationKmTouchedFor === 'A' }), '7');
  const project = { id: 'B' };
  assert.equal(operationKmTouchedFor === project.id, false);
  operationKmTouchedFor = null;
  assert.equal(resolveOperationKmInput({ ...base, touched: operationKmTouchedFor === project.id }), '');
  assert.equal(resolveOperationKmInput({ ...base, ready: true, defaultKm: '2.22', touched: operationKmTouchedFor === project.id }), '2.22');
});

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
test('22–23: history and reopened frozen snapshot agree, attached documents and approval unchanged', () => {
  const s = snapshot();
  Object.assign(s.collections, { routes: [
    { id: 'a', totalLength: 0, path: [p(0), p(.01)] },
    { id: 'b', markStart: 100, markEnd: 1600, path: [p(0), p(.03)] },
    { id: 'c', startEnclosureId: 'x', endEnclosureId: 'y' },
    { id: 'd' }, { id: 'e', path: [p(0), p(0)] },
  ], enclosures: [{ id: 'x', position: p(0) }, { id: 'y', position: p(.02) }] });
  const approval = { totalOperationDistanceKm: 99, finalDocuments: [{ name: 'old.pdf', distanceKm: 99 }, { name: 'old.kmz', distanceKm: 99 }] };
  const before = JSON.stringify({ s, approval }); freeze(s); freeze(approval);
  const rows = documentRouteDistances(s.collections.routes, s.collections.enclosures);
  assert.deepEqual(rows.map(d => d.text), ['1.11', '3.34', '2.22', '-', '0.00']);
  assert.deepEqual(summarizeSnapshot(s).routes.map(r => r.cells[3]), rows.map(d => d.text));
  assert.equal(aggregateDistanceMeters(rows).totalText, '6.67');
  assert.equal(JSON.stringify({ s, approval }), before);
});
