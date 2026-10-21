export const WI_ALLOWED_ACTIONS = [
  'fillLogin', 'submitLogin', 'goto', 'expandRoutesList', 'expandEnclosuresList', 'focusAllObjects',
  'leftClickPoint', 'rightClickPoint', 'pressEscape', 'closePopup',
  'openProjectForm', 'fillProjectDraft', 'openProfile', 'openSampleCard',
  'openEnclosureForm', 'openRouteDraft', 'finishRouteDraft', 'cancelDraft',
  'openCoreManager', 'selectCore', 'openSpliceManager', 'selectFiberSide',
  'openFiles', 'openSchedule', 'selectTask', 'openApprovalDocument', 'openSignForm', 'closeSignForm',
  'openUserPage', 'openPermissionsPage', 'openSettingsPage', 'openLogsPage', 'openSettingsTab', 'openSettingsForm', 'pickOnMap', 'openSignSlide', 'exitDrawMode'
] as const;

export type WiAllowedAction = (typeof WI_ALLOWED_ACTIONS)[number];
export function assertAllowedAction(name: string): asserts name is WiAllowedAction {
  if (!(WI_ALLOWED_ACTIONS as readonly string[]).includes(name)) throw new Error(`Disallowed page action: ${name}`);
}

const EXACT_SAFE_LABELS = new Set(['Cancel', 'Finish Drawing', 'Back to Projects', 'สร้างโครงการ', 'Splice Manager', 'ปิด', 'ยกเลิก']);
const DENIED_LABEL = /บันทึก|save|ยืนยัน|confirm|ลบ|delete|ส่งคำขออนุมัติ|ลงนาม|ไม่อนุมัติ|upload|export|splice|unsplice|ออกจากระบบ|logout|อนุมัติ|ขอแก้ไข|ส่ง|submit|approve|reject|sign/i;
export const ACTION_EXACT_LABELS: Partial<Record<WiAllowedAction, readonly RegExp[]>> = {
  openApprovalDocument: [/^ลงนาม 2 ระดับ$/, /^เอกสารอนุมัติ$/],
  openSignForm: [/^ลงนาม Planning \([^()]+\)$/, /^ลงนาม O&M \([^()]+\)$/],
  openSettingsTab: [/^Enclosure Types$/],
  openSettingsForm: [/^Add Type$/],
  pickOnMap: [/^Pick on Map$/],
  openSignSlide: [/^6$/],
  exitDrawMode: [/^Select$/]
};
export const normalizeLabel = (label: string): string => label.trim().replace(/\s+/g, ' ');
export function matchesActionExactLabel(label: string, action: WiAllowedAction): boolean {
  return ACTION_EXACT_LABELS[action]?.some(pattern => pattern.test(normalizeLabel(label))) ?? false;
}
export function assertSafeClickLabel(label: string, action?: WiAllowedAction): void {
  const value = normalizeLabel(label);
  if (!value) throw new Error('Click target has no readable label');
  if (action && matchesActionExactLabel(value, action)) return;
  if (EXACT_SAFE_LABELS.has(value)) return;
  if (DENIED_LABEL.test(value)) throw new Error(`Unsafe click label: ${value}`);
}

const ALLOWED_PATHS = new Set(['/', '/login', '/profile', '/user-management', '/permission-management', '/settings', '/logs']);
export function assertAllowedPath(path: string): void {
  if (!ALLOWED_PATHS.has(path) && !/^\/project\/[^/]+$/.test(path)) throw new Error(`Disallowed goto path: ${path}`);
}

export const REQUIRED_MENU_ITEMS = ['Cut Fiber Here', 'Split at Enclosure', 'Edit'] as const;
export function missingMenuItems(visibleTexts: string[]): string[] {
  return REQUIRED_MENU_ITEMS.filter(item => !visibleTexts.some(text => text.trim() === item));
}
