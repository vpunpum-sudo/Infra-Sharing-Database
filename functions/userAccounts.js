const { randomUUID } = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const DATABASE_ID = 'ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece';
const BOOTSTRAP_ADMINS = ['vpunpum@gmail.com', 'verayut_p@uih.co.th'];
const ROLES = ['Admin', 'Management', 'Planning', 'Design', 'Viewer', 'Sub-contract'];
const OWNERS = ['ITEL', 'SYMC', 'UIH'];

function normalizeEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function validatePassword(value) {
  return typeof value === 'string' && value === value.trim() && value.length >= 6 && value.length <= 128;
}
function validateProvisionInput(data) {
  const email = normalizeEmail(data?.email);
  if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'อีเมลไม่ถูกต้อง');
  }
  if (!ROLES.includes(data?.role)) throw new HttpsError('invalid-argument', 'บทบาทไม่ถูกต้อง');
  if (data.role !== 'Admin' && !OWNERS.includes(data?.owner)) throw new HttpsError('invalid-argument', 'หน่วยงานไม่ถูกต้อง');
  if (!validatePassword(data?.password)) throw new HttpsError('invalid-argument', 'รหัสผ่านต้องยาว 6–128 ตัวอักษรและไม่มีช่องว่างต้นหรือท้าย');
  return { email, password: data.password, role: data.role, owner: data.role === 'Admin' ? 'None' : data.owner };
}
function isAdminCaller(userData, tokenEmail) {
  return userData?.role === 'Admin' || BOOTSTRAP_ADMINS.includes(tokenEmail);
}
function auditEntry(caller, action, description, metadata) {
  const id = randomUUID();
  return { id, userId: caller.uid, userEmail: caller.token?.email || caller.profileEmail || caller.uid,
    action, description,
    timestamp: new Date().toISOString(), metadata };
}
function chunk(items, size = 400) {
  const parts = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}
async function writeAudit(db, caller, action, description, metadata, log) {
  try {
    const entry = auditEntry(caller, action, description, metadata);
    await db.collection('logs').doc(entry.id).set(entry);
  } catch (error) { log.error('Managed user audit failed', { action, code: error?.code }); }
}
async function authorize(db, caller) {
  if (!caller?.uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  const user = await db.collection('users').doc(caller.uid).get();
  if (!isAdminCaller(user.exists ? user.data() : null, caller.token?.email)) {
    throw new HttpsError('permission-denied', 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการบัญชีผู้ใช้ได้');
  }
  return user.exists ? user.data() : null;
}
function internal(log, message, error, reason) {
  // Do not send an Auth SDK error object to logs: its request context might
  // include a password supplied to createUser or updateUser.
  log.error(message, { code: error?.code, reason });
  return new HttpsError('internal', 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่', reason ? { reason } : undefined);
}
async function createManagedUserCore({ auth, db, caller, data, logger: log = console }) {
  const callerProfile = await authorize(db, caller);
  const input = validateProvisionInput(data);
  const users = db.collection('users');
  let existingDocs;
  try { existingDocs = await users.where('email', '==', input.email).get(); }
  catch (error) { throw internal(log, 'Managed user duplicate lookup failed', error); }
  if (!existingDocs.empty) throw new HttpsError('already-exists', 'มีอีเมลนี้ในระบบแล้ว');

  let authUser;
  let existingAccount = false;
  try {
    authUser = await auth.getUserByEmail(input.email);
    existingAccount = true;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw internal(log, 'Managed user Auth lookup failed', error);
  }
  if (existingAccount) {
    // The email query catches profiles and preauthorizations. Also guard the UID
    // independently in case a legacy profile has a differently cased email.
    const uidDoc = await users.doc(authUser.uid).get();
    if (uidDoc.exists) throw new HttpsError('already-exists', 'มีบัญชีผู้ใช้นี้ในระบบแล้ว');
    try { await auth.updateUser(authUser.uid, { password: input.password, disabled: false }); }
    catch (error) { throw internal(log, 'Managed user Auth update failed', error); }
  } else {
    try { authUser = await auth.createUser({ email: input.email, password: input.password }); }
    catch (error) { throw internal(log, 'Managed user Auth create failed', error); }
  }

  const profile = { id: authUser.uid, email: input.email, role: input.role, owner: input.owner,
    isApproved: true, requiresPasswordChange: true };
  try { await users.doc(authUser.uid).set(profile); }
  catch (error) {
    if (!existingAccount) {
      try { await auth.deleteUser(authUser.uid); }
      catch (rollbackError) { log.error('Managed user Auth rollback failed', { code: rollbackError?.code }); }
      throw internal(log, 'Managed user profile write failed', error);
    }
    throw internal(log, 'Managed user profile write failed after password update', error,
      'profile_write_failed_password_changed');
  }
  let revokeFailed = false;
  if (existingAccount) {
    try { await auth.revokeRefreshTokens(authUser.uid); }
    catch (error) { revokeFailed = true; log.error('Managed user token revocation failed', { code: error?.code }); }
  }
  await writeAudit(db, { ...caller, profileEmail: callerProfile?.email }, 'create_user', `Created managed user ${input.email}`,
    { role: input.role, owner: input.owner, isApproved: true, existingAccount, targetUid: authUser.uid }, log);
  return { uid: authUser.uid, existingAccount, ...(revokeFailed ? { revokeFailed: true } : {}) };
}

async function deleteManagedUserCore({ auth, db, caller, data, logger: log = console }) {
  const callerProfile = await authorize(db, caller);
  const userId = data?.userId;
  if (typeof userId !== 'string' || !/^[\w-]{1,128}$/.test(userId)) {
    throw new HttpsError('invalid-argument', 'รหัสผู้ใช้ไม่ถูกต้อง');
  }
  if (userId === caller.uid) throw new HttpsError('failed-precondition', 'ไม่สามารถลบบัญชีตัวเองได้');
  const users = db.collection('users');
  const target = await users.doc(userId).get();
  if (!target.exists) throw new HttpsError('not-found', 'ไม่พบผู้ใช้');
  const targetData = target.data();
  if (!userId.startsWith('preauth_')) {
    try { await auth.deleteUser(userId); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') throw internal(log, 'Managed user Auth delete failed', error);
    }
  }
  const deleted = [];
  try {
    if (!userId.startsWith('preauth_')) {
      let cleared = false;
      for (let round = 0; round < 50; round++) {
        const result = await users.where('email', '==', targetData.email).get();
        const stale = result.docs.filter(doc => doc.id.startsWith('preauth_') && doc.id !== userId);
        if (!stale.length) { cleared = true; break; }
        // Requery each round so retries continue from the remaining documents.
        for (const group of chunk(stale.slice(0, 400))) {
          const batch = db.batch();
          for (const doc of group) batch.delete(doc.ref);
          await batch.commit();
          deleted.push(...group.map(doc => doc.id));
        }
      }
      if (!cleared) throw new Error('Preauthorization cleanup limit reached');
    }
    await users.doc(userId).delete();
    deleted.push(userId);
  } catch (error) {
    throw internal(log, 'Managed user profile delete failed after Auth delete', error,
      'profile_delete_failed_auth_deleted');
  }
  await writeAudit(db, { ...caller, profileEmail: callerProfile?.email }, 'delete_user', `Deleted user ${targetData.email}`,
    { deletedUserId: userId, role: targetData.role, deletedDocIds: deleted }, log);
  return { deleted };
}

function callable(core) {
  return onCall({ region: 'asia-southeast1' }, async request => {
    try {
      return await core({ auth: getAuth(), db: getFirestore(DATABASE_ID), caller: request.auth,
        data: request.data, logger });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw internal(logger, 'Unexpected managed user operation failure', error);
    }
  });
}
exports.createManagedUser = callable(createManagedUserCore);
exports.deleteManagedUser = callable(deleteManagedUserCore);
Object.assign(exports, { normalizeEmail, validatePassword, validateProvisionInput, isAdminCaller,
  auditEntry, chunk, createManagedUserCore, deleteManagedUserCore });
