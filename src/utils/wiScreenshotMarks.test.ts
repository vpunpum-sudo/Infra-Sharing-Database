import test from 'node:test';
import assert from 'node:assert/strict';
import { clampMark, formatMarksModule, toPercentMarks, stackParts, mergeCapturedMarks } from './wiScreenshotMarks';

test('marks are centred, rounded to one decimal, clamped and fall back separately', () => {
  const result = toPercentMarks([
    { name: 'header', box: { x: 0, y: 0, width: 144, height: 90 } },
    { name: 'tools', box: undefined },
    { name: 'outside', box: { x: 1500, y: 950, width: 20, height: 20 } }
  ], { width: 1440, height: 900 }, [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
  assert.deepEqual(result.marks, [{ x: 5, y: 5 }, { x: 3, y: 4 }, { x: 100, y: 100 }]);
  assert.deepEqual(result.measured, ['header', 'outside']);
  assert.deepEqual(result.kept, ['tools']);
  assert.deepEqual(clampMark({ x: -5, y: 101 }), { x: 0, y: 100 });
});

test('marks can sit on the top-left corner or the middle of the left edge', () => {
  const box = { x: 144, y: 90, width: 288, height: 180 };
  const result = toPercentMarks([
    { name: 'corner', box, anchor: 'top-left' },
    { name: 'edge', box, anchor: 'left-center' },
    { name: 'centre', box }
  ], { width: 1440, height: 900 }, []);
  assert.deepEqual(result.marks, [{ x: 10, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 20 }]);
});

test('marks module formatting is stable in map then context-menu order', () => {
  const marks = { map: [{ x: 1.234, y: 9.96 }], 'context-menu': [{ x: 2, y: 3 }] };
  const first = formatMarksModule(marks);
  assert.equal(first, formatMarksModule(marks));
  assert.match(first, /x: 1\.2, y: 10\.0/);
  assert.ok(first.indexOf('map:') < first.indexOf("'context-menu':"));
});

test('marks use crop coordinates and warn when clamped', () => {
  const clip = { x: 100, y: 50, width: 400, height: 300 };
  const result = toPercentMarks([
    { name: 'inside', box: { x: 300, y: 200, width: 1, height: 1 }, anchor: 'top-left' },
    { name: 'outside', box: { x: 700, y: 500, width: 1, height: 1 } }
  ], clip, []);
  assert.deepEqual(result.marks[0], { x: 50, y: 50 });
  assert.deepEqual(result.marks[1], { x: 100, y: 100 });
  assert.deepEqual(result.warnings, ['outside: mark clamped to clip']);
});

test('composite offsets lower-part marks by upper-part height', () => {
  const result = stackParts([{ width: 1440, height: 64, marks: [] }, { width: 1440, height: 836, marks: [{ x: 50, y: 10 / 836 * 100 }] }]);
  assert.equal(result.width, 1440);
  assert.equal(result.height, 900);
  assert.equal(result.marks[0].y, 8.2);
});

test('partial merge retains other screenshot keys', () => {
  const old = { login: [{ x: 1, y: 2 }], map: [{ x: 3, y: 4 }], 'context-menu': [{ x: 5, y: 6 }] };
  assert.deepEqual(mergeCapturedMarks(old, { dashboard: [{ x: 7, y: 8 }] }), { ...old, dashboard: [{ x: 7, y: 8 }] });
});
