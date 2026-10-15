import assert from 'node:assert/strict';
import test from 'node:test';
import { FiberEnclosure, FiberLoop, Route } from '../types';
import { getDistance, insertPointOnRoute, routeLength } from './geo';
import { attachEnclosureToRouteCut, prepareRouteCut, prepareRouteSplit } from './splitRoute';

const a = { lat: 13.7, lng: 100.5 };
const mid = { lat: 13.7, lng: 100.505 };
const b = { lat: 13.7, lng: 100.51 };
const cut: FiberEnclosure = { id: 'cut', name: 'BJ#02', position: mid, uid: 'owner' };
const end: FiberEnclosure = { id: 'end', name: 'BJ#03', position: b, uid: 'owner', portAssignments: { 1: { routeId: 'original' } } };
const route: Route = {
  id: 'original', name: 'Fiber 216', path: [a, b], capacity: 1, uid: 'owner',
  markStart: 100, markEnd: 1100, totalLength: 1000,
  cores: [{ id: 1, color: 'blue', status: 'used', label: '', owner: 'ITEL', priority: 'Low', details: '',
    splices: { end: { routeId: 'other', coreId: 1 } } }]
};
const other: Route = {
  ...route, id: 'other', name: 'Branch', path: [b, { lat: 13.701, lng: b.lng }],
  cores: [{ ...route.cores[0], splices: { end: { routeId: 'original', coreId: 1 } } }]
};
const loop: FiberLoop = { id: 'loop', name: 'Loop', position: { lat: 13.7, lng: 100.508 }, routeId: 'original', length: 50, uid: 'owner' };

test('snapping inserts a vertex without changing the Fiber geometry', () => {
  const inserted = insertPointOnRoute(route.path, cut.position);
  assert.equal(inserted.index, 1);
  assert.equal(inserted.path.length, 3);
  assert.ok(Math.abs(routeLength(route.path) - routeLength(inserted.path)) < 0.01);
  assert.ok(getDistance(inserted.point, cut.position) < 0.2);
});

test('splitting preserves both halves and moves references to the second segment', () => {
  const result = prepareRouteSplit(route, cut, [route, other], [cut, end], [loop], 'new', 'editor', 'Fiber A', 'Fiber B');
  assert.deepEqual(result.first.path.at(-1), result.second.path[0]);
  assert.equal(result.first.endEnclosureId, cut.id);
  assert.equal(result.second.startEnclosureId, cut.id);
  assert.equal(result.first.totalLength! + result.second.totalLength!, route.totalLength);
  assert.equal(result.first.markEnd, result.second.markStart);
  assert.equal(result.first.cores[0].splices?.end, undefined);
  assert.equal(result.second.cores[0].splices?.end?.routeId, 'other');
  assert.equal(result.first.cores[0].splices?.cut?.routeId, 'new');
  assert.equal(result.second.cores[0].splices?.cut?.routeId, 'original');
  assert.equal(result.updatedRoutes[0].cores[0].splices?.end?.routeId, 'new');
  assert.equal(result.updatedEnclosures[0].portAssignments?.[1].routeId, 'new');
  assert.equal(result.updatedLoops[0].routeId, 'new');
  assert.equal(result.first.lineageId, result.second.lineageId);
});

test('refuses a split at a route endpoint', () => {
  assert.throws(() => prepareRouteSplit(route, { ...cut, position: a }, [route], [cut], [], 'new', 'editor', 'A', 'B'));
});

test('an existing splice at the cut stays attached to its original segment', () => {
  const spliced: Route = {
    ...route,
    cores: [{ ...route.cores[0], splices: { cut: { routeId: 'other', coreId: 1 } } }]
  };
  const result = prepareRouteSplit(spliced, cut, [spliced], [cut], [], 'new', 'editor', 'A', 'B');
  assert.equal(result.first.cores[0].splices?.cut?.routeId, 'other');
  assert.equal(result.second.cores[0].splices?.cut, undefined);
});

test('cutting at a clicked point keeps both Fiber halves and does not invent a splice', () => {
  const result = prepareRouteCut(route, mid, [route, other], [end], [loop],
    'new', 'cut-point', 'editor', 'Fiber A', 'Fiber B');
  assert.deepEqual(result.first.path.at(-1), result.second.path[0]);
  assert.equal(result.first.endCutId, 'cut-point');
  assert.equal(result.second.startCutId, 'cut-point');
  assert.equal(result.first.endEnclosureId, undefined);
  assert.equal(result.second.startEnclosureId, undefined);
  assert.equal(result.first.cores[0].splices?.['cut-point'], undefined);
  assert.equal(result.second.cores[0].splices?.['cut-point'], undefined);
  assert.equal(result.first.totalLength! + result.second.totalLength!, route.totalLength);
  assert.equal(result.updatedRoutes[0].cores[0].splices?.end?.routeId, 'new');
  assert.equal(result.updatedLoops[0].routeId, 'new');
});

test('adding an Enclosure at a saved cut connects both segments by matching Core', () => {
  const result = prepareRouteCut(route, mid, [route], [], [], 'new', 'cut-point', 'editor', 'A', 'B');
  const connected = attachEnclosureToRouteCut(result.first, result.second, cut, 'cut-point');
  assert.equal(connected.first.endEnclosureId, cut.id);
  assert.equal(connected.second.startEnclosureId, cut.id);
  assert.equal(connected.first.endCutId, undefined);
  assert.equal(connected.second.startCutId, undefined);
  assert.deepEqual(connected.first.cores[0].splices?.[cut.id], { routeId: 'new', coreId: 1 });
  assert.deepEqual(connected.second.cores[0].splices?.[cut.id], { routeId: 'original', coreId: 1 });
});

test('cutting at a route endpoint is rejected', () => {
  assert.throws(() => prepareRouteCut(route, a, [route], [], [], 'new', 'cut-point', 'editor', 'A', 'B'));
});
