import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

  assert.deepEqual(Object.keys(ACTION_EXACT_LABELS).sort(), ['closeContractorDraft', 'collapseDiagramInfo', 'exitDrawMode', 'expandTube', 'openApprovalDocument', 'openApprovalRequestForm', 'openContractorDraft', 'openSettingsForm', 'openSettingsTab', 'openSignForm', 'openSignSlide', 'pickOnMap']);
  for (const patterns of Object.values(ACTION_EXACT_LABELS)) {
    for (const pattern of patterns ?? []) {
      assert.ok(pattern.source.startsWith('^'));
      assert.ok(pattern.source.endsWith('$'));
    }
  }
});

test('approval request capture opens and closes only the local UI views', () => {
  for (const [label, action] of [
    ['กรอก/แก้ไขข้อมูลผู้รับจ้าง', 'openContractorDraft'],
    ['ยกเลิกการแก้ไข', 'closeContractorDraft'],
    ['ยื่นขออนุมัติใหม่', 'openApprovalRequestForm']
  ] as const) assert.doesNotThrow(() => assertSafeClickLabel(label, action));
  for (const [label, action] of [
    ['บันทึกข้อมูลผู้รับจ้าง', 'openContractorDraft'],
    ['ส่งคำขออนุมัติแบบ', 'openApprovalRequestForm'],
    ['ยืนยันการแก้ไข', 'closeContractorDraft']
  ] as const) assert.throws(() => assertSafeClickLabel(label, action));
});

test('goto accepts only approved app paths', () => {
  for (const path of ['/', '/login', '/profile', '/user-management', '/permission-management', '/settings', '/logs', '/project/abc']) assert.doesNotThrow(() => assertAllowedPath(path));
  for (const path of ['/admin', '/project/abc/delete', 'https://external.example/', '/logout']) assert.throws(() => assertAllowedPath(path));
});

test('missing menu items report absent or hidden commands', () => {
  assert.deepEqual(missingMenuItems(['Cut Fiber Here', 'Edit']), ['Split at Enclosure']);
  assert.deepEqual(missingMenuItems(['Cut Fiber Here', 'Split at Enclosure', 'Edit']), []);
});

test('open-only settings, map and slide controls match only their exact labels', () => {
  for (const [label, action] of [['Enclosure Types', 'openSettingsTab'], ['Add Type', 'openSettingsForm'], ['Pick on Map', 'pickOnMap'], ['6', 'openSignSlide'], ['Select', 'exitDrawMode']] as const) {
    assert.doesNotThrow(() => assertSafeClickLabel(label, action), label);
  }
  for (const [label, action] of [['Save Specification', 'openSettingsForm'], ['Save Enclosure', 'pickOnMap'], ['ลงนามอนุมัติ', 'openSignSlide'], ['Delete', 'openSettingsTab']] as const) {
    assert.throws(() => assertSafeClickLabel(label, action), label);
  }
});

test('the splice info card collapses only through its exact collapse title', () => {
  assert.doesNotThrow(() => assertSafeClickLabel('Click to collapse info', 'collapseDiagramInfo'));
  for (const label of ['Click to expand info', 'BJ#08 Sample Enclosure', 'Splice', 'Export PDF']) {
    assert.throws(() => assertSafeClickLabel(label, 'collapseDiagramInfo'), label);
  }
});

test('Core Manager tubes expand only through their exact local toggle label', () => {
  assert.doesNotThrow(() => assertSafeClickLabel('Expand tube 1', 'expandTube'));
  for (const label of ['Collapse tube 1', 'Expand tube', 'Tube 1', 'Save Changes', 'Edit']) {
    assert.throws(() => assertSafeClickLabel(label, 'expandTube'), label);
  }
  const source = readFileSync(new URL('../components/CoreManager.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label=\{canExpand \? `\$\{isExpanded \? 'Collapse' : 'Expand'\} tube \$\{tubeId\}` : undefined\}/);
});
