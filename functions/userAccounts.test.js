const test = require('node:test');
const assert = require('node:assert/strict');
const { createManagedUserCore: create, deleteManagedUserCore: remove,
  validateProvisionInput, isAdminCaller } = require('./userAccounts');

const admin = { uid: 'admin', token: { email: 'admin@x.com' } };
const input = { email: 'a@x.com', password: 'Passw0rd', role: 'Viewer', owner: 'ITEL' };
function fixture() {
  const docs = new Map([['users/admin', { id: 'admin', email: 'admin@x.com', role: 'Admin' }]]);
  const accounts = new Map();
  const calls = [];
  const failures = {};
  const log = { errors: [], error(...args) { this.errors.push(args); } };
  const snapshot = (path, data) => ({ id: path.split('/').at(-1), exists: !!data, data: () => data,
    ref: { path } });
  const db = {
    collection(name) {
      return {
        doc(id) {
          const path = `${name}/${id}`;
          return { path,
            async get() { calls.push(`get:${path}`); return snapshot(path, docs.get(path)); },
            async set(data) { calls.push(`set:${path}`); if (failures.set) throw failures.set; docs.set(path, data); },
            async delete() { calls.push(`delete:${path}`); if (failures.delete) throw failures.delete; docs.delete(path); }
          };
        },
        where(field, op, value) {
          assert.equal(op, '==');
          return { async get() {
            calls.push(`query:${name}:${field}:${value}`);
            const matches = [...docs].filter(([key, data]) => key.startsWith(`${name}/`) && data[field] === value)
              .map(([key, data]) => snapshot(key, data));
            return { empty: matches.length === 0, docs: failures.stickyQuery ? failures.stickyQuery : matches };
          } };
        }
      };
    },
    batch() {
      const paths = [];
      return { delete(ref) { paths.push(ref.path); }, async commit() {
        calls.push(`batch:${paths.length}`);
        if (failures.batch && --failures.batch === 0) throw new Error('batch failed');
        paths.forEach(path => docs.delete(path));
      } };
    }
  };
  const auth = {
    async getUserByEmail(email) {
      calls.push(`getAuth:${email}`);
      if (failures.lookup) throw failures.lookup;
      const result = [...accounts.values()].find(u => u.email === email);
      if (!result) throw { code: 'auth/user-not-found' };
      return result;
    },
    async createUser(data) {
      calls.push(`createAuth:${data.email}`);
      if (failures.create) throw failures.create;
      const user = { uid: 'newUid', email: data.email, password: data.password };
      accounts.set(user.uid, user);
      return user;
    },
    async updateUser(uid, data) {
      calls.push(`updateAuth:${uid}`);
      if (failures.update) throw failures.update;
      Object.assign(accounts.get(uid), data);
    },
    async revokeRefreshTokens(uid) {
      calls.push(`revoke:${uid}`);
      if (failures.revoke) throw failures.revoke;
    },
    async deleteUser(uid) {
      calls.push(`deleteAuth:${uid}`);
      if (failures.authDelete) throw failures.authDelete;
      if (!accounts.has(uid)) throw { code: 'auth/user-not-found' };
      accounts.delete(uid);
    }
  };
  const args = { auth, db, caller: admin, data: input, logger: log };
  return { docs, accounts, calls, failures, log, args };
}
async function rejectsCode(promise, code, reason) {
  await assert.rejects(promise, error => error.code === code && (!reason || error.details?.reason === reason));
}
function existing(f, uid = 'U', email = 'b@x.com', extras = {}) {
  f.accounts.set(uid, { uid, email, ...extras });
}
function target(f, id = 'U', email = 'b@x.com') {
  f.docs.set(`users/${id}`, { id, email, role: 'Viewer' });
  if (!id.startsWith('preauth_')) existing(f, id, email);
}

test('1 new account writes the exact password, profile and safe audit', async () => {
  const f = fixture();
  assert.deepEqual(await create(f.args), { uid: 'newUid', existingAccount: false });
  assert.equal(f.accounts.get('newUid').password, 'Passw0rd');
  assert.deepEqual(f.docs.get('users/newUid'), { id: 'newUid', email: 'a@x.com', role: 'Viewer', owner: 'ITEL', isApproved: true, requiresPasswordChange: true });
  const audit = [...f.docs.entries()].find(([key]) => key.startsWith('logs/'))[1];
  assert.equal(audit.action, 'create_user');
  assert.equal(audit.userId, admin.uid);
  assert.equal(audit.userEmail, admin.token.email);
  assert.ok(audit.id && audit.timestamp && audit.metadata.targetUid === 'newUid');
  assert.doesNotMatch(JSON.stringify(audit), /Passw0rd/);
});
test('2 normalizes email before Auth and profile storage', async () => {
  const f = fixture(); f.args.data = { ...input, email: ' A@X.com ' };
  await create(f.args);
  assert.ok(f.calls.includes('createAuth:a@x.com'));
  assert.equal(f.docs.get('users/newUid').email, 'a@x.com');
});
test('3 resets an orphaned Auth account, including a Google-linked one, in order', async () => {
  for (const providerData of [[], [{ providerId: 'google.com' }]]) {
    const f = fixture(); existing(f, 'U', 'b@x.com', { providerData });
    f.args.data = { ...input, email: 'b@x.com' };
    assert.equal((await create(f.args)).existingAccount, true);
    assert.deepEqual(f.calls.filter(x => /^(updateAuth|set:users|revoke)/.test(x)), ['updateAuth:U', 'set:users/U', 'revoke:U']);
    assert.equal(f.accounts.get('U').password, 'Passw0rd');
    assert.equal(f.accounts.get('U').disabled, false);
    assert.equal(f.docs.get('users/U').requiresPasswordChange, true);
    assert.ok(![...f.docs.keys()].some(k => k.includes('preauth_')));
  }
});
test('4 revocation failure is reported without failing provision', async () => {
  const f = fixture(); existing(f); f.args.data = { ...input, email: 'b@x.com' };
  f.failures.revoke = new Error('revoke');
  assert.equal((await create(f.args)).revokeFailed, true);
  assert.equal(f.log.errors.length, 1);
});
test('5 new-account profile failure rolls back even if rollback itself fails', async () => {
  for (const rollbackFails of [false, true]) {
    const f = fixture(); f.failures.set = new Error('write');
    if (rollbackFails) f.failures.authDelete = new Error('rollback');
    await rejectsCode(create(f.args), 'internal');
    assert.ok(f.calls.includes('deleteAuth:newUid'));
    assert.ok(!f.docs.has('users/newUid'));
    if (rollbackFails) assert.equal(f.log.errors.length, 2);
  }
});
test('6 existing-account profile failure is retryable and does not revoke', async () => {
  const f = fixture(); existing(f); f.args.data = { ...input, email: 'b@x.com' };
  f.failures.set = new Error('write');
  await rejectsCode(create(f.args), 'internal', 'profile_write_failed_password_changed');
  assert.ok(!f.calls.includes('revoke:U'));
  delete f.failures.set;
  assert.equal((await create(f.args)).existingAccount, true);
});
test('7 any matching uid or preauth profile rejects before Auth', async () => {
  for (const id of ['U', 'preauth_a']) {
    const f = fixture(); f.docs.set(`users/${id}`, { email: 'a@x.com' });
    await rejectsCode(create(f.args), 'already-exists');
    assert.ok(!f.calls.some(x => /Auth/.test(x)));
  }
});
test('8 non-Admin roles cannot create or delete, even if manageUsers might be granted', async () => {
  for (const role of ['Management', 'Planning', 'Viewer']) {
    const f = fixture(); f.docs.set('users/admin', { role }); target(f);
    await rejectsCode(create(f.args), 'permission-denied');
    await rejectsCode(remove({ ...f.args, data: { userId: 'U' } }), 'permission-denied');
    assert.ok(!f.calls.some(x => /Auth|^set:|^delete:|^batch:/.test(x)));
  }
});
test('9 bootstrap email is Admin without an Admin profile', async () => {
  assert.ok(isAdminCaller(null, 'vpunpum@gmail.com'));
  assert.ok(isAdminCaller(null, 'verayut_p@uih.co.th'));
  const f = fixture(); f.docs.delete('users/admin');
  f.args.caller = { uid: 'admin', token: { email: 'vpunpum@gmail.com' } };
  assert.equal((await create(f.args)).uid, 'newUid');
});
test('10 unauthenticated calls reject before any side effect', async () => {
  const f = fixture(); f.args.caller = null;
  await rejectsCode(create(f.args), 'unauthenticated');
  await rejectsCode(remove({ ...f.args, data: { userId: 'U' } }), 'unauthenticated');
  assert.deepEqual(f.calls, []);
});
test('11 invalid email, role, owner and passwords reject without side effects', async () => {
  const bad = [{ email: 'bad' }, { email: `${'a'.repeat(95)}@x.com` }, { role: 'Unknown' }, { owner: 'Unknown' },
    ...[' abc123', 'abc123 ', '      ', 'abc12', 123].map(password => ({ password }))];
  for (const patch of bad) {
    const f = fixture(); f.args.data = { ...input, ...patch };
    await assert.rejects(create(f.args), e => e.code === 'invalid-argument' && /[ก-๙]/.test(e.message));
    assert.ok(!f.calls.some(x => /Auth|^set:|^delete:/.test(x)));
  }
  assert.equal(validateProvisionInput({ ...input, role: 'Admin', owner: 'ITEL' }).owner, 'None');
  assert.equal(validateProvisionInput({ ...input, password: 'abc 123' }).password, 'abc 123');
});
test('12 unexpected Auth create error writes no profile', async () => {
  const f = fixture(); f.failures.create = new Error('create request contained Passw0rd');
  await rejectsCode(create(f.args), 'internal');
  assert.ok(!f.docs.has('users/newUid'));
  assert.doesNotMatch(JSON.stringify(f.log.errors), /Passw0rd/);
});
test('13 uid deletion removes Auth, matching preauth and target in order with audit', async () => {
  const f = fixture(); target(f); f.docs.set('users/preauth_a', { email: 'b@x.com' });
  assert.deepEqual((await remove({ ...f.args, data: { userId: 'U' } })).deleted, ['preauth_a', 'U']);
  assert.ok(f.calls.indexOf('deleteAuth:U') < f.calls.indexOf('batch:1'));
  assert.ok(f.calls.indexOf('batch:1') < f.calls.indexOf('delete:users/U'));
  const audit = [...f.docs.entries()].find(([key, value]) => key.startsWith('logs/') && value.action === 'delete_user')[1];
  assert.deepEqual(audit.metadata.deletedDocIds, ['preauth_a', 'U']);
});
test('14 missing Auth account still allows doc deletion', async () => {
  const f = fixture(); target(f); f.accounts.delete('U');
  assert.deepEqual((await remove({ ...f.args, data: { userId: 'U' } })).deleted, ['U']);
});
test('15 non-not-found Auth delete errors stop before Firestore deletion', async () => {
  const f = fixture(); target(f); f.failures.authDelete = new Error('Auth down');
  await rejectsCode(remove({ ...f.args, data: { userId: 'U' } }), 'internal');
  assert.ok(f.docs.has('users/U'));
  assert.ok(!f.calls.some(x => /^delete:|^batch:/.test(x)));
});
test('16 Firestore deletion failure after Auth deletion is retryable', async () => {
  const f = fixture(); target(f); f.failures.delete = new Error('delete');
  await rejectsCode(remove({ ...f.args, data: { userId: 'U' } }), 'internal', 'profile_delete_failed_auth_deleted');
  assert.ok(!f.accounts.has('U')); assert.ok(f.docs.has('users/U'));
  delete f.failures.delete;
  assert.deepEqual((await remove({ ...f.args, data: { userId: 'U' } })).deleted, ['U']);
});
test('17 preauth deletion touches only Firestore', async () => {
  const f = fixture(); target(f, 'preauth_a');
  await remove({ ...f.args, data: { userId: 'preauth_a' } });
  assert.ok(!f.calls.some(x => /Auth|^batch:/.test(x)));
  assert.ok(!f.docs.has('users/preauth_a'));
});
test('18 self-delete fails before deletion', async () => {
  const f = fixture(); await rejectsCode(remove({ ...f.args, data: { userId: 'admin' } }), 'failed-precondition');
  assert.ok(f.docs.has('users/admin'));
});
test('19 unknown target fails with not-found', async () => {
  const f = fixture(); await rejectsCode(remove({ ...f.args, data: { userId: 'unknown' } }), 'not-found');
});
test('20 audit failure does not change create or delete result', async () => {
  const f = fixture();
  const original = f.args.db.collection;
  f.args.db.collection = name => {
    const value = original(name);
    if (name === 'logs') value.doc = () => ({ set: async () => { throw Error('audit'); } });
    return value;
  };
  assert.equal((await create(f.args)).uid, 'newUid');
  assert.deepEqual((await remove({ ...f.args, data: { userId: 'newUid' } })).deleted, ['newUid']);
  assert.equal(f.log.errors.length, 2);
});
test('21 cleanup uses 400, 400, 150 batches and has a 50-round cap', async () => {
  const f = fixture(); target(f);
  for (let n = 0; n < 950; n++) f.docs.set(`users/preauth_${n}`, { email: 'b@x.com' });
  await remove({ ...f.args, data: { userId: 'U' } });
  assert.deepEqual(f.calls.filter(x => x.startsWith('batch:')), ['batch:400', 'batch:400', 'batch:150']);
  assert.ok(f.calls.filter(x => x === 'query:users:email:b@x.com').length >= 4);
  const g = fixture(); target(g);
  g.failures.stickyQuery = [{ id: 'preauth_stuck', ref: { path: 'users/preauth_stuck' } }];
  await rejectsCode(remove({ ...g.args, data: { userId: 'U' } }), 'internal', 'profile_delete_failed_auth_deleted');
  assert.equal(g.calls.filter(x => x.startsWith('batch:')).length, 50);
  assert.ok(g.docs.has('users/U'));
});
test('22 failed second batch preserves target and retry clears the rest', async () => {
  const f = fixture(); target(f);
  for (let n = 0; n < 950; n++) f.docs.set(`users/preauth_${n}`, { email: 'b@x.com' });
  f.failures.batch = 2;
  await rejectsCode(remove({ ...f.args, data: { userId: 'U' } }), 'internal', 'profile_delete_failed_auth_deleted');
  assert.ok(f.docs.has('users/U'));
  delete f.failures.batch;
  await remove({ ...f.args, data: { userId: 'U' } });
  assert.ok(!f.docs.has('users/U'));
  assert.ok(![...f.docs.keys()].some(k => k.startsWith('users/preauth_')));
});
