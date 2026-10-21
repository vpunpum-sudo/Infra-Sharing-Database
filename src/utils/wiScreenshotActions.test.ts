import test from 'node:test';
import assert from 'node:assert/strict';
import { WI_ALLOWED_ACTIONS, ACTION_EXACT_LABELS, assertAllowedAction, assertSafeClickLabel, assertAllowedPath, missingMenuItems } from './wiScreenshotActions';

test('action allowlist contains only approved interactions', () => {
  assert.ok(WI_ALLOWED_ACTIONS.includes('openProjectForm'));
  assert.ok(WI_ALLOWED_ACTIONS.includes('openApprovalDocument'));
  assert.ok(WI_ALLOWED_ACTIONS.includes('openSignForm'));
  assert.ok(WI_ALLOWED_ACTIONS.includes('closeSignForm'));
  for (const action of WI_ALLOWED_ACTIONS) assert.doesNotThrow(() => assertAllowedAction(action));
  for (const action of ['submitApproval', 'clickSidebarRoute', 'zoomIn', 'zoomOut', 'drag', 'wheel', 'clickMenuItem', 'acceptDialog', 'save']) assert.throws(() => assertAllowedAction(action));
});

test('click labels deny dangerous commands and exceptions require exact match', () => {
  for (const label of ['บันทึก', 'Save', 'ยืนยัน', 'Confirm Changes?', 'ลบ', 'Delete User', 'ส่งคำขออนุมัติแบบ…', 'ลงนาม…', 'ไม่อนุมัติ', 'Upload', 'Export Diagram as PDF', 'Splice', 'Unsplice', 'ออกจากระบบ', 'Logout', 'ขอแก้ไข', 'อนุมัติ', 'ส่ง', 'Submit', 'Approve', 'Reject', 'Sign']) {
    assert.throws(() => assertSafeClickLabel(label), label);
  }
  for (const label of ['Cancel', 'Finish Drawing', 'Back to Projects', 'สร้างโครงการ', 'Splice Manager', 'ปิด', 'ยกเลิก']) assert.doesNotThrow(() => assertSafeClickLabel(label));
  assert.throws(() => assertSafeClickLabel('Finish Drawing and Save'));
  assert.throws(() => assertSafeClickLabel('ปิดและบันทึก'));
});

test('approval openers accept only full labels for their own action', () => {
  for (const [label, action] of [
    ['ลงนาม 2 ระดับ', 'openApprovalDocument'], ['เอกสารอนุมัติ', 'openApprovalDocument'],
    ['ลงนาม Planning (ITEL)', 'openSignForm'], ['ลงนาม O&M (ITEL)', 'openSignForm'],
    ['  ลงนาม   Planning (ITEL) ', 'openSignForm']
  ] as const) assert.doesNotThrow(() => assertSafeClickLabel(label, action), label);

  for (const [label, action] of [
    ['ลงนาม Planning (ITEL) ยืนยัน', 'openSignForm'], ['ลงนาม Planning ()', 'openSignForm'],
    ['ลงนาม Planning (A) (B)', 'openSignForm'], ['ลงนาม Planning ITEL', 'openSignForm'],
    ['xลงนาม 2 ระดับ', 'openApprovalDocument'], ['ลงนาม 2 ระดับ ยืนยัน', 'openApprovalDocument'],
    ['ลงนามอนุมัติ', 'openSignForm'], ['✓ ลงนามอนุมัติ', 'openSignForm'],
    ['ลงนาม', 'openSignForm'], ['ไม่อนุมัติ / ขอแก้ไข', 'openSignForm'],
    ['แก้ไขข้อมูล / ลงนามใหม่', 'openSignForm'], ['ส่งคำขออนุมัติแบบ', 'openApprovalDocument'],
    ['ลงนาม Planning (ITEL)', 'openApprovalDocument'], ['ลงนาม 2 ระดับ', 'openSignForm'],
    ['ลงนาม O&M (ITEL)', 'leftClickPoint']
  ] as const) assert.throws(() => assertSafeClickLabel(label, action), label);
  assert.throws(() => assertSafeClickLabel('ลงนาม 2 ระดับ'));

  assert.deepEqual(Object.keys(ACTION_EXACT_LABELS).sort(), ['openApprovalDocument', 'openSignForm']);
  for (const patterns of Object.values(ACTION_EXACT_LABELS)) {
    for (const pattern of patterns ?? []) {
      assert.ok(pattern.source.startsWith('^'));
      assert.ok(pattern.source.endsWith('$'));
    }
  }
});

test('goto accepts only approved app paths', () => {
  for (const path of ['/', '/login', '/profile', '/user-management', '/permission-management', '/settings', '/logs', '/project/abc']) assert.doesNotThrow(() => assertAllowedPath(path));
  for (const path of ['/admin', '/project/abc/delete', 'https://external.example/', '/logout']) assert.throws(() => assertAllowedPath(path));
});

test('missing menu items report absent or hidden commands', () => {
  assert.deepEqual(missingMenuItems(['Cut Fiber Here', 'Edit']), ['Split at Enclosure']);
  assert.deepEqual(missingMenuItems(['Cut Fiber Here', 'Split at Enclosure', 'Edit']), []);
});
