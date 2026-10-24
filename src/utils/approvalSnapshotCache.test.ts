import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotCache, CancelledHistoryLoadError } from './approvalSnapshotCache';
import { deferred, tick } from './approvalHistory.testFixtures';
test('7: resident reuse, LRU eight-entry bound and eviction reload', async () => {
  const cache = createSnapshotCache<number>(); let reads = 0;
  const load = (key: string) => cache.load(key, async () => ++reads);
  assert.equal(await load('0'), 1); assert.equal(await load('0'), 1);
  for (let i = 1; i < 8; i++) await load(String(i));
  await load('0'); await load('8'); assert.equal(cache.size, 8);
  assert.equal(await load('0'), 1); await load('1'); assert.equal(reads, 10);
});
test('7: concurrent dedup, failures retry and separate session keys', async () => {
  const cache = createSnapshotCache<number>(); const pending = deferred<number>(); let reads = 0;
  const loader = () => { reads++; return pending.promise; };
  const a = cache.load('u/project/a', loader), b = cache.load('u/project/a', loader);
  assert.equal(a, b); await tick(); assert.equal(reads, 1); pending.resolve(42); assert.equal(await a, 42);
  await cache.load('other/project/a', async () => ++reads); await cache.load('u/other/a', async () => ++reads); assert.equal(reads, 3);
  await assert.rejects(cache.load('failed', async () => { throw Error('failed'); })); assert.equal(cache.size, 3);
  assert.equal(await cache.load('failed', async () => 1), 1);
});
test('7: cancel discards old pending generation, starts fresh load and keeps residents', async () => {
  const cache = createSnapshotCache<number>(); await cache.load('resident', async () => 7);
  const old = deferred<number>(), fresh = deferred<number>(); let reads = 0;
  const a = cache.load('a', () => { reads++; return old.promise; }); const rejection = assert.rejects(a, CancelledHistoryLoadError);
  await tick(); cache.cancelPending();
  const b = cache.load('a', () => { reads++; return fresh.promise; }); await tick(); assert.equal(reads, 2);
  old.resolve(1); await rejection; assert.equal(cache.size, 1); assert.equal(cache.staleDropped, 1);
  assert.equal(await cache.load('resident', async () => 99), 7);
  fresh.resolve(2); assert.equal(await b, 2); assert.equal(cache.size, 2);
});
test('7: reset clears residents and old settlements cannot refill new session', async () => {
  const cache = createSnapshotCache<number>(); await cache.load('resident', async () => 7);
  const pending = deferred<number>(); const a = cache.load('a', () => pending.promise); const rejected = assert.rejects(a, CancelledHistoryLoadError);
  await tick(); cache.resetSession(); assert.equal(cache.size, 0); pending.resolve(1); await rejected; assert.equal(cache.size, 0);
  assert.equal(await cache.load('resident', async () => 8), 8);
});
