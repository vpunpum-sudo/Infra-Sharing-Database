import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_QUEUE,
  MAX_STORED_NOTIFICATIONS,
  MAX_VISIBLE_NOTIFICATIONS,
  NOTIFICATION_DURATION_MS,
  NotificationQueueState,
  dismissNotification,
  enqueueNotification,
  visibleNotifications
} from './notificationQueue';

function fill(count: number, kind: 'success' | 'error' = 'success'): NotificationQueueState {
  let state = EMPTY_QUEUE;
  for (let i = 0; i < count; i++) state = enqueueNotification(state, { message: `m${i}`, kind }, `id${i}`);
  return state;
}

test('constants match the contract', () => {
  assert.equal(MAX_VISIBLE_NOTIFICATIONS, 3);
  assert.equal(MAX_STORED_NOTIFICATIONS, 10);
  assert.deepEqual(NOTIFICATION_DURATION_MS, { success: 3000, info: 4000, warning: 5000, error: 6000 });
});

test('defaults kind to success and duration from the table', () => {
  const state = enqueueNotification(EMPTY_QUEUE, { message: 'hello' }, 'a');
  assert.deepEqual(state.items, [{ id: 'a', message: 'hello', kind: 'success', durationMs: 3000 }]);
});

test('errors last longer than success', () => {
  let state = enqueueNotification(EMPTY_QUEUE, { message: 'ok', kind: 'success' }, 'a');
  state = enqueueNotification(state, { message: 'bad', kind: 'error' }, 'b');
  assert.equal(state.items[0].durationMs, 3000);
  assert.equal(state.items[1].durationMs, 6000);
});

test('explicit positive duration is kept; invalid durations fall back', () => {
  assert.equal(enqueueNotification(EMPTY_QUEUE, { message: 'x', durationMs: 1234 }, 'a').items[0].durationMs, 1234);
  for (const [i, d] of [0, -5, NaN, Infinity].entries()) {
    const s = enqueueNotification(EMPTY_QUEUE, { message: 'x', kind: 'info', durationMs: d }, `i${i}`);
    assert.equal(s.items[0].durationMs, 4000);
  }
});

test('empty or whitespace messages return the same state', () => {
  assert.equal(enqueueNotification(EMPTY_QUEUE, { message: '' }, 'a'), EMPTY_QUEUE);
  assert.equal(enqueueNotification(EMPTY_QUEUE, { message: '   ' }, 'a'), EMPTY_QUEUE);
});

test('identical message and kind is not duplicated, different kind is', () => {
  const state = enqueueNotification(EMPTY_QUEUE, { message: 'dup', kind: 'error' }, 'a');
  assert.equal(enqueueNotification(state, { message: 'dup', kind: 'error' }, 'b'), state);
  const other = enqueueNotification(state, { message: 'dup', kind: 'success' }, 'c');
  assert.equal(other.items.length, 2);
});

test('duplicates are detected among waiting items too', () => {
  const state = fill(5);
  assert.equal(enqueueNotification(state, { message: 'm4' }, 'z'), state);
});

test('five in the same tick: 3 visible, 2 waiting, in order', () => {
  const state = fill(5);
  assert.equal(state.items.length, 5);
  assert.deepEqual(visibleNotifications(state).map(n => n.id), ['id0', 'id1', 'id2']);
});

test('dismissing a visible item promotes the next waiting one; none lost', () => {
  let state = fill(5);
  state = dismissNotification(state, 'id1');
  assert.deepEqual(visibleNotifications(state).map(n => n.id), ['id0', 'id2', 'id3']);
  state = dismissNotification(state, 'id0');
  state = dismissNotification(state, 'id2');
  assert.deepEqual(visibleNotifications(state).map(n => n.id), ['id3', 'id4']);
});

test('dismissing an unknown id returns the same state', () => {
  const state = fill(2);
  assert.equal(dismissNotification(state, 'nope'), state);
});

test('storage is capped by dropping the oldest waiting item, never visible ones', () => {
  const state = fill(MAX_STORED_NOTIFICATIONS);
  assert.equal(state.items.length, 10);
  const next = enqueueNotification(state, { message: 'newest' }, 'new');
  assert.equal(next.items.length, 10);
  assert.deepEqual(next.items.slice(0, 3).map(n => n.id), ['id0', 'id1', 'id2']);
  assert.equal(next.items.some(n => n.id === 'id3'), false);
  assert.equal(next.items[next.items.length - 1].id, 'new');
});

test('enqueue does not mutate the previous state', () => {
  const state = fill(2);
  const snapshot = [...state.items];
  enqueueNotification(state, { message: 'another' }, 'x');
  assert.deepEqual(state.items, snapshot);
});
