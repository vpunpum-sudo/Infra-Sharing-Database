import { Point } from '../types';

/**
 * Calculates the distance between two points in meters using the Haversine formula.
 */
export function getDistance(p1: Point, p2: Point): number {
  const R = 6371e3; // Earth's radius in meters
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the closest point on a line segment (p1, p2) to a given point p.
 */
export function getClosestPointOnSegment(p: Point, p1: Point, p2: Point): Point {
  const x = p.lng;
  const y = p.lat;
  const x1 = p1.lng;
  const y1 = p1.lat;
  const x2 = p2.lng;
  const y2 = p2.lat;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) return p1;

  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);

  if (t < 0) return p1;
  if (t > 1) return p2;

  return {
    lat: y1 + t * dy,
    lng: x1 + t * dx
  };
}

/**
 * Finds the closest point on a route (array of points) to a given point p.
 * Returns the point and the segment index.
 */
export function getClosestPointOnRoute(p: Point, path: Point[]): { point: Point; distance: number; segmentIndex: number } {
  let minDistance = Infinity;
  let closestPoint = path[0];
  let segmentIndex = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const cp = getClosestPointOnSegment(p, p1, p2);
    const dist = getDistance(p, cp);

    if (dist < minDistance) {
      minDistance = dist;
      closestPoint = cp;
      segmentIndex = i;
    }
  }

  return { point: closestPoint, distance: minDistance, segmentIndex };
}

export function routeLength(path: Point[]): number {
  return path.slice(1).reduce((total, point, index) => total + getDistance(path[index], point), 0);
}

/** Insert a point on a route without duplicating an existing vertex. */
export function insertPointOnRoute(path: Point[], point: Point): { path: Point[]; index: number; point: Point } {
  if (path.length < 2) throw new Error('A route needs at least two points.');
  const closest = getClosestPointOnRoute(point, path);
  const before = path[closest.segmentIndex];
  const after = path[closest.segmentIndex + 1];
  if (getDistance(closest.point, before) < 0.2) {
    return { path, index: closest.segmentIndex, point: before };
  }
  if (getDistance(closest.point, after) < 0.2) {
    return { path, index: closest.segmentIndex + 1, point: after };
  }
  const updated = [...path.slice(0, closest.segmentIndex + 1), closest.point, ...path.slice(closest.segmentIndex + 1)];
  return { path: updated, index: closest.segmentIndex + 1, point: closest.point };
}

export function splitRoutePath(path: Point[], point: Point) {
  const inserted = insertPointOnRoute(path, point);
  const first = inserted.path.slice(0, inserted.index + 1);
  const second = inserted.path.slice(inserted.index);
  const firstLength = routeLength(first);
  const secondLength = routeLength(second);
  if (firstLength < 1 || secondLength < 1) throw new Error('Choose an Enclosure between the ends of the route.');
  return { first, second, point: inserted.point, fraction: firstLength / (firstLength + secondLength) };
}

/** Designed path length, falling back only to the route's explicit end enclosures. */
export function routeDistanceMeters(route: unknown, enclosures: unknown): number | undefined {
  if (!route || typeof route !== 'object') return undefined;
  const r = route as Record<string, unknown>;
  const isPoint = (value: unknown): value is Point => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Point;
    return typeof p.lat === 'number' && Number.isFinite(p.lat) &&
      typeof p.lng === 'number' && Number.isFinite(p.lng);
  };
  const path = Array.isArray(r.path) ? r.path.filter(isPoint) : [];
  if (path.length >= 2) {
    const meters = routeLength(path);
    if (Number.isFinite(meters) && meters >= 0) return meters;
  }
  const enclosure = (id: unknown): unknown => {
    if (typeof id !== 'string') return undefined;
    if (enclosures instanceof Map) return enclosures.get(id);
    if (Array.isArray(enclosures)) return enclosures.find(e => e && typeof e === 'object' && e.id === id);
    return undefined;
  };
  const position = (entry: unknown): unknown => entry && typeof entry === 'object'
    ? (entry as { position?: unknown }).position : undefined;
  const from = position(enclosure(r.startEnclosureId));
  const to = position(enclosure(r.endEnclosureId));
  if (!isPoint(from) || !isPoint(to)) return undefined;
  const meters = getDistance(from, to);
  return Number.isFinite(meters) && meters >= 0 ? meters : undefined;
}

export function distanceKmText(meters: number | undefined): string {
  return typeof meters === 'number' && Number.isFinite(meters) && meters >= 0
    ? (meters / 1000).toFixed(2) : '-';
}
