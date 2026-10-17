import { Project, ScheduleSummary, ScheduleTask } from '../types';

export type ScheduleStatus = 'done' | 'late' | 'very-late' | 'in-progress' | 'not-started';
type Span = Pick<ScheduleTask, 'start' | 'end' | 'progress' | 'milestone' | 'approvalLinked'>;

const DAY = 86_400_000;
/** Midnight UTC of a YYYY-MM-DD date, so day arithmetic ignores time zones. */
export const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const fromDay = (time: number) => new Date(time).toISOString().slice(0, 10);
export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const addDays = (date: string, days: number) => fromDay(toDay(date) + days * DAY);
const clamp = (value: number) => Math.max(0, Math.min(100, value));
/** A task's end is inclusive: a one-day task starts and ends on the same date. */
const duration = (task: Span) => task.milestone ? 0 : (toDay(task.end) - toDay(task.start)) / DAY + 1;

/** Design approval as schedule progress: requested, Planning signed, O&M signed. */
export function approvalProgress(project?: Pick<Project, 'designApproval' | 'status'>) {
  const approval = project?.designApproval;
  if (!approval || approval.status === 'Rejected') return 0;
  if (approval.status === 'Approved' || approval.approvalStage === 'Completed') return 100;
  if (approval.approvalStage === 'OM') return 66;
  return 33;
}

export const effectiveProgress = (task: Span, project?: Pick<Project, 'designApproval' | 'status'>) =>
  task.approvalLinked ? approvalProgress(project) : clamp(task.progress || 0);

/** How far along the task should be on `today` if it ran evenly through its dates. */
export function expectedProgress(task: Span, today: string) {
  const now = toDay(today);
  if (task.milestone) return now >= toDay(task.start) ? 100 : 0;
  const elapsed = (now - toDay(task.start)) / DAY + 1;
  return clamp(elapsed / duration(task) * 100);
}

export function taskStatus(task: Span, today: string, project?: Pick<Project, 'designApproval' | 'status'>): ScheduleStatus {
  const progress = effectiveProgress(task, project);
  if (progress >= 100) return 'done';
  const gap = expectedProgress(task, today) - progress;
  if (gap > 40) return 'very-late';
  if (gap > 10) return 'late';
  return progress > 0 ? 'in-progress' : 'not-started';
}

/** Progress weighted by each task's length in days; milestones only count for the late check. */
export function overallProgress(tasks: Span[], today: string, project?: Pick<Project, 'designApproval' | 'status'>) {
  const work = tasks.filter(task => !task.milestone);
  const total = work.reduce((sum, task) => sum + duration(task), 0);
  if (!total) return { actual: 0, expected: 0, behind: 0, status: 'not-started' as ScheduleStatus };
  const actual = Math.round(work.reduce((sum, task) => sum + duration(task) * effectiveProgress(task, project), 0) / total);
  const expected = Math.round(work.reduce((sum, task) => sum + duration(task) * expectedProgress(task, today), 0) / total);
  const behind = Math.max(0, expected - actual);
  const status: ScheduleStatus = actual >= 100 ? 'done' : behind > 20 ? 'very-late' : behind > 5 ? 'late'
    : actual > 0 ? 'in-progress' : 'not-started';
  return { actual, expected, behind, status };
}

export function scheduleRange(tasks: Span[]) {
  if (!tasks.length) return null;
  const starts = tasks.map(task => toDay(task.start));
  const ends = tasks.map(task => toDay(task.end));
  return { start: fromDay(Math.min(...starts)), end: fromDay(Math.max(...ends)) };
}

export const summarize = (tasks: ScheduleTask[]): ScheduleSummary => ({
  items: tasks.map(({ start, end, progress, milestone, approvalLinked }) =>
    ({ start, end, progress, ...(milestone ? { milestone } : {}), ...(approvalLinked ? { approvalLinked } : {}) })),
  updatedAt: new Date().toISOString()
});

/** The standard steps of a fiber project, laid out back to back from `start`. */
export function defaultSchedule(start: string): Omit<ScheduleTask, 'id'>[] {
  const steps: [string, number, string, Partial<ScheduleTask>?][] = [
    ['สำรวจเส้นทาง', 10, 'Design'],
    ['ออกแบบ / วาดแผนที่', 14, 'Design'],
    ['ขออนุมัติแบบ', 14, 'Planning + O&M', { approvalLinked: true }],
    ['เตรียมวัสดุ / สาย', 14, 'ผู้รับเหมา'],
    ['ลากสาย Fiber', 21, 'ผู้รับเหมา'],
    ['ติดตั้ง Enclosure + Splice', 14, 'ผู้รับเหมา'],
    ['ทดสอบ OTDR', 5, 'Operator'],
    ['ส่งมอบงาน', 0, 'ทุก Operator', { milestone: true }]
  ];
  let cursor = start;
  return steps.map(([name, days, assignee, extra], order) => {
    const task = { name, assignee, order, progress: 0, start: cursor, end: days ? addDays(cursor, days - 1) : cursor, ...extra };
    if (days) cursor = addDays(cursor, days);
    return task;
  });
}

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  done: 'เสร็จแล้ว', 'very-late': 'ล่าช้ามาก', late: 'ล่าช้า', 'in-progress': 'กำลังทำ', 'not-started': 'ยังไม่เริ่ม'
};
/** Bar and chip colours per status (same in both themes; text is dark on the light chip). */
export const STATUS_COLORS: Record<ScheduleStatus, { bar: string; chipBg: string; chipText: string }> = {
  done: { bar: '#16a34a', chipBg: '#dcfce7', chipText: '#166534' },
  'very-late': { bar: '#dc2626', chipBg: '#fee2e2', chipText: '#991b1b' },
  late: { bar: '#f59e0b', chipBg: '#fef3c7', chipText: '#92400e' },
  'in-progress': { bar: '#0284c7', chipBg: '#e0f2fe', chipText: '#075985' },
  'not-started': { bar: '#94a3b8', chipBg: '#f1f5f9', chipText: '#475569' }
};
