import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOG_PAGE_SIZE,
  buildLogPageQuery,
  fetchLogPage,
  splitPage,
  mergeById,
  initialLogListState,
  logListReducer,
  canRefresh,
  canLoadMore,
  isEndOfList,
  shouldQueryLogs,
  type FetchedDoc,
  type LogListState,
  type LogPage,
} from './logPagination';

type Datum = { value: number };
type Cursor = string;
const doc = (id: string): FetchedDoc<Datum, Cursor> => ({ id, data: { value: Number(id.replace(/\D/g, '')) }, cursor: `cursor-${id}` });
const docs = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => doc(`${prefix}${index + 1}`));
const page = (ids: string[], nextCursor: Cursor | null, hasMore: boolean): LogPage<Datum, Cursor> => ({
  items: ids.map(id => ({ id, data: doc(id).data })), nextCursor, hasMore,
});
const seeded = (count: number, cursor = 'X'): LogListState<Datum, Cursor> => ({
  ...initialLogListState<Datum, Cursor>(),
  rows: docs('a', count).map(({ id, data }) => ({ id, data })),
  cursor, hasMore: true, loaded: true,
});

test('first page uses one bounded timestamp-desc query without a cursor', async () => {
  assert.equal(LOG_PAGE_SIZE, 50);
  assert.deepEqual(buildLogPageQuery(), { orderByField: 'timestamp', direction: 'desc', limit: 51 });
  const seen: unknown[] = [];
  await fetchLogPage<Datum, Cursor>(async spec => { seen.push(spec); return docs('a', 1); });
  assert.deepEqual(seen, [{ orderByField: 'timestamp', direction: 'desc', limit: 51 }]);
});

test('next page uses one bounded timestamp-desc query after the supplied cursor', async () => {
  const expected = { orderByField: 'timestamp', direction: 'desc', limit: 51, startAfter: 'boundary' };
  assert.deepEqual(buildLogPageQuery('boundary'), expected);
  const seen: unknown[] = [];
  await fetchLogPage<Datum, Cursor>(async spec => { seen.push(spec); return docs('b', 1); }, 'boundary');
  assert.deepEqual(seen, [expected]);
});

test('page split hides the lookahead document and uses the final visible cursor', () => {
  for (const [count, visible, hasMore, cursor] of [
    [0, 0, false, null], [12, 12, false, 'cursor-a12'],
    [50, 50, false, 'cursor-a50'], [51, 50, true, 'cursor-a50'],
  ] as const) {
    const result = splitPage(docs('a', count), 50);
    assert.equal(result.items.length, visible);
    assert.equal(result.hasMore, hasMore);
    assert.equal(result.nextCursor, cursor);
    assert.equal(result.items.some(item => item.id === 'a51'), false);
  }
});

test('fetchLogPage returns the bounded split page', async () => {
  const result = await fetchLogPage<Datum, Cursor>(async () => docs('a', 51));
  assert.equal(result.items.length, 50);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, 'cursor-a50');
});

test('refresh success replaces 120 rows and cursor with the new page', () => {
  const pending = logListReducer(seeded(120), { type: 'start', kind: 'refresh', requestId: 1 });
  const result = logListReducer(pending, { type: 'success', requestId: 1, page: page(docs('b', 50).map(d => d.id), 'Y', true) });
  assert.equal(result.rows.length, 50);
  assert.equal(result.rows[0].id, 'b1');
  assert.equal(result.cursor, 'Y');
  assert.equal(result.hasMore, true);
  assert.equal(result.error, null);
});

test('refresh de-duplicates within the new page and keeps its first occurrence', () => {
  const pending = logListReducer(seeded(2), { type: 'start', kind: 'refresh', requestId: 1 });
  const result = logListReducer(pending, { type: 'success', requestId: 1, page: {
    items: [{ id: 'x', data: { value: 1 } }, { id: 'x', data: { value: 2 } }], nextCursor: 'Y', hasMore: false,
  } });
  assert.deepEqual(result.rows, [{ id: 'x', data: { value: 1 } }]);
});

test('load more appends 49 new ids and keeps the first a50', () => {
  const pending = logListReducer(seeded(50), { type: 'start', kind: 'more', requestId: 2 });
  const incoming = ['a50', ...docs('b', 49).map(d => d.id)];
  const nextPage = page(incoming, 'Y', true);
  nextPage.items[0].data.value = 999;
  const result = logListReducer(pending, { type: 'success', requestId: 2, page: nextPage });
  assert.deepEqual(result.rows.map(row => row.id), [...docs('a', 50).map(d => d.id), ...docs('b', 49).map(d => d.id)]);
  assert.equal(result.rows.find(row => row.id === 'a50')?.data.value, 50);
  assert.equal(result.cursor, 'Y');
  assert.equal(mergeById([{ id: 'x', value: 1 }], [{ id: 'x', value: 2 }])[0].value, 1);
});

test('end of list stops further load-more requests', () => {
  const pending = logListReducer(seeded(50), { type: 'start', kind: 'more', requestId: 1 });
  const result = logListReducer(pending, { type: 'success', requestId: 1, page: page(['b1'], 'Y', false) });
  assert.equal(result.rows.length, 51);
  assert.equal(result.hasMore, false);
  assert.equal(isEndOfList(result), true);
  assert.strictEqual(logListReducer(result, { type: 'start', kind: 'more', requestId: 2 }), result);
});

test('refresh supersedes load more regardless of completion order', () => {
  for (const order of ['older-first', 'newer-first']) {
    let state = logListReducer(seeded(50), { type: 'start', kind: 'more', requestId: 1 });
    state = logListReducer(state, { type: 'start', kind: 'refresh', requestId: 2 });
    assert.equal(state.rows.length, 50);
    assert.deepEqual(state.pending, { kind: 'refresh', requestId: 2 });
    const older = { type: 'success', requestId: 1, page: page(['b1'], 'old', false) } as const;
    const newer = { type: 'success', requestId: 2, page: page(['c1'], 'new', false) } as const;
    if (order === 'older-first') {
      assert.strictEqual(logListReducer(state, older), state);
      state = logListReducer(logListReducer(state, older), newer);
    } else {
      state = logListReducer(state, newer);
      assert.strictEqual(logListReducer(state, older), state);
    }
    assert.deepEqual(state.rows.map(row => row.id), ['c1']);
    assert.equal(state.cursor, 'new');
  }
});

test('outdated load-more failure does not disturb a pending refresh', () => {
  let state = logListReducer(seeded(50), { type: 'start', kind: 'more', requestId: 1 });
  state = logListReducer(state, { type: 'start', kind: 'refresh', requestId: 2 });
  assert.strictEqual(logListReducer(state, { type: 'failure', requestId: 1, error: 'Failed' }), state);
  assert.deepEqual(state.pending, { kind: 'refresh', requestId: 2 });
  assert.equal(state.error, null);
});

test('load-more failure preserves rows, cursor, and hasMore, then permits retry', () => {
  const before = seeded(50);
  let state = logListReducer(before, { type: 'start', kind: 'more', requestId: 3 });
  state = logListReducer(state, { type: 'failure', requestId: 3, error: 'Could not load logs.' });
  assert.deepEqual(state.rows, before.rows);
  assert.equal(state.cursor, 'X');
  assert.equal(state.hasMore, true);
  assert.deepEqual(state.error, { kind: 'more', message: 'Could not load logs.' });
  assert.equal(state.pending, null);
  assert.equal(canLoadMore(state), true);
  state = logListReducer(state, { type: 'start', kind: 'more', requestId: 5 });
  state = logListReducer(state, { type: 'success', requestId: 5, page: page(['b1'], 'Y', false) });
  assert.equal(state.rows.length, 51);
  assert.equal(state.error, null);
});

test('refresh failure preserves rows and cursor, then permits retry', () => {
  const before = seeded(80);
  let state = logListReducer(before, { type: 'start', kind: 'refresh', requestId: 4 });
  state = logListReducer(state, { type: 'failure', requestId: 4, error: 'Could not load logs.' });
  assert.deepEqual(state.rows, before.rows);
  assert.equal(state.cursor, 'X');
  assert.equal(state.hasMore, true);
  assert.deepEqual(state.error, { kind: 'refresh', message: 'Could not load logs.' });
  assert.equal(canRefresh(state), true);
  state = logListReducer(state, { type: 'start', kind: 'refresh', requestId: 6 });
  state = logListReducer(state, { type: 'success', requestId: 6, page: page(['b1'], 'Y', false) });
  assert.deepEqual(state.rows.map(row => row.id), ['b1']);
  assert.equal(state.error, null);
});

test('load-more success keeps the old cursor when the page has no cursor', () => {
  const pending = logListReducer(seeded(50), { type: 'start', kind: 'more', requestId: 1 });
  const result = logListReducer(pending, { type: 'success', requestId: 1, page: page([], null, false) });
  assert.equal(result.cursor, 'X');
  assert.equal(result.hasMore, false);
});

test('initial-load failure is visible and retryable with zero rows', () => {
  let state = logListReducer(initialLogListState<Datum, Cursor>(), { type: 'start', kind: 'refresh', requestId: 1 });
  state = logListReducer(state, { type: 'failure', requestId: 1, error: 'Could not load logs.' });
  assert.equal(state.rows.length, 0);
  assert.equal(state.error?.kind, 'refresh');
  assert.equal(state.loaded, true);
  assert.equal(canRefresh(state), true);
});

test('button selectors and start guards match pending and idle states', () => {
  const idle = seeded(50);
  assert.equal(canRefresh(idle), true);
  assert.equal(canLoadMore(idle), true);
  const refreshing = logListReducer(idle, { type: 'start', kind: 'refresh', requestId: 1 });
  assert.equal(canRefresh(refreshing), false);
  assert.equal(canLoadMore(refreshing), false);
  assert.strictEqual(logListReducer(refreshing, { type: 'start', kind: 'more', requestId: 2 }), refreshing);
  const loadingMore = logListReducer(idle, { type: 'start', kind: 'more', requestId: 1 });
  assert.equal(canRefresh(loadingMore), true);
  assert.equal(canLoadMore(loadingMore), false);
  assert.strictEqual(logListReducer(loadingMore, { type: 'start', kind: 'more', requestId: 2 }), loadingMore);
  assert.equal(canLoadMore({ ...idle, cursor: null }), false);
  assert.equal(canLoadMore({ ...idle, hasMore: false }), false);
});

test('only a completed admin check for an admin permits querying logs', () => {
  assert.equal(shouldQueryLogs(false, false), false);
  assert.equal(shouldQueryLogs(true, false), false);
  assert.equal(shouldQueryLogs(false, true), false);
  assert.equal(shouldQueryLogs(true, true), true);
});
