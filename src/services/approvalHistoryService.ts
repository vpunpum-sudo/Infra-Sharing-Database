import { collection, doc, getDoc, getDocs, query, orderBy, limit, startAfter, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { snapshotCollections, type ApprovalSnapshot } from '../utils/approvalSnapshot';
import { assembleSnapshotFromDocs } from '../utils/approvalSnapshotReader';
import { createSnapshotCache } from '../utils/approvalSnapshotCache';
import type { HistoryReader } from '../utils/approvalHistoryController';
export function createApprovalHistoryReader(): HistoryReader {
  const cache = createSnapshotCache<ApprovalSnapshot>();
  const path = (project: string, snapshot: string) => `projects/${project}/approvalSnapshots/${snapshot}`;
  return {
    async listPage(projectId, cursor, pageSize = 20) {
      const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
      if (cursor) constraints.push(startAfter(cursor as QueryDocumentSnapshot));
      const result = await getDocs(query(collection(db, `projects/${projectId}/approvalSnapshots`), ...constraints));
      return { docs: result.docs.map(d => ({ id: d.id, data: d.data() })), nextCursor: result.docs.at(-1), fetchedCount: result.size };
    },
    async getSnapshotMetadata(projectId, snapshotId) {
      try { const d = await getDoc(doc(db, path(projectId, snapshotId))); return d.exists() ? { status: 'found', doc: { id: d.id, data: d.data() } } : { status: 'missing' }; }
      catch { return { status: 'error' }; }
    },
    loadSnapshot(projectId, snapshotId, approvalId, uid) {
      return cache.load(JSON.stringify([uid, projectId, snapshotId]), async () => {
        const base = path(projectId, snapshotId);
        const metadata = await getDoc(doc(db, base));
        const [index, ...children] = await Promise.all([getDocs(collection(db, `${base}/index`)), ...snapshotCollections.map(name => getDocs(collection(db, `${base}/${name}`)))]);
        const docs = (snap: typeof index) => snap.docs.map(d => ({ id: d.id, data: d.data() }));
        return assembleSnapshotFromDocs(projectId, snapshotId, approvalId, metadata.exists() ? { id: metadata.id, data: metadata.data() } : null,
          docs(index), Object.fromEntries(snapshotCollections.map((name, i) => [name, docs(children[i])])));
      });
    },
    cancelPending: cache.cancelPending, resetSession: cache.resetSession,
  };
}
