import test from 'node:test';
import assert from 'node:assert/strict';
import { distinctValues, filterEnclosures, filterLoops, filterRoutes, SidebarFilter } from './sidebarList';
import { FiberEnclosure, FiberLoop, Route } from '../types';

const base: SidebarFilter = { query: '', sort: 'name-asc', routeType: '', locationType: '' };
const routes = [
  { id: 'a', name: 'BJ#10 - BJ#11', capacity: 216, fiberType: 'Fiber Optic 216 Core', totalLength: 300 },
  { id: 'b', name: 'BJ#2 - BJ#3', capacity: 312, fiberType: 'Fiber Optic 312 Core', totalLength: 900, owners: ['UIH'] },
  { id: 'c', name: 'BJ#1 - BJ#2', capacity: 216, fiberType: 'Fiber Optic 216 Core', markStart: 100, markEnd: 600 }
] as unknown as Route[];
const enclosures = [
  { id: '1', name: 'BJ#10', locationType: 'Pole', locationName: 'หน้าตลาด' },
  { id: '2', name: 'BJ#2', locationType: 'Manhole' },
  { id: '3', name: 'BJ#1', locationType: 'Pole' }
] as FiberEnclosure[];
const loops = [{ id: 'x', name: 'Loop B', length: 20 }, { id: 'y', name: 'Loop A', length: 50 }] as FiberLoop[];

test('sorts names with numbers in natural order, both ways', () => {
  assert.deepEqual(filterRoutes(routes, base).map(r => r.id), ['c', 'b', 'a']);
  assert.deepEqual(filterRoutes(routes, { ...base, sort: 'name-desc' }).map(r => r.id), ['a', 'b', 'c']);
  assert.deepEqual(filterEnclosures(enclosures, base).map(e => e.name), ['BJ#1', 'BJ#2', 'BJ#10']);
});

test('sorts by route length (ML difference when no total) and loop length', () => {
  assert.deepEqual(filterRoutes(routes, { ...base, sort: 'size-desc' }).map(r => r.id), ['b', 'c', 'a']);
  assert.deepEqual(filterLoops(loops, { ...base, sort: 'size-asc' }).map(l => l.id), ['x', 'y']);
});

test('filters by text and by type', () => {
  assert.deepEqual(filterRoutes(routes, { ...base, query: 'uih' }).map(r => r.id), ['b']);
  assert.deepEqual(filterRoutes(routes, { ...base, routeType: 'Fiber Optic 216 Core' }).map(r => r.id), ['c', 'a']);
  assert.deepEqual(filterEnclosures(enclosures, { ...base, query: 'ตลาด' }).map(e => e.id), ['1']);
  assert.deepEqual(filterEnclosures(enclosures, { ...base, locationType: 'Pole' }).map(e => e.name), ['BJ#1', 'BJ#10']);
  assert.deepEqual(filterLoops(loops, { ...base, query: '50m' }).map(l => l.id), ['y']);
});

test('lists distinct filter options in natural order', () => {
  assert.deepEqual(distinctValues(['Pole', undefined, 'Manhole', 'Pole']), ['Manhole', 'Pole']);
});
