import type { ApprovalSnapshotCollections, ApprovalSnapshotMetadata, ApprovalSnapshotProject, CoreOwner, DesignApproval, Project, Route } from '../types';
import { Timestamp, type FieldValue } from 'firebase/firestore';

export const snapshotCollections = ['routes', 'enclosures', 'loops', 'enclosureTypes', 'fiberTypes', 'fiberColorConfigs'] as const;
export type SnapshotCollection = typeof snapshotCollections[number];
export type SnapshotIndexChunk = { collection: SnapshotCollection; ids: string[] };
export type ApprovalSnapshot = { metadata: ApprovalSnapshotMetadata; collections: ApprovalSnapshotCollections; indexChunks: SnapshotIndexChunk[] };
export type SnapshotSourceStatus = Record<SnapshotCollection, { loaded: boolean; error?: string }>;
const INDEX_LIMIT = 256 * 1024;

export class IncompleteApprovalSnapshotError extends Error {
  constructor(detail: string) { super(`Approval snapshot is incomplete: ${detail}`); this.name = 'IncompleteApprovalSnapshotError'; }
}

export class ApprovalStateChangedError extends Error {
  constructor() { super('Approval state changed. Please reload the page and try again.'); this.name = 'ApprovalStateChangedError'; }
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const emptyIds = (): NonNullable<ApprovalSnapshotMetadata['ids']> => ({ routes: [], enclosures: [], loops: [], enclosureTypes: [], fiberTypes: [], fiberColorConfigs: [] });

export function nextApprovalId(): string { return `appr_${crypto.randomUUID()}`; }
export function nextSnapshotId(): string { return `snap_${crypto.randomUUID()}`; }

export type BackfillExpected = { approvalId: string };
export type BackfillRecord = { snapshotId: string; createdAt: string; uid: string; email: string };
export type BackfillReread = { ok: true; project: Project | null } | { ok: false };
export type BackfillFailure = 'state-changed' | 'permission-error' | 'failed';

export function backfillStateMatches(expected: BackfillExpected, project: Project | null | undefined): boolean {
  return project?.designApproval?.id === expected.approvalId && !project.designApproval.snapshotId;
}

export function planSnapshotBackfill(expected: BackfillExpected, project: Project, record: BackfillRecord,
  serverTime: Timestamp | FieldValue): Record<string, string | Timestamp | FieldValue> {
  if (!backfillStateMatches(expected, project) || record.snapshotId === expected.approvalId)
    throw new ApprovalStateChangedError();
  return {
    'designApproval.snapshotId': record.snapshotId,
    'designApproval.snapshotCreatedAt': record.createdAt,
    'designApproval.snapshotBackfilledAt': serverTime,
    'designApproval.snapshotBackfilledByUid': record.uid,
    'designApproval.snapshotBackfilledByEmail': record.email
  };
}

export function classifyBackfillFailure(code: string | undefined, expected: BackfillExpected,
  reread?: BackfillReread): BackfillFailure {
  if (code !== 'permission-denied' || !reread?.ok) return 'failed';
  return backfillStateMatches(expected, reread.project) ? 'permission-error' : 'state-changed';
}

export function firestoreErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function backfillFailureMessage(classification: BackfillFailure, code?: string, rereadFailed = false): string {
  if (classification === 'state-changed') return 'คำขอเปลี่ยนไปแล้ว (อาจมีผู้ล็อกก่อน หรือคำขอถูกยื่นใหม่/ถอยกลับ) กรุณาโหลดหน้าใหม่';
  if (classification === 'permission-error') return 'ไม่มีสิทธิ์ล็อกเอกสารนี้ (permission-denied) กรุณาติดต่อผู้ดูแลระบบ';
  return rereadFailed ? 'ล็อกเอกสารไม่สำเร็จ และตรวจสอบสาเหตุไม่ได้ กรุณากดล็อกอีกครั้ง'
    : `ล็อกเอกสารไม่สำเร็จ (${code || 'unknown'}) กรุณากดล็อกอีกครั้ง`;
}

export function backfillCommitMessage(refreshFailed: boolean): string {
  return refreshFailed ? 'ล็อกเอกสารสำเร็จแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ โปรดโหลดหน้าใหม่' : 'ล็อกเอกสารสำเร็จ';
}

export function isBackfilledApproval(approval?: DesignApproval): boolean {
  return Boolean(approval?.snapshotId && approval.snapshotId !== approval.id);
}

export function backfillLockedAt(approval?: DesignApproval): Timestamp | null {
  return approval?.snapshotBackfilledAt instanceof Timestamp ? approval.snapshotBackfilledAt : null;
}

export function resolveBackfillLocker(uid: string | undefined, email: string | undefined,
  profile?: { id?: string; displayName?: string } | null): string {
  return uid && profile?.id === uid && profile.displayName?.trim() ? profile.displayName.trim() : email || '';
}

export function formatBackfillNotice(approval: DesignApproval, locker: string): string {
  const at = backfillLockedAt(approval);
  if (!at) return 'กำลังยืนยันเวลาล็อกจากเซิร์ฟเวอร์…';
  const formatted = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(at.toDate());
  return `เอกสารนี้ถูกล็อกย้อนหลังเมื่อ ${formatted} โดย ${locker} — เนื้อหาเป็นข้อมูลโครงการ ณ เวลาที่ล็อก ไม่ใช่ข้อมูลตอนที่ยื่นขออนุมัติ`;
}

export function sourceReadiness(status: SnapshotSourceStatus): { ready: boolean; loading: boolean; errorSource?: SnapshotCollection } {
  const errorSource = snapshotCollections.find(name => Boolean(status[name].error));
  const loading = snapshotCollections.some(name => !status[name].loaded && !status[name].error);
  return { ready: !loading && !errorSource, loading, errorSource };
}

export function projectForDocument(project: Project, snapshot?: ApprovalSnapshot | null): Project {
  if (!snapshot) return project;
  const submitted = snapshot.metadata.project;
  return { ...project, name: submitted.name, routeCode: submitted.routeCode,
    owner: submitted.owner, owners: submitted.owners };
}

export function getParticipatingOwners(project: Project, routes: Route[]): CoreOwner[] {
  const owners: CoreOwner[] = [];
  const add = (owner?: string) => {
    if (!owner || owner === 'None') return;
    const value = owner.toUpperCase().trim() as CoreOwner;
    if (!owners.includes(value)) owners.push(value);
  };
  if (project.owners?.length) project.owners.forEach(add);
  else add(project.owner);
  if (!owners.length) routes.forEach(route => {
    (route.owners || route.tierSharingPartners || []).forEach(add);
    route.cores?.forEach(core => add(core.owner));
  });
  const order: Record<string, number> = { ITEL: 1, SYMC: 2, UIH: 3 };
  return owners.sort((a, b) => (order[a] || 99) - (order[b] || 99));
}

export type ApprovalFormValues = {
  designNotes: string;
  contractorName: string;
  contractorContact: string;
  contractorPhone: string;
  contractorPoNumber: string;
  contractorScope: string;
  totalOperationDistanceKm?: number;
  estimatedInstallationDate: string;
  routeEnclosureSelections: Record<string, string[]>;
};

/** A rejected approval is the starting point; only defined draft fields override it. */
export function resolveApprovalFormValues(project: Project): ApprovalFormValues {
  const approval = project.designApproval;
  const draft = !approval || approval.status === 'Rejected' ? project.approvalDraft : undefined;
  return {
    designNotes: draft?.designNotes ?? approval?.designNotes ?? '',
    contractorName: draft?.contractorName ?? approval?.contractorName ?? '',
    contractorContact: draft?.contractorContact ?? approval?.contractorContact ?? '',
    contractorPhone: draft?.contractorPhone ?? approval?.contractorPhone ?? '',
    contractorPoNumber: draft?.contractorPoNumber ?? approval?.contractorPoNumber ?? '',
    contractorScope: draft?.contractorScope ?? approval?.contractorScope ?? '',
    totalOperationDistanceKm: draft?.totalOperationDistanceKm ?? approval?.totalOperationDistanceKm,
    estimatedInstallationDate: draft?.estimatedInstallationDate ?? approval?.estimatedInstallationDate ?? '',
    routeEnclosureSelections: draft?.routeEnclosureSelections ?? approval?.routeEnclosureSelections ?? {}
  };
}

export function chooseApprovalSource(live: ApprovalSnapshotCollections, approval?: DesignApproval, snapshot?: ApprovalSnapshot | null, forForm = false): ApprovalSnapshotCollections {
  if (forForm || !approval?.snapshotId) return live;
  if (!snapshot || snapshot.metadata.id !== approval.snapshotId || snapshot.metadata.approvalId !== approval.id)
    throw new IncompleteApprovalSnapshotError('metadata');
  return snapshot.collections;
}

export function planIdIndex(ids: NonNullable<ApprovalSnapshotMetadata['ids']>): {
  ids?: NonNullable<ApprovalSnapshotMetadata['ids']>;
  idIndex?: ApprovalSnapshotMetadata['idIndex'];
  chunks: SnapshotIndexChunk[];
} {
  if (bytes(ids) <= INDEX_LIMIT) return { ids, chunks: [] };
  const chunks: SnapshotIndexChunk[] = [];
  for (const collection of snapshotCollections) {
    let current: string[] = [];
    const baseSize = bytes({ collection, ids: [] });
    let currentSize = baseSize;
    for (const id of ids[collection]) {
      const idSize = bytes(id);
      if (currentSize + idSize + (current.length ? 1 : 0) > INDEX_LIMIT) {
        if (!current.length) throw new Error(`Snapshot ID is too large: ${collection}`);
        chunks.push({ collection, ids: current });
        current = [id];
        currentSize = baseSize + idSize;
        if (currentSize > INDEX_LIMIT) throw new Error(`Snapshot ID is too large: ${collection}`);
      } else {
        currentSize += idSize + (current.length ? 1 : 0);
        current.push(id);
      }
    }
    if (current.length) chunks.push({ collection, ids: current });
  }
  return { idIndex: { mode: 'chunked', chunkCount: chunks.length }, chunks };
}

export function buildApprovalSnapshot(project: Project, approvalId: string, createdAt: string, createdByUid: string,
  participatingOwners: CoreOwner[], source: ApprovalSnapshotCollections, snapshotId = approvalId): ApprovalSnapshot {
  const collections = structuredClone(source);
  const ids = emptyIds();
  for (const collection of snapshotCollections) {
    ids[collection] = collections[collection].map(item => item.id).sort();
    if (new Set(ids[collection]).size !== ids[collection].length) throw new IncompleteApprovalSnapshotError(`duplicate ${collection} IDs`);
  }
  const index = planIdIndex(ids);
  const snapshotProject: ApprovalSnapshotProject = { name: project.name };
  if (project.routeCode !== undefined) snapshotProject.routeCode = project.routeCode;
  if (project.owner !== undefined) snapshotProject.owner = project.owner;
  if (project.owners !== undefined) snapshotProject.owners = structuredClone(project.owners);
  return {
    metadata: {
      id: snapshotId, approvalId, projectId: project.id, createdAt, createdByUid, schemaVersion: 1,
      ...(snapshotId !== approvalId ? { backfill: true as const } : {}),
      project: snapshotProject, participatingOwners: [...participatingOwners],
      ...(index.ids ? { ids: index.ids } : { idIndex: index.idIndex })
    }, collections, indexChunks: index.chunks
  };
}

export function resolveApprovalSnapshot(metadata: ApprovalSnapshotMetadata | null,
  children: ApprovalSnapshotCollections, indexChunks: Array<{ id: string; data: SnapshotIndexChunk }> = [],
  expectedIdentity?: { snapshotId: string; approvalId: string }): ApprovalSnapshot {
  if (!metadata || metadata.schemaVersion !== 1 || !metadata.id || !metadata.approvalId ||
    (expectedIdentity && (metadata.id !== expectedIdentity.snapshotId || metadata.approvalId !== expectedIdentity.approvalId)) ||
    (metadata.id !== metadata.approvalId && metadata.backfill !== true))
    throw new IncompleteApprovalSnapshotError('metadata');
  let expected: NonNullable<ApprovalSnapshotMetadata['ids']>;
  if (metadata.idIndex) {
    const count = metadata.idIndex.chunkCount;
    if (metadata.idIndex.mode !== 'chunked' || !Number.isSafeInteger(count) || count < 1 || indexChunks.length !== count || metadata.ids)
      throw new IncompleteApprovalSnapshotError('index count');
    expected = emptyIds();
    const seen = new Set<string>();
    for (const chunk of indexChunks) {
      if (!/^\d+$/.test(chunk.id) || Number(chunk.id) >= count || seen.has(chunk.id) ||
        !snapshotCollections.includes(chunk.data.collection) || !Array.isArray(chunk.data.ids) || bytes(chunk.data) > INDEX_LIMIT)
        throw new IncompleteApprovalSnapshotError('index chunk');
      seen.add(chunk.id);
      expected[chunk.data.collection].push(...chunk.data.ids);
    }
    for (let i = 0; i < count; i++) if (!seen.has(String(i))) throw new IncompleteApprovalSnapshotError('missing index chunk');
  } else {
    if (!metadata.ids || indexChunks.length || bytes(metadata.ids) > INDEX_LIMIT) throw new IncompleteApprovalSnapshotError('inline index');
    expected = metadata.ids;
  }
  for (const collection of snapshotCollections) {
    const wanted = expected[collection];
    const actual = children[collection];
    const actualIds = Array.isArray(actual) ? actual.map(item => item.id) : [];
    const actualSet = new Set(actualIds);
    if (!Array.isArray(wanted) || !Array.isArray(actual) ||
      new Set(wanted).size !== wanted.length || actualSet.size !== actual.length ||
      wanted.length !== actual.length || wanted.some(id => !actualSet.has(id)))
      throw new IncompleteApprovalSnapshotError(`${collection} IDs`);
  }
  return { metadata, collections: children, indexChunks: indexChunks.map(chunk => chunk.data) };
}

export function chunkSnapshotWrites<T>(items: T[], size = 450): T[][] {
  if (size < 1 || size > 450) throw new Error('Invalid snapshot batch size');
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export type ExpectedApprovalState = { kind: 'none' } | { kind: 'rejected'; id: string };
export function assertApprovalAttachState(expected: ExpectedApprovalState, actual?: DesignApproval): void {
  if (expected.kind === 'none' ? actual !== undefined : actual?.id !== expected.id || actual.status !== 'Rejected')
    throw new ApprovalStateChangedError();
}

export function planApprovalAttach(expected: ExpectedApprovalState, project: Project, newApproval: DesignApproval):
  Pick<Project, 'status' | 'designApproval' | 'approvalDraft'> {
  assertApprovalAttachState(expected, project.designApproval);
  if ((expected.kind === 'none' && project.status !== 'Draft' && project.status !== undefined) ||
    (expected.kind === 'rejected' && project.status !== 'Rejected')) throw new ApprovalStateChangedError();
  return { status: 'Pending Approval', designApproval: newApproval, approvalDraft: undefined };
}

export function remapApprovalDraftSelections(project: Project | undefined, routeId: string, secondRouteId: string,
  firstEnclosureIds: string[], secondEnclosureIds: string[]): NonNullable<Project['approvalDraft']> | undefined {
  if (!project || (project.designApproval && project.designApproval.status !== 'Rejected')) return undefined;
  const selections = project.approvalDraft?.routeEnclosureSelections ||
    (project.designApproval?.status === 'Rejected' ? project.designApproval.routeEnclosureSelections : undefined);
  if (!selections?.[routeId]) return undefined;
  const selected = new Set(selections[routeId]);
  return { ...project.approvalDraft, routeEnclosureSelections: {
    ...selections,
    [routeId]: firstEnclosureIds.filter(id => selected.has(id)),
    [secondRouteId]: secondEnclosureIds.filter(id => selected.has(id))
  } };
}
