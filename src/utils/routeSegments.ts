import { Core, CorePriority, FiberEnclosure, Point, Route } from '../types';
import { getClosestPointOnRoute, getDistance } from './geo';
import { tubeIdForCore } from './tubeOwnership';

export type EnclosureSpan = {
  key: string;
  from: FiberEnclosure;
  to: FiberEnclosure;
  startDistance: number;
  endDistance: number;
};

const MAX_SNAP_DISTANCE_METERS = 3;

function distanceAlongRoute(route: Route, point: Point): { distance: number; offset: number } {
  const closest = getClosestPointOnRoute(point, route.path);
  let distance = 0;
  for (let index = 0; index < closest.segmentIndex; index++) {
    distance += getDistance(route.path[index], route.path[index + 1]);
  }
  return {
    distance: distance + getDistance(route.path[closest.segmentIndex], closest.point),
    offset: closest.distance
  };
}

/** Consecutive Enclosures on the selected physical Fiber path, in path order. */
export function getRouteEnclosureSpans(route: Route, enclosures: FiberEnclosure[]): EnclosureSpan[] {
  if (route.path.length < 2) return [];
  const points = enclosures.flatMap(enclosure => {
    if (!enclosure.position) return [];
    const position = distanceAlongRoute(route, enclosure.position);
    const isEndpoint = enclosure.id === route.startEnclosureId || enclosure.id === route.endEnclosureId;
    return position.offset <= MAX_SNAP_DISTANCE_METERS || isEndpoint
      ? [{ enclosure, distance: position.distance }]
      : [];
  }).sort((a, b) => a.distance - b.distance);

  const spans: EnclosureSpan[] = [];
  let from = points[0];
  for (let index = 1; index < points.length; index++) {
    const to = points[index];
    if (to.distance - from.distance < 0.5) continue;
    spans.push({
      key: `${from.enclosure.id}|${to.enclosure.id}`,
      from: from.enclosure,
      to: to.enclosure,
      startDistance: from.distance,
      endDistance: to.distance
    });
    from = to;
  }
  return spans;
}

export function getSpanAtPoint(route: Route, enclosures: FiberEnclosure[], point: Point): EnclosureSpan | null {
  if (route.path.length < 2) return null;
  const clicked = distanceAlongRoute(route, point);
  if (clicked.offset > 30) return null;
  return getRouteEnclosureSpans(route, enclosures).find(span =>
    clicked.distance >= span.startDistance && clicked.distance <= span.endDistance
  ) || null;
}

/** Old Core priority is the default until a span receives an explicit Tube value. */
export function getTubePriority(route: Route, spanKey: string | null, tubeId: number): CorePriority {
  const saved = spanKey ? route.segmentTubePriorities?.[spanKey]?.[tubeId] : undefined;
  if (saved === 'Low' || saved === 'Medium' || saved === 'High') return saved;
  const cores: Core[] = route.cores.filter(core => tubeIdForCore(core.id) === tubeId);
  if (cores.some(core => core.priority === 'High')) return 'High';
  if (cores.some(core => core.priority === 'Medium')) return 'Medium';
  return 'Low';
}
