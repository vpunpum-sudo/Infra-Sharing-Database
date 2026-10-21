import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCheckedScreenshot } from './wiScreenshotCaptureCheck';

test('checks after capture and discards an unsafe staged image', async () => {
  const order: string[] = [];
  const result = await captureCheckedScreenshot(
    async () => { order.push('capture'); return Buffer.from('private pixels'); },
    async () => { order.push('check'); return 'mask-region:previous-signer'; },
    async () => { order.push('discard'); });
  assert.deepEqual(result, { ok: false, error: 'mask-region:previous-signer' });
  assert.deepEqual(order, ['capture', 'check', 'discard']);
});

test('a failed post-capture check discards the staged image', async () => {
  let discarded = false;
  await assert.rejects(captureCheckedScreenshot(
    async () => 'pixels', async () => { throw new Error('snapshot unavailable'); },
    async () => { discarded = true; }), /snapshot unavailable/);
  assert.equal(discarded, true);
});
