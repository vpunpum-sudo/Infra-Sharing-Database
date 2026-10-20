import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMatrix, candidateFractions, pointAtFraction, rectContains, validateClickPoint } from './wiScreenshotPoint';

const mapRect = { x: 300, y: 40, width: 1100, height: 820 };
const viewport = { width: 1440, height: 900 };
const excluded = [
  { name: 'sidebar', rect: { x: 0, y: 0, width: 350, height: 900 } },
  { name: 'toggle', rect: { x: 350, y: 400, width: 32, height: 40 } },
  { name: 'control', rect: { x: 1320, y: 40, width: 80, height: 80 } }
];
const area = { mapRect, viewport, excluded, margin: 4 };

test('route fraction length is clamped and candidates keep the approved order', () => {
  assert.deepEqual(candidateFractions(), [0.5, 1 / 3, 2 / 3]);
  assert.equal(pointAtFraction(-1, 90), 0);
  assert.equal(pointAtFraction(1 / 3, 90), 30);
  assert.equal(pointAtFraction(2, 90), 90);
});

test('CTM mapping recomputes changed screen coordinates after a pan', () => {
  const pathPoint = { x: 10, y: 20 };
  const before = applyMatrix(pathPoint, { a: 1, b: 0, c: 0, d: 1, e: 500, f: 300 });
  const after = applyMatrix(pathPoint, { a: 1, b: 0, c: 0, d: 1, e: 600, f: 300 });
  assert.deepEqual(before, { x: 510, y: 320 });
  assert.deepEqual(after, { x: 610, y: 320 });
  assert.deepEqual(validateClickPoint(after, area), { ok: true });
});

test('usable map point excludes map and viewport margins, sidebar, toggle and control', () => {
  assert.equal(rectContains(mapRect, { x: 500, y: 300 }), true);
  assert.deepEqual(validateClickPoint({ x: 500, y: 300 }, area), { ok: true });
  assert.deepEqual(validateClickPoint({ x: 200, y: 300 }, area), { ok: false, reason: 'outside-map' });
  assert.deepEqual(validateClickPoint({ x: 302, y: 300 }, area), { ok: false, reason: 'outside-map' });
  assert.deepEqual(validateClickPoint({ x: 340, y: 300 }, area), { ok: false, reason: 'under-sidebar' });
  assert.deepEqual(validateClickPoint({ x: 360, y: 420 }, area), { ok: false, reason: 'under-toggle' });
  assert.deepEqual(validateClickPoint({ x: 1350, y: 80 }, area), { ok: false, reason: 'under-control' });
  assert.deepEqual(validateClickPoint({ x: 1439, y: 300 }, { ...area, mapRect: { x: 0, y: 0, width: 1500, height: 900 } }), { ok: false, reason: 'outside-viewport' });
  assert.deepEqual(validateClickPoint({ x: 310, y: 300 }, area), { ok: false, reason: 'under-sidebar' });
});
