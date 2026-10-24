import { buildApprovalTimeline, parseSnapshotMetadata, pickDefaultComparison, HISTORY_PAGE_SIZE, MAX_FETCHED_DOCS, HISTORY_ROW_CAP, type CurrentApproval, type CurrentLookup, type RawMetadataDoc, type TimelineEntry } from './approvalHistory';
import type { ApprovalSnapshot } from './approvalSnapshot';
import { diffApprovalSnapshots, type SnapshotDiff } from './approvalSnapshotDiff';
export type HistoryReader = {
  listPage(projectId: string, cursor?: unknown, pageSize?: number): Promise<{ docs: RawMetadataDoc[]; nextCursor: unknown; fetchedCount: number }>;
  getSnapshotMetadata(projectId: string, snapshotId: string): Promise<CurrentLookup>;
  loadSnapshot(projectId: string, snapshotId: string, approvalId: string, uid?: string): Promise<ApprovalSnapshot>;
  cancelPending(): void; resetSession(): void;
};
type Status = 'idle' | 'loading' | 'ready' | 'error';
export type HistoryState = {
  session: { projectId: string; uid?: string }; generation: number; open: boolean; staleDropped: number;
  list: { status: Status; entries: TimelineEntry[]; docs: RawMetadataDoc[]; fetchedCount: number; cursor?: unknown; hasMore: boolean; error?: string; requestId: number; currentLookup?: CurrentLookup; retryAppend?: boolean };
  selection: { viewId?: string; baseId?: string; targetId?: string };
  version: { status: Status; id?: string; data?: ApprovalSnapshot; error?: string; requestId: number };
  compare: { status: Status; baseId?: string; targetId?: string; diff?: SnapshotDiff; error?: string; requestId: number };
  rows: Record<string, number>;
};
export function initialHistoryState(projectId: string, uid?: string, generation = 0, staleDropped = 0): HistoryState {
  return { session: { projectId, uid }, generation, open: false, staleDropped,
    list: { status: 'idle', entries: [], docs: [], fetchedCount: 0, hasMore: false, requestId: 0 }, selection: {},
    version: { status: 'idle', requestId: 0 }, compare: { status: 'idle', requestId: 0 }, rows: {} };
}
export type HistoryAction = { type: 'replace'; state: HistoryState } | { type: 'stale' } | { type: 'showMoreRows'; key: string };
export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'replace') return action.state;
  if (action.type === 'stale') return { ...state, staleDropped: state.staleDropped + 1 };
  return { ...state, rows: { ...state.rows, [action.key]: Math.min(HISTORY_ROW_CAP, (state.rows[action.key] || 50) + 50) } };
}
const withoutRows = (rows: Record<string, number>, keep: (key: string) => boolean) => Object.fromEntries(Object.entries(rows).filter(([key]) => keep(key)));
export function createHistoryController({ reader, projectId, uid, onChange }: { reader: HistoryReader; projectId: string; uid?: string; onChange?: () => void }) {
  let state = initialHistoryState(projectId, uid), current: CurrentApproval | null = null, disposed = false;
  const listeners = new Set<() => void>();
  const emit = () => { onChange?.(); for (const fn of listeners) fn(); };
  const replace = (next: HistoryState) => { state = historyReducer(state, { type: 'replace', state: next }); emit(); };
  const valid = (generation: number, slot: 'list' | 'version' | 'compare', requestId: number) => {
    if (!disposed && state.open && state.generation === generation && state[slot].requestId === requestId) return true;
    state = historyReducer(state, { type: 'stale' }); if (!disposed) emit(); return false;
  };
  function clear(reset: boolean) {
    if (reset) reader.resetSession(); else reader.cancelPending();
    current = null; replace(initialHistoryState(state.session.projectId, state.session.uid, state.generation + 1, state.staleDropped));
  }
  async function listRequested(append = false) {
    if (disposed || !state.open || append && (!state.list.hasMore || state.list.fetchedCount >= MAX_FETCHED_DOCS)) return;
    const generation = state.generation, requestId = state.list.requestId + 1;
    const prior = state.list, summary = current, session = state.session;
    replace({ ...state, list: { ...prior, status: 'loading', requestId, error: undefined } });
    try {
      const [page, lookup] = await Promise.all([
        reader.listPage(session.projectId, append ? prior.cursor : undefined, Math.min(HISTORY_PAGE_SIZE, MAX_FETCHED_DOCS - (append ? prior.fetchedCount : 0))),
        !append && summary?.snapshotId ? reader.getSnapshotMetadata(session.projectId, summary.snapshotId).catch(() => ({ status: 'error' as const })) : Promise.resolve(append ? prior.currentLookup : undefined),
      ]);
      if (!valid(generation, 'list', requestId)) return;
      const sanitizedDocs = page.docs.map(d => {
        const parsed = parseSnapshotMetadata(d.id, d.data, session.projectId);
        return { id: d.id, data: parsed.ok ? parsed.meta : null };
      });
      const docs = append ? [...prior.docs, ...sanitizedDocs] : sanitizedDocs;
      const count = (append ? prior.fetchedCount : 0) + page.fetchedCount;
      // Validate the direct get against the session project before timeline construction.
      let checkedLookup = lookup;
      if (lookup?.status === 'found') {
        const parsed = parseSnapshotMetadata(lookup.doc.id, lookup.doc.data, session.projectId);
        checkedLookup = parsed.ok ? { status: 'found', doc: { id: lookup.doc.id, data: parsed.meta } } : { status: 'error' };
      }
      const entries = buildApprovalTimeline(summary, docs.map(d => ({ id: d.id, parsed: parseSnapshotMetadata(d.id, d.data, session.projectId) })), session.uid, checkedLookup, session.projectId);
      const picks = pickDefaultComparison(entries);
      replace({ ...state, list: { status: 'ready', entries, docs, fetchedCount: count, cursor: page.nextCursor, hasMore: page.fetchedCount === HISTORY_PAGE_SIZE && count < MAX_FETCHED_DOCS, requestId, currentLookup: checkedLookup }, selection: append ? state.selection : { ...picks } });
    } catch {
      if (valid(generation, 'list', requestId)) replace({ ...state, list: { ...prior, status: 'error', requestId, retryAppend: append, error: 'โหลดประวัติคำขอไม่สำเร็จ' } });
    }
  }
  async function openVersion(id: string) {
    if (disposed || !state.open) return;
    const entry = state.list.entries.find(e => e.id === id && e.openable); if (!entry?.meta) return;
    const generation = state.generation, requestId = state.version.requestId + 1, session = state.session;
    replace({ ...state, selection: { ...state.selection, viewId: id }, version: { status: 'loading', id, requestId }, rows: withoutRows(state.rows, key => key.startsWith('diff/')) });
    try {
      const data = await reader.loadSnapshot(session.projectId, id, entry.meta.approvalId, session.uid);
      if (valid(generation, 'version', requestId)) replace({ ...state, version: { status: 'ready', id, data, requestId } });
    } catch { if (valid(generation, 'version', requestId)) replace({ ...state, version: { status: 'error', id, requestId, error: 'โหลดเวอร์ชันไม่สำเร็จ ข้อมูลอาจไม่ครบ กรุณาลองอีกครั้ง' } }); }
  }
  async function compare() {
    if (disposed || !state.open) return;
    const { baseId, targetId } = state.selection;
    const a = state.list.entries.find(e => e.id === baseId && e.comparable), b = state.list.entries.find(e => e.id === targetId && e.comparable);
    if (!a?.meta || !b?.meta || baseId === targetId) return;
    const generation = state.generation, requestId = state.compare.requestId + 1, session = state.session;
    replace({ ...state, compare: { status: 'loading', baseId, targetId, requestId }, rows: withoutRows(state.rows, key => key.startsWith('version/')) });
    try {
      const [left, right] = await Promise.all([reader.loadSnapshot(session.projectId, a.id, a.meta.approvalId, session.uid), reader.loadSnapshot(session.projectId, b.id, b.meta.approvalId, session.uid)]);
      if (valid(generation, 'compare', requestId)) replace({ ...state, compare: { status: 'ready', baseId, targetId, diff: diffApprovalSnapshots(left, right), requestId } });
    } catch { if (valid(generation, 'compare', requestId)) replace({ ...state, compare: { status: 'error', baseId, targetId, requestId, error: 'เปรียบเทียบไม่สำเร็จ ข้อมูลอาจไม่ครบ กรุณาลองอีกครั้ง' } }); }
  }
  const select = (key: 'baseId' | 'targetId', id: string) => {
    if (disposed || !state.open || !state.list.entries.some(e => e.id === id && e.comparable)) return;
    replace({ ...state, selection: { ...state.selection, [key]: id }, compare: { status: 'idle', requestId: state.compare.requestId + 1 } });
  };
  return {
    getState: () => state,
    subscribe(fn: () => void) { if (!disposed) listeners.add(fn); return () => { listeners.delete(fn); }; },
    open(summary: CurrentApproval | null) { if (disposed) return; reader.cancelPending(); current = summary; replace({ ...initialHistoryState(state.session.projectId, state.session.uid, state.generation + 1, state.staleDropped), open: true }); return listRequested(); },
    close() { if (!disposed) clear(false); },
    sessionChange(project: string, user?: string) { if (disposed) return; clear(true); replace(initialHistoryState(project, user, state.generation, state.staleDropped)); },
    dispose() { if (disposed) return; clear(true); disposed = true; listeners.clear(); },
    listRequested, paginate: () => listRequested(true), openVersion, compare,
    retry(slot: 'list' | 'version' | 'compare') { if (disposed || !state.open) return; return slot === 'list' ? listRequested(state.list.retryAppend === true) : slot === 'version' ? openVersion(state.selection.viewId!) : compare(); },
    selectBase: (id: string) => select('baseId', id), selectTarget: (id: string) => select('targetId', id),
    showMoreRows(key: string) { if (!disposed && state.open) { state = historyReducer(state, { type: 'showMoreRows', key }); emit(); } },
  };
}
export type HistoryController = ReturnType<typeof createHistoryController>;
