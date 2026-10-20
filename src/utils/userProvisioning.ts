import type { CoreOwner, UserRole } from '../types';

export const MESSAGES = {
  duplicateLocal: 'มีผู้ใช้อีเมลนี้ในรายการแล้ว',
  duplicateGlobal: 'มีผู้ใช้อีเมลนี้ในระบบแล้ว',
  invalidEmail: 'กรุณากรอกอีเมลให้ถูกต้อง',
  passwordSpaces: 'รหัสผ่านต้องไม่มีช่องว่างต้นหรือท้าย',
  passwordLength: 'รหัสผ่านต้องมีความยาว 6–128 ตัวอักษร',
  preauth: 'อนุญาตอีเมลล่วงหน้าสำเร็จ ผู้ใช้สามารถเข้าสู่ระบบเมื่อสร้างบัญชีแล้ว',
  newAccount: 'สร้างบัญชีใหม่สำเร็จ ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก',
  existingAccount: 'ตั้งรหัสผ่านใหม่ให้บัญชีเดิมสำเร็จ ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก',
  revokeFailed: ' ไม่สามารถยกเลิกเซสชันเก่าได้ทันที',
  deleted: 'ลบบัญชีผู้ใช้สำเร็จ',
  unauthenticated: 'กรุณาเข้าสู่ระบบอีกครั้ง',
  permissionDenied: 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการบัญชีผู้ใช้ได้',
  alreadyExists: 'มีผู้ใช้อีเมลนี้ในระบบแล้ว',
  notFound: 'ไม่พบผู้ใช้ กรุณารีเฟรชรายการ',
  failedPrecondition: 'ไม่สามารถลบบัญชีตัวเองได้',
  profileWriteFailed: 'เปลี่ยนรหัสผ่านแล้วแต่บันทึกโปรไฟล์ไม่สำเร็จ ลองอีกครั้งได้อย่างปลอดภัย',
  profileDeleteFailed: 'ลบบัญชีเข้าสู่ระบบแล้วแต่ลบข้อมูลไม่ครบ ลองอีกครั้งได้อย่างปลอดภัย',
  internal: 'ระบบจัดการบัญชีขัดข้อง กรุณาลองอีกครั้ง',
  unknown: 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง'
} as const;

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function validateNewUserPassword(password: string): string | null {
  if (password !== password.trim()) return MESSAGES.passwordSpaces;
  if (password.length < 6 || password.length > 128) return MESSAGES.passwordLength;
  return null;
}
export function errorMessageKey(error: unknown): keyof typeof MESSAGES {
  const e = error as { code?: string; details?: { reason?: string } };
  switch (e?.code?.replace(/^functions\//, '')) {
    case 'unauthenticated': return 'unauthenticated';
    case 'permission-denied': return 'permissionDenied';
    case 'already-exists': return 'alreadyExists';
    case 'invalid-argument': return 'unknown';
    case 'not-found': return 'notFound';
    case 'failed-precondition': return 'failedPrecondition';
    case 'internal':
      if (e.details?.reason === 'profile_write_failed_password_changed') return 'profileWriteFailed';
      if (e.details?.reason === 'profile_delete_failed_auth_deleted') return 'profileDeleteFailed';
      return 'internal';
    default: return 'unknown';
  }
}
export function errorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code?.replace(/^functions\//, '') === 'invalid-argument') return e.message || MESSAGES.unknown;
  return MESSAGES[errorMessageKey(error)];
}

type ProvisionInput = { email: string; password: string; role: UserRole; owner: CoreOwner };
type ProvisionDeps = {
  listHasEmail: (email: string) => boolean;
  isAdmin: boolean;
  globalEmailExists: (email: string) => Promise<boolean>;
  writePreauth: (input: Omit<ProvisionInput, 'password'>) => Promise<void>;
  logPreauth: (input: Omit<ProvisionInput, 'password'>) => Promise<void>;
  createManagedUser: (input: ProvisionInput) => Promise<{ existingAccount: boolean; revokeFailed?: boolean }>;
};
export type ActionResult = { ok: boolean; message: string };

export async function submitProvisionUser(input: ProvisionInput, deps: ProvisionDeps): Promise<ActionResult> {
  const email = normalizeEmail(input.email);
  if (deps.listHasEmail(email)) return { ok: false, message: MESSAGES.duplicateLocal };
  if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: MESSAGES.invalidEmail };
  }
  if (input.password !== '') {
    const validation = validateNewUserPassword(input.password);
    if (validation) return { ok: false, message: validation };
  }
  try {
    if (deps.isAdmin && await deps.globalEmailExists(email)) return { ok: false, message: MESSAGES.duplicateGlobal };
    const normalized = { email, role: input.role, owner: input.owner };
    if (input.password === '') {
      await deps.writePreauth(normalized);
      await deps.logPreauth(normalized);
      return { ok: true, message: MESSAGES.preauth };
    }
    const result = await deps.createManagedUser({ ...normalized, password: input.password });
    return { ok: true, message: (result.existingAccount ? MESSAGES.existingAccount : MESSAGES.newAccount) +
      (result.revokeFailed ? MESSAGES.revokeFailed : '') };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function submitDeleteUser(userId: string, deps: {
  deleteManagedUser: (id: string) => Promise<unknown>
}): Promise<ActionResult> {
  try {
    await deps.deleteManagedUser(userId);
    return { ok: true, message: MESSAGES.deleted };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}
