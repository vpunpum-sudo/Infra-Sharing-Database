const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emailContent } = require('./approvalNotifications');
const fixture = require('./fixtures/approvalEmailGolden.json');
for (const entry of fixture.cases) {
  test(`S34 golden byte equality: ${entry.notification.kind} (${fixture.sourceRevision})`, () => {
    const actual = emailContent(entry.notification, entry.appUrl, entry.projectId, entry.attachmentNote);
    for (const field of ['subject', 'text', 'html']) assert.equal(actual[field], entry.expected[field]);
  });
}
