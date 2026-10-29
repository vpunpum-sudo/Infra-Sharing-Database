import { describeActionError } from '../utils/asyncAction';
import { PHOTO_MESSAGES, avatarObjectPath, checkPersistableUrl, describePhotoError, managedObjectPath, PhotoError } from '../utils/profilePhoto';

export interface PhotoCheckpoint {
  kind: 'upload' | 'remove';
  blob?: Blob;
  objectPath?: string;
  uploadedUrl?: string;
  authUpdated: boolean;
  firestoreUpdated: boolean;
  previousUrl: string;
}
export interface PhotoDependencies {
  uid: string;
  bucket: string;
  newObjectName: () => string;
  uploadBytes: (path: string, blob: Blob) => Promise<unknown>;
  getDownloadURL: (path: string) => Promise<string>;
  updateAuthPhoto: (url: string | null) => Promise<unknown>;
  writeUserPhoto: (url: string) => Promise<unknown>;
  deleteObject: (path: string) => Promise<unknown>;
  logSuccess: () => Promise<unknown>;
}
export async function runPhotoJob(cp: PhotoCheckpoint, deps: PhotoDependencies, isCurrent: () => boolean): Promise<{ status: 'done' | 'failed' | 'stale'; message: string }> {
  const stale = { status: 'stale' as const, message: '' };
  let step: 'storage' | 'persist' = 'storage';
  try {
    if (!isCurrent()) return stale;
    if (cp.kind === 'upload') {
      if (!cp.objectPath) {
        const path = avatarObjectPath(deps.uid, deps.newObjectName());
        if (!cp.blob) throw new PhotoError('process');
        await deps.uploadBytes(path, cp.blob);
        cp.objectPath = path;
      }
      if (!isCurrent()) return stale;
      if (!cp.uploadedUrl) {
        const url = await deps.getDownloadURL(cp.objectPath);
        if (checkPersistableUrl(url)) throw new PhotoError('url');
        cp.uploadedUrl = url;
      }
    }
    step = 'persist';
    if (!isCurrent()) return stale;
    if (!cp.authUpdated) {
      await deps.updateAuthPhoto(cp.kind === 'remove' ? null : cp.uploadedUrl!);
      cp.authUpdated = true;
    }
    if (!isCurrent()) return stale;
    if (!cp.firestoreUpdated) {
      await deps.writeUserPhoto(cp.kind === 'remove' ? '' : cp.uploadedUrl!);
      cp.firestoreUpdated = true;
    }
    if (!isCurrent()) return stale;
    const previousPath = managedObjectPath(cp.previousUrl, deps.uid, deps.bucket);
    if (previousPath && previousPath !== cp.objectPath) {
      try { await deps.deleteObject(previousPath); } catch { /* Cleanup never fails the save. */ }
    }
    if (!isCurrent()) return stale;
    try { await deps.logSuccess(); } catch { /* Activity is best-effort. */ }
    if (!isCurrent()) return stale;
    return { status: 'done', message: cp.kind === 'remove' ? PHOTO_MESSAGES.removed : PHOTO_MESSAGES.success };
  } catch (error) {
    if (!isCurrent()) return stale;
    return { status: 'failed', message: step === 'storage' ? describePhotoError(error) : describeActionError(error, PHOTO_MESSAGES.partial) };
  }
}
