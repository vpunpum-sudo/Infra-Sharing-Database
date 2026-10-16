import { FiberEnclosure, Route } from '../types';
import { getClosestPointOnRoute } from './geo';

/** Physical routes at an Enclosure. A nearby parallel route is not a connection. */
export function getConnectedEnclosureRoutes(enclosure: FiberEnclosure, routes: Route[]): Route[] {
  return routes.filter(route => {
    if (route.startEnclosureId === enclosure.id || route.endEnclosureId === enclosure.id) return true;
    if (route.path?.length < 2 || !enclosure.position) return false;
    return getClosestPointOnRoute(enclosure.position, route.path).distance <= 3;
  });
}
