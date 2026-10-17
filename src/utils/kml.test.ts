import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectKml, kmlFileName } from './kml';
import { FiberEnclosure, FiberLoop, Route } from '../types';

const routes = [
  { id: 'R1', name: 'Main <A&B>', capacity: 216, cores: [], path: [{ lat: 13.75, lng: 100.5 }, { lat: 13.76, lng: 100.51 }] },
  { id: 'R2', name: 'Too short', capacity: 12, cores: [], path: [{ lat: 13.7, lng: 100.4 }] }
] as Route[];
const enclosures = [
  { id: 'E1', name: 'BJ#01', position: { lat: 13.75, lng: 100.5 }, locationType: 'Manhole' },
  { id: 'E2', name: 'Broken', position: { lat: NaN, lng: 100 } }
] as FiberEnclosure[];
const loops = [{ id: 'L1', name: 'Loop 1', position: { lat: 13.755, lng: 100.505 }, routeId: 'R1', length: 30 }] as FiberLoop[];

test('exports routes as lines and enclosures and loops as points, longitude first', () => {
  const kml = buildProjectKml({ project: { name: 'ถนนบรม', routeCode: 'BKK-01' }, routes, enclosures, loops });
  assert.match(kml, /<name>ถนนบรม \(BKK-01\)<\/name>/);
  assert.match(kml, /<coordinates>100.5,13.75,0 100.51,13.76,0<\/coordinates>/);
  assert.match(kml, /<name>BJ#01<\/name>[\s\S]*<coordinates>100.5,13.75,0<\/coordinates>/);
  assert.match(kml, /<description>30 m · Main &lt;A&amp;B&gt;<\/description>/);
});

test('escapes names and skips routes or points without usable coordinates', () => {
  const kml = buildProjectKml({ project: { name: 'P' }, routes, enclosures, loops: [] });
  assert.match(kml, /Main &lt;A&amp;B&gt;/);
  assert.doesNotMatch(kml, /Too short|Broken|NaN/);
  assert.doesNotMatch(kml, /Fiber Loops/);
});

test('builds a safe file name', () => {
  assert.equal(kmlFileName({ name: 'ถนน A/B: "ช่วง 1"', routeCode: 'R-1' }), 'R-1 ถนน A-B- -ช่วง 1-.kml');
  assert.equal(kmlFileName({ name: '' }), 'project.kml');
});
