export const LOG_PAGE_SIZE = 50;

export type LogPageQuerySpec<C> = {
  orderByField: 'timestamp';
  direction: 'desc';
  limit: number;
  startAfter?: C;
};

export type FetchedDoc<T, C> = { id: string; data: T; cursor: C };
export type LogRow<T> = { id: string; data: T };
export type LogPage<T, C> = { items: LogRow<T>[]; nextCursor: C | null; hasMore: boolean };
export type RequestKind = 'refresh' | 'more';

export type LogListState<T, C> = {
  rows: LogRow<T>[];
  cursor: C | null;
  hasMore: boolean;
  loaded: boolean;
  pending: { kind: RequestKind; requestId: number } | null;
  currentRequestId: number | null;
  error: { kind: RequestKind; message: string } | null;
};

export type LogListAction<T, C> =
  | { type: 'start'; kind: RequestKind; requestId: number }
  | { type: 'success'; requestId: number; page: LogPage<T, C> }
  | { type: 'failure'; requestId: number; error: string };

export function buildLogPageQuery<C>(cursor?: C | null): LogPageQuerySpec<C> {
  const spec: LogPageQuerySpec<C> = {
    orderByField: 'timestamp', direction: 'desc', limit: LOG_PAGE_SIZE + 1,
  };
  if (cursor != null) spec.startAfter = cursor;
  return spec;
}

export function splitPage<T, C>(docs: FetchedDoc<T, C>[], pageSize: number): LogPage<T, C> {
  const visible = docs.slice(0, pageSize);
  return {
    items: visible.map(({ id, data }) => ({ id, data })),
    nextCursor: visible.length ? visible[visible.length - 1].cursor : null,
    hasMore: docs.length > pageSize,
  };
}

export async function fetchLogPage<T, C>(
  fetcher: (spec: LogPageQuerySpec<C>) => Promise<FetchedDoc<T, C>[]>,
  cursor?: C | null,
): Promise<LogPage<T, C>> {
  const docs = await fetcher(buildLogPageQuery(cursor));
  return splitPage(docs, LOG_PAGE_SIZE);
}

export function mergeById<R extends { id: string }>(existing: R[], incoming: R[]): R[] {
  const seen = new Set<string>();
  return [...existing, ...incoming].filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function initialLogListState<T, C>(): LogListState<T, C> {
  return { rows: [], cursor: null, hasMore: false, loaded: false, pending: null, currentRequestId: null, error: null };
}

export function logListReducer<T, C>(state: LogListState<T, C>, action: LogListAction<T, C>): LogListState<T, C> {
  if (action.type === 'start') {
    if (action.kind === 'more' && !canLoadMore(state)) return state;
    return {
      ...state,
      pending: { kind: action.kind, requestId: action.requestId },
      currentRequestId: action.requestId,
      error: null,
    };
  }

  if (state.currentRequestId !== action.requestId || state.pending?.requestId !== action.requestId) return state;
  const kind = state.pending.kind;
  if (action.type === 'failure') {
    return { ...state, loaded: true, pending: null, error: { kind, message: action.error } };
  }

  const page = action.page;
  if (kind === 'refresh') {
    return {
      ...state, rows: mergeById([], page.items), cursor: page.nextCursor,
      hasMore: page.hasMore, loaded: true, pending: null, error: null,
    };
  }
  return {
    ...state, rows: mergeById(state.rows, page.items), cursor: page.nextCursor ?? state.cursor,
    hasMore: page.hasMore, loaded: true, pending: null, error: null,
  };
}

export function canRefresh<T, C>(state: LogListState<T, C>): boolean {
  return state.pending?.kind !== 'refresh';
}

export function canLoadMore<T, C>(state: LogListState<T, C>): boolean {
  return state.pending === null && state.hasMore && state.cursor !== null;
}

export function isEndOfList<T, C>(state: LogListState<T, C>): boolean {
  return state.loaded && state.rows.length > 0 && !state.hasMore;
}

export function shouldQueryLogs(isAdmin: boolean, adminCheckDone: boolean): boolean {
  return isAdmin && adminCheckDone;
}
