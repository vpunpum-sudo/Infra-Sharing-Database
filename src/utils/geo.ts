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
