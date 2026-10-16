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

test('submission targets Design for participating owners', () => {
  const notice = notificationForTransition({ status: 'Draft' }, project('Planning'));
  assert.equal(notice.kind, 'planning-requested');
  assert.deepEqual(notice.roles, ['Design']);
  assert.deepEqual(notice.owners, ['ITEL', 'UIH']);
});

test('Management notice requires all Planning approvals', () => {
  const before = project('Planning');
  assert.equal(notificationForTransition(before, project('OM')), null);
  const notice = notificationForTransition(before, project('OM', signOffs('Approved')));
  assert.equal(notice.kind, 'management-requested');
  assert.deepEqual(notice.roles, ['Management']);
});

test('completion requires both approval levels and targets both roles', () => {
  const before = project('OM', signOffs('Approved'));
  assert.equal(notificationForTransition(before, project('Completed', signOffs('Approved'))), null);
  const notice = notificationForTransition(before,
    project('Completed', signOffs('Approved'), signOffs('Approved')));
  assert.equal(notice.kind, 'approval-completed');
  assert.deepEqual(notice.roles, ['Design', 'Management']);
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
  assert.match(emailContent(notice, 'https://example.com').html, /&lt;Project&gt;/);
});

test('projects without explicitly participating owners do not notify every company', () => {
  const after = project('Planning');
  delete after.owners;
  assert.equal(notificationForTransition({ status: 'Draft' }, after), null);
});
