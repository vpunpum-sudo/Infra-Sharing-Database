import test from 'node:test';
import assert from 'node:assert/strict';
import { captureWithTimeout } from './wiScreenshotTimeout';
import { SafetyViolation } from './wiScreenshotRun';

test('timeout closes the capture page and waits for its work to settle', async () => {
  let rejectCapture!: (error: Error) => void;
  let settled = false;
  const result = await captureWithTimeout(
    () => new Promise<string>((_resolve, reject) => { rejectCapture = reject; }).finally(() => { settled = true; }),
    async () => { rejectCapture(new Error('page closed')); }, 1);
  assert.deepEqual(result, { timedOut: true });
  assert.equal(settled, true);
});

test('successful capture leaves page open and clears the timer', async () => {
  let closes = 0;
  const result = await captureWithTimeout(async () => 'image', async () => { closes++; }, 1_000);
  assert.deepEqual(result, { timedOut: false, value: 'image' });
  assert.equal(closes, 0);
});

test('a safety violation remains fatal even when the timer has fired', async () => {
  let rejectCapture!: (error: Error) => void;
  await assert.rejects(captureWithTimeout(
    () => new Promise<string>((_resolve, reject) => { rejectCapture = reject; }),
    async () => { rejectCapture(new SafetyViolation('unsafe action')); }, 1), SafetyViolation);
});
