import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { ProjectFolder } from '../types';

const manageProjectFile = httpsCallable(functions, 'manageProjectFile');
const call = async (data: Record<string, unknown>) => (await manageProjectFile(data)).data as Record<string, string>;

/** Sends a file straight to the Storage resumable session from startUpload. */
export function uploadToStorage(url: string, file: Blob, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve() : reject(new Error(`อัปโหลดไฟล์ไม่สำเร็จ (${request.status})`));
    request.onerror = () => reject(new Error('อัปโหลดไฟล์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่'));
    request.send(file);
  });
}

/** The top-level project folder with this name, created if missing. */
export async function ensureProjectFolder(projectId: string, name: string): Promise<string> {
  const folders = (await getDocs(collection(db, `projects/${projectId}/folders`))).docs.map(item => item.data() as ProjectFolder);
  const existing = folders.find(folder => !folder.parentId && folder.name === name);
  if (existing) return existing.id;
  return (await call({ action: 'createFolder', projectId, name, parentId: null })).id;
}

/** Uploads a file into the project's files (optionally a folder) and returns its file id. */
export async function uploadProjectFile(projectId: string, file: Blob, name: string, folderId: string | null): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const session = await call({ action: 'startUpload', projectId, name, folderId, contentType });
  await uploadToStorage(session.uploadUrl, file);
  await call({ action: 'finishUpload', projectId, name, folderId, id: session.id, storagePath: session.storagePath });
  return session.id;
}
