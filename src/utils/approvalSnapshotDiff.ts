import { getDistance } from './geo';
import { HISTORY_ROW_CAP } from './approvalHistory';

export const COORDINATE_TOLERANCE = 1e-7;
export type DiffField = { label: string; before: unknown; after: unknown };
export type DiffDetail = { id: string; kind: 'added' | 'removed' | 'changed'; fields: DiffField[] };
export type CategoryDiff = { added: number; removed: number; changed: number; unchangedCount: number; details: DiffDetail[]; truncated: number };
export type SnapshotDiff = ReturnType<typeof diffApprovalSnapshots>;
type Item = Record<string, any>;
const isObject = (v: any): v is Item => v !== null && typeof v === 'object' && !Array.isArray(v);
const point = (v: any) => isObject(v) && Number.isFinite(v.lat) && Number.isFinite(v.lng);
const moved = (a: any, b: any) => Math.abs(a.lat - b.lat) > COORDINATE_TOLERANCE || Math.abs(a.lng - b.lng) > COORDINATE_TOLERANCE;
const set = (v: any) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string'))].sort() : [];
// Only bounded, JSON-like values are compared. No recursion through arbitrary nested assignments.
function equal(a: any, b: any, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (depth > 8 || !a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && equal(a[k], b[k], depth + 1));
}
function assignments(v: any, cores = false): Map<string, any> {
  if (cores) return new Map((Array.isArray(v) ? v : []).filter(c => isObject(c) && (typeof c.id === 'number' || typeof c.id === 'string')).map(c => [String(c.id), c.owner]));
  return new Map(Object.entries(isObject(v) ? v : {}).map(([key, value]) => [key, isObject(value) ? value.owner : value]));
}
function ownershipCount(a: any, b: any, cores = false) {
  const x = assignments(a, cores), y = assignments(b, cores); let count = 0;
  for (const key of new Set([...x.keys(), ...y.keys()])) if (x.has(key) !== y.has(key) || !equal(x.get(key), y.get(key))) count++;
  return count;
}
export function diffApprovalSnapshots(base: unknown, target: unknown, opts: { detailLimit?: number; onDetailCreated?: (category: string) => void } = {}) {
  const warnings = { skippedMalformed: 0, duplicateIds: 0 };
  const limit = Number.isFinite(opts.detailLimit) ? Math.max(0, Math.min(HISTORY_ROW_CAP, Math.floor(opts.detailLimit!))) : HISTORY_ROW_CAP;
  const snapshot = (x: any) => isObject(x) ? x : {};
  const left = snapshot(base), right = snapshot(target);
  function items(s: Item, category: string): Map<string, Item> {
    const array = s.collections?.[category]; const result = new Map<string, Item>();
    if (!Array.isArray(array)) { warnings.skippedMalformed++; return result; }
    for (const item of array) {
      if (!isObject(item) || typeof item.id !== 'string' ||
        (category === 'routes' ? !Array.isArray(item.path) || !Array.from(item.path).every(point) : !point(item.position))) { warnings.skippedMalformed++; continue; }
      if (result.has(item.id)) { warnings.duplicateIds++; continue; }
      result.set(item.id, item);
    }
    return result;
  }
  const maps = { routes: [items(left, 'routes'), items(right, 'routes')], enclosures: [items(left, 'enclosures'), items(right, 'enclosures')], loops: [items(left, 'loops'), items(right, 'loops')] };
  function categoryDiff(category: keyof typeof maps): CategoryDiff {
    const [a, b] = maps[category];
    const result: CategoryDiff = { added: 0, removed: 0, changed: 0, unchangedCount: 0, details: [], truncated: 0 };
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(id), y = b.get(id);
      const collect = result.details.length < limit;
      let changed = false; const fields: DiffField[] = [];
      const field = (label: string, before: any, after: any) => { if (!equal(before, after)) { changed = true; if (collect) fields.push({ label, before, after }); } };
      if (x && y) {
        const keys = category === 'routes' ? ['name', 'capacity', 'fiberType', 'tier', 'startEnclosureId', 'endEnclosureId', 'totalLength'] : category === 'enclosures' ? ['name', 'enclosureTypeId', 'locationType', 'locationName'] : ['name', 'routeId', 'length'];
        for (const key of keys) field(key, x[key], y[key]);
        if (category === 'routes') {
          for (const key of ['owners', 'tierSharingPartners']) field(key, set(x[key]), set(y[key]));
          const p = x.path, q = y.path;
          const vertexMoved = p.length !== q.length || p.some((v: any, i: number) => q[i] && moved(v, q[i]));
          if (vertexMoved) { changed = true; if (collect) fields.push({ label: 'path', before: { points: p.length }, after: { points: q.length, startMoved: Boolean(p.length && q.length && moved(p[0], q[0])), endMoved: Boolean(p.length && q.length && moved(p.at(-1), q.at(-1))), vertexMoved } }); }
          const count = ownershipCount(x.cores, y.cores, true);
          if (count) field('coreOwners', 0, count);
        } else {
          if (moved(x.position, y.position)) field('position', x.position, { ...y.position, movedMetres: getDistance(x.position, y.position) });
          if (category === 'enclosures') for (const key of ['trayAssignments', 'portAssignments']) { const count = ownershipCount(x[key], y[key]); if (count) field(key, 0, count); }
        }
      }
      const kind = !x ? 'added' : !y ? 'removed' : changed ? 'changed' : null;
      if (!kind) { result.unchangedCount++; continue; }
      result[kind]++;
      if (collect) { opts.onDetailCreated?.(category); result.details.push({ id, kind, fields }); }
      else result.truncated++;
    }
    return result;
  }
  const projectFields: DiffField[] = [];
  const pa = left.metadata?.project || {}, pb = right.metadata?.project || {};
  for (const k of ['name', 'routeCode', 'owner', 'owners']) {
    const a = k === 'owners' ? set(pa[k]) : pa[k], b = k === 'owners' ? set(pb[k]) : pb[k];
    if (!equal(a, b)) projectFields.push({ label: k, before: a, after: b });
  }
  const oa = set(left.metadata?.participatingOwners), ob = set(right.metadata?.participatingOwners);
  const participatingOwners = { added: ob.filter(o => !oa.includes(o)), removed: oa.filter(o => !ob.includes(o)) };
  const total = (before: number, after: number) => ({ before, after, delta: after - before });
  const lengths = maps.routes.map(m => [...m.values()].reduce((r, item) => { if (Number.isFinite(item.totalLength)) { if (item.totalLength > 0) r.km += item.totalLength / 1000; } else r.missing++; return r; }, { km: 0, missing: 0 }));
  const totals = { routes: total(maps.routes[0].size, maps.routes[1].size), enclosures: total(maps.enclosures[0].size, maps.enclosures[1].size), loops: total(maps.loops[0].size, maps.loops[1].size), storedRouteLengthKm: total(lengths[0].km, lengths[1].km), routesWithoutStoredLength: total(lengths[0].missing, lengths[1].missing) };
  const routes = categoryDiff('routes'), enclosures = categoryDiff('enclosures'), loops = categoryDiff('loops');
  return { routes, enclosures, loops, projectFields, participatingOwners, totals, warnings, hasChanges: Boolean(routes.added + routes.removed + routes.changed + enclosures.added + enclosures.removed + enclosures.changed + loops.added + loops.removed + loops.changed + projectFields.length + participatingOwners.added.length + participatingOwners.removed.length) };
}
