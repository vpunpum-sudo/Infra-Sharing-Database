import assert from 'node:assert/strict';
import test from 'node:test';
import { DesignApproval, Project } from '../types';
import { buildApprovalDocumentNumber } from './approvalDocumentNumber';

const october = new Date(2026, 9, 17);
const project = (id: string, routeCode?: string, documentNumber?: string): Project => ({
  id, name: 'ถนนบรม', uid: 'user', ...(routeCode ? { routeCode } : {}),
  ...(documentNumber ? { designApproval: { documentNumber } as DesignApproval } : {})
});

test('Thai-named projects without a route code get distinct numbers from their ids', () => {
  const a = buildApprovalDocumentNumber(project('3f9a2c1e-0000-4000-8000-000000000000'), october);
  const b = buildApprovalDocumentNumber(project('b71d04aa-0000-4000-8000-000000000000'), october);
  assert.equal(a, 'APP-202610-3F9A2C');
  assert.equal(b, 'APP-202610-B71D04');
});

test('the route code is used when it is set', () => {
  assert.equal(buildApprovalDocumentNumber(project('3f9a2c1e', ' bkk-r12 / สายหลัก '), october), 'APP-202610-BKK-R12');
});

test('a route code with no usable characters falls back to the project id', () => {
  assert.equal(buildApprovalDocumentNumber(project('3f9a2c1e', 'สายหลัก'), october), 'APP-202610-3F9A2C');
});

test('resubmitting in the same month adds a revision suffix', () => {
  assert.equal(buildApprovalDocumentNumber(project('3f9a2c1e', 'R12', 'APP-202610-R12'), october), 'APP-202610-R12-R2');
  assert.equal(buildApprovalDocumentNumber(project('3f9a2c1e', 'R12', 'APP-202610-R12-R2'), october), 'APP-202610-R12-R3');
});

test('a previous request from another month or the legacy format starts fresh', () => {
  assert.equal(buildApprovalDocumentNumber(project('3f9a2c1e', 'R12', 'APP-202609-R12-R4'), october), 'APP-202610-R12');
  assert.equal(buildApprovalDocumentNumber(project('3f9a2c1e', undefined, 'APP-202610-PROJ'), october), 'APP-202610-3F9A2C');
});
