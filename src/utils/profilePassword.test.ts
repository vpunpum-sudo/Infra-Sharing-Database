import test from 'node:test';
import assert from 'node:assert/strict';
import { changePassword, mapPasswordError, PROFILE_PASSWORD_MESSAGES as M } from './profilePassword';
import { validateNewPassword, PASSWORD_MESSAGES } from './forceChangePassword';
const input = { email: ' password@example.test ', current: 'current-sentinel', next: 'next-sentinel', confirm: 'next-sentinel' };
function fake() {
  const calls: unknown[][] = [];
  return { calls, deps: {
    buildCredential(email: string, value: string) { calls.push(['credential', email, value]); return { email, value }; },
    async reauthenticate(credential: unknown) { calls.push(['reauth', credential]); },
    async updatePassword(next: string) { calls.push(['update', next]); }
  } };
}
test('34–35: validate, build with trimmed provider email, reauthenticate, update in order', async () => {
  const { deps, calls } = fake();
  const result = await changePassword(input, deps);
  assert.equal(result.status, 'done');
  assert.deepEqual(calls.map(c => c[0]), ['credential', 'reauth', 'update']);
  assert.equal(calls[0][1], 'password@example.test');
});
test('38,40: missing email/current and invalid new passwords never build credentials or call Firebase', async () => {
  for (const [patch, message] of [
    [{ email: null }, M.noEmail], [{ email: '' }, M.noEmail], [{ email: '  ' }, M.noEmail],
    [{ current: '' }, M.currentRequired], [{ next: 'short' }, PASSWORD_MESSAGES.length],
    [{ next: ' next-sentinel' }, PASSWORD_MESSAGES.spaces], [{ confirm: 'other' }, PASSWORD_MESSAGES.mismatch],
    [{ next: input.current, confirm: input.current }, M.sameAsCurrent]
  ] as const) {
    const { deps, calls } = fake();
    assert.deepEqual(await changePassword({ ...input, ...patch }, deps), { status: 'failed', message });
    assert.deepEqual(calls, []);
  }
  assert.equal(validateNewPassword('abcdef', 'abcdef'), null);
});
test('39,41: every Firebase error maps to fixed text and reauth failure never updates', async () => {
  const cases = [
    ['auth/wrong-password', M.wrongCurrent], ['auth/invalid-credential', M.wrongCurrent], ['auth/invalid-login-credentials', M.wrongCurrent],
    ['auth/weak-password', PASSWORD_MESSAGES.weak], ['auth/password-does-not-meet-requirements', PASSWORD_MESSAGES.weak],
    ['auth/requires-recent-login', PASSWORD_MESSAGES.recentLogin], ['auth/too-many-requests', M.tooMany],
    ['auth/network-request-failed', M.offline], ['unknown', PASSWORD_MESSAGES.updateFailed]
  ];
  for (const [code, message] of cases) {
    assert.equal(mapPasswordError(code), message);
    const { deps, calls } = fake();
    deps.reauthenticate = async () => { throw { code, message: input.current }; };
    assert.deepEqual(await changePassword(input, deps), { status: 'failed', message });
    assert.equal(calls.some(c => c[0] === 'update'), false);
    deps.reauthenticate = async () => {};
    deps.updatePassword = async () => { throw { code, message: input.next }; };
    assert.equal((await changePassword(input, deps)).message, message);
  }
});
test('42: sentinel passwords and raw error text never reach consoles or result messages', async t => {
  const output: unknown[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) t.mock.method(console, method, (...args: unknown[]) => { output.push(args); });
  const { deps } = fake();
  const success = await changePassword(input, deps);
  deps.reauthenticate = async () => { throw { code: 'unknown', message: input.current + input.next }; };
  const failure = await changePassword(input, deps);
  assert.deepEqual(output, []);
  for (const value of [input.current, input.next]) assert.equal(JSON.stringify([success, failure, output]).includes(value), false);
});
