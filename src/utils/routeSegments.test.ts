import assert from 'node:assert/strict';
import test from 'node:test';
import { FiberEnclosure, Route } from '../types';
import { getRouteEnclosureSpans, getSpanAtPoint, getTubePriority } from './routeSegments';
import { attachEnclosureToRouteCut, prepareRouteCut, prepareRouteSplit } from './splitRoute';

const point = (lng: number) => ({ lat: 13.7, lng });
const enclosures: FiberEnclosure[] = [
  { id: 'A', name: 'BJ#01', position: point(100.5) },
  { id: 'B', name: 'BJ#02', position: point(100.505) },
  { id: 'C', name: 'BJ#03', position: point(100.51) }
];
const route: Route = {
  id: 'fiber', name: 'Fiber', path: [point(100.5), point(100.51)], capacity: 12, uid: 'editor',
  cores: Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, label: `T1-C${index + 1}`, color: 'blue', status: 'used' as const,
    owner: 'ITEL' as const, priority: 'Low' as const, details: ''
  })),
  segmentTubePriorities: { 'A|B': { 1: 'High' }, 'B|C': { 1: 'Medium' } }
};

test('a click selects only the enclosure span containing it', () => {
  assert.deepEqual(getRouteEnclosureSpans(route, enclosures).map(span => span.key), ['A|B', 'B|C']);
  assert.equal(getSpanAtPoint(route, enclosures, point(100.502))?.key, 'A|B');
  assert.equal(getSpanAtPoint(route, enclosures, point(100.508))?.key, 'B|C');
  assert.equal(getTubePriority(route, 'A|B', 1), 'High');
  assert.equal(getTubePriority(route, 'B|C', 1), 'Medium');
});

test('a new enclosure inherits the priority of its original span on both sides', () => {
  const middle: FiberEnclosure = { id: 'D', name: 'BJ#01/1', position: point(100.5025) };
  const result = prepareRouteSplit(route, middle, [route], enclosures, [], 'fiber-2', 'editor', 'First', 'Second');
  assert.equal(result.first.segmentTubePriorities?.['A|D']?.[1], 'High');
  assert.equal(result.second.segmentTubePriorities?.['D|B']?.[1], 'High');
  assert.equal(result.second.segmentTubePriorities?.['B|C']?.[1], 'Medium');
});

test('a cut followed by enclosure attachment retains span priorities', () => {
  const result = prepareRouteCut(route, point(100.5025), [route], enclosures, [],
    'fiber-2', 'cut-id', 'editor', 'First', 'Second');
  const middle: FiberEnclosure = { id: 'D', name: 'BJ#01/1', position: point(100.5025) };
  const connected = attachEnclosureToRouteCut(result.first, result.second, middle, 'cut-id');
  assert.equal(connected.first.segmentTubePriorities?.['A|D']?.[1], 'High');
  assert.equal(connected.second.segmentTubePriorities?.['D|B']?.[1], 'High');
});
