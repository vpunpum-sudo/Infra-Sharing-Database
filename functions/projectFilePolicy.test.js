const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canAccessProjectFiles } = require('./projectFilePolicy');

const project = { owners: ['ITEL', 'UIH'], owner: 'ITEL' };

test('authorized operator can manage project files', () => {
  assert.equal(canAccessProjectFiles({ role: 'Design', owner: 'UIH', isApproved: true }, project, true), true);
  assert.equal(canAccessProjectFiles({ role: 'Design', owner: 'SYMC', isApproved: true }, project, true), false);
});

test('viewer can download but cannot change project files', () => {
  const viewer = { role: 'Viewer', owner: 'ITEL', isApproved: true };
  assert.equal(canAccessProjectFiles(viewer, project), true);
  assert.equal(canAccessProjectFiles(viewer, project, true), false);
});

test('admin can manage files and unapproved users cannot', () => {
  assert.equal(canAccessProjectFiles({ role: 'Admin', owner: 'None', isApproved: true }, project, true), true);
  assert.equal(canAccessProjectFiles({ role: 'Design', owner: 'ITEL', isApproved: false }, project, true), false);
});
