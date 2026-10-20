import test from 'node:test';
import assert from 'node:assert/strict';
import { clampMark, formatMarksModule, toPercentMarks } from './wiScreenshotMarks';

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

test('marks module formatting is stable in map then context-menu order', () => {
  const marks = { map: [{ x: 1.234, y: 9.96 }], 'context-menu': [{ x: 2, y: 3 }] };
  const first = formatMarksModule(marks);
  assert.equal(first, formatMarksModule(marks));
  assert.match(first, /x: 1\.2, y: 10\.0/);
  assert.ok(first.indexOf('map:') < first.indexOf("'context-menu':"));
});
