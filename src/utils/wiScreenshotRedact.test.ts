import test from 'node:test';
import assert from 'node:assert/strict';
import { findPii, findKnownValues, redactSecrets } from './wiScreenshotRedact';

test('PII detection returns kinds only', () => {
  assert.deepEqual(findPii('a@example.com 02-123-4567 0812345678 +66812345678'), ['email', 'phone']);
  assert.deepEqual(findPii('ผู้ใช้ตัวอย่าง 12'), []);
});

test('known values match trimmed names and emails case insensitively', () => {
  assert.deepEqual(findKnownValues('Hello SOMCHAI and USER@EXAMPLE.COM', { email: ' user@example.com ', displayName: ' Somchai ' }), ['email', 'displayName']);
  assert.deepEqual(findKnownValues('ordinary text', { email: ' user@example.com ', displayName: ' Somchai ' }), []);
});

test('secret redaction removes supplied credentials without printing them', () => {
  assert.equal(redactSecrets('bad secret-value', ['secret-value']), 'bad [redacted]');
});
