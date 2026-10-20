import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordChangeGate } from './passwordChangeGate';

test('30 a password session forces change even on a Google-linked account', () => {
  assert.equal(passwordChangeGate({ requiresPasswordChange: true, signInProvider: 'password' }), 'force');
});
test('31 a Google session skips the password gate', () => {
  assert.equal(passwordChangeGate({ requiresPasswordChange: true, signInProvider: 'google.com' }), 'skip');
});
test('32 provider loading waits and lookup failure forces change', () => {
  assert.equal(passwordChangeGate({ requiresPasswordChange: true, signInProvider: undefined }), 'pending');
  assert.equal(passwordChangeGate({ requiresPasswordChange: true, signInProvider: null }), 'force');
});
test('33 users without a true flag skip for all provider states', () => {
  for (const requiresPasswordChange of [false, undefined]) {
    for (const signInProvider of [undefined, null, 'password', 'google.com']) {
      assert.equal(passwordChangeGate({ requiresPasswordChange, signInProvider }), 'skip');
    }
  }
  assert.equal(passwordChangeGate({}), 'skip');
});
