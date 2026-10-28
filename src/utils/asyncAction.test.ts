import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_ERROR_MESSAGES,
  AsyncActionState,
  IDLE_ACTION,
  SKIPPED,
  createSingleFlight,
  describeActionError,
  reduceAsyncAction
} from './asyncAction';

const pending: AsyncActionState = { status: 'pending' };

test('idle state is { status: idle }', () => {
  assert.deepEqual(IDLE_ACTION, { status: 'idle' });
});

test('start moves idle, success and error to pending and clears the message', () => {
  assert.deepEqual(reduceAsyncAction(IDLE_ACTION, { type: 'start' }), { status: 'pending' });
  assert.deepEqual(reduceAsyncAction({ status: 'success', message: 'ok' }, { type: 'start' }), { status: 'pending' });
  const afterError = reduceAsyncAction({ status: 'error', message: 'bad' }, { type: 'start' });
  assert.equal(afterError.status, 'pending');
  assert.equal(afterError.message, undefined);
});

test('start while pending returns the same state object', () => {
  assert.equal(reduceAsyncAction(pending, { type: 'start' }), pending);
});

test('succeed and fail apply only while pending', () => {
  assert.deepEqual(reduceAsyncAction(pending, { type: 'succeed' }).status, 'success');
  assert.equal(reduceAsyncAction(pending, { type: 'succeed', message: 'done' }).message, 'done');
  assert.deepEqual(reduceAsyncAction(pending, { type: 'fail', message: 'nope' }), { status: 'error', message: 'nope' });

  const success: AsyncActionState = { status: 'success' };
  const error: AsyncActionState = { status: 'error', message: 'x' };
  assert.equal(reduceAsyncAction(IDLE_ACTION, { type: 'succeed' }), IDLE_ACTION);
  assert.equal(reduceAsyncAction(IDLE_ACTION, { type: 'fail', message: 'x' }), IDLE_ACTION);
  assert.equal(reduceAsyncAction(success, { type: 'fail', message: 'x' }), success);
  assert.equal(reduceAsyncAction(error, { type: 'succeed' }), error);
});

test('reset always returns IDLE_ACTION', () => {
  for (const s of [IDLE_ACTION, pending, { status: 'success' } as AsyncActionState, { status: 'error', message: 'x' } as AsyncActionState]) {
    assert.equal(reduceAsyncAction(s, { type: 'reset' }), IDLE_ACTION);
  }
});

test('single-flight sets running synchronously and skips re-entrant runs', async () => {
  const flight = createSingleFlight();
  let calls = 0;
  let release!: (v: string) => void;
  const first = flight.run(() => {
    calls++;
    return new Promise<string>(resolve => { release = resolve; });
  });
  assert.equal(flight.isRunning(), true);
  const second = await flight.run(async () => { calls++; return 'second'; });
  assert.equal(second, SKIPPED);
  assert.equal(calls, 1);
  release('first');
  assert.equal(await first, 'first');
  assert.equal(flight.isRunning(), false);
});

test('single-flight accepts a new task after settling', async () => {
  const flight = createSingleFlight();
  assert.equal(await flight.run(async () => 1), 1);
  assert.equal(await flight.run(async () => 2), 2);
});

test('single-flight clears running after a rejection and propagates it', async () => {
  const flight = createSingleFlight();
  await assert.rejects(flight.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(flight.isRunning(), false);
  assert.equal(await flight.run(async () => 'again'), 'again');
});

test('single-flight treats a synchronous throw as a rejection', async () => {
  const flight = createSingleFlight();
  await assert.rejects(flight.run((() => { throw new Error('sync'); }) as () => Promise<never>), /sync/);
  assert.equal(flight.isRunning(), false);
  assert.equal(await flight.run(async () => 'ok'), 'ok');
});

test('error messages constants are the Thai strings', () => {
  assert.equal(ACTION_ERROR_MESSAGES.permission, 'คุณไม่มีสิทธิ์ทำรายการนี้');
  assert.equal(ACTION_ERROR_MESSAGES.quota, 'โควต้าการเขียนข้อมูลวันนี้เต็มแล้ว กรุณาลองใหม่หลังโควต้ารีเซ็ต');
  assert.equal(ACTION_ERROR_MESSAGES.offline, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
});

test('describeActionError maps permission, quota and offline errors', () => {
  const fb = 'fallback';
  assert.equal(describeActionError({ code: 'permission-denied' }, fb), ACTION_ERROR_MESSAGES.permission);
  assert.equal(describeActionError(new Error('Missing or Insufficient Permissions.'), fb), ACTION_ERROR_MESSAGES.permission);
  assert.equal(describeActionError({ code: 'resource-exhausted' }, fb), ACTION_ERROR_MESSAGES.quota);
  assert.equal(describeActionError('Quota exceeded for today', fb), ACTION_ERROR_MESSAGES.quota);
  assert.equal(describeActionError({ code: 'unavailable' }, fb), ACTION_ERROR_MESSAGES.offline);
  assert.equal(describeActionError(new Error('Failed to fetch'), fb), ACTION_ERROR_MESSAGES.offline);
  assert.equal(describeActionError({ message: 'client is OFFLINE' }, fb), ACTION_ERROR_MESSAGES.offline);
  assert.equal(describeActionError({ message: 'Network error' }, fb), ACTION_ERROR_MESSAGES.offline);
});

test('describeActionError returns the fallback for anything else', () => {
  assert.equal(describeActionError(null, 'fb'), 'fb');
  assert.equal(describeActionError(undefined, 'fb'), 'fb');
  assert.equal(describeActionError(42, 'fb'), 'fb');
  assert.equal(describeActionError(new Error('something odd'), 'fb'), 'fb');
});

test('describeActionError never leaks raw error text', () => {
  const raw = JSON.stringify({ error: 'boom', authInfo: { userId: 'uid-123', email: 'a@b.com' }, path: 'projects/x' });
  const out = describeActionError(new Error(raw), 'ไม่สำเร็จ');
  assert.equal(out, 'ไม่สำเร็จ');
  assert.ok(!out.includes('a@b.com'));
  const known = [ACTION_ERROR_MESSAGES.permission, ACTION_ERROR_MESSAGES.quota, ACTION_ERROR_MESSAGES.offline, 'ไม่สำเร็จ'];
  const mapped = describeActionError(new Error(`permission-denied for a@b.com ${raw}`), 'ไม่สำเร็จ');
  assert.ok(known.includes(mapped));
  assert.ok(!mapped.includes('a@b.com'));
});
