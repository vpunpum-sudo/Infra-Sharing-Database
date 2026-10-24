import React from 'react';
import { HISTORY_ROW_CAP } from '../utils/approvalHistory';
import type { SnapshotDiff } from '../utils/approvalSnapshotDiff';
const fieldLabels: Record<string, string> = {
  name: 'ชื่อ', routeCode: 'รหัสเส้นทาง', owner: 'เจ้าของ', owners: 'เจ้าของ', capacity: 'ความจุ',
  fiberType: 'ชนิดสาย', tier: 'Tier', tierSharingPartners: 'ผู้ร่วมใช้', startEnclosureId: 'จุดพักสายต้นทาง',
  endEnclosureId: 'จุดพักสายปลายทาง', totalLength: 'ความยาวที่บันทึกไว้ (ม.)', path: 'แนวเส้นทาง',
  coreOwners: 'จำนวนแกนที่เปลี่ยนเจ้าของ', position: 'ตำแหน่ง', enclosureTypeId: 'ชนิดจุดพักสาย',
  locationType: 'ประเภทสถานที่', locationName: 'ชื่อสถานที่', trayAssignments: 'จำนวนถาดที่เปลี่ยนเจ้าของ',
  portAssignments: 'จำนวนพอร์ตที่เปลี่ยนเจ้าของ', routeId: 'เส้นทาง', length: 'ความยาวที่บันทึกไว้ (ม.)',
};
export function display(value: any): string {
  if (value === undefined || value === null) return '-';
  if (Array.isArray(value)) return value.map(display).join(', ') || '-';
  if (typeof value === 'object') {
    if (typeof value.points === 'number' && Number.isFinite(value.points)) return `${value.points} จุด${value.vertexMoved ? ' · แนวเส้นทางเปลี่ยน' : ''}${value.startMoved ? ' · จุดเริ่มย้าย' : ''}${value.endMoved ? ' · จุดสิ้นสุดย้าย' : ''}`;
    if (typeof value.movedMetres === 'number' && Number.isFinite(value.movedMetres)) return `ย้าย ${value.movedMetres.toFixed(2)} ม.`;
    if (typeof value.lat === 'number' && Number.isFinite(value.lat) && typeof value.lng === 'number' && Number.isFinite(value.lng)) return `${value.lat}, ${value.lng}`;
    return '-';
  }
  return String(value);
}
export function formatTotalValue(key: string, value: number): string {
  return String(key === 'storedRouteLengthKm' ? Number(value.toFixed(3)) : value);
}
export function ApprovalDiffSummary({ diff, rows, onShowMore }: { diff: SnapshotDiff; rows: Record<string, number>; onShowMore: (key: string) => void }) {
  return <section className="mt-8 border-t border-slate-700 pt-6">
    <h3 className="text-lg font-semibold">สิ่งที่เปลี่ยนแปลง</h3>
    {!diff.hasChanges && <p className="mt-3">ไม่มีการเปลี่ยนแปลง</p>}
    <dl className="mt-3 space-y-1 tabular-nums">{Object.entries(diff.totals).map(([key, total]) => <div key={key} className="flex flex-wrap gap-x-3"><dt>{({ routes: 'เส้นทาง', enclosures: 'จุดพักสาย', loops: 'Loop', storedRouteLengthKm: 'ความยาวที่บันทึกไว้ (กม.)', routesWithoutStoredLength: 'เส้นทางที่ไม่ได้บันทึกความยาว' })[key]}</dt><dd>{formatTotalValue(key, total.before)} → {formatTotalValue(key, total.after)} (ผลต่าง {formatTotalValue(key, total.delta)})</dd></div>)}</dl>
    {diff.projectFields.map(f => <p className="mt-2 text-sm break-words" key={f.label}>{fieldLabels[f.label] || f.label}: {display(f.before)} → {display(f.after)}</p>)}
    {(diff.participatingOwners.added.length > 0 || diff.participatingOwners.removed.length > 0) && <p className="mt-2 text-sm">ผู้ร่วมโครงการ: เพิ่ม {diff.participatingOwners.added.join(', ') || '-'} · นำออก {diff.participatingOwners.removed.join(', ') || '-'}</p>}
    {(diff.warnings.skippedMalformed > 0 || diff.warnings.duplicateIds > 0) && <p role="status" className="text-amber-300 mt-3">ข้ามข้อมูลไม่ถูกต้อง {diff.warnings.skippedMalformed} รายการ · id ซ้ำ {diff.warnings.duplicateIds} รายการ</p>}
    {(['routes', 'enclosures', 'loops'] as const).map(key => {
      const d = diff[key], count = Math.min(HISTORY_ROW_CAP, rows[`diff/${key}`] || 50);
      const remainder = d.added + d.removed + d.changed - Math.min(count, d.details.length);
      return <div key={key} className="mt-4"><p className="font-medium">{({ routes: 'เส้นทาง', enclosures: 'จุดพักสาย', loops: 'Loop' })[key]}: เพิ่ม {d.added} · นำออก {d.removed} · เปลี่ยน {d.changed} · เหมือนเดิม {d.unchangedCount}</p>
        <details className="mt-2"><summary className="cursor-pointer text-sky-300 py-2">รายละเอียด</summary>
          <ul className="divide-y divide-slate-800">{d.details.slice(0, count).map(item => <li data-history-row={`diff/${key}`} className="py-2 text-sm break-words" key={item.id}>
            {item.id} · {({ added: 'เพิ่ม', removed: 'นำออก', changed: 'เปลี่ยน' })[item.kind]}
            {item.fields.map(f => <p className="text-slate-300 ml-3" key={f.label}>{fieldLabels[f.label] || f.label}: {display(f.before)} → {display(f.after)}</p>)}
          </li>)}</ul>
          {remainder > 0 && <p className="mt-2 text-sm">{count < Math.min(HISTORY_ROW_CAP, d.details.length) && <button type="button" className="text-sky-300 underline p-2 mr-3" onClick={() => onShowMore(`diff/${key}`)}>แสดงเพิ่ม</button>}และอีก {remainder} รายการ</p>}
        </details></div>;
    })}
    <p className="mt-4 text-sm text-slate-400">เปรียบเทียบตาม id: สายที่แยกจะปรากฏเป็นรายการนำออกและรายการเพิ่ม</p>
  </section>;
}
