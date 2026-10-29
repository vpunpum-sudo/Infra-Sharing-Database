export const PASSWORD_MESSAGES = {
  spaces: 'รหัสผ่านต้องไม่มีช่องว่างต้นหรือท้าย',
  length: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร',
  mismatch: 'รหัสผ่านไม่ตรงกัน',
  recentLogin: 'เซสชันหมดอายุ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่เพื่อเปลี่ยนรหัสผ่าน',
  weak: 'รหัสผ่านไม่ปลอดภัยเพียงพอ กรุณาเลือกรหัสผ่านใหม่',
  updateFailed: 'ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาลองอีกครั้ง',
  flagFailed: 'รหัสผ่านใหม่ใช้งานได้แล้ว แต่บันทึกสถานะไม่สำเร็จ กรุณาลองบันทึกสถานะอีกครั้ง',
  done: 'เปลี่ยนรหัสผ่านสำเร็จ กำลังนำคุณเข้าสู่ระบบ...'
} as const;
type Deps = { updatePassword: (password: string) => Promise<void>; clearFlag: () => Promise<void> };
export type PasswordResult = { status: 'done' | 'validation_failed' | 'update_failed' | 'flag_failed_password_active'; message: string };

export async function run(newPassword: string, confirmPassword: string, deps: Deps): Promise<PasswordResult> {
  const validation = validateNewPassword(newPassword, confirmPassword);
  if (validation) return { status: 'validation_failed', message: validation };
  try { await deps.updatePassword(newPassword); }
  catch (error) {
    const code = (error as { code?: string })?.code;
    return { status: 'update_failed', message: code === 'auth/requires-recent-login' ? PASSWORD_MESSAGES.recentLogin :
      code === 'auth/weak-password' ? PASSWORD_MESSAGES.weak : PASSWORD_MESSAGES.updateFailed };
  }
  return retryClearFlag(deps);
}
export async function retryClearFlag(deps: Pick<Deps, 'clearFlag'>): Promise<PasswordResult> {
  try { await deps.clearFlag(); return { status: 'done', message: PASSWORD_MESSAGES.done }; }
  catch { return { status: 'flag_failed_password_active', message: PASSWORD_MESSAGES.flagFailed }; }
}

export function validateNewPassword(next: string, confirm: string): string | null {
  if (next !== next.trim()) return PASSWORD_MESSAGES.spaces;
  if (next.length < 6) return PASSWORD_MESSAGES.length;
  if (next !== confirm) return PASSWORD_MESSAGES.mismatch;
  return null;
}
