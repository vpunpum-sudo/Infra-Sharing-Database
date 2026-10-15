import { Core, FiberEnclosure, FiberLoop, Point, Route } from '../types';
import { getClosestPointOnRoute, getDistance, splitRoutePath } from './geo';

export type RouteSplit = {
  first: Route;
  second: Route;
  updatedRoutes: Route[];
  updatedEnclosures: FiberEnclosure[];
  updatedLoops: FiberLoop[];
  firstEnclosureIds: string[];
  secondEnclosureIds: string[];
};

/** Build the complete set of changes before writing anything to Firestore. */
export function prepareRouteSplit(
  route: Route,
  enclosure: FiberEnclosure,
  routes: Route[],
  enclosures: FiberEnclosure[],
  loops: FiberLoop[],
  newRouteId: string,
  uid: string,
  firstName: string,
  secondName: string
): RouteSplit {
  if (route.path.length < 2) throw new Error('The selected Fiber route has no drawable line.');
  if (getClosestPointOnRoute(enclosure.position, route.path).distance > 3) {
    throw new Error('The Enclosure must be on the selected Fiber route (within 3 m).');
  }
  const { first: firstPath, second: secondPath, point, fraction } = splitRoutePath(route.path, enclosure.position);
  if (firstPath.length > 1000 || secondPath.length > 1000) throw new Error('The route has too many points to split.');

  const distanceFromStart = (position: Point) => {
    const match = getClosestPointOnRoute(position, route.path);
    let distance = 0;
    for (let i = 0; i < match.segmentIndex; i++) distance += getDistance(route.path[i], route.path[i + 1]);
    return distance + getDistance(route.path[match.segmentIndex], match.point);
  };
  const cutDistance = distanceFromStart(point);
  const isOnSecond = (position: Point) => distanceFromStart(position) > cutDistance + 0.2;
  const enclosureById = new Map(enclosures.map(item => [item.id, item]));
  const belongsToSecond = (enclosureId: string) => {
    if (enclosureId === enclosure.id) return false;
    const item = enclosureById.get(enclosureId);
    return item ? isOnSecond(item.position) : false;
  };
  const partitionCores = (second: boolean): Core[] => route.cores.map(core => {
    const splices = Object.fromEntries(Object.entries(core.splices || {}).filter(([id]) => belongsToSecond(id) === second));
    return { ...core, ...(core.splices ? { splices } : {}) };
  });
  const originalLength = route.totalLength ??
    (route.markStart !== undefined && route.markEnd !== undefined ? Math.abs(route.markEnd - route.markStart) : undefined);
  const firstLength = originalLength === undefined ? undefined : Math.round(originalLength * fraction * 100) / 100;
  const secondLength = originalLength === undefined ? undefined : Math.round((originalLength - firstLength!) * 100) / 100;
  const markAtCut = route.markStart !== undefined && route.markEnd !== undefined
    ? Math.round((route.markStart + (route.markEnd - route.markStart) * fraction) * 100) / 100 : undefined;
  const lineageId = route.lineageId || route.id;
  const first: Route = {
    ...route, name: firstName.trim(), lineageId, path: firstPath,
    endEnclosureId: enclosure.id, cores: partitionCores(false),
    ...(markAtCut !== undefined ? { markEnd: markAtCut } : {}),
    ...(firstLength !== undefined ? { totalLength: firstLength } : {})
  };
  const second: Route = {
    ...route, id: newRouteId, uid, name: secondName.trim(), lineageId, path: secondPath,
    startEnclosureId: enclosure.id, cores: partitionCores(true),
    ...(markAtCut !== undefined ? { markStart: markAtCut } : {}),
    ...(secondLength !== undefined ? { totalLength: secondLength } : {})
  };
  // Keep an unspliced core continuous across the new enclosure. An existing
  // splice at this enclosure remains with the first segment instead.
  route.cores.forEach((core, index) => {
    if (core.splices?.[enclosure.id]) return;
    first.cores[index] = {
      ...first.cores[index],
      splices: { ...first.cores[index].splices, [enclosure.id]: { routeId: newRouteId, coreId: core.id } }
    };
    second.cores[index] = {
      ...second.cores[index],
      splices: { ...second.cores[index].splices, [enclosure.id]: { routeId: route.id, coreId: core.id } }
    };
  });
  if (!first.name || !second.name) throw new Error('Enter names for both Fiber segments.');

  // Splices are stored on both cables. Update reciprocal references on the far side.
  const updatedRoutes = routes.filter(item => item.id !== route.id).flatMap(item => {
    let changed = false;
    const cores = item.cores.map(core => {
      if (!core.splices) return core;
      const splices = { ...core.splices };
      Object.entries(splices).forEach(([enclosureId, connection]) => {
        if (connection.routeId === route.id && belongsToSecond(enclosureId)) {
          splices[enclosureId] = { ...connection, routeId: newRouteId };
          changed = true;
        }
      });
      return changed ? { ...core, splices } : core;
    });
    return changed ? [{ ...item, cores }] : [];
  });

  const updatedEnclosures = enclosures.flatMap(item => {
    if (!belongsToSecond(item.id)) return [];
    let changed = false;
    const portAssignments = item.portAssignments ? { ...item.portAssignments } : undefined;
    if (portAssignments) Object.entries(portAssignments).forEach(([port, assignment]) => {
      if (assignment.routeId === route.id) {
        portAssignments[Number(port)] = { ...assignment, routeId: newRouteId };
        changed = true;
      }
    });
    const routeSideOverrides = item.routeSideOverrides ? { ...item.routeSideOverrides } : undefined;
    if (routeSideOverrides?.[route.id]) {
      routeSideOverrides[newRouteId] = routeSideOverrides[route.id];
      delete routeSideOverrides[route.id];
      changed = true;
    }
    const routeOffsets = item.routeOffsets ? { ...item.routeOffsets } : undefined;
    if (routeOffsets?.[route.id] !== undefined) {
      routeOffsets[newRouteId] = routeOffsets[route.id];
      delete routeOffsets[route.id];
      changed = true;
    }
    return changed ? [{ ...item, ...(portAssignments ? { portAssignments } : {}), ...(routeSideOverrides ? { routeSideOverrides } : {}), ...(routeOffsets ? { routeOffsets } : {}) }] : [];
  });

  const updatedLoops = loops.filter(loop => loop.routeId === route.id && isOnSecond(loop.position))
    .map(loop => ({ ...loop, routeId: newRouteId }));
  const firstEnclosureIds = enclosures.filter(item => item.id === enclosure.id || !belongsToSecond(item.id)).map(item => item.id);
  const secondEnclosureIds = enclosures.filter(item => item.id === enclosure.id || belongsToSecond(item.id)).map(item => item.id);
  return { first, second, updatedRoutes, updatedEnclosures, updatedLoops, firstEnclosureIds, secondEnclosureIds };
}
