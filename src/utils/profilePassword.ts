import { PASSWORD_MESSAGES as SHARED, validateNewPassword } from './forceChangePassword';
export const PROFILE_PASSWORD_MESSAGES = {
  currentRequired: 'กรุณากรอกรหัสผ่านปัจจุบัน',
  wrongCurrent: 'รหัสผ่านปัจจุบันไม่ถูกต้อง กรุณาลองอีกครั้ง',
  sameAsCurrent: 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน',
  tooMany: 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
  noEmail: 'บัญชีนี้ไม่มีอีเมลสำหรับเปลี่ยนรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบ',
  offline: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  done: 'เปลี่ยนรหัสผ่านสำเร็จ'
} as const;
export function mapPasswordError(code: unknown): string {
  switch (code) {
    case 'auth/wrong-password': case 'auth/invalid-credential': case 'auth/invalid-login-credentials': return PROFILE_PASSWORD_MESSAGES.wrongCurrent;
    case 'auth/weak-password': case 'auth/password-does-not-meet-requirements': return SHARED.weak;
    case 'auth/requires-recent-login': return SHARED.recentLogin;
    case 'auth/too-many-requests': return PROFILE_PASSWORD_MESSAGES.tooMany;
    case 'auth/network-request-failed': return PROFILE_PASSWORD_MESSAGES.offline;
    default: return SHARED.updateFailed;
  }
}
export async function changePassword<Credential>(
  input: { current: string; next: string; confirm: string; email: string | null },
  deps: { buildCredential: (email: string, password: string) => Credential; reauthenticate: (credential: Credential) => Promise<unknown>; updatePassword: (next: string) => Promise<unknown> }
): Promise<{ status: 'done' | 'failed'; message: string }> {
  const failure = (message: string) => ({ status: 'failed' as const, message });
  const email = input.email?.trim();
  if (!email) return failure(PROFILE_PASSWORD_MESSAGES.noEmail);
  if (!input.current) return failure(PROFILE_PASSWORD_MESSAGES.currentRequired);
  const validation = validateNewPassword(input.next, input.confirm);
  if (validation) return failure(validation);
  if (input.current === input.next) return failure(PROFILE_PASSWORD_MESSAGES.sameAsCurrent);
  try {
    const credential = deps.buildCredential(email, input.current);
    await deps.reauthenticate(credential);
    await deps.updatePassword(input.next);
    return { status: 'done', message: PROFILE_PASSWORD_MESSAGES.done };
  } catch (error) { return failure(mapPasswordError((error as { code?: unknown })?.code)); }
}
