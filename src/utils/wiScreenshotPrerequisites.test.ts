import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFigureGate, hasUnpublishableSelection, observedSpliceEnclosure, REMAINING_WI_FIGURES } from './wiScreenshotPrerequisites';

test('all seven remaining figures require an observed state, reviewer, and publishability confirmation', () => {
  assert.deepEqual(REMAINING_WI_FIGURES, ['profile', 'core-manager', 'splice', 'files', 'schedule', 'approval-request', 'approval-sign']);
  for (const id of REMAINING_WI_FIGURES) {
    assert.equal(evaluateFigureGate(undefined).ready, false, id);
    assert.equal(evaluateFigureGate({ prerequisite: `${id} available`, reviewer: '', sceneObserved: true, publishable: true, permission: 'available', state: 'available' }).ready, false);
    assert.equal(evaluateFigureGate({ prerequisite: `${id} available`, reviewer: 'reviewer', publishable: true, permission: 'available', state: 'available' }).ready, false);
    assert.deepEqual(evaluateFigureGate({ prerequisite: `${id} available`, reviewer: 'reviewer', sceneObserved: true, publishable: false, permission: 'available', state: 'available' }),
      { ready: false, status: 'failed: unpublishable content', reason: 'visible sample data is not approved for publication' });
    assert.deepEqual(evaluateFigureGate({ prerequisite: `${id} available`, reviewer: 'reviewer', sceneObserved: true, publishable: true, permission: 'available', state: 'available' }), { ready: true });
  }
});

test('permission and missing pre-existing states are ordinary skips when publishability is unknown', () => {
  assert.deepEqual(evaluateFigureGate({ prerequisite: 'control unavailable', reviewer: 'reviewer', permission: 'missing', state: 'available' }), { ready: false, status: 'skipped: permission', reason: 'control unavailable' });
  assert.deepEqual(evaluateFigureGate({ prerequisite: 'existing task unavailable', reviewer: 'reviewer', permission: 'available', state: 'missing' }), { ready: false, status: 'skipped: data-state', reason: 'existing task unavailable' });
});

test('one explicitly unpublishable selection aborts the entire selection before capture', () => {
  const ready = evaluateFigureGate({ prerequisite: 'task exists', reviewer: 'reviewer', sceneObserved: true, publishable: true, permission: 'available', state: 'available' });
  const unsafe = evaluateFigureGate({ prerequisite: 'file exists', reviewer: 'reviewer', publishable: false, permission: 'available', state: 'available' });
  assert.equal(hasUnpublishableSelection([ready, unsafe]), true);
  assert.equal(hasUnpublishableSelection([ready, evaluateFigureGate(undefined)]), false);
});

test('splice capture requires the exact observed project and enclosure', () => {
  const gate = { prerequisite: 'connected diagram observed', reviewer: 'reviewer', sceneObserved: true,
    publishable: true, permission: 'available' as const, state: 'available' as const,
    projectId: 'project-a', enclosureId: ' enclosure-a ' };
  assert.equal(observedSpliceEnclosure(gate, 'project-a'), 'enclosure-a');
  assert.equal(observedSpliceEnclosure(gate, 'project-b'), undefined);
  assert.equal(observedSpliceEnclosure({ ...gate, enclosureId: '' }, 'project-a'), undefined);
  assert.equal(observedSpliceEnclosure({ ...gate, sceneObserved: false }, 'project-a'), undefined);
});

test('project figures reject a missing or different recorded project before capture', () => {
  const gate = { prerequisite: 'scene observed', reviewer: 'reviewer', sceneObserved: true,
    publishable: true, permission: 'available' as const, state: 'available' as const,
    projectId: 'project-a' };
  for (const figureId of ['core-manager', 'splice', 'files', 'schedule', 'approval-request', 'approval-sign'] as const) {
    assert.deepEqual(evaluateFigureGate(gate, { figureId, projectId: 'project-a' }), { ready: true }, figureId);
    assert.deepEqual(evaluateFigureGate(gate, { figureId, projectId: 'project-b' }),
      { ready: false, status: 'failed: unpublishable content', reason: 'selected project does not match the observed scene' }, figureId);
    assert.deepEqual(evaluateFigureGate({ ...gate, projectId: undefined }, { figureId, projectId: 'project-a' }),
      { ready: false, status: 'failed: unpublishable content', reason: 'selected project does not match the observed scene' }, figureId);
  }
  assert.deepEqual(evaluateFigureGate({ ...gate, projectId: undefined }, { figureId: 'profile', projectId: 'project-b' }), { ready: true });
});
