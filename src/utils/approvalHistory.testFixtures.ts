import { createHistoryController, type HistoryReader } from './approvalHistoryController';
import { createSnapshotCache } from './approvalSnapshotCache';
import type { ApprovalSnapshot } from './approvalSnapshot';
import type { CurrentLookup } from './approvalHistory';
import type { ApprovalSnapshotCollections, Project } from '../types';
import { buildApprovalSnapshot } from './approvalSnapshot';
import { summarizeCurrentApproval, type CurrentApproval, type RawMetadataDoc } from './approvalHistory';
export const time = '2026-10-20T12:00:00Z';
export const project: Project = { id: 'project', uid: 'user-private', name: 'Synthetic private project', routeCode: 'ROUTE-QA', owners: ['ITEL'] };
export const source = (): ApprovalSnapshotCollections => ({ routes: [], enclosures: [], loops: [], enclosureTypes: [], fiberTypes: [], fiberColorConfigs: [] });
export const snapshot = (id = 'a', at = time, approvalId = id) => buildApprovalSnapshot(project, approvalId, at, 'user-private', ['ITEL'], source(), id);
export const raw = (id = 'a', at = time): RawMetadataDoc => ({ id, data: snapshot(id, at).metadata });
export const current = (id = 'a', overrides: Partial<CurrentApproval> = {}): CurrentApproval => ({ id, snapshotId: id, documentNumber: 'PRIVATE-DOC', status: 'Pending Approval', stageText: 'Planning', requestedAt: time, requestedBy: 'Synthetic requester', backfilled: false, ...overrides });
export const projectWithApproval = (id = 'a'): Project => ({ ...project, designApproval: { id, snapshotId: id, documentNumber: 'PRIVATE-DOC', status: 'Pending Approval', requestedAt: time, requestedBy: 'Synthetic requester', requestedByUid: 'user-private' } });
export function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason?: any) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { resolve, reject, promise }; }
export const tick = () => new Promise<void>(resolve => setImmediate(resolve));

export function harness() {
  const calls = { page: 0, metadata: 0, snapshot: 0, cancel: 0, reset: 0 };
  const cache = createSnapshotCache<ApprovalSnapshot>();
  const behavior = {
    page: async (project: string, cursor?: unknown, size?: number) => ({ docs: [raw('a'), raw('b', '2026-10-21')], fetchedCount: 2, nextCursor: 2 as unknown }),
    metadata: async (): Promise<CurrentLookup> => ({ status: 'found', doc: raw('b', '2026-10-21') }),
    snapshot: async (id: string) => snapshot(id),
  };
  const reader: HistoryReader = {
    listPage(project, cursor, size) { calls.page++; return behavior.page(project, cursor, size); },
    getSnapshotMetadata() { calls.metadata++; return behavior.metadata(); },
    loadSnapshot(project, id, approvalId, uid) { return cache.load(JSON.stringify([uid, project, id]), () => { calls.snapshot++; return behavior.snapshot(id); }); },
    cancelPending() { calls.cancel++; cache.cancelPending(); },
    resetSession() { calls.reset++; cache.resetSession(); },
  };
  const controller = createHistoryController({ reader, projectId: 'project', uid: 'user' });
  return { calls, cache, behavior, reader, controller };
}
