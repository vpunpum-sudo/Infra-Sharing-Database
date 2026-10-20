import test from 'node:test';
import assert from 'node:assert/strict';
import { WI_ALLOWED_ACTIONS, assertAllowedAction, missingMenuItems } from './wiScreenshotActions';

test('action allowlist contains only approved interactions', () => {
  assert.deepEqual(WI_ALLOWED_ACTIONS, ['fillLogin', 'submitLogin', 'goto', 'expandRoutesList', 'focusAllObjects', 'leftClickPoint', 'rightClickPoint', 'pressEscape', 'closePopup']);
  for (const action of WI_ALLOWED_ACTIONS) assert.doesNotThrow(() => assertAllowedAction(action));
  for (const action of ['clickSidebarRoute', 'closeCoreManager', 'zoomIn', 'zoomOut', 'drag', 'wheel', 'clickMenuItem', 'acceptDialog', 'save']) assert.throws(() => assertAllowedAction(action));
});

test('missing menu items report absent or hidden commands', () => {
  assert.deepEqual(missingMenuItems(['Cut Fiber Here', 'Edit']), ['Split at Enclosure']);
  assert.deepEqual(missingMenuItems(['Cut Fiber Here', 'Split at Enclosure', 'Edit']), []);
});
