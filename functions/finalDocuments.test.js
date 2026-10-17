const { test } = require('node:test');
const assert = require('node:assert/strict');
const { finalDocumentFileIds, fitAttachments, attachmentNote } = require('./finalDocuments');

test('picks the PDF then the KMZ, ignoring missing or malformed ids', () => {
  assert.deepEqual(finalDocumentFileIds({ pdfFileId: 'p-1', kmzFileId: 'k-1' }), ['p-1', 'k-1']);
  assert.deepEqual(finalDocumentFileIds({ pdfFileId: 'p-1' }), ['p-1']);
  assert.deepEqual(finalDocumentFileIds({ pdfFileId: '../x' }), []);
  assert.deepEqual(finalDocumentFileIds(undefined), []);
});

test('attaches files in order while they fit the limit', () => {
  const files = [{ name: 'a.pdf', size: 6 }, { name: 'b.kmz', size: 5 }, { name: 'c', size: 3 }];
  const { attached, skipped } = fitAttachments(files, 10);
  assert.deepEqual(attached.map(f => f.name), ['a.pdf', 'c']);
  assert.deepEqual(skipped, ['b.kmz']);
});

test('describes attached, skipped or missing documents', () => {
  assert.match(attachmentNote(['a.pdf', 'b.kmz'], []), /แนบไฟล์: a\.pdf, b\.kmz/);
  assert.match(attachmentNote(['a.pdf'], ['b.kmz']), /ใหญ่เกิน.*b\.kmz/);
  assert.match(attachmentNote([], []), /ไฟล์โครงการ › เอกสารอนุมัติ/);
});
