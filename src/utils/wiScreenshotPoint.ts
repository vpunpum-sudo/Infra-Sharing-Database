export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export function candidateFractions(): number[] { return [0.5, 1 / 3, 2 / 3]; }
export function pointAtFraction(fraction: number, totalLength: number): number {
  return Math.max(0, Math.min(1, fraction)) * totalLength;
}
export function applyMatrix(point: Point, matrix: Matrix): Point {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}
export function rectContains(rect: Rect, point: Point, margin = 0): boolean {
  return point.x >= rect.x + margin && point.x <= rect.x + rect.width - margin &&
    point.y >= rect.y + margin && point.y <= rect.y + rect.height - margin;
}
export function validateClickPoint(point: Point, area: {
  mapRect: Rect;
  viewport: { width: number; height: number };
  excluded: { name: string; rect: Rect }[];
  margin: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !rectContains(area.mapRect, point, area.margin)) return { ok: false, reason: 'outside-map' };
  if (!rectContains({ x: 0, y: 0, ...area.viewport }, point, area.margin)) return { ok: false, reason: 'outside-viewport' };
  for (const item of area.excluded) if (rectContains(item.rect, point)) return { ok: false, reason: `under-${item.name}` };
  return { ok: true };
}
