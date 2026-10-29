import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordProviderEmail, passwordSectionMode } from './authProviders';
const password = { providerId: 'password', email: ' password@example.test ' };
const google = { providerId: 'google.com', email: 'google@example.test' };
test('34–38: section classification and credential email use the password provider', () => {
  assert.equal(passwordSectionMode([password]), 'password');
  assert.equal(passwordSectionMode([google, password]), 'password+google');
  assert.equal(passwordProviderEmail([google, password]), 'password@example.test');
  assert.equal(passwordSectionMode([google]), 'google-only');
  assert.equal(passwordSectionMode([]), 'none');
  for (const email of [null, '', '  ']) {
    assert.equal(passwordSectionMode([{ providerId: 'password', email }, google]), 'password-no-email');
    assert.equal(passwordProviderEmail([{ providerId: 'password', email }]), null);
  }
});
