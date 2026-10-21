import test from 'node:test';
import assert from 'node:assert/strict';
import { WI_CHAPTERS, WI_META, WI_REVISIONS } from './workInstruction';
import { WI_FIGURES, figureImagePath, type FigureId } from '../utils/wiScreenshotFigures';
import { WI_SCREENSHOT_MARKS } from './wiScreenshotMarks';
import { WI_MASK_SPECS } from '../utils/wiScreenshotMaskSpec';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('every screenshot has a drawn fallback, matching bounded marks, and a WI path', () => {
  const procedures = WI_CHAPTERS.flatMap(chapter => chapter.procedures);
  for (const procedure of procedures.filter(item => item.image)) {
    assert.ok(procedure.figure, `${procedure.id}: fallback`);
    assert.equal(procedure.marks?.length, procedure.callouts?.length, `${procedure.id}: mark count`);
    assert.ok(procedure.image?.startsWith('/wi/'), `${procedure.id}: image path`);
    for (const mark of procedure.marks ?? []) assert.ok(mark.x >= 0 && mark.x <= 100 && mark.y >= 0 && mark.y <= 100, `${procedure.id}: mark bounds`);
  }
  assert.deepEqual(procedures.filter(item => item.image).map(item => item.id),
    procedures.filter(item => WI_SCREENSHOT_MARKS[item.figure as FigureId]).map(item => item.id));
  assert.equal(WI_META.revision, '04');
  assert.ok(WI_REVISIONS.some(item => item.revision === '04'));
  assert.doesNotMatch(procedures.find(item => item.id === 'loop-add')!.callouts![4], /Loop/);
  for (const figure of WI_FIGURES) {
    for (const procedure of procedures.filter(item => item.figure === figure.id)) {
      assert.equal(procedure.callouts?.length, figure.markCount, `${figure.id}: ${procedure.id} callout count`);
    }
  }
});

function checkScreenshotContent(keyed: Partial<Record<FigureId, { x: number; y: number }[]>>, pngExists = existsSync): void {
  const figures = new Map(WI_FIGURES.map(item => [item.id, item]));
  const procedures = WI_CHAPTERS.flatMap(chapter => chapter.procedures);
  for (const [id, marks] of Object.entries(keyed)) {
    assert.ok(figures.has(id as FigureId), `${id}: registry entry`);
    for (const procedure of procedures.filter(item => item.figure === id)) {
      assert.equal(marks?.length, procedure.callouts?.length, `${id}: mark count for ${procedure.id}`);
    }
    assert.ok(pngExists(resolve('public', figureImagePath(id as FigureId).slice(1))), `${id}: PNG missing`);
    for (const procedure of procedures.filter(item => item.figure === id)) {
      assert.equal(procedure.image, figureImagePath(id as FigureId), `${procedure.id}: image`);
      assert.ok(procedure.figure, `${procedure.id}: fallback`);
      assert.deepEqual(procedure.marks, marks, `${procedure.id}: marks`);
      assert.equal(marks?.length, procedure.callouts?.length, `${procedure.id}: mark count`);
    }
  }
  for (const procedure of procedures) {
    assert.ok(!procedure.figure || figures.has(procedure.figure as FigureId), `${procedure.id}: unregistered figure`);
    assert.equal(!!procedure.image, !!keyed[procedure.figure as FigureId], `${procedure.id}: unexpected image`);
  }
  for (const figure of WI_FIGURES) assert.ok(WI_MASK_SPECS[figure.id], `${figure.id}: mask spec`);
}

test('every screenshot key has a PNG and all procedures using it have matching marks and fallback', () => {
  checkScreenshotContent(WI_SCREENSHOT_MARKS);
});

test('a key without a PNG reports its figure', () => {
  const figure = WI_FIGURES.find(item => !WI_SCREENSHOT_MARKS[item.id])!;
  const missing = resolve('public', figureImagePath(figure.id).slice(1));
  assert.throws(() => checkScreenshotContent({ ...WI_SCREENSHOT_MARKS, [figure.id]: Array.from({ length: figure.markCount }, () => ({ x: 10, y: 10 })) },
    path => path !== missing && existsSync(path)), new RegExp(`${figure.id}: PNG missing`));
});

test('a key with the wrong callout count reports its figure', () => {
  assert.throws(() => checkScreenshotContent({ ...WI_SCREENSHOT_MARKS, dashboard: Array.from({ length: 5 }, () => ({ x: 10, y: 10 })) }, () => true), /dashboard: mark count/);
});
