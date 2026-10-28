import React from 'react';
import type { ApprovalSnapshot } from '../utils/approvalSnapshot';
import { HISTORY_ROW_CAP, HISTORY_LABELS, type TimelineEntry } from '../utils/approvalHistory';
import { summarizeSnapshot, type SummaryRow } from '../utils/approvalSnapshotSummary';

type CellKind = 'name' | 'owners' | 'text' | 'count' | 'distance' | 'stored';
type Column = { head: string; kind: CellKind };

const OWNER_CHIP: Record<string, string> = {
  ITEL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  SYMC: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  UIH: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};
const MISSING = new Set(['-', 'ไม่ได้บันทึกไว้']);
const numeric = (kind: CellKind) => kind === 'count' || kind === 'distance' || kind === 'stored';

function OwnerChips({ value }: { value: string }) {
  if (MISSING.has(value)) return <span className="text-slate-500">-</span>;
  return <span className="flex flex-wrap gap-1">{value.split(', ').map(owner =>
    <span key={owner} className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${OWNER_CHIP[owner] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'}`}>{owner}</span>)}</span>;
}

function Cell({ kind, value }: { kind: CellKind; value: string | number }) {
  const missing = typeof value === 'string' && MISSING.has(value);
  if (kind === 'owners') return <OwnerChips value={String(value)} />;
  if (missing) return <span className={`text-slate-500 ${kind === 'stored' ? 'text-xs italic' : ''}`}>{value}</span>;
  if (kind === 'name') return <span className="font-medium text-slate-100">{value}</span>;
  if (kind === 'distance') return <span className="font-semibold text-sky-300">{value}</span>;
  if (kind === 'stored') return <span className="text-slate-400">{typeof value === 'number' ? value.toLocaleString('en-US') : value}</span>;
  return <>{value}</>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="flex-1 min-w-[7rem] rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="text-2xl font-semibold tabular-nums text-slate-100">{value.toLocaleString('en-US')}</div>
  </div>;
}

export function ApprovalVersionSummary({ snapshot, entry, timeLabel, rows, onShowMore }: {
  snapshot: ApprovalSnapshot; entry: TimelineEntry; timeLabel?: string; rows: Record<string, number>; onShowMore: (key: string) => void;
}) {
  const summary = summarizeSnapshot(snapshot);
  function table(key: string, label: string, columns: Column[], data: SummaryRow[]) {
    const count = Math.min(HISTORY_ROW_CAP, rows[`version/${key}`] || 50);
    return <section className="mt-8" key={key}>
      <h4 className="flex items-center gap-2 font-semibold mb-3 text-slate-100">{label}
        <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-xs font-semibold tabular-nums">{data.length}</span></h4>
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-400"><tr>{columns.map(({ head, kind }) =>
            <th scope="col" className={`px-4 py-3 font-semibold border-b border-slate-700 ${numeric(kind) ? 'text-right whitespace-nowrap' : ''}`} key={head}>{head}</th>)}</tr></thead>
          <tbody>{data.slice(0, count).map(row =>
            <tr key={row.id} data-history-row={`version/${key}`} className="hover:bg-slate-800/40 transition-colors [&:last-child>td]:border-b-0">
              {row.cells.map((cell, i) => <td className={`px-4 py-3 align-middle break-words border-b border-slate-800 ${numeric(columns[i]?.kind) ? 'text-right tabular-nums whitespace-nowrap' : 'max-w-xs'} ${i === 0 ? 'min-w-[14rem]' : 'text-slate-300'}`} key={i}>
                <Cell kind={columns[i]?.kind || 'text'} value={cell} /></td>)}
            </tr>)}</tbody>
        </table>
      </div>
      {data.length > count && <div className="mt-3 flex items-center gap-3 text-sm text-slate-400">{count < HISTORY_ROW_CAP && <button type="button" onClick={() => onShowMore(`version/${key}`)} className="px-3 py-1.5 rounded-lg border border-slate-600 text-sky-300 hover:bg-slate-800">แสดงเพิ่ม</button>}<span>และอีก {data.length - count} รายการ</span></div>}
    </section>;
  }
  const projectOwners = (snapshot.metadata.project.owners || [snapshot.metadata.project.owner]).filter(Boolean).join(', ') || '-';
  return <section className="mt-8 border-t border-slate-700 pt-6">
    <h3 className="text-lg font-semibold">{snapshot.metadata.project.name} · {entry.label}</h3>
    <p className="text-slate-300 mt-1">{snapshot.metadata.project.routeCode || '-'} · {snapshot.metadata.participatingOwners.join(' + ')} · {timeLabel || entry.timeLabel}</p>
    <div className="text-sm text-slate-300 mt-2 flex flex-wrap items-center gap-2"><span>เจ้าของโครงการ:</span><OwnerChips value={projectOwners} /></div>
    <div className="mt-4 flex flex-wrap gap-3 tabular-nums">
      <Stat label="เส้นทาง" value={summary.counts.routes} />
      <Stat label="จุดพักสาย" value={summary.counts.enclosures} />
      <Stat label="Loop" value={summary.counts.loops} />
    </div>
    <p className="text-sm text-slate-400 mt-4 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">ระยะ (กม.) คำนวณแบบเดียวกับตารางในเอกสาร (ใช้ความยาวที่บันทึกไว้ก่อน ถ้าไม่มีจึงคำนวณจากแนวเส้นทาง) และปัดเศษ ส่วนความยาวที่บันทึกไว้คือค่าที่เก็บไว้ในข้อมูลโดยตรง</p>
    {summary.skippedMalformed > 0 && <p role="status" className="text-amber-300 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">ข้ามข้อมูลไม่ถูกต้อง {summary.skippedMalformed} รายการ</p>}
    {table('routes', 'เส้นทาง', [{ head: 'ชื่อ', kind: 'name' }, { head: 'เจ้าของ', kind: 'owners' }, { head: 'ความจุ', kind: 'count' }, { head: 'ระยะ (กม.)', kind: 'distance' }, { head: 'ความยาวที่บันทึกไว้ (ม.)', kind: 'stored' }], summary.routes)}
    {table('enclosures', 'จุดพักสาย', [{ head: 'ชื่อ', kind: 'name' }, { head: 'ชนิด', kind: 'text' }, { head: 'เจ้าของ', kind: 'owners' }], summary.enclosures)}
    {table('loops', 'Loop', [{ head: 'ชื่อ', kind: 'name' }, { head: 'ความยาวที่บันทึกไว้ (ม.)', kind: 'stored' }], summary.loops)}
    <p className="text-sm text-slate-400 mt-6">{HISTORY_LABELS.omissions}</p>
  </section>;
}
