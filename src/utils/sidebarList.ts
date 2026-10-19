import { FiberEnclosure, FiberLoop, Route } from '../types';

export type SidebarSort = 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';
export type SidebarFilter = { query: string; sort: SidebarSort; routeType: string; locationType: string };

export const SORT_LABELS: Record<SidebarSort, string> = {
  'name-asc': 'ชื่อ ก→ฮ / A→Z',
  'name-desc': 'ชื่อ ฮ→ก / Z→A',
  'size-desc': 'ขนาด/ความยาว มาก→น้อย',
  'size-asc': 'ขนาด/ความยาว น้อย→มาก'
};

// Numeric-aware so BJ#2 comes before BJ#10.
const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });
const matches = (query: string, ...values: (string | number | undefined)[]) => {
  const q = query.trim().toLowerCase();
  return !q || values.some(value => value !== undefined && String(value).toLowerCase().includes(q));
};

export const routeLength = (route: Route) => route.totalLength ??
  (route.markEnd !== undefined && route.markStart !== undefined ? Math.abs(route.markEnd - route.markStart) : 0);
export const routeTypeLabel = (route: Route) => route.fiberType || route.tier || `${route.capacity}F`;

function sorted<T>(items: T[], sort: SidebarSort, name: (item: T) => string, size: (item: T) => number) {
  const byName = (a: T, b: T) => collator.compare(name(a), name(b));
  return [...items].sort((a, b) => {
    if (sort === 'name-desc') return -byName(a, b);
    if (sort === 'size-desc') return size(b) - size(a) || byName(a, b);
    if (sort === 'size-asc') return size(a) - size(b) || byName(a, b);
    return byName(a, b);
  });
}

/** Routes matching the text (name, type, tier, capacity, operators) and fiber type, in the chosen order. Size = length. */
export function filterRoutes(routes: Route[], filter: SidebarFilter) {
  return sorted(routes.filter(route =>
    (!filter.routeType || routeTypeLabel(route) === filter.routeType) &&
    matches(filter.query, route.name, route.fiberType, route.tier, `${route.capacity}f`, ...(route.owners || []))
  ), filter.sort, route => route.name || '', routeLength);
}

/** Enclosures matching the text (name, location) and location type. Size orders by location type, then name. */
export function filterEnclosures(enclosures: FiberEnclosure[], filter: SidebarFilter) {
  const list = enclosures.filter(enclosure =>
    (!filter.locationType || (enclosure.locationType || '') === filter.locationType) &&
    matches(filter.query, enclosure.name, enclosure.locationName, enclosure.locationType));
  if (filter.sort === 'size-desc' || filter.sort === 'size-asc') {
    const direction = filter.sort === 'size-asc' ? 1 : -1;
    return [...list].sort((a, b) => direction * collator.compare(a.locationType || '', b.locationType || '') ||
      collator.compare(a.name || '', b.name || ''));
  }
  return sorted(list, filter.sort, enclosure => enclosure.name || '', () => 0);
}

/** Loops matching the text (name, length). Size = loop length. */
export function filterLoops(loops: FiberLoop[], filter: SidebarFilter) {
  return sorted(loops.filter(loop => matches(filter.query, loop.name, `${loop.length}m`)),
    filter.sort, loop => loop.name || '', loop => loop.length || 0);
}

/** Distinct values for a filter dropdown, in natural order. */
export const distinctValues = (values: (string | undefined)[]) =>
  Array.from(new Set(values.filter((value): value is string => !!value))).sort(collator.compare);
