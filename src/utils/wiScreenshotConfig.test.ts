import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWiScreenshotConfig } from './wiScreenshotConfig';

test('config lists every absent or empty required key without values', () => {
  assert.deepEqual(resolveWiScreenshotConfig({}), { ok: false, missing: ['WI_SCREENSHOT_EMAIL', 'WI_SCREENSHOT_PASSWORD', 'WI_SCREENSHOT_PROJECT_ID'] });
  assert.deepEqual(resolveWiScreenshotConfig({ WI_SCREENSHOT_EMAIL: 'test@example.invalid', WI_SCREENSHOT_PASSWORD: ' ' }), { ok: false, missing: ['WI_SCREENSHOT_PASSWORD', 'WI_SCREENSHOT_PROJECT_ID'] });
});

test('real environment wins over fallback and optional keys are trimmed', () => {
  const fallback = { WI_SCREENSHOT_EMAIL: 'fallback@example.invalid', WI_SCREENSHOT_PASSWORD: 'fallback', WI_SCREENSHOT_PROJECT_ID: 'old', WI_SCREENSHOT_ROUTE_NAME: ' Route A ' };
  assert.deepEqual(resolveWiScreenshotConfig({ ...fallback, WI_SCREENSHOT_EMAIL: 'real@example.invalid', WI_SCREENSHOT_PASSWORD: 'real' }), {
    ok: true, config: { email: 'real@example.invalid', password: 'real', projectId: 'old', routeName: 'Route A', baseUrl: undefined }
  });
});
