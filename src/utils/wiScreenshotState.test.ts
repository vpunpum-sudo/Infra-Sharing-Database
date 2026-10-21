import test from 'node:test';
import assert from 'node:assert/strict';
import { captureState, compareCaptureState } from './wiScreenshotState';
import type { Project, Route } from '../types';

test('approval stage, sign-offs, and splice links are compared without exposing record content', () => {
  const project = { id: 'sample', designApproval: { approvalStage: 'Planning', status: 'Pending', planningSignOffs: {} } } as unknown as Project;
  const routes = [{ id: 'route', cores: [{ id: 1, splices: {} }] }] as unknown as Route[];
  const before = captureState(project, routes)!;
  assert.ok(compareCaptureState(before, captureState(project, routes)!));
  assert.equal(JSON.stringify(before).includes('sample'), false);
  assert.equal(compareCaptureState(before, captureState({ ...project, designApproval: { ...project.designApproval!, approvalStage: 'OM' } }, routes)!), false);
  assert.equal(compareCaptureState(before, captureState(project, [{ ...routes[0], cores: [{ ...routes[0].cores[0], splices: { enclosure: { routeId: 'other', coreId: 2 } } }] }])!), false);
  assert.equal(captureState(null, routes), undefined);
});
