import type { CoreOwner, Project } from '../types';

export const HISTORY_ROW_CAP = 200;
export const MAX_FETCHED_DOCS = 100;
export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_LABELS = {
  empty: 'ไม่พบเวอร์ชันก่อนหน้า', unavailable: 'ไม่พบข้อมูลของเวอร์ชันนี้',
  legacy: 'ข้อมูลสด ยังไม่ล็อก — ไม่ใช่เวอร์ชันที่ถูกแช่แข็ง',
  earlier: 'คำขอรอบก่อน หรือการยื่นที่ไม่สำเร็จ (แยกไม่ได้จากข้อมูลที่เก็บ)',
  replaced: 'ผลของรอบนี้และเหตุผลที่ถูกปฏิเสธไม่ได้ถูกเก็บไว้ (ถูกแทนที่ด้วยคำขอรอบถัดไป)',
  notCurrent: 'ไม่ใช่คำขอปัจจุบัน (ยื่นไม่สำเร็จ หรือถอยกลับเป็นร่างแล้ว)',
  noName: 'ไม่ได้เก็บชื่อผู้ยื่นไว้', noNumber: 'ไม่ได้เก็บเลขที่เอกสารไว้',
  omissions: 'ไม่ได้เก็บลายเซ็น ผลลงนาม ผู้รับเหมา หมายเหตุ การเลือกจุดพักสาย และระยะทางที่กรอกในคำขอไว้ในเวอร์ชัน',
  legacyNote: 'คำขอเก่าที่ถูกแทนที่ก่อนล็อกข้อมูลไม่มีเวอร์ชันให้แสดง',
};
const safeSubmitterName = (value: unknown, uid?: string): string => typeof value === 'string' && value.trim() && !/\S+@\S+/.test(value) && value !== uid ? value : HISTORY_LABELS.noName;
export type CurrentApproval = {
  id: string; snapshotId?: string; documentNumber: string; status: string; stageText: string;
  requestedAt: string; requestedBy: string; rejectionReason?: string; backfilled: boolean; lockedAt?: string;
};
export function summarizeCurrentApproval(project: Project): CurrentApproval | null {
  const a = project.designApproval;
  if (!a) return null;
  let lockedAt: string | undefined;
  try { lockedAt = a.snapshotBackfilledAt?.toDate().toISOString() || a.snapshotCreatedAt; } catch { /* unknown time */ }
  return { id: a.id, snapshotId: a.snapshotId, documentNumber: a.documentNumber, status: a.status,
    stageText: a.approvalStage || a.status, requestedAt: a.requestedAt, requestedBy: safeSubmitterName(a.requestedBy, a.requestedByUid),
    rejectionReason: a.rejectionReason, backfilled: Boolean(a.snapshotId && a.snapshotId !== a.id), lockedAt };
}
export type HistoryMetadata = {
  id: string; approvalId: string; projectId: string; schemaVersion: 1; createdAt: string; createdByUid: string;
  project: { name: string; routeCode?: string; owner?: string; owners?: CoreOwner[] };
  participatingOwners: CoreOwner[]; backfill?: true;
};
export type ParsedMetadata = { ok: true; meta: HistoryMetadata } | { ok: false; reason: string };
export type RawMetadataDoc = { id: string; data: unknown };
export type CurrentLookup = { status: 'found'; doc: RawMetadataDoc } | { status: 'missing' | 'error' };
const object = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const owners = (v: unknown): v is CoreOwner[] => Array.isArray(v) && v.every(o => ['None', 'ITEL', 'SYMC', 'UIH'].includes(o));
export function parseSnapshotMetadata(docId: string, data: unknown, projectId: string): ParsedMetadata {
  try {
    if (!object(data) || data.id !== docId || data.projectId !== projectId || data.schemaVersion !== 1) return { ok: false, reason: 'metadata identity' };
    if (!['approvalId', 'createdAt', 'createdByUid'].every(k => typeof data[k] === 'string' && data[k].trim())) return { ok: false, reason: 'required metadata' };
    if (!object(data.project) || typeof data.project.name !== 'string' ||
      ['routeCode', 'owner'].some(k => data.project[k] !== undefined && typeof data.project[k] !== 'string') ||
      (data.project.owners !== undefined && !owners(data.project.owners)) || !owners(data.participatingOwners)) return { ok: false, reason: 'project or owners' };
    if ((data.backfill !== undefined && data.backfill !== true) || (data.id !== data.approvalId) !== (data.backfill === true)) return { ok: false, reason: 'backfill identity' };
    if ((data.ids !== undefined && !object(data.ids)) || (data.idIndex !== undefined && (!object(data.idIndex) || data.idIndex.mode !== 'chunked' || !Number.isSafeInteger(data.idIndex.chunkCount) || data.idIndex.chunkCount < 1))) return { ok: false, reason: 'index shape' };
    return { ok: true, meta: { id: data.id, approvalId: data.approvalId, projectId, schemaVersion: 1, createdAt: data.createdAt, createdByUid: data.createdByUid,
      project: { name: data.project.name, ...(data.project.routeCode !== undefined ? { routeCode: data.project.routeCode } : {}), ...(data.project.owner !== undefined ? { owner: data.project.owner } : {}), ...(data.project.owners !== undefined ? { owners: [...data.project.owners] } : {}) }, participatingOwners: [...data.participatingOwners], ...(data.backfill === true ? { backfill: true } : {}) } };
  } catch { return { ok: false, reason: 'unreadable metadata' }; }
}
export type TimelineEntry = {
  id: string; kind: 'current-frozen' | 'current-backfilled' | 'current-legacy-live' | 'current-unavailable' | 'earlier' | 'not-current' | 'invalid';
  meta?: HistoryMetadata; label: string; timeLabel: string; timeParts: { prefix: string; time?: string; suffix?: string }; submitterLabel: string; outcome: string;
  current: boolean; openable: boolean; comparable: boolean;
};
export type TimeFormatter = (iso: string) => string;
export function historyTimeParts(meta: HistoryMetadata, current: CurrentApproval | null, notCurrent = false): TimelineEntry['timeParts'] {
  const time = meta.backfill ? meta.createdAt : current ? current.requestedAt : meta.createdAt;
  if (!Number.isFinite(Date.parse(time))) return { prefix: 'บันทึกเมื่อ ไม่ทราบเวลา' };
  return { prefix: meta.backfill ? 'ล็อกเมื่อ' : current ? 'ยื่นเมื่อ' : 'บันทึกเมื่อ', time,
    ...(!meta.backfill && notCurrent ? { suffix: ' (ไม่ยืนยันว่ายื่นสำเร็จ)' } : {}) };
}
export const historyTimeLabel = (meta: HistoryMetadata, current: CurrentApproval | null, notCurrent = false, format: TimeFormatter = s => s): string => {
  const { prefix, time, suffix } = historyTimeParts(meta, current, notCurrent);
  return time ? `${prefix} ${format(time)}${suffix ?? ''}` : prefix;
};
export function buildApprovalTimeline(current: CurrentApproval | null, docs: Array<{ id: string; parsed: ParsedMetadata }>, uid: string | undefined, lookup?: CurrentLookup, projectId?: string): TimelineEntry[] {
  const map = new Map(docs.map(d => [d.id, d.parsed]));
  // A later malformed duplicate must not replace a valid page document.
  for (const d of docs) if (d.parsed.ok) map.set(d.id, d.parsed);
  if (current?.snapshotId && lookup?.status === 'found' && !map.get(current.snapshotId)?.ok && lookup.doc.id === current.snapshotId) {
    map.set(current.snapshotId, parseSnapshotMetadata(lookup.doc.id, lookup.doc.data, projectId || (lookup.doc.data as any)?.projectId));
  }
  const entries: TimelineEntry[] = [];
  for (const [id, p] of map) {
    if (id === current?.snapshotId && !p.ok) continue;
    if (!p.ok) { entries.push({ id, kind: 'invalid', label: `appr_${id.replace(/^appr_/, '').slice(0, 8)}`, timeLabel: 'บันทึกเมื่อ ไม่ทราบเวลา', timeParts: { prefix: 'บันทึกเมื่อ ไม่ทราบเวลา' }, submitterLabel: HISTORY_LABELS.noName, outcome: 'ข้อมูลเวอร์ชันไม่ถูกต้อง', current: false, openable: false, comparable: false }); continue; }
    const m = p.meta;
    const isCurrent = id === current?.snapshotId;
    const orphan = !current || Date.parse(m.createdAt) > Date.parse(current.requestedAt);
    entries.push({ id, meta: m, kind: isCurrent ? m.backfill ? 'current-backfilled' : 'current-frozen' : orphan ? 'not-current' : 'earlier',
      label: isCurrent ? current.documentNumber : `appr_${m.approvalId.replace(/^appr_/, '').slice(0, 8)} — ${HISTORY_LABELS.noNumber}`,
      timeLabel: historyTimeLabel(m, isCurrent ? current : null, !isCurrent && orphan),
      timeParts: historyTimeParts(m, isCurrent ? current : null, !isCurrent && orphan),
      submitterLabel: isCurrent ? safeSubmitterName(current.requestedBy, m.createdByUid) : !m.backfill && m.createdByUid === uid ? 'คุณ' : HISTORY_LABELS.noName,
      outcome: isCurrent ? `${current.status === 'Rejected' ? 'ถูกปฏิเสธ' : current.status} · ${current.stageText}${current.status === 'Rejected' && current.rejectionReason ? ` · ${current.rejectionReason}` : ''}` : orphan ? HISTORY_LABELS.notCurrent : `${HISTORY_LABELS.earlier}${current && Number.isFinite(Date.parse(m.createdAt)) && Number.isFinite(Date.parse(current.requestedAt)) ? ` · ${HISTORY_LABELS.replaced}` : ''}`,
      current: isCurrent, openable: true, comparable: true });
  }
  entries.sort((a, b) => {
    const t = (e: TimelineEntry) => Number.isFinite(Date.parse(e.meta?.createdAt || '')) ? Date.parse(e.meta!.createdAt) : -Infinity;
    return (t(b) - t(a) || a.id.localeCompare(b.id));
  });
  if (current && (!current.snapshotId || !entries.some(e => e.id === current.snapshotId))) entries.unshift({
    id: current.snapshotId || `legacy:${current.id}`, kind: current.snapshotId ? 'current-unavailable' : 'current-legacy-live',
    timeParts: { prefix: current.snapshotId ? HISTORY_LABELS.unavailable : HISTORY_LABELS.legacy },
    label: current.documentNumber, timeLabel: current.snapshotId ? HISTORY_LABELS.unavailable : HISTORY_LABELS.legacy,
    submitterLabel: safeSubmitterName(current.requestedBy, uid), outcome: current.status === 'Rejected' ? `ถูกปฏิเสธ · ${current.rejectionReason || ''}` : current.status,
    current: true, openable: false, comparable: false,
  });
  return entries;
}
export function pickDefaultComparison(entries: TimelineEntry[]): { baseId: string; targetId: string } | null {
  const good = entries.filter(e => e.comparable);
  const index = good.findIndex(e => e.current);
  if (index >= 0) return good[index + 1] ? { baseId: good[index + 1].id, targetId: good[index].id } : null;
  return good.length >= 2 ? { baseId: good[1].id, targetId: good[0].id } : null;
}
