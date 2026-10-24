import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryController, type HistoryReader } from './approvalHistoryController';
import { createSnapshotCache } from './approvalSnapshotCache';
import { raw, current, snapshot, deferred, tick, harness } from './approvalHistory.testFixtures';
import type { ApprovalSnapshot } from './approvalSnapshot';
import type { CurrentLookup } from './approvalHistory';
test('8: lazy open list + one direct get, legacy without get, snapshot + compare cache reads', async () => {
  const h = harness(); assert.equal(h.calls.page, 0); assert.equal(h.calls.snapshot, 0);
  await h.controller.open(current('b', { requestedAt: '2026-10-21' })); assert.equal(h.calls.page, 1); assert.equal(h.calls.metadata, 1); assert.equal(h.calls.snapshot, 0);
  await h.controller.openVersion('a'); assert.equal(h.calls.snapshot, 1); assert.equal(h.controller.getState().version.status, 'ready');
  await h.controller.compare(); assert.equal(h.calls.snapshot, 2); assert.equal(h.controller.getState().compare.status, 'ready');
  h.controller.close(); await h.controller.open(current('b')); await h.controller.openVersion('a'); assert.equal(h.calls.snapshot, 2);
  await h.controller.open(current('b', { snapshotId: undefined })); assert.equal(h.calls.metadata, 2);
});
test('8: page cap counts malformed/duplicates, pagination no metadata get, current beyond cap', async () => {
  const h = harness(); h.behavior.page = async (_p, cursor, size) => ({ docs: Array.from({ length: size }, (_, i) => i % 2 ? raw('duplicate') : { id: `bad${cursor || 0}/${i}`, data: null }), fetchedCount: size!, nextCursor: Number(cursor || 0) + size! });
  await h.controller.open(current('b')); for (let i = 0; i < 10; i++) await h.controller.paginate();
  const s = h.controller.getState(); assert.equal(s.list.fetchedCount, 100); assert.equal(h.calls.page, 5); assert.equal(h.calls.metadata, 1); assert.equal(s.list.hasMore, false); assert.equal(s.list.entries.find(e => e.id === 'b')!.kind, 'current-frozen');
  assert.ok(!JSON.stringify(s.list).includes('"ids"'));
});
test('8: failures and retry for list, version, compare; partial data never installed', async () => {
  const h = harness(); const original = h.behavior.page; h.behavior.page = async () => { throw Error(); };
  await h.controller.open(current('b')); assert.equal(h.controller.getState().list.status, 'error'); h.behavior.page = original;
  await h.controller.retry('list'); assert.equal(h.calls.page, 2); assert.equal(h.calls.metadata, 2);
  h.behavior.snapshot = async () => { throw Error(); }; await h.controller.openVersion('a'); assert.equal(h.controller.getState().version.status, 'error'); assert.equal(h.cache.size, 0);
  h.behavior.snapshot = async id => snapshot(id); await h.controller.retry('version'); assert.equal(h.controller.getState().version.status, 'ready');
  h.behavior.snapshot = async () => { throw Error(); }; await h.controller.compare(); assert.equal(h.controller.getState().compare.status, 'error'); assert.equal(h.controller.getState().compare.diff, undefined);
  h.behavior.snapshot = async id => snapshot(id); await h.controller.retry('compare'); assert.equal(h.controller.getState().compare.status, 'ready');
});
test('8: detach/re-attach preserves session/cache; dispose twice clears; new identity/session reads again', async () => {
  const h = harness(); let changes = 0; const unsubscribe = h.controller.subscribe(() => changes++);
  await h.controller.open(null); await h.controller.openVersion('a'); unsubscribe(); const at = changes;
  h.controller.close(); await h.controller.open(null); await h.controller.openVersion('a'); assert.equal(h.calls.snapshot, 1); assert.equal(changes, at);
  const off = h.controller.subscribe(() => changes++); await h.controller.openVersion('a'); assert.ok(changes > at); off();
  h.controller.dispose(); h.controller.dispose(); assert.equal(h.calls.reset, 1); assert.equal(h.cache.size, 0);
  await h.controller.open(null); await h.controller.openVersion('a'); await h.controller.compare(); await h.controller.retry('list'); h.controller.sessionChange('x', 'y'); h.controller.showMoreRows('routes'); assert.equal(h.calls.page, 2);
  const fresh = createHistoryController({ reader: h.reader, projectId: 'project', uid: 'user2' }); await fresh.open(null); await fresh.openVersion('a'); assert.equal(h.calls.snapshot, 2);
  h.behavior.page = async () => ({ docs: [ { id: 'a', data: { ...(raw('a').data as any), projectId: 'other-project' } } ], fetchedCount: 1, nextCursor: 1 });
  fresh.sessionChange('other-project', 'user2'); assert.equal(h.cache.size, 0); await fresh.open(null); await fresh.openVersion('a'); assert.equal(h.calls.snapshot, 3);
});
test('9: close cancels pending list + direct get and clears timeline/selection/token', async () => {
  for (const slot of ['page', 'metadata'] as const) {
    const h = harness(); const pending = deferred<any>(); h.behavior[slot] = () => pending.promise;
    const request = h.controller.open(current('b')); h.controller.close(); pending.resolve(slot === 'page' ? { docs: [raw()], fetchedCount: 1, nextCursor: 1 } : { status: 'found', doc: raw('b') }); await request;
    const s = h.controller.getState(); assert.equal(s.open, false); assert.deepEqual(s.selection, {}); assert.deepEqual(s.list.entries, []); assert.equal(s.list.currentLookup, undefined); assert.equal(s.staleDropped, 1);
  }
});
test('9: pending open/compare/retry/paginate dropped on close and cannot fill cache', async () => {
  for (const slot of ['open', 'compare', 'retry', 'paginate'] as const) {
    const h = harness(); await h.controller.open(current('b'));
    const pending = deferred<any>(); let request: Promise<any>;
    if (slot === 'paginate') {
      // Start again with a full page so pagination is enabled.
      h.behavior.page = async () => ({ docs: Array.from({ length: 20 }, () => raw()), fetchedCount: 20, nextCursor: 20 }); await h.controller.open(current('b'));
      h.behavior.page = () => pending.promise; request = h.controller.paginate();
    } else {
      if (slot === 'retry') { h.behavior.snapshot = async () => { throw Error(); }; await h.controller.openVersion('a'); }
      h.behavior.snapshot = () => pending.promise;
      request = slot === 'compare' ? h.controller.compare() : slot === 'retry' ? h.controller.retry('version')! : h.controller.openVersion('a');
    }
    await tick(); h.controller.close(); pending.resolve(slot === 'paginate' ? { docs: [raw()], fetchedCount: 1, nextCursor: 1 } : snapshot()); await request;
    assert.ok(h.controller.getState().staleDropped > 0); assert.equal(h.cache.size, 0); assert.equal(h.controller.getState().version.status, 'idle'); assert.equal(h.controller.getState().compare.status, 'idle');
  }
});
test('9: project/uid/dispose invalidate pending cache fills; inert after dispose', async () => {
  for (const action of ['project', 'uid', 'dispose'] as const) {
    const h = harness(); await h.controller.open(null); const pending = deferred<ApprovalSnapshot>(); h.behavior.snapshot = () => pending.promise;
    const load = h.controller.openVersion('a'); await tick();
    if (action === 'dispose') h.controller.dispose(); else h.controller.sessionChange(action === 'project' ? 'other' : 'project', action === 'uid' ? 'other' : 'user');
    pending.resolve(snapshot()); await load; assert.equal(h.cache.size, 0); assert.equal(h.controller.getState().version.data, undefined); assert.ok(h.controller.getState().staleDropped > 0);
  }
});
test('9: newer open, version, comparison, list retry and paginate supersede older requests', async () => {
  const h = harness(); const old = deferred<any>(); h.behavior.page = () => old.promise;
  const first = h.controller.open(null); h.behavior.page = async () => ({ docs: [raw('b')], fetchedCount: 1, nextCursor: 1 });
  await h.controller.open(null); old.resolve({ docs: [raw('old')], fetchedCount: 1, nextCursor: 1 }); await first; assert.deepEqual(h.controller.getState().list.entries.map(e => e.id), ['b']);
  h.behavior.page = async () => ({ docs: [raw('a'), raw('b')], fetchedCount: 2, nextCursor: 2 }); await h.controller.open(null);
  const pending = deferred<ApprovalSnapshot>(); h.behavior.snapshot = id => id === 'a' ? pending.promise : Promise.resolve(snapshot('b'));
  const a = h.controller.openVersion('a'); await tick(); await h.controller.openVersion('b'); pending.resolve(snapshot('a')); await a; assert.equal(h.controller.getState().version.id, 'b');
  const list = deferred<any>(); h.behavior.page = () => list.promise; const older = h.controller.retry('list'); h.behavior.page = async () => ({ docs: [raw('fresh')], fetchedCount: 1, nextCursor: 1 }); await h.controller.retry('list'); list.resolve({ docs: [raw('stale')], fetchedCount: 1, nextCursor: 1 }); await older; assert.deepEqual(h.controller.getState().list.entries.map(e => e.id), ['fresh']);
  assert.ok(h.controller.getState().staleDropped >= 3);
});
test('7/9: reopen does not reuse pre-cancel pending promise; resident survives', async () => {
  const h = harness(); await h.controller.open(null); await h.controller.openVersion('b');
  const old = deferred<ApprovalSnapshot>(), fresh = deferred<ApprovalSnapshot>(); let n = 0; h.behavior.snapshot = () => ++n === 1 ? old.promise : fresh.promise;
  const first = h.controller.openVersion('a'); await tick(); h.controller.close(); await h.controller.open(null); const next = h.controller.openVersion('a'); await tick(); assert.equal(n, 2);
  old.resolve(snapshot('old')); await first; assert.equal(h.cache.size, 1); assert.equal(h.controller.getState().version.status, 'loading');
  fresh.resolve(snapshot('a')); await next; assert.equal(h.controller.getState().version.data!.metadata.id, 'a'); assert.equal(h.cache.size, 2); assert.equal(h.cache.staleDropped, 1);
});

test('9: retry and pagination request ids supersede earlier responses in the same generation', async () => {
  const h = harness(); h.behavior.page = async () => ({ docs: Array.from({ length: 20 }, (_, i) => raw(`a${i}`)), fetchedCount: 20, nextCursor: 20 }); await h.controller.open(null);
  const pending = deferred<any>(); h.behavior.page = () => pending.promise; const stalePage = h.controller.paginate();
  h.behavior.page = async () => ({ docs: [raw('fresh')], fetchedCount: 1, nextCursor: 40 }); await h.controller.paginate();
  pending.resolve({ docs: [raw('stale')], fetchedCount: 1, nextCursor: 40 }); await stalePage;
  assert.equal(h.controller.getState().list.fetchedCount, 21); assert.equal(h.controller.getState().list.entries.some(e => e.id === 'stale'), false); assert.equal(h.controller.getState().staleDropped, 1);
  const retry = deferred<any>(); h.behavior.page = () => retry.promise; const oldRetry = h.controller.retry('list'); h.controller.close(); retry.resolve({ docs: [], fetchedCount: 0, nextCursor: null }); await oldRetry;
  assert.equal(h.controller.getState().staleDropped, 2); assert.equal(h.controller.getState().list.entries.length, 0);
});
test('9: superseded comparison/selection cannot install stale diff', async () => {
  const h = harness(); await h.controller.open(null); const a = deferred<ApprovalSnapshot>(); h.behavior.snapshot = id => id === 'a' ? a.promise : Promise.resolve(snapshot('b'));
  const first = h.controller.compare(); await tick(); h.controller.selectBase('b'); h.controller.selectTarget('a'); const second = h.controller.compare();
  a.resolve(snapshot('a')); await Promise.all([first, second]);
  const state = h.controller.getState(); assert.equal(state.compare.status, 'ready'); assert.equal(state.compare.baseId, 'b'); assert.equal(state.compare.targetId, 'a'); assert.equal(state.staleDropped, 1); assert.equal(h.calls.snapshot, 2);
});

test('9: newer version retry supersedes pending retry while sharing the same-generation load', async () => {
  const h = harness(); await h.controller.open(null); h.behavior.snapshot = async () => { throw Error(); }; await h.controller.openVersion('a');
  const pending = deferred<ApprovalSnapshot>(); h.behavior.snapshot = () => pending.promise;
  const first = h.controller.retry('version'), second = h.controller.retry('version'); await tick(); pending.resolve(snapshot()); await Promise.all([first, second]);
  assert.equal(h.controller.getState().staleDropped, 1); assert.equal(h.controller.getState().version.status, 'ready'); assert.equal(h.calls.snapshot, 2);
});

const fullPage = () => ({ docs: Array.from({ length: 20 }, (_, i) => raw(`p${i}`, `2026-10-${String(20 - i % 10).padStart(2, '0')}`)), fetchedCount: 20, nextCursor: { page: 2 } });
test('follow-up 2/4: append retries preserve pages, cursor, default/custom selection and rows without direct get', async () => {
  for (const custom of [false, true]) {
    const h = harness(); h.behavior.page = async () => fullPage(); await h.controller.open(current('b'));
    if (custom) { h.controller.selectBase('p3'); h.controller.selectTarget('p4'); }
    h.controller.showMoreRows('diff/routes'); h.controller.showMoreRows('version/loops');
    const before = h.controller.getState(), requests: unknown[][] = [];
    const checkPreserved = () => {
      const state = h.controller.getState();
      for (const key of ['docs', 'entries', 'cursor', 'currentLookup', 'hasMore', 'fetchedCount'] as const) assert.deepEqual(state.list[key], before.list[key]);
      assert.deepEqual(state.selection, before.selection); assert.deepEqual(state.rows, before.rows);
    };
    h.behavior.page = async (...args) => { requests.push(args); throw Error('page 2'); };
    await h.controller.paginate(); checkPreserved(); assert.equal(h.controller.getState().list.retryAppend, true);
    await h.controller.retry('list'); checkPreserved(); assert.equal(h.controller.getState().list.status, 'error');
    const pending = deferred<any>(); h.behavior.page = (...args) => { requests.push(args); return pending.promise; };
    const retry = h.controller.retry('list'); checkPreserved(); assert.equal(h.controller.getState().list.status, 'loading');
    pending.resolve({ docs: [raw('page2')], fetchedCount: 1, nextCursor: 21 }); await retry;
    assert.deepEqual(requests, Array.from({ length: 3 }, () => ['project', before.list.cursor, 20]));
    const after = h.controller.getState(); assert.equal(after.list.status, 'ready'); assert.equal(after.list.retryAppend, undefined);
    assert.equal(after.list.docs.length, 21); assert.ok(after.list.entries.some(e => e.id === 'page2'));
    assert.deepEqual(after.selection, before.selection); assert.deepEqual(after.rows, before.rows); assert.equal(h.calls.metadata, 1);
  }
});
test('follow-up 5: append resolve/reject after close, session change or dispose is discarded; marker reset on reopen', async () => {
  for (const action of ['close', 'session', 'dispose'] as const) for (const rejects of [false, true]) {
    const h = harness(); h.behavior.page = async () => fullPage(); await h.controller.open(current('b'));
    h.behavior.page = async () => { throw Error(); }; await h.controller.paginate(); assert.equal(h.controller.getState().list.retryAppend, true);
    const pending = deferred<any>(); h.behavior.page = () => pending.promise; const request = h.controller.retry('list');
    if (action === 'close') h.controller.close(); else if (action === 'session') h.controller.sessionChange('project', 'new-user'); else h.controller.dispose();
    if (rejects) pending.reject(Error('late')); else pending.resolve({ docs: [raw('late')], fetchedCount: 1, nextCursor: 21 });
    await request; const s = h.controller.getState(); assert.equal(s.list.status, 'idle'); assert.equal(s.staleDropped, 1); assert.equal(s.list.retryAppend, undefined); assert.deepEqual(s.list.entries, []);
    if (action !== 'dispose') {
      const cursors: unknown[] = []; h.behavior.page = async (_p, cursor) => { cursors.push(cursor); return fullPage(); };
      await h.controller.open(current('b')); await h.controller.retry('list'); assert.deepEqual(cursors, [undefined, undefined]);
    }
  }
});
test('follow-up 5: opening directly clears failed-append marker; overlapping append retries supersede safely', async () => {
  const h = harness(); h.behavior.page = async () => fullPage(); await h.controller.open(null);
  h.behavior.page = async () => { throw Error(); }; await h.controller.paginate();
  const old = deferred<any>(); h.behavior.page = () => old.promise; const first = h.controller.retry('list');
  h.behavior.page = async () => ({ docs: [raw('fresh')], fetchedCount: 1, nextCursor: 21 }); await h.controller.retry('list');
  old.reject(Error('stale failure')); await first; assert.equal(h.controller.getState().staleDropped, 1); assert.equal(h.controller.getState().list.status, 'ready');
  h.behavior.page = async () => fullPage(); await h.controller.open(null); h.behavior.page = async () => { throw Error(); }; await h.controller.paginate();
  let cursor: unknown = 'unset'; h.behavior.page = async (_p, c) => { cursor = c; return fullPage(); }; await h.controller.open(null);
  assert.equal(cursor, undefined); assert.equal(h.controller.getState().list.retryAppend, undefined);
});
test('follow-up 6: version and diff row expansion survives replacing the other slot', async () => {
  const h = harness(); await h.controller.open(null);
  h.controller.showMoreRows('diff/routes'); h.controller.showMoreRows('version/loops');
  const opening = h.controller.openVersion('a'); assert.deepEqual(h.controller.getState().rows, { 'diff/routes': 100 }); await opening;
  h.controller.showMoreRows('version/loops');
  const comparing = h.controller.compare(); assert.deepEqual(h.controller.getState().rows, { 'version/loops': 100 }); await comparing;
  assert.deepEqual(h.controller.getState().rows, { 'version/loops': 100 });
});
