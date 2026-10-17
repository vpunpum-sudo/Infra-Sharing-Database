const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decodeFile, MAX_FILE_BYTES } = require('./projectFiles');

test('decodes a file close to the 5 MB limit', () => {
  const bytes = Buffer.alloc(MAX_FILE_BYTES - 1, 7);
  assert.equal(decodeFile(bytes.toString('base64')).length, bytes.length);
});

test('rejects malformed, empty and oversized base64', () => {
  for (const value of ['abc', 'ab=c', '@@@@', '', Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64')]) {
    assert.throws(() => decodeFile(value), { code: 'invalid-argument' });
  }
});
