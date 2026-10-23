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

const rejectedProject = (planning = signOffs('Pending'), om = signOffs('Pending'), reason = '') => {
  const after = project('Rejected', planning, om);
  after.status = 'Rejected';
  after.designApproval.rejectionReason = reason;
  return after;
};

test('Planning rejection sends the reason and signer to all participating approval roles', () => {
  const signedAt = '2026-10-20T01:00:00.000Z';
  const after = rejectedProject({
    ITEL: { status: 'Rejected', signedBy: 'Somchai', signedAt },
    UIH: { status: 'Pending' }
  }, signOffs('Pending'), ' ระยะไม่ถูกต้อง ');
  const notice = notificationForTransition(project('Planning'), after);
  assert.equal(notice.kind, 'approval-rejected');
  assert.deepEqual(notice.roles, ['Design', 'Planning', 'Management']);
  assert.deepEqual(notice.owners, ['ITEL', 'UIH']);
  assert.deepEqual(notice.details.rejection, {
    reason: 'ระยะไม่ถูกต้อง', owner: 'ITEL', signedBy: 'Somchai', level: 'Planning', signedAt
  });
});

test('O&M rejection identifies Management and preserves the sign-off table', () => {
  const after = rejectedProject(signOffs('Approved'), {
    ITEL: { status: 'Approved' },
    UIH: { status: 'Rejected', signedBy: 'Suda', signedAt: '2026-10-21T01:00:00.000Z' }
  }, 'ต้องแก้ไข');
  const notice = notificationForTransition(project('OM', signOffs('Approved')), after);
  assert.equal(notice.details.rejection.level, 'OM');
  assert.equal(notice.details.rejection.owner, 'UIH');
  const { subject, text, html } = emailContent(notice, 'https://app.example.com', 'p1');
  assert.equal(subject, '[Fiber Sharing] เอกสารไม่ได้รับอนุมัติ: ทดสอบ <Project> (APP-1)');
  assert.match(text, /ระดับที่ไม่อนุมัติ: Management \(O&M\)/);
  assert.match(text, /ผู้ไม่อนุมัติ: UIH — Suda/);
  assert.match(text, /วันที่ไม่อนุมัติ: 21 ต\.ค\. 2569 08:00 น\./);
  assert.match(text, /สถานะการลงนาม/);
  assert.match(text, /ไม่อนุมัติ/);
  assert.match(text, /เปิดดูโครงการ: https:\/\/app\.example\.com\/project\/p1/);
  assert.match(html, /Management \(O&amp;M\)/);
  assert.match(html, /สถานะการลงนาม/);
});

test('rejection sends only for a matching approval crossing to Rejected stage and status', () => {
  const after = rejectedProject();
  assert.equal(notificationForTransition(after, { ...after, approvalDraft: { changed: true } }), null);
  const newId = rejectedProject();
  newId.designApproval.id = 'approval-2';
  assert.equal(notificationForTransition(project('Planning'), newId), null);
  assert.equal(notificationForTransition({ status: 'Draft' }, after), null);
  assert.equal(notificationForTransition(project('Planning'), { ...after, status: 'Pending Approval' }), null);
  const wrongStage = project('Planning');
  wrongStage.status = 'Rejected';
  assert.equal(notificationForTransition(project('Planning'), wrongStage), null);
  const noNumber = rejectedProject();
  delete noNumber.designApproval.documentNumber;
  assert.equal(notificationForTransition(project('Planning'), noNumber), null);
  const noOwners = rejectedProject();
  delete noOwners.owners;
  assert.equal(notificationForTransition(project('Planning'), noOwners), null);
});

test('latest valid rejected sign-off wins across Planning and O&M', () => {
  const planning = { ITEL: { status: 'Rejected', signedAt: '2026-10-20T01:00:00Z' }, UIH: { status: 'Approved' } };
  const om = { ITEL: { status: 'Pending' }, UIH: { status: 'Rejected', signedAt: '2026-10-21T01:00:00Z' } };
  const latestOm = notificationForTransition(project('OM'), rejectedProject(planning, om)).details.rejection;
  assert.equal(latestOm.owner, 'UIH');
  assert.equal(latestOm.level, 'OM');
  planning.ITEL.signedAt = '2026-10-22T01:00:00Z';
  const latestPlanning = notificationForTransition(project('OM'), rejectedProject(planning, om)).details.rejection;
  assert.equal(latestPlanning.owner, 'ITEL');
  assert.equal(latestPlanning.level, 'Planning');
});

test('rejector ties prefer O&M, then participating owner order; valid times beat missing times', () => {
  const before = project('OM');
  const planning = { ITEL: { status: 'Rejected' }, UIH: { status: 'Rejected' } };
  const om = { ITEL: { status: 'Pending' }, UIH: { status: 'Rejected' } };
  const rejector = (p, o) => notificationForTransition(before, rejectedProject(p, o)).details.rejection;
  assert.equal(rejector(planning, om).level, 'OM');
  planning.ITEL.signedAt = '2026-10-20T01:00:00Z';
  om.UIH.signedAt = '2026-10-20T01:00:00Z';
  assert.equal(rejector(planning, om).level, 'OM');
  delete om.UIH.signedAt;
  assert.equal(rejector(planning, om).owner, 'ITEL');
  delete planning.ITEL.signedAt;
  assert.equal(rejector(planning, signOffs('Pending')).owner, 'ITEL');
  planning.ITEL.signedAt = 'invalid';
  planning.UIH.signedAt = '2026-10-20T01:00:00Z';
  assert.equal(rejector(planning, signOffs('Pending')).owner, 'UIH');
});

test('non-participating rejected sign-offs are ignored', () => {
  const planning = {
    ITEL: { status: 'Rejected', signedAt: '2026-10-20T01:00:00Z' },
    UIH: { status: 'Pending' },
    SYMC: { status: 'Rejected', signedAt: '2026-10-21T01:00:00Z' }
  };
  assert.equal(notificationForTransition(project('Planning'), rejectedProject(planning)).details.rejection.owner, 'ITEL');
});

test('rejection without a rejected sign-off still includes the reason and omits rejector rows', () => {
  const notice = notificationForTransition(project('Planning'), rejectedProject(signOffs('Pending'), signOffs('Pending'), 'แก้ไขระยะ'));
  assert.deepEqual(notice.details.rejection, { reason: 'แก้ไขระยะ', owner: '', signedBy: '', level: '', signedAt: '' });
  const { text, html } = emailContent(notice, 'https://app.example.com', 'p1');
  assert.match(text, /เหตุผลที่ไม่อนุมัติ\nแก้ไขระยะ/);
  assert.doesNotMatch(text, /ระดับที่ไม่อนุมัติ:|ผู้ไม่อนุมัติ:|วันที่ไม่อนุมัติ:/);
  assert.doesNotMatch(html, /ระดับที่ไม่อนุมัติ|ผู้ไม่อนุมัติ|วันที่ไม่อนุมัติ/);
});

test('missing reason has a visible fallback in text and HTML', () => {
  const notice = notificationForTransition(project('Planning'), rejectedProject());
  const { text, html } = emailContent(notice, 'https://app.example.com', 'p1');
  assert.match(text, /เหตุผลที่ไม่อนุมัติ\nไม่ระบุเหตุผล/);
  assert.match(html, /เหตุผลที่ไม่อนุมัติ/);
  assert.match(html, /ไม่ระบุเหตุผล/);
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /color:#b91c1c;background:#fee2e2/);
});

test('rejection HTML escapes free text and keeps the reason out of subject and preheader', () => {
  const reason = '<script>alert(1)</script> & "unique-reason-marker"';
  const after = rejectedProject({
    ITEL: { status: 'Rejected', signedBy: '<b>Evil</b>' }, UIH: { status: 'Pending' }
  }, signOffs('Pending'), reason);
  after.name = '<Project & Co>';
  const notice = notificationForTransition(project('Planning'), after);
  const { subject, text, html } = emailContent(notice, 'https://app.example.com', 'p1');
  assert.match(text, /<script>alert\(1\)<\/script> & "unique-reason-marker"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;unique-reason-marker&quot;/);
  assert.match(html, /&lt;b&gt;Evil&lt;\/b&gt;/);
  assert.match(html, /&lt;Project &amp; Co&gt;/);
  assert.doesNotMatch(html, /<script>|<b>Evil/);
  assert.doesNotMatch(subject, /unique-reason-marker/);
  assert.doesNotMatch(html.match(/<div style="display:none[^>]*>[^<]*<\/div>/)[0], /unique-reason-marker/);
});

test('rejection recipients are approved participating Design, Planning and Management users only', () => {
  const notice = notificationForTransition(project('Planning'), rejectedProject());
  const users = [
    { email: ' A@EXAMPLE.COM ', role: 'Design', owner: 'ITEL', isApproved: true },
    { email: 'a@example.com', role: 'Planning', owner: 'UIH', isApproved: true },
    { email: 'b@example.com', role: 'Planning', owner: 'UIH', isApproved: true },
    { email: 'c@example.com', role: 'Management', owner: 'ITEL', isApproved: true },
    { email: 'd@example.com', role: 'Design', owner: 'UIH', isApproved: false },
    { email: 'e@example.com', role: 'Sub-contract', owner: 'ITEL', isApproved: true },
    { email: 'f@example.com', role: 'Admin', owner: 'UIH', isApproved: true },
    { email: 'g@example.com', role: 'Management', owner: 'SYMC', isApproved: true },
    { email: 'invalid-email', role: 'Design', owner: 'ITEL', isApproved: true }
  ];
  assert.deepEqual(notificationRecipients(users, notice), ['a@example.com', 'b@example.com', 'c@example.com']);
});

test('rejection delivery keys separate kinds and distinct rewind events', () => {
  const before = project('Planning');
  const after = rejectedProject();
  const first = notificationForTransition(before, after);
  const again = notificationForTransition(before, after);
  assert.equal(again.kind, 'approval-rejected');
  assert.notEqual(deliveryId('p1', first, 'a@example.com', 'event-1'),
    deliveryId('p1', { ...first, kind: 'approval-completed' }, 'a@example.com', 'event-1'));
  assert.equal(deliveryId('p1', first, 'a@example.com', 'event-1'),
    deliveryId('p1', first, 'a@example.com', 'event-1'));
  assert.notEqual(deliveryId('p1', first, 'a@example.com', 'event-1'),
    deliveryId('p1', again, 'a@example.com', 'event-2'));
});

