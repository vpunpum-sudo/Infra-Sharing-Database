import { collection, doc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { RolePermissions, UserRole } from '../types';
import { DEFAULT_PERMISSIONS } from '../constants';
import { mergeWithDefaults, setRolePermissions } from './rolePermissionsStore';

// Firestore layout: rolePermissions/{role} = { permissions: { [feature]: boolean }, updatedAt, updatedBy }
const COLLECTION = 'rolePermissions';

function toSavedMap(docs: { id: string; data: () => Record<string, any> }[]) {
  const saved: Record<string, Record<string, unknown>> = {};
  docs.forEach(d => {
    const permissions = d.data().permissions;
    if (permissions && typeof permissions === 'object') saved[d.id] = permissions;
  });
  return saved;
}

/** Keep the shared store in sync with Firestore. Call after sign-in; returns an unsubscribe. */
export function startRolePermissionsSync(): () => void {
  const unsubscribe = onSnapshot(collection(db, COLLECTION), (snapshot) => {
    setRolePermissions(mergeWithDefaults(toSavedMap(snapshot.docs)));
  }, (err) => {
    console.warn('rolePermissions listener error (using defaults):', err);
  });
  return () => {
    unsubscribe();
    setRolePermissions(DEFAULT_PERMISSIONS);
  };
}

export async function loadRolePermissions(): Promise<RolePermissions> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return mergeWithDefaults(toSavedMap(snapshot.docs));
}

/** Writes every role in one batch; rejects if Firestore refuses the write. */
export async function saveRolePermissions(permissions: RolePermissions): Promise<void> {
  const batch = writeBatch(db);
  const updatedAt = new Date().toISOString();
  const updatedBy = auth.currentUser?.uid || 'unknown';
  (Object.keys(permissions) as UserRole[]).forEach(role => {
    batch.set(doc(db, COLLECTION, role), { permissions: permissions[role], updatedAt, updatedBy });
  });
  await batch.commit();
}
