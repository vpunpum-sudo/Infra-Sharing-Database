import { FiberEnclosure, Route } from '../types';
import { getClosestPointOnRoute, getDistance } from './geo';

/** Physical routes at an Enclosure. A nearby parallel route is not a connection. */
export function getConnectedEnclosureRoutes(enclosure: FiberEnclosure, routes: Route[]): Route[] {
  return routes.filter(route => {
    if (route.startEnclosureId === enclosure.id || route.endEnclosureId === enclosure.id) return true;
    if (route.path?.length < 2 || !enclosure.position) return false;
    return getClosestPointOnRoute(enclosure.position, route.path).distance <= 3;
  });
}

/** A cable passing through an Enclosure has an incoming and an outgoing leg. */
export function isRoutePassThroughEnclosure(enclosure: FiberEnclosure, route: Route): boolean {
  if (route.startEnclosureId === enclosure.id || route.endEnclosureId === enclosure.id) {
    return route.startEnclosureId === enclosure.id && route.endEnclosureId === enclosure.id;
  }
  if (route.path?.length < 2 || !enclosure.position) return false;
  if (getClosestPointOnRoute(enclosure.position, route.path).distance > 3) return false;
  return getDistance(enclosure.position, route.path[0]) > 3 &&
    getDistance(enclosure.position, route.path[route.path.length - 1]) > 3;
}
