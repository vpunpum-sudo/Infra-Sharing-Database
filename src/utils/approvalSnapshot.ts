import type { ApprovalSnapshotCollections, ApprovalSnapshotMetadata, ApprovalSnapshotProject, CoreOwner, DesignApproval, Project, Route } from '../types';

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
  if (!snapshot || snapshot.metadata.approvalId !== approval.snapshotId) throw new IncompleteApprovalSnapshotError('metadata');
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
  participatingOwners: CoreOwner[], source: ApprovalSnapshotCollections): ApprovalSnapshot {
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
      id: approvalId, approvalId, projectId: project.id, createdAt, createdByUid, schemaVersion: 1,
      project: snapshotProject, participatingOwners: [...participatingOwners],
      ...(index.ids ? { ids: index.ids } : { idIndex: index.idIndex })
    }, collections, indexChunks: index.chunks
  };
}

export function resolveApprovalSnapshot(metadata: ApprovalSnapshotMetadata | null,
  children: ApprovalSnapshotCollections, indexChunks: Array<{ id: string; data: SnapshotIndexChunk }> = []): ApprovalSnapshot {
  if (!metadata || metadata.schemaVersion !== 1 || !metadata.id || metadata.id !== metadata.approvalId)
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
