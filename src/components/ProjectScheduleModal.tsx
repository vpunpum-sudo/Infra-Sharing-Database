import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { CalendarRange, Diamond, Link2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../firebase';
import { Project, ScheduleLogEntry, ScheduleTask, User as AppUser } from '../types';
import {
  addDays, defaultSchedule, effectiveProgress, expectedProgress, overallProgress, scheduleRange, STATUS_COLORS,
  STATUS_LABELS, ScheduleStatus, summarize, taskStatus, toDay, todayIso
} from '../utils/schedule';
import { useConfirm } from './ConfirmModal';
import { useToast } from './Toast';

const DAY = 86_400_000;
const thaiDate = (date: string, withYear = false) => new Date(`${date}T00:00:00`).toLocaleDateString('th-TH',
  withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });

export function StatusChip({ status, label }: { status: ScheduleStatus; label?: string }) {
  const color = STATUS_COLORS[status];
  return <span className="schedule-chip" style={{ backgroundColor: color.chipBg, color: color.chipText }}>{label || STATUS_LABELS[status]}</span>;
}

type SaveSchedule = (next: ScheduleTask[], changed: ScheduleTask[], removed?: string[],
  log?: Omit<ScheduleLogEntry, 'id' | 'at' | 'byUid' | 'byName'>) => Promise<boolean>;

/** Loads the plan from Firestore and saves changes in one batch with the project summary. */
export function ProjectScheduleModal({ project, appUser, canEdit, onClose }: {
  project: Project; appUser: AppUser | null; canEdit: boolean; onClose: () => void;
}) {
  const [tasks, setTasks] = useState<ScheduleTask[] | null>(null);
  const [logs, setLogs] = useState<ScheduleLogEntry[]>([]);
  const notify = useToast();
  const base = `projects/${project.id}`;

  useEffect(() => onSnapshot(collection(db, `${base}/schedule`), snapshot => {
    setTasks(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as ScheduleTask)
      .sort((a, b) => a.order - b.order || a.start.localeCompare(b.start)));
  }, () => { setTasks([]); notify('โหลดแผนงานไม่สำเร็จ กรุณาตรวจสอบสิทธิ์', 'error'); }), [base, notify]);

  useEffect(() => onSnapshot(query(collection(db, `${base}/scheduleLogs`), orderBy('at', 'desc')), snapshot => {
    setLogs(snapshot.docs.map(item => item.data() as ScheduleLogEntry));
  }, () => setLogs([])), [base]);

  const save: SaveSchedule = async (next, changed, removed = [], log) => {
    try {
      const batch = writeBatch(db);
      const stamp = { updatedAt: new Date().toISOString(), updatedBy: appUser?.id || '' };
      changed.forEach(task => batch.set(doc(db, `${base}/schedule`, task.id), { ...task, ...stamp }));
      removed.forEach(id => batch.delete(doc(db, `${base}/schedule`, id)));
      batch.update(doc(db, 'projects', project.id), { scheduleSummary: summarize(next) });
      if (log) {
        const id = uuidv4();
        batch.set(doc(db, `${base}/scheduleLogs`, id), { ...log, id, at: stamp.updatedAt, byUid: appUser?.id || '',
          byName: appUser?.displayName || appUser?.email || '' });
      }
      await batch.commit();
      return true;
    } catch (error) {
      console.error('Schedule save failed', error);
      notify('บันทึกแผนงานไม่สำเร็จ กรุณาตรวจสอบสิทธิ์แล้วลองใหม่', 'error');
      return false;
    }
  };

  return <ScheduleView project={project} canEdit={canEdit} onClose={onClose} tasks={tasks} logs={logs} save={save} />;
}

/** The schedule window itself; data and saving come from the caller. */
export function ScheduleView({ project, canEdit, onClose, tasks, logs, save: persist }: {
  project: Project; canEdit: boolean; onClose: () => void;
  tasks: ScheduleTask[] | null; logs: ScheduleLogEntry[]; save: SaveSchedule;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleTask | null>(null);
  const [note, setNote] = useState('');
  const [planStart, setPlanStart] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const notify = useToast();
  const confirm = useConfirm();
  const today = todayIso();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Keep a selection, and reset the edit form when the selected task changes on the server.
  const selected = tasks?.find(task => task.id === selectedId) || tasks?.[0] || null;
  useEffect(() => { setDraft(selected ? { ...selected } : null); setNote(''); }, [selected?.id, selected?.updatedAt]);

  const overall = useMemo(() => overallProgress(tasks || [], today, project), [tasks, today, project]);
  const range = useMemo(() => scheduleRange(tasks || []), [tasks]);
  const counts = useMemo(() => {
    const work = (tasks || []).filter(task => !task.milestone);
    const statuses = work.map(task => taskStatus(task, today, project));
    return { all: work.length, done: statuses.filter(s => s === 'done').length,
      doing: statuses.filter(s => s === 'in-progress').length, late: statuses.filter(s => s === 'late' || s === 'very-late').length };
  }, [tasks, today, project]);

  // Timeline scale: plan range plus a little air, and today if it falls just outside.
  const scale = useMemo(() => {
    if (!range) return null;
    const start = Math.min(toDay(range.start), toDay(today)) - 2 * DAY;
    const end = Math.max(toDay(range.end), Math.min(toDay(today), toDay(range.end) + 30 * DAY)) + 3 * DAY;
    const at = (date: string) => (toDay(date) - start) / (end - start) * 100;
    const months: { label: string; left: number }[] = [];
    const cursor = new Date(start);
    cursor.setUTCDate(1);
    while (cursor.getTime() <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      // The first, partial month is labelled at the left edge.
      const left = cursor.getTime() < start ? 0 : at(iso);
      const label = new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { month: 'short' });
      // A partial first month too close to the next one gives way to it.
      if (months.length && left - months[months.length - 1].left <= 6) months.pop();
      months.push({ label, left });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { at, months, dayWidth: DAY / (end - start) * 100 };
  }, [range, today]);

  async function save(...args: Parameters<SaveSchedule>) {
    setSaving(true);
    try { return await persist(...args); } finally { setSaving(false); }
  }

  async function createDefault() {
    const created = defaultSchedule(planStart).map(task => ({ ...task, id: uuidv4() }));
    if (await save(created, created)) { setSelectedId(created[0].id); notify('สร้างแผนงานแล้ว'); }
  }

  async function saveDraft() {
    if (!draft || !tasks) return;
    const name = draft.name.trim();
    if (!name) { notify('ใส่ชื่องานก่อนบันทึก', 'error'); return; }
    if (!draft.milestone && draft.end < draft.start) { notify('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }
    const task = { ...draft, name, end: draft.milestone ? draft.start : draft.end };
    const previous = tasks.find(item => item.id === task.id);
    const progressChanged = !task.approvalLinked && previous?.progress !== task.progress;
    const log = note.trim() || progressChanged
      ? { taskId: task.id, taskName: task.name, text: note.trim(), progress: effectiveProgress(task, project) } : undefined;
    if (await save(tasks.map(item => item.id === task.id ? task : item), [task], [], log)) notify('บันทึกแล้ว');
  }

  async function addTask() {
    if (!tasks) return;
    const last = tasks[tasks.length - 1];
    const start = last ? addDays(last.end, 1) : today;
    const task: ScheduleTask = { id: uuidv4(), name: 'งานใหม่', start, end: addDays(start, 6), progress: 0,
      order: (last?.order ?? -1) + 1, assignee: '' };
    if (await save([...tasks, task], [task])) setSelectedId(task.id);
  }

  async function removeTask(task: ScheduleTask) {
    if (!tasks || !(await confirm({ title: 'ลบงานนี้?', message: `“${task.name}” จะถูกลบออกจากแผนงาน` }))) return;
    if (await save(tasks.filter(item => item.id !== task.id), [], [task.id])) { setSelectedId(null); notify('ลบงานแล้ว'); }
  }

  const status = draft ? taskStatus(draft, today, project) : 'not-started';
  const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 disabled:opacity-70';
  const taskLogs = logs.filter(log => log.taskId === selected?.id).slice(0, 20);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-2 sm:p-4" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-label={`แผนงานโครงการ ${project.name}`}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-700 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarRange size={20} /> แผนงานโครงการ</h2>
            <p className="mt-1 truncate text-sm text-slate-300">
              {project.name}{range ? ` · ${thaiDate(range.start)} – ${thaiDate(range.end, true)}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {tasks?.length ? <StatusChip status={overall.status}
              label={overall.behind > 5 ? `ล่าช้ากว่าแผน ${overall.behind}%` : overall.status === 'done' ? 'เสร็จแล้ว' : 'ตามแผน'} /> : null}
            <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-2 hover:bg-slate-800"><X size={18} /></button>
          </div>
        </header>

        <div className="overflow-y-auto p-4 sm:p-5">
          {tasks === null ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-300"><Loader2 className="animate-spin" size={16} /> กำลังโหลดแผนงาน...</div>
          ) : tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-600 p-8 text-center">
              <CalendarRange size={32} className="mx-auto mb-3 text-slate-400" />
              <h3 className="text-base font-bold">เริ่มติดตามความคืบหน้าโครงการ</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-300">
                สร้างแผนจากขั้นตอนมาตรฐาน (สำรวจ → ออกแบบ → ขออนุมัติ → เตรียมวัสดุ → ลากสาย → Splice → ทดสอบ OTDR → ส่งมอบ) แล้วปรับวันที่ได้ภายหลัง
              </p>
              {canEdit ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <label htmlFor="schedule-start" className="text-sm text-slate-300">วันเริ่มโครงการ</label>
                  <input id="schedule-start" type="date" value={planStart} onChange={event => setPlanStart(event.target.value)} className={`${field} w-auto`} />
                  <button type="button" onClick={createDefault} disabled={saving || !planStart} className="btn-primary px-4 py-2 text-sm">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} สร้างแผนงาน
                  </button>
                </div>
              ) : <p className="mt-4 text-sm text-slate-400">ยังไม่มีแผนงาน ผู้ที่แก้ไขโครงการได้จะเป็นผู้สร้าง</p>}
            </div>
          ) : (
            <>
              {/* Overall progress against the plan */}
              <div className="flex items-center gap-3">
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${overall.actual}%`, backgroundColor: STATUS_COLORS[overall.status].bar }} />
                  <div className="absolute inset-y-0 border-r-2 border-dashed border-rose-500" style={{ left: `${overall.expected}%` }} title={`ตามแผน ${overall.expected}%`} />
                </div>
                <span className="whitespace-nowrap text-sm text-slate-300">จริง <b className="text-slate-100">{overall.actual}%</b> · ตามแผน {overall.expected}%</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[['งานทั้งหมด', counts.all, ''], ['เสร็จแล้ว', counts.done, 'text-emerald-400'], ['กำลังทำ', counts.doing, 'text-sky-300'], ['ล่าช้า', counts.late, 'text-rose-300']]
                  .map(([label, value, color]) => (
                    <div key={label as string} className="rounded-xl bg-slate-800/70 px-3 py-2">
                      <div className="text-xs text-slate-400">{label}</div>
                      <div className={`text-xl font-bold ${color}`}>{value}</div>
                    </div>
                  ))}
              </div>

              {/* Gantt timeline */}
              {scale && (
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-[180px_minmax(0,1fr)_48px] gap-2 px-2 text-xs text-slate-400">
                      <span>ขั้นตอน</span>
                      <div className="relative h-4">{scale.months.map(month =>
                        <span key={`${month.label}-${month.left}`} className="absolute" style={{ left: `${month.left}%` }}>{month.label}</span>)}</div>
                      <span className="text-right">%</span>
                    </div>
                    <div className="relative mt-1">
                      {tasks.map(task => {
                        const taskState = taskStatus(task, today, project);
                        const progress = effectiveProgress(task, project);
                        const left = scale.at(task.start);
                        const width = Math.max(scale.at(task.end) - left + scale.dayWidth, scale.dayWidth);
                        const isSelected = task.id === selected?.id;
                        return (
                          <button key={task.id} type="button" onClick={() => setSelectedId(task.id)} aria-pressed={isSelected}
                            className={`schedule-row grid w-full grid-cols-[180px_minmax(0,1fr)_48px] items-center gap-2 rounded-lg px-2 py-1.5 text-left ${isSelected ? 'schedule-row-selected' : ''}`}>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1 truncate text-sm font-semibold">
                                {task.approvalLinked && <Link2 size={13} className="shrink-0 text-sky-300" aria-label="ซิงก์กับเอกสารอนุมัติ" />}
                                <span className="truncate">{task.name}</span>
                              </span>
                              <span className="block text-xs text-slate-400">{STATUS_LABELS[taskState]}</span>
                            </span>
                            <span className="relative block h-5">
                              {task.milestone ? (
                                <Diamond size={16} className="absolute top-0.5 text-sky-300" style={{ left: `calc(${left}% - 8px)` }} />
                              ) : <>
                                <span className="schedule-plan absolute top-1 h-3 rounded" style={{ left: `${left}%`, width: `${width}%` }} />
                                <span className="absolute top-1 h-3 rounded" style={{ left: `${left}%`, width: `${width * progress / 100}%`, backgroundColor: STATUS_COLORS[taskState].bar }} />
                              </>}
                            </span>
                            <span className="text-right text-sm font-bold">{task.milestone ? '' : `${progress}%`}</span>
                          </button>
                        );
                      })}
                      <div className="pointer-events-none absolute inset-y-0 left-[196px] right-[64px]">
                        <div className="absolute inset-y-0 border-l-2 border-dashed border-rose-500" style={{ left: `${scale.at(today)}%` }} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 px-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5"><span className="schedule-plan inline-block h-2 w-5 rounded" /> แผน</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded" style={{ backgroundColor: STATUS_COLORS['in-progress'].bar }} /> ทำได้จริง</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-3 border-l-2 border-dashed border-rose-500" /> วันนี้ {thaiDate(today)}</span>
                      <span className="flex items-center gap-1.5"><Link2 size={12} /> ซิงก์กับเอกสารอนุมัติ</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected task */}
              {draft && (
                <div className="mt-4 rounded-xl border border-slate-700 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <input aria-label="ชื่องาน" value={draft.name} disabled={!canEdit} maxLength={80}
                      onChange={event => setDraft({ ...draft, name: event.target.value })}
                      className={`${field} max-w-sm text-base font-bold`} />
                    <div className="flex items-center gap-2">
                      <StatusChip status={status} />
                      {canEdit && <button type="button" onClick={() => removeTask(draft)} disabled={saving} aria-label="ลบงานนี้" title="ลบงานนี้"
                        className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 size={16} /></button>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <label className="text-xs text-slate-400">ผู้รับผิดชอบ
                      <input data-wi-pii="task-owner" value={draft.assignee || ''} disabled={!canEdit} maxLength={60} placeholder="เช่น ผู้รับเหมา, ITEL"
                        onChange={event => setDraft({ ...draft, assignee: event.target.value })} className={`${field} mt-1`} />
                    </label>
                    <label className="text-xs text-slate-400">{draft.milestone ? 'วันที่' : 'เริ่ม'}
                      <input type="date" value={draft.start} disabled={!canEdit}
                        onChange={event => setDraft({ ...draft, start: event.target.value })} className={`${field} mt-1`} />
                    </label>
                    {!draft.milestone && <label className="text-xs text-slate-400">สิ้นสุด
                      <input type="date" value={draft.end} disabled={!canEdit} min={draft.start}
                        onChange={event => setDraft({ ...draft, end: event.target.value })} className={`${field} mt-1`} />
                    </label>}
                    <div className="text-xs text-slate-400">ควรเสร็จวันนี้
                      <div className="mt-1 py-1.5 text-sm font-bold text-slate-100">{Math.round(expectedProgress(draft, today))}%</div>
                    </div>
                  </div>

                  {draft.approvalLinked ? (
                    <p className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 text-sm text-sky-200">
                      <Link2 size={14} className="mr-1 inline" /> ความคืบหน้าดึงจากเอกสารอนุมัติ: {effectiveProgress(draft, project)}%
                      ({project.designApproval ? (project.designApproval.status === 'Approved' ? 'อนุมัติครบแล้ว' : project.designApproval.status === 'Rejected' ? 'ไม่อนุมัติ' : `รออนุมัติระดับ ${project.designApproval.approvalStage === 'OM' ? 'O&M' : 'Planning'}`) : 'ยังไม่ได้ส่งขออนุมัติ'})
                    </p>
                  ) : !draft.milestone && (
                    <div className="mt-3 flex items-center gap-3">
                      <label htmlFor="schedule-progress" className="text-sm text-slate-300">ความคืบหน้า</label>
                      <input id="schedule-progress" type="range" min={0} max={100} step={5} value={draft.progress} disabled={!canEdit}
                        onChange={event => setDraft({ ...draft, progress: Number(event.target.value) })} className="flex-1 accent-sky-500" />
                      <span className="w-12 text-right text-base font-bold">{draft.progress}%</span>
                    </div>
                  )}
                  {draft.milestone && !draft.approvalLinked && (
                    <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={draft.progress >= 100} disabled={!canEdit}
                        onChange={event => setDraft({ ...draft, progress: event.target.checked ? 100 : 0 })} /> ถึงหมุดหมายนี้แล้ว
                    </label>
                  )}

                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input value={note} onChange={event => setNote(event.target.value)} maxLength={300}
                        onKeyDown={event => { if (event.key === 'Enter') saveDraft(); }}
                        placeholder="บันทึกความคืบหน้า เช่น ลากสายถึง BJ#03 แล้ว" aria-label="บันทึกความคืบหน้า" className={`${field} min-w-[220px] flex-1`} />
                      <button type="button" onClick={saveDraft} disabled={saving} className="btn-primary px-4 py-2 text-sm">
                        {saving && <Loader2 size={16} className="animate-spin" />} บันทึก
                      </button>
                    </div>
                  )}

                  {taskLogs.length > 0 && (
                    <div className="mt-4">
                      <h3 className="mb-2 text-xs font-bold text-slate-400">ประวัติความคืบหน้า</h3>
                      <ul className="space-y-1.5">
                        {taskLogs.map(log => (
                          <li key={log.id} className="flex gap-3 text-sm">
                            <span className="w-28 shrink-0 text-xs text-slate-400">{new Date(log.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            <span className="min-w-0"><b>{log.progress}%</b>{log.text && ` · ${log.text}`}
                              <span data-wi-pii="schedule-history-name" className="text-xs text-slate-400"> — {log.byName}</span></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {canEdit && (
                <button type="button" onClick={addTask} disabled={saving} className="card-action mt-3">
                  <Plus size={14} /> เพิ่มงาน
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
