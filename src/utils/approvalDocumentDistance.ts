import { routeDistanceMeters, distanceKmText } from './geo';

export function distanceWithUnit(text: string, unit: string): string {
  return text === '-' ? '-' : `${text} ${unit}`;
}

export function documentRouteDistances(routes: unknown, enclosures: unknown): Array<{ meters: number | undefined; text: string }> {
  if (!Array.isArray(routes)) return [];
  const lookup = Array.isArray(enclosures)
    ? new Map(enclosures.filter(e => e && typeof e === 'object' && typeof e.id === 'string').map(e => [e.id, e]))
    : enclosures;
  return routes.map(route => {
    const meters = routeDistanceMeters(route, lookup);
    return { meters, text: distanceKmText(meters) };
  });
}

export function aggregateDistanceMeters(entries: ReadonlyArray<{ meters: number | undefined; group?: string }>) {
  let totalMeters = 0, knownCount = 0, unknownCount = 0;
  const groups = new Map<string, number>();
  for (const entry of entries) {
    const known = typeof entry.meters === 'number' && Number.isFinite(entry.meters) && entry.meters >= 0;
    const meters = known ? entry.meters! : 0;
    if (known) knownCount++; else unknownCount++;
    totalMeters += meters;
    if (entry.group !== undefined) groups.set(entry.group, (groups.get(entry.group) ?? 0) + meters);
  }
  return { totalMeters, totalText: distanceKmText(totalMeters), knownCount, unknownCount,
    groups: Array.from(groups, ([group, meters]) => ({ group, meters, text: distanceKmText(meters) })) };
}

export function resolveOperationKmInput(state: {
  current: string; touched: boolean; storedKm: number | null | undefined; ready: boolean; defaultKm: string;
}): string {
  if (state.storedKm != null || !state.ready || state.touched || !state.defaultKm.trim() ||
    !Number.isFinite(Number(state.defaultKm)) || Number(state.defaultKm) < 0) return state.current;
  return state.defaultKm;
}

export function submittedOperationKm(input: string, defaultKm: string): number {
  const parsed = Number.parseFloat(input);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  const fallback = Number.parseFloat(defaultKm);
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
}
