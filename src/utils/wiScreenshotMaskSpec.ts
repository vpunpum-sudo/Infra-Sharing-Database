import type { FigureId } from './wiScreenshotFigures';
import { findKnownValues, findPii, type KnownValues } from './wiScreenshotRedact';

export const WI_MASK_PLACEHOLDERS = {
  name: (n: number) => `ผู้ใช้ตัวอย่าง ${n}`,
  ownName: 'ผู้ใช้ตัวอย่าง',
  email: (n: number) => `อีเมลผู้ใช้ ${n} (ปิดบัง)`,
  phone: 'เบอร์โทร (ปิดบัง)',
  profileImageLink: 'ลิงก์รูปโปรไฟล์ (ปิดบัง)',
  supervisor: 'ผู้รับผิดชอบตัวอย่าง',
  company: 'บริษัทตัวอย่าง จำกัด',
  contractNumber: 'เลขที่สัญญา (ปิดบัง)',
  logDescription: 'รายละเอียดการกระทำ (ปิดบังข้อมูล)'
} as const;

export type MaskRegion = { name: string; selector: string; kind: 'text' | 'input' | 'image' | 'hide'; placeholder?: string; required: boolean; source?: string };
export type MaskSpec = { regions: readonly MaskRegion[] };
export type RegionSnapshot = { matches: number; values: string[]; imageMasked?: boolean[]; maskValid?: boolean[] };
export type PageSnapshot = { bodyText: string; inputs: string[]; attrs: string[]; regions: Record<string, RegionSnapshot> };
const region = (name: string, kind: MaskRegion['kind'], placeholder: string | undefined, required: boolean, source: string): MaskRegion =>
  ({ name, selector: `[data-wi-pii="${name}"]`, kind, placeholder, required, source });

export const HEADER_SPEC: MaskSpec = { regions: [
  region('account-name', 'text', WI_MASK_PLACEHOLDERS.ownName, true, 'ProjectsDashboard.tsx'),
  region('account-avatar', 'image', undefined, false, 'ProjectsDashboard.tsx')
] };
const header = (required = true) => [region('account-name', 'text', WI_MASK_PLACEHOLDERS.ownName, required, 'ProjectsDashboard.tsx'), region('account-avatar', 'image', undefined, false, 'ProjectsDashboard.tsx')];
const mapHeader = () => [region('map-account-name', 'text', WI_MASK_PLACEHOLDERS.ownName, true, 'App.tsx'), region('map-account-avatar', 'image', undefined, false, 'App.tsx')];
const creator = () => [region('creator-name', 'text', WI_MASK_PLACEHOLDERS.name(1), false, 'ProjectsDashboard.tsx')];
const otherProjects = () => [region('other-project-card', 'hide', undefined, true, 'ProjectsDashboard.tsx')];
const mapRegions = () => [...mapHeader()];

export const WI_MASK_SPECS: Record<FigureId, MaskSpec> = {
  login: { regions: [] },
  dashboard: { regions: [...header(), ...otherProjects(), ...creator()] },
  'card-actions': { regions: [...header(), ...otherProjects(), ...creator()] },
  'project-form': { regions: header() },
  profile: { regions: [
    ...header(), region('profile-display-name', 'input', WI_MASK_PLACEHOLDERS.ownName, true, 'ProfileSettings.tsx'),
    region('profile-email', 'input', WI_MASK_PLACEHOLDERS.email(1), true, 'ProfileSettings.tsx'),
    region('profile-image-url', 'input', WI_MASK_PLACEHOLDERS.profileImageLink, true, 'ProfileSettings.tsx'),
    region('profile-avatar', 'image', undefined, false, 'ProfileSettings.tsx')
  ] },
  map: { regions: mapRegions() },
  'context-menu': { regions: mapRegions() },
  'enclosure-form': { regions: mapRegions() },
  'route-draw': { regions: mapRegions() },
  'core-manager': { regions: mapRegions() },
  splice: { regions: mapRegions() },
  files: { regions: header() },
  schedule: { regions: [...header(), region('task-owner', 'text', WI_MASK_PLACEHOLDERS.supervisor, true, 'ProjectScheduleModal.tsx'), region('schedule-history-name', 'text', WI_MASK_PLACEHOLDERS.name(1), false, 'ProjectScheduleModal.tsx')] },
  'approval-request': { regions: [
    ...header(), region('approval-supervisor', 'input', WI_MASK_PLACEHOLDERS.supervisor, true, 'DesignApprovalModal.tsx'),
    region('approval-phone', 'input', WI_MASK_PLACEHOLDERS.phone, true, 'DesignApprovalModal.tsx'),
    region('approval-company', 'input', WI_MASK_PLACEHOLDERS.company, false, 'DesignApprovalModal.tsx'),
    region('approval-contract', 'input', WI_MASK_PLACEHOLDERS.contractNumber, false, 'DesignApprovalModal.tsx'),
    region('approval-signature', 'image', undefined, false, 'DesignApprovalModal.tsx'),
    region('approval-signer-name', 'text', WI_MASK_PLACEHOLDERS.name(1), false, 'DesignApprovalModal.tsx'),
    region('previous-signer', 'text', WI_MASK_PLACEHOLDERS.name(1), false, 'DesignApprovalModal.tsx')
  ] },
  'approval-sign': { regions: [
    ...header(), region('signer-name', 'input', '', true, 'DesignApprovalModal.tsx'),
    region('signer-position', 'input', '', true, 'DesignApprovalModal.tsx'),
    region('signature-pad', 'image', undefined, true, 'DesignApprovalModal.tsx'),
    region('approval-signature', 'image', undefined, false, 'DesignApprovalModal.tsx'),
    region('approval-signer-name', 'text', WI_MASK_PLACEHOLDERS.name(1), false, 'DesignApprovalModal.tsx'),
    region('previous-signature', 'image', undefined, false, 'DesignApprovalModal.tsx'),
    region('previous-signer', 'text', WI_MASK_PLACEHOLDERS.name(1), false, 'DesignApprovalModal.tsx')
  ] },
  users: { regions: [
    ...header(false), region('user-email', 'text', WI_MASK_PLACEHOLDERS.email(1), true, 'UserManagement.tsx'),
    region('user-name', 'text', WI_MASK_PLACEHOLDERS.name(1), true, 'UserManagement.tsx'),
    region('add-user-email', 'input', WI_MASK_PLACEHOLDERS.email(1), false, 'UserManagement.tsx')
  ] },
  permissions: { regions: header(false) },
  settings: { regions: header(false) },
  logs: { regions: [
    ...header(false), region('log-user', 'text', WI_MASK_PLACEHOLDERS.name(1), true, 'LogViewer.tsx'),
    region('log-description', 'text', WI_MASK_PLACEHOLDERS.logDescription, true, 'LogViewer.tsx')
  ] }
};

export function checkMaskResult(snapshot: PageSnapshot, spec: MaskSpec, knownValues: KnownValues): string[] {
  for (const region of spec.regions) {
    const found = snapshot.regions[region.name];
    if (region.required && (!found || found.matches === 0)) return [`mask-required:${region.name}`];
    if (found?.imageMasked?.some(masked => !masked)) return [`image-region:${region.name}`];
    if (found?.maskValid?.some(valid => !valid)) return [`mask-region:${region.name}`];
  }
  const content = [snapshot.bodyText, ...snapshot.inputs, ...snapshot.attrs].join('\n');
  const pii = findPii(content);
  if (pii.length) return [`pii:${pii[0]}`];
  if (findKnownValues(content, knownValues).length) return ['known-value'];
  return [];
}

export function maskThenCheck(snapshot: PageSnapshot, spec: MaskSpec, knownValues: KnownValues): string[] {
  const masked: PageSnapshot = { ...snapshot, inputs: [...snapshot.inputs], attrs: [...snapshot.attrs] };
  for (const region of spec.regions) {
    const found = snapshot.regions[region.name];
    if (!found || !region.placeholder) continue;
    for (const value of found.values) {
      if (!value) continue;
      masked.bodyText = masked.bodyText.replace(value, region.placeholder);
      for (const target of [masked.inputs, masked.attrs]) {
        const index = target.findIndex(item => item.includes(value));
        if (index !== -1) target[index] = target[index].replace(value, region.placeholder);
      }
    }
  }
  return checkMaskResult(masked, spec, knownValues);
}
