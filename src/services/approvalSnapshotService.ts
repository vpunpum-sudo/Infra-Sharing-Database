import { collection, doc, getDoc, getDocFromServer, getDocs, runTransaction, setDoc, writeBatch, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { ApprovalSnapshotCollections, ApprovalSnapshotMetadata, DesignApproval, Project, User } from '../types';
import { ApprovalStateChangedError, chunkSnapshotWrites, IncompleteApprovalSnapshotError, planApprovalAttach,
  planSnapshotBackfill, resolveApprovalSnapshot, snapshotCollections, type ApprovalSnapshot, type BackfillExpected,
  type BackfillRecord, type BackfillReread, type ExpectedApprovalState, type SnapshotIndexChunk } from '../utils/approvalSnapshot';

const snapshotPath = (projectId: string, approvalId: string) => `projects/${projectId}/approvalSnapshots/${approvalId}`;

export async function writeApprovalSnapshot(snapshot: ApprovalSnapshot): Promise<void> {
  const { metadata, collections, indexChunks } = snapshot;
  const base = snapshotPath(metadata.projectId, metadata.id);
  await setDoc(doc(db, base), metadata);
  for (const [i, chunk] of indexChunks.entries()) {
    await setDoc(doc(db, `${base}/index/${i}`), { ...chunk, projectId: metadata.projectId, approvalId: metadata.approvalId });
  }
  const children = snapshotCollections.flatMap(collectionName =>
    collections[collectionName].map(item => ({ collectionName, item })));
  for (const group of chunkSnapshotWrites(children)) {
    const batch = writeBatch(db);
    for (const { collectionName, item } of group) {
      batch.set(doc(db, `${base}/${collectionName}/${item.id}`), {
        projectId: metadata.projectId, approvalId: metadata.approvalId, data: item
      });
    }
    await batch.commit();
  }
}

export async function readApprovalSnapshot(projectId: string, snapshotId: string, approvalId: string): Promise<ApprovalSnapshot> {
  const base = snapshotPath(projectId, snapshotId);
  const metadataDoc = await getDoc(doc(db, base));
  if (!metadataDoc.exists()) throw new IncompleteApprovalSnapshotError('missing metadata');
  const metadata = metadataDoc.data() as ApprovalSnapshotMetadata;
  if (metadata.projectId !== projectId || metadata.approvalId !== approvalId || metadataDoc.id !== snapshotId || metadata.id !== snapshotId)
    throw new IncompleteApprovalSnapshotError('metadata identity');
  const [indexSnap, ...childSnaps] = await Promise.all([
    getDocs(collection(db, `${base}/index`)),
    ...snapshotCollections.map(name => getDocs(collection(db, `${base}/${name}`)))
  ]);
  const indexChunks = indexSnap.docs.map(d => ({ id: d.id, data: d.data() as SnapshotIndexChunk }));
  for (const chunk of indexSnap.docs) {
    if (chunk.data().projectId !== projectId || chunk.data().approvalId !== approvalId)
      throw new IncompleteApprovalSnapshotError('index identity');
  }
  const children = {} as ApprovalSnapshotCollections;
  for (const [i, name] of snapshotCollections.entries()) {
    const values = childSnaps[i].docs.map(d => {
      const wrapper = d.data();
      if (wrapper.projectId !== projectId || wrapper.approvalId !== approvalId || wrapper.data?.id !== d.id)
        throw new IncompleteApprovalSnapshotError(`${name} identity`);
      return wrapper.data;
    });
    // Each collection is loaded independently; the resolver compares document IDs exactly.
    (children as unknown as Record<string, unknown>)[name] = values;
  }
  return resolveApprovalSnapshot(metadata, children, indexChunks, { snapshotId, approvalId });
}

export async function backfillApprovalSnapshot(projectId: string, expected: BackfillExpected,
  record: BackfillRecord): Promise<void> {
  await runTransaction(db, async transaction => {
    const projectRef = doc(db, `projects/${projectId}`);
    const current = await transaction.get(projectRef);
    if (!current.exists()) throw new ApprovalStateChangedError();
    const patch = planSnapshotBackfill(expected, current.data() as Project, record, serverTimestamp());
    transaction.update(projectRef, patch);
  });
}

export async function rereadProjectForBackfill(projectId: string): Promise<BackfillReread> {
  try {
    const fresh = await getDocFromServer(doc(db, `projects/${projectId}`));
    return { ok: true, project: fresh.exists() ? { ...fresh.data(), id: fresh.id } as Project : null };
  } catch {
    return { ok: false };
  }
}

export async function readBackfillLockerProfile(uid: string): Promise<Pick<User, 'id' | 'displayName'> | null> {
  const profile = await getDoc(doc(db, `users/${uid}`));
  return profile.exists() ? { ...profile.data(), id: profile.id } as User : null;
}

export async function attachApprovalSnapshot(projectId: string, expected: ExpectedApprovalState,
  newApproval: DesignApproval): Promise<void> {
  await runTransaction(db, async transaction => {
    const projectRef = doc(db, `projects/${projectId}`);
    const current = await transaction.get(projectRef);
    if (!current.exists()) throw new ApprovalStateChangedError();
    const data = current.data() as Project;
    const patch = planApprovalAttach(expected, data, newApproval);
    transaction.update(projectRef, {
      status: patch.status, designApproval: patch.designApproval, approvalDraft: deleteField()
    });
  });
}
