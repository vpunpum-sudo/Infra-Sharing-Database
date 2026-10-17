const test = require('node:test');
const assert = require('node:assert/strict');
const {
  notificationForTransition, notificationRecipients, deliveryId, emailContent
} = require('./approvalNotifications');

const signOffs = status => ({ ITEL: { status }, UIH: { status } });
const project = (stage, planning = signOffs('Pending'), om = signOffs('Pending')) => ({
  name: 'ทดสอบ <Project>', owners: ['ITEL', 'UIH'], status: stage === 'Completed' ? 'Approved' : 'Pending Approval',
  designApproval: { id: 'approval-1', documentNumber: 'APP-1', approvalStage: stage,
    planningSignOffs: planning, omSignOffs: om }
});

test('submission targets Design and Planning for participating owners', () => {
  const notice = notificationForTransition({ status: 'Draft' }, project('Planning'));
  assert.equal(notice.kind, 'planning-requested');
  assert.deepEqual(notice.roles, ['Design', 'Planning']);
  assert.deepEqual(notice.owners, ['ITEL', 'UIH']);
});

test('Management notice requires all Planning approvals', () => {
  const before = project('Planning');
  assert.equal(notificationForTransition(before, project('OM')), null);
  const notice = notificationForTransition(before, project('OM', signOffs('Approved')));
  assert.equal(notice.kind, 'management-requested');
  assert.deepEqual(notice.roles, ['Management']);
});

test('completion requires both approval levels and targets Design, Planning and Management', () => {
  const before = project('OM', signOffs('Approved'));
  assert.equal(notificationForTransition(before, project('Completed', signOffs('Approved'))), null);
  const notice = notificationForTransition(before,
    project('Completed', signOffs('Approved'), signOffs('Approved')));
  assert.equal(notice.kind, 'approval-completed');
  assert.deepEqual(notice.roles, ['Design', 'Planning', 'Management']);
});

test('recipient emails are unique, approved and limited to owner and role', () => {
  const notice = notificationForTransition(project('Planning'), project('OM', signOffs('Approved')));
  const users = [
    { email: 'A@EXAMPLE.COM', role: 'Management', owner: 'ITEL', isApproved: true },
    { email: 'a@example.com', role: 'Management', owner: 'UIH', isApproved: true },
    { email: 'b@example.com', role: 'Management', owner: 'SYMC', isApproved: true },
    { email: 'c@example.com', role: 'Design', owner: 'UIH', isApproved: true },
    { email: 'd@example.com', role: 'Management', owner: 'UIH', isApproved: false }
  ];
  assert.deepEqual(notificationRecipients(users, notice), ['a@example.com']);
});

test('same event has stable delivery key; HTML is escaped', () => {
  const notice = notificationForTransition({ status: 'Draft' }, project('Planning'));
  assert.equal(deliveryId('p1', notice, 'a@example.com'),
    deliveryId('p1', notice, 'a@example.com'));
  assert.notEqual(deliveryId('p1', notice, 'a@example.com'),
    deliveryId('p1', { ...notice, kind: 'approval-completed' }, 'a@example.com'));
  // Same change retried: same id. Same transition again later (new event): new id.
  assert.equal(deliveryId('p1', notice, 'a@example.com', 'event-1'), deliveryId('p1', notice, 'a@example.com', 'event-1'));
  assert.notEqual(deliveryId('p1', notice, 'a@example.com', 'event-1'), deliveryId('p1', notice, 'a@example.com', 'event-2'));
  assert.match(emailContent(notice, 'https://example.com').html, /&lt;Project&gt;/);
});

test('projects without explicitly participating owners do not notify every company', () => {
  const after = project('Planning');
  delete after.owners;
  assert.equal(notificationForTransition({ status: 'Draft' }, after), null);
});

test('Planning users receive the Planning-stage request', () => {
  const notice = notificationForTransition({ status: 'Draft' }, project('Planning'));
  const users = [
    { email: 'planner@example.com', role: 'Planning', owner: 'UIH', isApproved: true },
    { email: 'designer@example.com', role: 'Design', owner: 'ITEL', isApproved: true },
    { email: 'manager@example.com', role: 'Management', owner: 'UIH', isApproved: true }
  ];
  assert.deepEqual(notificationRecipients(users, notice),
    ['designer@example.com', 'planner@example.com']);
});

test('approval email lists project details, sign-off status and a direct project link', () => {
  const after = project('Planning', {
    ITEL: { status: 'Approved', signedBy: 'Somchai', signedAt: '2026-10-16T05:00:00.000Z' }, UIH: { status: 'Pending' }
  });
  after.routeCode = 'BKK-R01';
  Object.assign(after.designApproval, {
    requestedBy: 'Verayut', requestedByEmail: 'v@example.com', requestedAt: '2026-10-16T12:01:00.000Z',
    projectCorridorDistanceKm: 1.25, totalOperationDistanceKm: 2.5, contractorName: 'ACME', contractorPoNumber: 'PO-9'
  });
  const notice = notificationForTransition({ status: 'Draft' }, after);
  const { subject, text, html } = emailContent(notice, 'https://app.example.com/', 'proj 1');

  assert.equal(subject, '[Fiber Sharing] มีเอกสารรออนุมัติขั้น Planning: ทดสอบ <Project> (APP-1)');
  for (const expected of ['รหัสเส้นทาง: BKK-R01', 'ผู้ขออนุมัติ: Verayut (v@example.com)', 'วันที่ขออนุมัติ: 16 ต.ค. 2569 19:01 น.',
    'ระยะ Project Corridor: 1.25 กม.', 'ผู้รับเหมา: ACME / PO PO-9', 'Operator: ITEL, UIH',
    '- ITEL: Planning อนุมัติแล้ว (Somchai, 16 ต.ค. 2569 12:00 น.)', '- UIH: Planning รออนุมัติ',
    'https://app.example.com/project/proj%201']) {
    assert.ok(text.includes(expected), `text should include ${expected}`);
  }
  assert.ok(!text.includes('วันติดตั้งโดยประมาณ'), 'empty fields are omitted');
  assert.match(html, /href="https:\/\/app\.example\.com\/project\/proj%201"/);
  assert.match(html, /อนุมัติแล้ว/);
  assert.doesNotMatch(html, /<Project>/);
});

test('signed documents saved after the completion email trigger a follow-up email', () => {
  const owners = ['ITEL'];
  const signed = { ITEL: { status: 'Approved' } };
  const approval = { id: 'a1', documentNumber: 'D-1', approvalStage: 'Completed', status: 'Approved',
    planningSignOffs: signed, omSignOffs: signed, finalApprovedAt: '2026-10-17T13:30:00.000Z' };
  const before = { name: 'P', owners, status: 'Approved', designApproval: approval };
  const after = { ...before, designApproval: { ...approval, finalDocuments: { pdfFileId: 'f1' } } };
  assert.equal(notificationForTransition(before, after, '2026-10-17T13:40:00.000Z')?.kind, 'final-documents');
  // Within the completion email's wait the documents ride along with it instead.
  assert.equal(notificationForTransition(before, after, '2026-10-17T13:31:00.000Z'), null);
  // Already recorded before: nothing new.
  assert.equal(notificationForTransition(after, after, '2026-10-17T13:40:00.000Z'), null);
});

