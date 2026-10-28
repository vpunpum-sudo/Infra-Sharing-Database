import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectKml, exportFileName } from './kml';
import { EnclosureType, FiberColorConfig, FiberEnclosure, FiberLoop, FiberType, Route } from '../types';

const fiberTypes = [{ id: 'F216', name: '216', color: '#123456' }] as FiberType[];
const fiberColorConfigs = [{ id: 'C1', fiberTypeId: 'F216', tier: 'Tier 1', color: '#ff8800', uid: 'u' }] as FiberColorConfig[];
const enclosureTypes = [
  { id: 'T1', name: 'Dome', color: '#22c55e', icon: 'data:image/png;base64,AAAA', spliceTrays: 2 },
  { id: 'T2', name: 'Inline', color: '#3b82f6' }
] as EnclosureType[];
const cores = Array.from({ length: 24 }, (_, index) => ({ id: index + 1, owner: index < 12 ? 'ITEL' : 'UIH' }));
const routes = [
  { id: 'R1', name: 'BJ#01 - BJ#02 <A&B>', capacity: 216, fiberType: '216', tier: 'Tier 1', cores, totalLength: 510,
    path: [{ lat: 13.75, lng: 100.5 }, { lat: 13.76, lng: 100.51 }] },
  { id: 'R2', name: 'Too short', capacity: 12, cores: [], path: [{ lat: 13.7, lng: 100.4 }] }
] as unknown as Route[];
const enclosures = [
  { id: 'E1', name: 'BJ#01', position: { lat: 13.75, lng: 100.5 }, enclosureTypeId: 'T1', locationType: 'Manhole',
    trayAssignments: { 1: 'ITEL' }, portAssignments: { 1: { routeId: 'R1' } } },
  { id: 'E2', name: 'BJ#02', position: { lat: 13.76, lng: 100.51 }, enclosureTypeId: 'T2' },
  { id: 'E3', name: 'Broken', position: { lat: NaN, lng: 100 } }
] as FiberEnclosure[];
const loops = [{ id: 'L1', name: 'Loop 1', position: { lat: 13.755, lng: 100.505 }, routeId: 'R1', length: 30 }] as FiberLoop[];
const input = { project: { name: 'ถนนบรม', routeCode: 'BKK-01' }, routes, enclosures, loops, enclosureTypes, fiberTypes, fiberColorConfigs };

test('routes keep the map colour (aabbggrr, 80% opacity) and 4px width', () => {
  const { kml } = buildProjectKml(input);
  assert.match(kml, /<Style id="route-ff8800"><LineStyle><color>cc0088ff<\/color><width>4<\/width>/);
  assert.match(kml, /<coordinates>100.5,13.75,0 100.51,13.76,0<\/coordinates>/);
  assert.doesNotMatch(kml, /Too short|Broken|NaN/);
});

test('enclosures use their type icon or a dot in the type colour; loops use the route colour', () => {
  const { kml, icons } = buildProjectKml(input);
  assert.deepEqual(icons.map(icon => [icon.href, icon.kind]), [
    ['files/enclosure-T1.png', 'image'],
    ['files/enclosure-dot-3b82f6.png', 'circle'],
    ['files/loop-ff8800.png', 'loop']
  ]);
  assert.match(kml, /<Style id="enclosure-T1"><IconStyle><scale>0.625<\/scale><Icon><href>files\/enclosure-T1.png<\/href>/);
  assert.match(kml, /<name>Loop 1<\/name>\s*<styleUrl>#loop-ff8800<\/styleUrl>/);
});

test('descriptions carry the popup details', () => {
  const { kml } = buildProjectKml(input);
  // Route: capacity, tier/type, length, owner share by tube and core.
  assert.match(kml, /216F[\s\S]*Tier 1 • 216[\s\S]*510 m[\s\S]*ITEL[\s\S]*T1[\s\S]*Core 1-12[\s\S]*UIH[\s\S]*Core 13-24/);
  // Enclosure: type, location, coordinates, trays, port cables.
  assert.match(kml, /Dome[\s\S]*Manhole[\s\S]*13.750000, 100.500000[\s\S]*Owner Splice Trays \(2 Trays\)[\s\S]*P1[\s\S]*To: BJ#02 &lt;A&amp;B&gt;/);
  // Loop: length and connected route.
  assert.match(kml, /Loop Length[\s\S]*30 m[\s\S]*Connected Fiber Optic[\s\S]*BJ#01 - BJ#02 &lt;A&amp;B&gt;/);
  assert.match(kml, /<description><!\[CDATA\[/);
  assert.match(kml, /<BalloonStyle><text>\$\[description\]<\/text><\/BalloonStyle>/);
});

test('splice trays share one row however many there are', () => {
  const sevenTrays = [{ id: 'T7', name: 'Big', color: '#22c55e', spliceTrays: 7 }] as EnclosureType[];
  const enclosure = { id: 'E7', name: 'Seven', position: { lat: 13.75, lng: 100.5 }, enclosureTypeId: 'T7',
    trayAssignments: { 1: 'ITEL', 2: 'ITEL', 3: 'ITEL', 4: 'UIH', 5: 'UIH', 6: 'UIH' } } as FiberEnclosure;
  const { kml } = buildProjectKml({ ...input, enclosures: [enclosure], enclosureTypes: sevenTrays });
  const trays = kml.match(/Owner Splice Trays \(7 Trays\)[\s\S]*?<\/table>/)?.[0] ?? '';
  assert.equal((trays.match(/<tr>/g) || []).length, 1);
  assert.equal((trays.match(/<td /g) || []).length, 7);
  assert.match(kml, /white-space:nowrap[^>]*>[\s\S]*ITEL:[\s\S]*UIH:[\s\S]*None:/);
});

test('builds a safe file name', () => {
  assert.equal(exportFileName({ name: 'ถนน A/B: "ช่วง 1"', routeCode: 'R-1' }, 'kmz'), 'R-1 ถนน A-B- -ช่วง 1-.kmz');
  assert.equal(exportFileName({ name: '' }, 'kmz'), 'project.kmz');
});
