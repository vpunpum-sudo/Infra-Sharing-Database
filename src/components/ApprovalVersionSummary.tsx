import React from 'react';
import type { ApprovalSnapshot } from '../utils/approvalSnapshot';
import { HISTORY_ROW_CAP, HISTORY_LABELS, type TimelineEntry } from '../utils/approvalHistory';
import { summarizeSnapshot, type SummaryRow } from '../utils/approvalSnapshotSummary';

export function ApprovalVersionSummary({ snapshot, entry, timeLabel, rows, onShowMore }: {
  snapshot: ApprovalSnapshot; entry: TimelineEntry; timeLabel?: string; rows: Record<string, number>; onShowMore: (key: string) => void;
}) {
  const summary = summarizeSnapshot(snapshot);
  function table(key: string, label: string, headings: string[], data: SummaryRow[]) {
    const count = Math.min(HISTORY_ROW_CAP, rows[`version/${key}`] || 50);
    return <section className="mt-6" key={key}>
      <h4 className="font-semibold mb-2">{label} ({data.length})</h4>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-slate-300"><tr>{headings.map(h => <th scope="col" className="p-2 border-b border-slate-700" key={h}>{h}</th>)}</tr></thead>
        <tbody>{data.slice(0, count).map(row => <tr key={row.id} data-history-row={`version/${key}`}>{row.cells.map((cell, i) => <td className="p-2 border-b border-slate-800 break-words max-w-xs" key={i}>{cell}</td>)}</tr>)}</tbody></table></div>
      {data.length > count && <div className="mt-2 flex items-center gap-3 text-sm">{count < HISTORY_ROW_CAP && <button type="button" onClick={() => onShowMore(`version/${key}`)} className="text-sky-300 underline p-2">แสดงเพิ่ม</button>}<span>และอีก {data.length - count} รายการ</span></div>}
    </section>;
  }
  return <section className="mt-8 border-t border-slate-700 pt-6">
    <h3 className="text-lg font-semibold">{snapshot.metadata.project.name} · {entry.label}</h3>
    <p className="text-slate-300 mt-1">{snapshot.metadata.project.routeCode || '-'} · {snapshot.metadata.participatingOwners.join(' + ')} · {timeLabel || entry.timeLabel}</p>
    <p className="text-sm text-slate-300 mt-2">เจ้าของโครงการ: {(snapshot.metadata.project.owners || [snapshot.metadata.project.owner]).filter(Boolean).join(', ') || '-'}</p>
    <p className="mt-3 tabular-nums">เส้นทาง {summary.counts.routes} · จุดพักสาย {summary.counts.enclosures} · Loop {summary.counts.loops}</p>
    <p className="text-sm text-slate-400 mt-2">ความยาวที่บันทึกไว้อาจต่างจากตารางในเอกสาร ซึ่งคำนวณจากแนวเส้นทางและปัดเศษ</p>
    {summary.skippedMalformed > 0 && <p role="status" className="text-amber-300 mt-2">ข้ามข้อมูลไม่ถูกต้อง {summary.skippedMalformed} รายการ</p>}
    {table('routes', 'เส้นทาง', ['ชื่อ', 'เจ้าของ', 'ความจุ', 'ความยาวที่บันทึกไว้ (ม.)'], summary.routes)}
    {table('enclosures', 'จุดพักสาย', ['ชื่อ', 'ชนิด', 'เจ้าของ'], summary.enclosures)}
    {table('loops', 'Loop', ['ชื่อ', 'ความยาวที่บันทึกไว้ (ม.)'], summary.loops)}
    <p className="text-sm text-slate-400 mt-4">{HISTORY_LABELS.omissions}</p>
  </section>;
}
