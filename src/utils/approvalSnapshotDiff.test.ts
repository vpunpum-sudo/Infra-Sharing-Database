import test from 'node:test';
import assert from 'node:assert/strict';
import { diffApprovalSnapshots, COORDINATE_TOLERANCE } from './approvalSnapshotDiff';
import { snapshot } from './approvalHistory.testFixtures';
const route = (id = 'r') => ({ id, name: 'Route', path: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], capacity: 48, cores: [{ id: 1, owner: 'ITEL' }, { id: 2, owner: 'SYMC' }], owners: ['ITEL', 'SYMC'], totalLength: 1000 });
const box = () => ({ id: 'e', name: 'Box', position: { lat: 0, lng: 0 }, trayAssignments: { 1: 'ITEL', 2: 'SYMC' }, portAssignments: { 1: { owner: 'ITEL' }, 2: { owner: 'UIH' } } });
const loop = () => ({ id: 'l', name: 'Loop', position: { lat: 0, lng: 0 }, routeId: 'r', length: 20 });
function full() { const s = snapshot(); Object.assign(s.collections, { routes: [route()], enclosures: [box()], loops: [loop()] }); return s; }
const labels = (d: ReturnType<typeof diffApprovalSnapshots>, key = 'routes') => d[key].details[0]?.fields.map(f => f.label);
test('4: identical/empty/reordered collections and nested assignments are unchanged', () => {
  for (const s of [snapshot(), full()]) assert.equal(diffApprovalSnapshots(s, structuredClone(s)).hasChanges, false);
  const a = full(), b = full();
  (b.collections.routes[0].cores as any).reverse(); b.collections.routes[0].owners.reverse();
  b.collections.enclosures[0].trayAssignments = { 2: 'SYMC', 1: 'ITEL' };
  a.collections.routes.push(route('second') as any); b.collections.routes.unshift(route('second') as any);
  const d = diffApprovalSnapshots(a, b); assert.equal(d.hasChanges, false); assert.equal(d.routes.unchangedCount, 2);
  const nonempty = diffApprovalSnapshots(snapshot(), full()); assert.equal(nonempty.routes.added, 1); assert.equal(nonempty.enclosures.added, 1); assert.equal(nonempty.loops.added, 1);
});
test('4: added/removed/changed IDs, fields and stable ownership counts', () => {
  const a = full(), b = full();
  a.collections.routes.push(route('removed') as any); b.collections.routes.push(route('added') as any);
  Object.assign(b.collections.routes[0], { name: 'Changed', capacity: 96, fiberType: 'G652', tier: 'T1', owners: ['UIH'], tierSharingPartners: ['SYMC'], startEnclosureId: 'x', endEnclosureId: 'y', totalLength: 2500 });
  b.collections.routes[0].cores[0].owner = 'UIH';
  b.collections.enclosures[0].trayAssignments[1] = 'UIH'; b.collections.enclosures[0].portAssignments[1].owner = 'SYMC';
  Object.assign(b.collections.enclosures[0], { name: 'New box', enclosureTypeId: 't', locationType: 'road', locationName: 'street' });
  Object.assign(b.collections.loops[0], { name: 'New loop', routeId: 'other', length: 50 });
  const d = diffApprovalSnapshots(a, b);
  assert.deepEqual([d.routes.added, d.routes.removed, d.routes.changed, d.routes.unchangedCount], [1, 1, 1, 0]);
  assert.deepEqual(labels(d), ['name', 'capacity', 'fiberType', 'tier', 'startEnclosureId', 'endEnclosureId', 'totalLength', 'owners', 'tierSharingPartners', 'coreOwners']);
  assert.equal(d.routes.details[0].fields.find(f => f.label === 'coreOwners')!.after, 1);
  for (const field of ['trayAssignments', 'portAssignments']) assert.equal(d.enclosures.details[0].fields.find(f => f.label === field)!.after, 1);
  assert.deepEqual(labels(d, 'loops'), ['name', 'routeId', 'length']);
  const removedCore = full(); removedCore.collections.routes[0].cores.pop(); assert.equal(diffApprovalSnapshots(a, removedCore).routes.details[0].fields.find(f => f.label === 'coreOwners')!.after, 1);
});
test('4: geometry tolerance, enclosure distance, extra vertex, reversed path, moved end', () => {
  const a = full();
  const near = full(); near.collections.enclosures[0].position.lat += COORDINATE_TOLERANCE / 2; near.collections.routes[0].path[0].lat += COORDINATE_TOLERANCE / 2;
  assert.equal(diffApprovalSnapshots(a, near).hasChanges, false);
  const far = full(); far.collections.enclosures[0].position.lat += 0.001;
  const field = diffApprovalSnapshots(a, far).enclosures.details[0].fields[0]; assert.equal(field.label, 'position'); assert.ok((field.after as any).movedMetres > 100);
  for (const mutate of [(s: any) => s.collections.routes[0].path.push({ lat: 2, lng: 2 }), (s: any) => s.collections.routes[0].path.reverse(), (s: any) => s.collections.routes[0].path[1].lat += 0.001]) {
    const b = full(); mutate(b); const f = diffApprovalSnapshots(a, b).routes.details[0].fields[0]; assert.equal(f.label, 'path'); assert.equal((f.after as any).vertexMoved, true); assert.equal((f.after as any).endMoved, true);
  }
  const movedLoop = full(); movedLoop.collections.loops[0].position.lng = 1; assert.deepEqual(labels(diffApprovalSnapshots(a, movedLoop), 'loops'), ['position']);
});
test('4: project and participant sets, exact stored-length totals and missing fields', () => {
  const a = full(), b = full(); a.metadata.participatingOwners = ['ITEL', 'SYMC']; b.metadata.participatingOwners = ['SYMC', 'UIH'];
  Object.assign(b.metadata.project, { name: 'New', routeCode: 'New code', owner: 'UIH', owners: ['UIH'] });
  b.collections.routes[0].totalLength = undefined; b.collections.routes.push({ ...route('two'), totalLength: 2500 } as any);
  const d = diffApprovalSnapshots(a, b);
  assert.deepEqual(d.projectFields.map(f => f.label), ['name', 'routeCode', 'owner', 'owners']);
  assert.deepEqual(d.participatingOwners, { added: ['UIH'], removed: ['ITEL'] });
  assert.deepEqual(d.totals.storedRouteLengthKm, { before: 1, after: 2.5, delta: 1.5 });
  assert.deepEqual(d.totals.routesWithoutStoredLength, { before: 0, after: 1, delta: 1 });
});
test('5: malformed collections/items/coordinates/path/duplicates warn and never throw', () => {
  for (const bad of [undefined, null, {}, { collections: { routes: null, loops: 5 } }, { collections: { routes: [null, 4, {}, { id: 'r' }, { ...route(), path: [{ lat: NaN, lng: 0 }] }, { ...route(), path: [{ lat: 0, lng: Infinity }] }], enclosures: [{ ...box(), position: { lat: NaN, lng: 0 } }], loops: [null] } }]) {
    const d = diffApprovalSnapshots(bad, snapshot()); assert.ok(d.warnings.skippedMalformed > 0);
  }
  const s = full(); s.collections.routes.push(route() as any); const d = diffApprovalSnapshots(s, snapshot()); assert.equal(d.warnings.duplicateIds, 1); assert.equal(d.routes.removed, 1);
});
test('5: detail allocation stops at per-category limit while counts remain exact', () => {
  const a = snapshot(), b = snapshot(); const allocations: Record<string, number> = {};
  Object.assign(b.collections, { routes: Array.from({ length: 500 }, (_, i) => route(String(i))), enclosures: Array.from({ length: 500 }, (_, i) => ({ ...box(), id: String(i) })), loops: Array.from({ length: 500 }, (_, i) => ({ ...loop(), id: String(i) })) });
  const d = diffApprovalSnapshots(a, b, { detailLimit: 3, onDetailCreated: key => { allocations[key] = (allocations[key] || 0) + 1; } });
  for (const key of ['routes', 'enclosures', 'loops'] as const) { assert.equal(allocations[key], 3); assert.equal(d[key].added, 500); assert.equal(d[key].details.length, 3); assert.equal(d[key].truncated, 497); }
});
test('5: 10,000-route structure and generous linear-time sanity bound', t => {
  const a = snapshot(), b = snapshot(); a.collections.routes = Array.from({ length: 10000 }, (_, i) => route(String(i)) as any); b.collections.routes = structuredClone(a.collections.routes);
  for (let i = 0; i < 1000; i++) b.collections.routes[i].name += ' changed';
  const start = performance.now(); const d = diffApprovalSnapshots(a, b); const elapsed = performance.now() - start;
  assert.equal(d.routes.changed, 1000); assert.equal(d.routes.unchangedCount, 9000); assert.equal(d.routes.details.length, 200); assert.equal(d.routes.truncated, 800);
  if (elapsed > 2000) t.diagnostic(`10,000 routes took ${elapsed.toFixed(0)}ms; target 2s`); assert.ok(elapsed < 10000); t.diagnostic(`10,000-route diff: ${elapsed.toFixed(0)}ms`);
});

test('4: stored zero length is present, contributes zero, and is not counted as missing', () => {
  const a = full(), b = full(); b.collections.routes[0].totalLength = 0;
  const d = diffApprovalSnapshots(a, b); assert.equal(d.totals.storedRouteLengthKm.after, 0); assert.equal(d.totals.routesWithoutStoredLength.after, 0);
});

test('4/5: assignment presence changes count by key; sparse paths are malformed', () => {
  const a = full(), b = full();
  b.collections.enclosures[0].trayAssignments[3] = 'UIH'; delete b.collections.enclosures[0].portAssignments[1];
  const d = diffApprovalSnapshots(a, b); for (const label of ['trayAssignments', 'portAssignments']) assert.equal(d.enclosures.details[0].fields.find(f => f.label === label)!.after, 1);
  (b.collections.routes[0].path as any) = Array(2); const malformed = diffApprovalSnapshots(a, b); assert.equal(malformed.warnings.skippedMalformed, 1);
});
