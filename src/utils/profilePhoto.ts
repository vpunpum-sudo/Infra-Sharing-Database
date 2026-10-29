import { describeActionError } from './asyncAction';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 40_000_000;
export const AVATAR_MAX_SIDE = 256;
export const AVATAR_MAX_BYTES = 200 * 1024;
export const JPEG_QUALITY_LADDER = [0.85, 0.75, 0.65, 0.5] as const;
export const MAX_PHOTO_URL_LENGTH = 1000;
export const AVATAR_NAME_PATTERN = /^avatar-[0-9]{13}-[0-9a-f]{16}\.jpg$/;
export const PHOTO_MESSAGES = {
  type: 'กรุณาเลือกรูป JPEG, PNG หรือ WebP เท่านั้น',
  tooLarge: 'รูปต้องมีขนาดไม่เกิน 10 MiB', empty: 'ไฟล์รูปว่างเปล่า กรุณาเลือกรูปใหม่',
  unreadable: 'อ่านไฟล์รูปไม่ได้ กรุณาเลือกรูปใหม่', pixels: 'รูปมีความละเอียดเกิน 40 ล้านพิกเซล กรุณาเลือกรูปที่เล็กลง',
  process: 'ประมวลผลรูปไม่ได้ กรุณาลองเลือกรูปใหม่', shrink: 'ย่อรูปให้เล็กพอไม่ได้ กรุณาเลือกรูปอื่น',
  url: 'ลิงก์รูปที่ได้รับไม่ถูกต้องหรือยาวเกินไป กรุณาลองอีกครั้ง',
  unauthorized: 'ยังไม่เปิดใช้งานการอัปโหลดรูปจากอุปกรณ์ในขณะนี้ จึงยังเปลี่ยนรูปโปรไฟล์ไม่ได้ กรุณาลองใหม่ภายหลังหรือแจ้งผู้ดูแลระบบ',
  unauthenticated: 'กรุณาเข้าสู่ระบบใหม่ก่อนอัปโหลดรูป', quota: 'พื้นที่จัดเก็บเต็ม กรุณาแจ้งผู้ดูแลระบบ',
  offline: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  generic: 'บันทึกรูปไม่สำเร็จ กรุณาลองอีกครั้ง', partial: 'บันทึกรูปยังไม่ครบ กรุณาลองบันทึกอีกครั้ง',
  success: 'บันทึกรูปโปรไฟล์สำเร็จ', removed: 'ลบรูปโปรไฟล์สำเร็จ'
} as const;
export type PhotoErrorCode = keyof typeof PHOTO_MESSAGES;
export class PhotoError extends Error {
  constructor(public code: PhotoErrorCode) { super(PHOTO_MESSAGES[code]); }
}
export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return PHOTO_MESSAGES.type;
  if (file.size <= 0) return PHOTO_MESSAGES.empty;
  if (file.size > MAX_SOURCE_BYTES) return PHOTO_MESSAGES.tooLarge;
  return null;
}
export function checkDecodedSize(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return PHOTO_MESSAGES.unreadable;
  return width * height > MAX_DECODED_PIXELS ? PHOTO_MESSAGES.pixels : null;
}
export function squareCropRect(width: number, height: number) {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}
export const targetSide = (side: number) => Math.min(side, AVATAR_MAX_SIDE);
export function pickEncoding(sizesByQuality: readonly number[]): number | null {
  const index = sizesByQuality.findIndex(size => size > 0 && size <= AVATAR_MAX_BYTES);
  return index >= 0 && index < JPEG_QUALITY_LADDER.length ? JPEG_QUALITY_LADDER[index] : null;
}
export function makeAvatarObjectName(now: number, randomHex: string): string {
  const name = `avatar-${now}-${randomHex}.jpg`;
  if (!AVATAR_NAME_PATTERN.test(name)) throw new PhotoError('process');
  return name;
}
export function avatarObjectPath(uid: string, name: string): string {
  if (!uid || uid.includes('/') || !AVATAR_NAME_PATTERN.test(name)) throw new PhotoError('process');
  return `profile-photos/${uid}/${name}`;
}
export function managedObjectPath(value: string, uid: string, bucket: string): string | null {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
    if (!match || decodeURIComponent(match[1]) !== bucket) return null;
    const path = decodeURIComponent(match[2]);
    const parts = path.split('/');
    return parts.length === 3 && parts[0] === 'profile-photos' && parts[1] === uid && uid !== '' && AVATAR_NAME_PATTERN.test(parts[2]) ? path : null;
  } catch { return null; }
}
export function checkPersistableUrl(value: string): string | null {
  try {
    if (!value || value.length > MAX_PHOTO_URL_LENGTH || value !== value.trim()) return PHOTO_MESSAGES.url;
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? null : PHOTO_MESSAGES.url;
  } catch { return PHOTO_MESSAGES.url; }
}
export function describePhotoError(error: unknown): string {
  if (error instanceof PhotoError) return PHOTO_MESSAGES[error.code];
  const code = (error as { code?: string })?.code;
  if (code === 'storage/unauthorized') return PHOTO_MESSAGES.unauthorized;
  if (code === 'storage/unauthenticated') return PHOTO_MESSAGES.unauthenticated;
  if (code === 'storage/quota-exceeded') return PHOTO_MESSAGES.quota;
  if (code === 'storage/retry-limit-exceeded') return PHOTO_MESSAGES.offline;
  return describeActionError(error, PHOTO_MESSAGES.generic);
}
