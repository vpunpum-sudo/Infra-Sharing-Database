import test from 'node:test';
import assert from 'node:assert/strict';
import { submitProvisionUser, submitDeleteUser, errorMessage, MESSAGES } from './userProvisioning';

const input = { email: 'a@x.com', password: 'Passw0rd', role: 'Viewer' as const, owner: 'ITEL' as const };
function deps() {
  const calls: string[] = [];
  return { calls,
    listHasEmail: (email: string) => { calls.push(`local:${email}`); return false; },
    isAdmin: true,
    globalEmailExists: async (email: string) => { calls.push(`global:${email}`); return false; },
    writePreauth: async (value: { email: string }) => { calls.push(`preauth:${value.email}`); },
    logPreauth: async (value: { email: string }) => { calls.push(`log:${value.email}`); },
    createManagedUser: async (value: { email: string }) => { calls.push(`callable:${value.email}`); return { existingAccount: false }; }
  };
}
test('23 normalizes before local/global checks and callable, with early duplicate rejection', async () => {
  const d = deps();
  assert.equal((await submitProvisionUser({ ...input, email: ' A@X.com ' }, d)).ok, true);
  assert.deepEqual(d.calls, ['local:a@x.com', 'global:a@x.com', 'callable:a@x.com']);
  const duplicate = deps(); duplicate.listHasEmail = email => { duplicate.calls.push(`local:${email}`); return email === 'a@x.com'; };
  assert.equal((await submitProvisionUser({ ...input, email: ' A@X.com ' }, duplicate)).message, MESSAGES.duplicateLocal);
  assert.deepEqual(duplicate.calls, ['local:a@x.com']);
  const invalid = deps();
  assert.equal((await submitProvisionUser({ ...input, email: ' BAD ' }, invalid)).message, MESSAGES.invalidEmail);
  assert.deepEqual(invalid.calls, ['local:bad']);
  assert.equal((await submitProvisionUser({ ...input, email: `${'a'.repeat(95)}@x.com` }, deps())).message, MESSAGES.invalidEmail);
});
test('24 empty password preauthorizes; whitespace and short passwords make no writes', async () => {
  const d = deps();
  assert.equal((await submitProvisionUser({ ...input, password: '' }, d)).ok, true);
  assert.deepEqual(d.calls.slice(-2), ['preauth:a@x.com', 'log:a@x.com']);
  for (const password of ['   ', ' abc123', 'abc12']) {
    const f = deps();
    const result = await submitProvisionUser({ ...input, password }, f);
    assert.equal(result.ok, false);
    assert.deepEqual(f.calls, ['local:a@x.com']);
    assert.equal(result.message, password === 'abc12' ? MESSAGES.passwordLength : MESSAGES.passwordSpaces);
  }
});
test('25 success messages distinguish new and existing accounts and revocation failure', async () => {
  for (const existingAccount of [false, true]) {
    const d = deps(); d.createManagedUser = async () => ({ existingAccount });
    const result = await submitProvisionUser(input, d);
    assert.equal(result.message, existingAccount ? MESSAGES.existingAccount : MESSAGES.newAccount);
  }
  const d = deps(); d.createManagedUser = async () => ({ existingAccount: true, revokeFailed: true });
  assert.equal((await submitProvisionUser(input, d)).message, MESSAGES.existingAccount + MESSAGES.revokeFailed);
});
test('26 callable errors map to distinct Thai messages, including partial failures', () => {
  const cases: [string, string | undefined, string][] = [
    ['unauthenticated', undefined, MESSAGES.unauthenticated],
    ['permission-denied', undefined, MESSAGES.permissionDenied],
    ['already-exists', undefined, MESSAGES.alreadyExists],
    ['not-found', undefined, MESSAGES.notFound],
    ['failed-precondition', undefined, MESSAGES.failedPrecondition],
    ['internal', 'profile_write_failed_password_changed', MESSAGES.profileWriteFailed],
    ['internal', 'profile_delete_failed_auth_deleted', MESSAGES.profileDeleteFailed],
    ['internal', undefined, MESSAGES.internal]
  ];
  for (const [code, reason, message] of cases) {
    assert.equal(errorMessage({ code: `functions/${code}`, details: { reason } }), message);
    assert.match(message, /[ก-๙]/);
  }
  assert.equal(errorMessage({ code: 'functions/invalid-argument', message: 'ข้อมูลไม่ถูกต้อง' }), 'ข้อมูลไม่ถูกต้อง');
  assert.equal(errorMessage({ code: 'other' }), MESSAGES.unknown);
});
test('27 delete controller calls only the callable and reports retry-safe partial failure', async () => {
  const calls: string[] = [];
  const success = await submitDeleteUser('U', { deleteManagedUser: async id => { calls.push(id); } });
  assert.deepEqual(calls, ['U']); assert.equal(success.message, MESSAGES.deleted);
  const failed = await submitDeleteUser('U', { deleteManagedUser: async () => {
    throw { code: 'functions/internal', details: { reason: 'profile_delete_failed_auth_deleted' } };
  } });
  assert.equal(failed.message, MESSAGES.profileDeleteFailed);
});
