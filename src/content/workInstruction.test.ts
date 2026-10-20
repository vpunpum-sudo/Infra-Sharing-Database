import test from 'node:test';
import assert from 'node:assert/strict';
import { WI_CHAPTERS, WI_META, WI_REVISIONS } from './workInstruction';

test('every screenshot has a drawn fallback, matching bounded marks, and a WI path', () => {
  const procedures = WI_CHAPTERS.flatMap(chapter => chapter.procedures);
  for (const procedure of procedures.filter(item => item.image)) {
    assert.ok(procedure.figure, `${procedure.id}: fallback`);
    assert.equal(procedure.marks?.length, procedure.callouts?.length, `${procedure.id}: mark count`);
    assert.ok(procedure.image?.startsWith('/wi/'), `${procedure.id}: image path`);
    for (const mark of procedure.marks ?? []) assert.ok(mark.x >= 0 && mark.x <= 100 && mark.y >= 0 && mark.y <= 100, `${procedure.id}: mark bounds`);
  }
  assert.deepEqual(procedures.filter(item => item.image).map(item => item.id), ['map-overview', 'loop-add', 'route-cut']);
  assert.equal(WI_META.revision, '03');
  assert.ok(WI_REVISIONS.some(item => item.revision === '03'));
  assert.doesNotMatch(procedures.find(item => item.id === 'loop-add')!.callouts![4], /Loop/);
});
