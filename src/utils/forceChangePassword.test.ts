import test from 'node:test';
import assert from 'node:assert/strict';
import { run, retryClearFlag, PASSWORD_MESSAGES } from './forceChangePassword';

function deps() {
  const calls: string[] = [];
  return { calls, updatePassword: async (_password: string) => { calls.push('update'); },
    clearFlag: async () => { calls.push('clear'); } };
}
test('28 run updates password then flag, validates first, maps Auth errors and preserves partial success', async () => {
  const d = deps();
  assert.equal((await run('Passw0rd', 'Passw0rd', d)).status, 'done');
  assert.deepEqual(d.calls, ['update', 'clear']);
  for (const [password, confirmation] of [[' abc123', ' abc123'], ['abc12', 'abc12'], ['abc123', 'different']]) {
    const f = deps();
    assert.equal((await run(password, confirmation, f)).status, 'validation_failed');
    assert.deepEqual(f.calls, []);
  }
  for (const [code, message] of [['auth/requires-recent-login', PASSWORD_MESSAGES.recentLogin], ['auth/weak-password', PASSWORD_MESSAGES.weak]]) {
    const f = deps(); f.updatePassword = async () => { f.calls.push('update'); throw { code }; };
    assert.equal((await run('Passw0rd', 'Passw0rd', f)).message, message);
    assert.deepEqual(f.calls, ['update']);
  }
  const partial = deps(); partial.clearFlag = async () => { partial.calls.push('clear'); throw Error('write'); };
  assert.equal((await run('Passw0rd', 'Passw0rd', partial)).status, 'flag_failed_password_active');
  assert.deepEqual(partial.calls, ['update', 'clear']);
});
test('29 retryClearFlag calls only the flag write', async () => {
  const d = deps();
  assert.equal((await retryClearFlag(d)).status, 'done');
  assert.deepEqual(d.calls, ['clear']);
  d.clearFlag = async () => { d.calls.push('clear'); throw Error('write'); };
  assert.equal((await retryClearFlag(d)).status, 'flag_failed_password_active');
  assert.deepEqual(d.calls, ['clear', 'clear']);
});
