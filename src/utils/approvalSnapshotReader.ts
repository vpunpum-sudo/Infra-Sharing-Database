import type { ApprovalSnapshotCollections, ApprovalSnapshotMetadata } from '../types';
import { IncompleteApprovalSnapshotError, resolveApprovalSnapshot, snapshotCollections, type SnapshotIndexChunk } from './approvalSnapshot';
import { parseSnapshotMetadata, type RawMetadataDoc } from './approvalHistory';
export function assembleSnapshotFromDocs(projectId: string, snapshotId: string, approvalId: string,
  metadataDoc: RawMetadataDoc | null, indexDocs: RawMetadataDoc[], childDocs: Record<string, RawMetadataDoc[]>) {
  const m = metadataDoc?.data as ApprovalSnapshotMetadata;
  if (!metadataDoc || metadataDoc.id !== snapshotId || !parseSnapshotMetadata(snapshotId, m, projectId).ok || m.approvalId !== approvalId)
    throw new IncompleteApprovalSnapshotError('metadata identity');
  const index = indexDocs.map(d => {
    const w = d.data as any;
    if (!w || w.projectId !== projectId || w.approvalId !== approvalId) throw new IncompleteApprovalSnapshotError('index identity');
    return { id: d.id, data: w as SnapshotIndexChunk };
  });
  const children = {} as ApprovalSnapshotCollections;
  for (const name of snapshotCollections) {
    if (!Array.isArray(childDocs[name])) throw new IncompleteApprovalSnapshotError(`${name} missing`);
    (children as any)[name] = childDocs[name].map(d => {
      const w = d.data as any;
      if (!w || w.projectId !== projectId || w.approvalId !== approvalId || w.data?.id !== d.id) throw new IncompleteApprovalSnapshotError(`${name} identity`);
      return w.data;
    });
  }
  return resolveApprovalSnapshot(m, children, index, { snapshotId, approvalId });
}
