const { randomUUID } = require('node:crypto');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { canAccessProjectFiles } = require('./projectFilePolicy');

const DATABASE_ID = 'ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece';
const BUCKET = 'gen-lang-client-0942355314.firebasestorage.app';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const region = 'asia-southeast1';

async function authorize(auth, projectId, write = false, allowCreator = false) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  if (typeof projectId !== 'string' || !/^[\w-]{1,100}$/.test(projectId)) {
    throw new HttpsError('invalid-argument', 'รหัสโครงการไม่ถูกต้อง');
  }
  const db = getFirestore(DATABASE_ID);
  const [userDoc, projectDoc] = await Promise.all([
    db.collection('users').doc(auth.uid).get(),
    db.collection('projects').doc(projectId).get()
  ]);
  if (!userDoc.exists || !projectDoc.exists) {
    throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์เข้าถึงโครงการนี้');
  }
  const user = userDoc.data();
  const project = projectDoc.data();
  if (!canAccessProjectFiles(user, project, write) && !(allowCreator && project.uid === auth.uid)) {
    throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์จัดการไฟล์ของโครงการนี้');
  }
  return { db, project, createdAt: project.createdAt || projectDoc.createTime?.toDate().toISOString() || null };
}

function validFileName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150 || /[\x00-\x1f]/.test(name)) {
    throw new HttpsError('invalid-argument', 'ชื่อไฟล์ต้องมีความยาวไม่เกิน 150 ตัวอักษร');
  }
  return name.trim();
}

function validFolderName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || /[\x00-\x1f/\\]/.test(name)) {
    throw new HttpsError('invalid-argument', 'ชื่อโฟลเดอร์ต้องมีความยาวไม่เกิน 100 ตัวอักษรและห้ามมี / หรือ \\');
  }
  return name.trim();
}

// null means the project's top level.
async function validFolderId(folders, folderId) {
  if (folderId === undefined || folderId === null || folderId === '') return null;
  if (typeof folderId !== 'string' || !/^[\w-]{1,100}$/.test(folderId)) {
    throw new HttpsError('invalid-argument', 'รหัสโฟลเดอร์ไม่ถูกต้อง');
  }
  if (!(await folders.doc(folderId).get()).exists) throw new HttpsError('not-found', 'ไม่พบโฟลเดอร์');
  return folderId;
}

function decodeFile(base64) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new HttpsError('invalid-argument', 'ไฟล์ไม่ถูกต้องหรือมีขนาดเกิน 5 MB');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) {
    throw new HttpsError('invalid-argument', 'ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
  }
  return bytes;
}

// Unexpected errors otherwise reach the client as a bare "INTERNAL", so log
// the cause and map the common Storage/Firestore setup failures to a message.
function toHttpsError(error, context) {
  if (error instanceof HttpsError) return error;
  const code = error?.code;
  const message = String(error?.message || error);
  logger.error('Project file operation failed', { ...context, code, message, stack: error?.stack });
  if (code === 404 && /bucket/i.test(message)) {
    return new HttpsError('failed-precondition', 'ยังไม่ได้เปิดใช้งาน Firebase Storage สำหรับโครงการนี้');
  }
  if (code === 403 || code === 7 || code === 'PERMISSION_DENIED') {
    return new HttpsError('failed-precondition', 'บัญชีบริการของ Cloud Functions ไม่มีสิทธิ์เข้าถึง Storage หรือ Firestore');
  }
  if (code === 5 || code === 404) return new HttpsError('not-found', 'ไม่พบไฟล์ในพื้นที่จัดเก็บ');
  return new HttpsError('internal', 'ดำเนินการกับไฟล์ไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ');
}

exports.manageProjectFile = onCall({ region, timeoutSeconds: 120, memory: '512MiB' }, async request => {
  try {
    return await handleProjectFile(request);
  } catch (error) {
    throw toHttpsError(error, { action: request.data?.action, projectId: request.data?.projectId, uid: request.auth?.uid });
  }
});

async function handleProjectFile(request) {
  const { action, projectId, fileId } = request.data || {};
  const write = ['upload', 'replace', 'rename', 'delete', 'createFolder', 'renameFolder', 'deleteFolder'].includes(action);
  if (!write && action !== 'download') throw new HttpsError('invalid-argument', 'คำสั่งไม่ถูกต้อง');
  const { db } = await authorize(request.auth, projectId, write);
  const files = db.collection('projects').doc(projectId).collection('files');
  const folders = db.collection('projects').doc(projectId).collection('folders');
  const bucket = getStorage().bucket(BUCKET);

  if (action === 'createFolder') {
    const name = validFolderName(request.data.name);
    const parentId = await validFolderId(folders, request.data.parentId);
    const id = randomUUID();
    const now = new Date().toISOString();
    await folders.doc(id).set({ id, name, parentId, createdAt: now, updatedAt: now, createdBy: request.auth.uid });
    return { id };
  }
  if (action === 'renameFolder' || action === 'deleteFolder') {
    const folderId = await validFolderId(folders, request.data.folderId);
    if (!folderId) throw new HttpsError('invalid-argument', 'รหัสโฟลเดอร์ไม่ถูกต้อง');
    if (action === 'renameFolder') {
      await folders.doc(folderId).update({ name: validFolderName(request.data.name), updatedAt: new Date().toISOString() });
      return { ok: true };
    }
    const [childFiles, childFolders] = await Promise.all([
      files.where('folderId', '==', folderId).limit(1).get(),
      folders.where('parentId', '==', folderId).limit(1).get()
    ]);
    if (!childFiles.empty || !childFolders.empty) {
      throw new HttpsError('failed-precondition', 'ลบได้เฉพาะโฟลเดอร์ว่าง กรุณาลบไฟล์และโฟลเดอร์ย่อยก่อน');
    }
    await folders.doc(folderId).delete();
    return { ok: true };
  }

  if (action === 'upload') {
    const name = validFileName(request.data.name);
    const folderId = await validFolderId(folders, request.data.folderId);
    const bytes = decodeFile(request.data.base64);
    const id = randomUUID();
    const storagePath = `project-files/${projectId}/${id}/${randomUUID()}`;
    const contentType = typeof request.data.contentType === 'string' && request.data.contentType.length <= 100
      ? request.data.contentType : 'application/octet-stream';
    await bucket.file(storagePath).save(bytes, { resumable: false, metadata: { contentType } });
    const now = new Date().toISOString();
    try {
      await files.doc(id).set({ id, name, folderId, contentType, size: bytes.length, storagePath,
        createdAt: now, updatedAt: now, uploadedBy: request.auth.uid });
    } catch (error) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
      throw error;
    }
    return { id };
  }

  if (typeof fileId !== 'string' || !/^[\w-]{1,100}$/.test(fileId)) {
    throw new HttpsError('invalid-argument', 'รหัสไฟล์ไม่ถูกต้อง');
  }
  const fileRef = files.doc(fileId);
  const fileDoc = await fileRef.get();
  if (!fileDoc.exists) throw new HttpsError('not-found', 'ไม่พบไฟล์');
  const current = fileDoc.data();

  if (action === 'download') {
    const [bytes] = await bucket.file(current.storagePath).download();
    return { name: current.name, contentType: current.contentType, base64: bytes.toString('base64') };
  }
  if (action === 'rename') {
    await fileRef.update({ name: validFileName(request.data.name), updatedAt: new Date().toISOString() });
    return { ok: true };
  }
  if (action === 'replace') {
    const bytes = decodeFile(request.data.base64);
    const storagePath = `project-files/${projectId}/${fileId}/${randomUUID()}`;
    const contentType = typeof request.data.contentType === 'string' && request.data.contentType.length <= 100
      ? request.data.contentType : 'application/octet-stream';
    await bucket.file(storagePath).save(bytes, { resumable: false, metadata: { contentType } });
    try {
      await fileRef.update({ storagePath, size: bytes.length, contentType,
        updatedAt: new Date().toISOString(), uploadedBy: request.auth.uid });
    } catch (error) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
      throw error;
    }
    try { await bucket.file(current.storagePath).delete({ ignoreNotFound: true }); }
    catch (error) { console.error('Old project file cleanup failed', error); }
    return { ok: true };
  }
  await fileRef.delete();
  try { await bucket.file(current.storagePath).delete({ ignoreNotFound: true }); }
  catch (error) { console.error('Deleted project file cleanup failed', error); }
  return { ok: true };
}

exports.getProjectCreatedDates = onCall({ region }, async request => {
  const ids = request.data?.projectIds;
  if (!Array.isArray(ids) || ids.length > 50) throw new HttpsError('invalid-argument', 'รายการโครงการไม่ถูกต้อง');
  const result = {};
  try {
    for (const projectId of ids) {
      const { createdAt } = await authorize(request.auth, projectId, false, true);
      result[projectId] = createdAt;
    }
  } catch (error) {
    throw toHttpsError(error, { action: 'getProjectCreatedDates', uid: request.auth?.uid });
  }
  return result;
});

exports.MAX_FILE_BYTES = MAX_FILE_BYTES;
