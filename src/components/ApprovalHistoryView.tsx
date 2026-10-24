import React from 'react';
import { HISTORY_LABELS, MAX_FETCHED_DOCS, type TimeFormatter, type TimelineEntry } from '../utils/approvalHistory';
import type { HistoryController, HistoryState } from '../utils/approvalHistoryController';
import { ApprovalVersionSummary } from './ApprovalVersionSummary';
import { ApprovalDiffSummary } from './ApprovalDiffSummary';
export function ApprovalHistoryView({ state, controller, formatTime = s => s }: { state: HistoryState; controller: HistoryController; formatTime?: TimeFormatter }) {
  const comparable = state.list.entries.filter(e => e.comparable);
  const localTime = (entry: TimelineEntry) => entry.timeParts.time
    ? `${entry.timeParts.prefix} ${formatTime(entry.timeParts.time)}${entry.timeParts.suffix ?? ''}` : entry.timeLabel;
  const selected = state.list.entries.find(e => e.id === state.version.id);
  const retry = (slot: 'list' | 'version' | 'compare', error?: string) => <div role="alert" className="my-3 text-amber-300"><p>{error}</p><button type="button" onClick={() => void controller.retry(slot)} className="underline py-2">ลองอีกครั้ง</button></div>;
  return <section data-wi-pii="approval-history" className="fixed inset-0 z-[1200] bg-slate-950/80 p-2 sm:p-6 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="approval-history-heading">
    <div className="bg-slate-900 text-slate-100 w-full max-w-5xl max-h-full overflow-y-auto rounded-xl border border-slate-700 shadow-xl shadow-black/30 [color-scheme:dark] focus-within:[&_button:focus-visible]:outline-sky-300">
      <header className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 sm:px-6 flex justify-between items-center gap-4 z-10">
        <h2 id="approval-history-heading" className="text-xl font-semibold">ประวัติคำขอ</h2>
        <button type="button" onClick={() => controller.close()} className="p-2 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">ปิดประวัติ</button>
      </header>
      <div className="p-4 sm:p-6">
        <p className="text-sm text-slate-400 max-w-prose">{HISTORY_LABELS.omissions} · {HISTORY_LABELS.legacyNote}</p>
        {state.list.status === 'loading' && <p role="status" className="py-4">กำลังโหลดประวัติ…</p>}
        {state.list.status === 'error' && retry('list', state.list.error)}
        {state.list.status === 'ready' && !state.list.entries.length && <p className="py-8">{HISTORY_LABELS.empty}</p>}
        <ol className="mt-4 divide-y divide-slate-700">{state.list.entries.map(entry => <li key={entry.id} className="py-4 flex flex-wrap gap-3 items-start">
          <div className="flex-1 min-w-0 break-words"><h3 className="font-semibold">{entry.label} {entry.current && <span className="text-sky-300 text-sm">คำขอปัจจุบัน</span>}</h3>
            <p className="text-sm text-slate-300 mt-1">{localTime(entry)} · {entry.submitterLabel}</p><p className="text-sm text-slate-400 mt-1 max-w-prose">{entry.outcome}</p></div>
          {entry.openable && <button type="button" onClick={() => void controller.openVersion(entry.id)} className="px-3 py-2 bg-slate-800 rounded-lg text-sky-300 hover:bg-slate-700">เปิดดู</button>}
        </li>)}</ol>
        {state.list.hasMore && <button type="button" disabled={state.list.status === 'loading'} onClick={() => void controller.paginate()} className="py-2 px-3 bg-slate-800 rounded-lg disabled:opacity-50">โหลดเพิ่ม</button>}
        {state.list.fetchedCount >= MAX_FETCHED_DOCS && <p className="text-sm text-amber-300 mt-3">แสดงรายการบางส่วน: ครบ {MAX_FETCHED_DOCS} เวอร์ชันที่ดึงแล้ว</p>}
        {comparable.length >= 2 && <section className="mt-6 border-t border-slate-700 pt-4"><h3 className="font-semibold">เปรียบเทียบเวอร์ชัน</h3>
          <div className="flex flex-wrap items-end gap-3 mt-3">{(['baseId', 'targetId'] as const).map((key, i) => <label className="flex flex-col gap-1 text-sm min-w-0 flex-1" key={key}>{i === 0 ? 'เวอร์ชันตั้งต้น' : 'เวอร์ชันปลายทาง'}
            <select className="w-full min-w-0 bg-slate-800 rounded-lg p-2 border border-slate-600" value={state.selection[key] || ''} onChange={e => (i === 0 ? controller.selectBase : controller.selectTarget)(e.target.value)}><option value="" disabled>เลือกเวอร์ชัน</option>{comparable.map(entry => <option value={entry.id} key={entry.id}>{entry.label} · {localTime(entry)}</option>)}</select>
          </label>)}<button type="button" onClick={() => void controller.compare()} disabled={!state.selection.baseId || !state.selection.targetId || state.selection.baseId === state.selection.targetId || state.compare.status === 'loading'} className="px-4 py-2 bg-sky-700 text-white rounded-lg disabled:opacity-50">เปรียบเทียบ</button></div></section>}
        {state.version.status === 'loading' && <p role="status" className="mt-4">กำลังโหลดเวอร์ชัน…</p>}
        {state.version.status === 'error' && retry('version', state.version.error)}
        {state.version.status === 'ready' && state.version.data && selected && <ApprovalVersionSummary snapshot={state.version.data} entry={selected} timeLabel={localTime(selected)} rows={state.rows} onShowMore={controller.showMoreRows} />}
        {state.compare.status === 'loading' && <p role="status" className="mt-4">กำลังเปรียบเทียบ…</p>}
        {state.compare.status === 'error' && retry('compare', state.compare.error)}
        {state.compare.status === 'ready' && state.compare.diff && <ApprovalDiffSummary diff={state.compare.diff} rows={state.rows} onShowMore={controller.showMoreRows} />}
      </div>
    </div>
  </section>;
}
