import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalProgress, defaultSchedule, expectedProgress, overallProgress, scheduleRange, taskStatus } from './schedule';
import { Project } from '../types';

const task = (start: string, end: string, progress: number, extra = {}) => ({ start, end, progress, ...extra });

test('expected progress runs evenly through the inclusive dates', () => {
  const t = task('2026-10-01', '2026-10-10', 0);
  assert.equal(expectedProgress(t, '2026-09-30'), 0);
  assert.equal(expectedProgress(t, '2026-10-05'), 50);
  assert.equal(expectedProgress(t, '2026-10-10'), 100);
  assert.equal(expectedProgress(task('2026-10-05', '2026-10-05', 0, { milestone: true }), '2026-10-05'), 100);
});

test('status compares progress with where the task should be', () => {
  const t = (progress: number) => task('2026-10-01', '2026-10-10', progress);
  assert.equal(taskStatus(t(100), '2026-10-05'), 'done');
  assert.equal(taskStatus(t(45), '2026-10-05'), 'in-progress');
  assert.equal(taskStatus(t(30), '2026-10-05'), 'late');
  assert.equal(taskStatus(t(0), '2026-10-09'), 'very-late');
  assert.equal(taskStatus(t(0), '2026-09-20'), 'not-started');
});

test('approval-linked tasks follow the design approval', () => {
  const p = (designApproval?: Partial<Project['designApproval']>) => ({ designApproval } as Pick<Project, 'designApproval' | 'status'>);
  assert.equal(approvalProgress(p()), 0);
  assert.equal(approvalProgress(p({ status: 'Pending Approval', approvalStage: 'Planning' })), 33);
  assert.equal(approvalProgress(p({ status: 'Pending Approval', approvalStage: 'OM' })), 66);
  assert.equal(approvalProgress(p({ status: 'Approved', approvalStage: 'Completed' })), 100);
  assert.equal(approvalProgress(p({ status: 'Rejected', approvalStage: 'Rejected' })), 0);
  const linked = task('2026-10-01', '2026-10-10', 0, { approvalLinked: true });
  assert.equal(taskStatus(linked, '2026-10-02', p({ status: 'Approved' })), 'done');
});

test('overall progress is weighted by days and ignores milestones', () => {
  const tasks = [task('2026-10-01', '2026-10-10', 100), task('2026-10-11', '2026-10-30', 0), task('2026-10-31', '2026-10-31', 0, { milestone: true })];
  const result = overallProgress(tasks, '2026-10-20');
  assert.equal(result.actual, 33);
  assert.equal(result.expected, 67);
  assert.equal(result.status, 'very-late');
  assert.deepEqual(scheduleRange(tasks), { start: '2026-10-01', end: '2026-10-31' });
});

test('default schedule lays the standard steps back to back', () => {
  const steps = defaultSchedule('2026-10-01');
  assert.equal(steps.length, 8);
  assert.deepEqual([steps[0].start, steps[0].end, steps[1].start], ['2026-10-01', '2026-10-10', '2026-10-11']);
  assert.ok(steps[2].approvalLinked);
  assert.ok(steps[7].milestone);
  assert.equal(steps[7].start, steps[7].end);
});
