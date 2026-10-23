const { test, mock, after } = require('node:test');
const assert = require('node:assert/strict');
const { makeStore } = require('./fixtures/reminderStore');
const { STAGE_REMINDER_OPTIONS, resolveReminderMode, reminderTransportOptions } = require('./approvalReminderConfig');
const { createStageReminderHandler } = require('./approvalReminders');
let currentDb;
const firestore = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
const nodemailer = require('nodemailer');
const lines = [], transports = [], messages = [];
mock.method(firestore, 'getFirestore', database => {
  assert.equal(database, 'ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece'); return currentDb;
});
mock.method(logger, 'info', (...args) => lines.push(args));
mock.method(logger, 'warn', (...args) => lines.push(args));
mock.method(nodemailer, 'createTransport', options => {
  transports.push(options); return { sendMail: async message => { messages.push(message); return {}; } };
});
const functions = require('./index');
const savedEnv = { ...process.env };
after(() => {
  for (const name of ['APPROVAL_REMINDER_MODE', 'APPROVAL_REMINDER_MAX_EMAILS', 'APPROVAL_EMAIL_FROM', 'APPROVAL_APP_URL', 'fiberinfrasharing']) {
    if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name];
  }
});
function configure(param, state) {
  currentDb = makeStore({ ...(state === 'missing' || state === 'unreadable' ? {} : { settings: { mode: state } }) });
  if (state === 'unreadable') currentDb.failGet = path => path === 'approvalReminderSettings/current';
  if (param === undefined) delete process.env.APPROVAL_REMINDER_MODE; else process.env.APPROVAL_REMINDER_MODE = param;
  process.env.APPROVAL_REMINDER_MAX_EMAILS = '40';
  process.env.APPROVAL_EMAIL_FROM = 'fixture-sender@gmail.com';
  process.env.APPROVAL_APP_URL = 'https://app.example.test';
  process.env.fiberinfrasharing = 'synthetic-test-value';
  lines.length = 0; transports.length = 0; messages.length = 0;
}

test('S36 installed scheduler endpoint and existing exports/trigger are registered with approved options', () => {
  assert.deepEqual(STAGE_REMINDER_OPTIONS, { region: 'asia-southeast1', schedule: '0 9 * * *', timeZone: 'Asia/Bangkok',
    retryCount: 0, maxInstances: 1, timeoutSeconds: 540, memory: '512MiB' });
  for (const name of ['manageProjectFile', 'getProjectCreatedDates', 'createManagedUser', 'deleteManagedUser',
    'cleanupProjectFiles', 'sendApprovalNotifications', 'sendApprovalStageReminders']) assert.equal(typeof functions[name], 'function');
  const endpoint = functions.sendApprovalStageReminders.__endpoint;
  assert.deepEqual(endpoint.region, ['asia-southeast1']);
  assert.equal(endpoint.scheduleTrigger.schedule, '0 9 * * *');
  assert.equal(endpoint.scheduleTrigger.timeZone, 'Asia/Bangkok');
  assert.equal(endpoint.scheduleTrigger.retryConfig.retryCount, 0);
  assert.equal(endpoint.maxInstances, 1); assert.equal(endpoint.timeoutSeconds, 540); assert.equal(endpoint.availableMemoryMb, 512);
  assert.deepEqual(endpoint.secretEnvironmentVariables, [{ key: 'fiberinfrasharing' }]);
  assert.deepEqual(functions.sendApprovalNotifications.__endpoint.region, ['asia-southeast1']);
  assert.equal(functions.sendApprovalNotifications.__endpoint.eventTrigger.retry, true);
  assert.deepEqual(reminderTransportOptions('sender', 'test'), { service: 'gmail', auth: { user: 'sender', pass: 'test' },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000 });
});
const documents = ['missing', 'off', 'dry-run', 'live', 'invalid', 'unreadable'];
const expected = {
  off: ['off', 'off', 'off', 'off', 'off', 'off'],
  'dry-run': ['dry-run', 'off', 'dry-run', 'dry-run', 'off', 'off'],
  live: ['live', 'off', 'dry-run', 'live', 'off', 'off'],
  invalid: ['off', 'off', 'off', 'off', 'off', 'off']
};
for (const param of ['off', 'dry-run', 'live', 'invalid']) {
  for (const [index, document] of documents.entries()) {
    test(`S27 actual scheduled handler mode matrix: ${param} / ${document}`, async () => {
      configure(param, document);
      const state = document === 'missing' ? { exists: false } : document === 'unreadable' ? { unreadable: true } : { exists: true, mode: document };
      const result = expected[param][index];
      assert.equal(resolveReminderMode(param, state), result);
      const summary = await functions.sendApprovalStageReminders.run({});
      if (result === 'off') {
        assert.equal(summary, undefined); assert.equal(lines.length, 1);
        assert.deepEqual(currentDb.events.reads, document === 'unreadable' ? [] : ['approvalReminderSettings/current']);
        assert.equal(currentDb.events.queries.length, 0); assert.equal(currentDb.events.getAll.length, 0);
      } else assert.equal(summary.mode, result);
      assert.equal(transports.length, result === 'live' ? 1 : 0);
      assert.equal(messages.length, 0);
    });
  }
}
test('S27 default is dry-run, whitespace/case normalization, malformed/missing mode fails closed', async () => {
  configure(undefined, 'missing');
  assert.equal((await functions.sendApprovalStageReminders.run({})).mode, 'dry-run');
  assert.equal(resolveReminderMode(), 'dry-run');
  assert.equal(resolveReminderMode(' LIVE ', { exists: true, mode: ' Dry-Run ' }), 'dry-run');
  assert.equal(resolveReminderMode('live', { exists: true }), 'off');
  assert.equal(resolveReminderMode(null), 'off');
});

test('S27,S28 off and dry-run never read secret; live rejects invalid configuration before any send', async () => {
  const db = makeStore(); let secretReads = 0;
  const create = mode => createStageReminderHandler({ getDb: () => db, mode: () => mode, maxEmails: () => 40,
    from: () => 'invalid', appUrl: () => 'http://invalid', password: () => { secretReads++; return ''; },
    createTransport: () => { throw new Error('must not create transport'); } });
  await create('off')(); await create('dry-run')(); assert.equal(secretReads, 0);
  await assert.rejects(create('live')(), /Gmail sender, app URL, or Gmail App Password is missing/);
  assert.equal(secretReads, 1);
});

test('S17 run reads users/permissions once only when due and logs unreadable/malformed permission fallback', async () => {
  const { runStageReminders } = require('./approvalReminders');
  const db = makeStore({ projects: { p: { name: 'Project', owners: ['ITEL'], status: 'Pending Approval', designApproval: {
    status: 'Pending Approval', id: 'a', documentNumber: 'D', requestedAt: '2026-01-01',
    planningSignOffs: { ITEL: { status: 'Pending' } } } } },
    users: { u: { isApproved: true, role: 'Planning', owner: 'ITEL', email: 'signer@example.test' } },
    permissions: { Planning: { permissions: [] } } });
  const logs = []; const run = now => runStageReminders({ db, now: () => Date.parse(now), mode: 'dry-run',
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) } });
  await run('2026-01-02'); assert.equal(db.events.queries.filter(q => ['users', 'rolePermissions'].includes(q.collection)).length, 0);
  assert.equal((await run('2026-01-04')).wouldSend, 1);
  assert.equal(db.events.queries.filter(q => q.collection === 'users').length, 1);
  assert.equal(db.events.queries.filter(q => q.collection === 'rolePermissions').length, 1);
  assert.ok(logs.some(([line]) => line === 'Reminder permissions fallback'));
  db.failGet = path => path === 'rolePermissions';
  assert.equal((await run('2026-01-04')).wouldSend, 1);
});

test('S35 actual existing trigger retains receipt email, retry-on-busy and raw failure write', async () => {
  configure('off', 'missing');
  currentDb.put('users/u', { email: 'existing@example.test', role: 'Design', owner: 'ITEL', isApproved: true });
  const after = { name: 'Existing project', status: 'Pending Approval', owners: ['ITEL'], designApproval: {
    id: 'a', status: 'Pending Approval', approvalStage: 'Planning', documentNumber: 'D', planningSignOffs: { ITEL: { status: 'Pending' } } } };
  const event = { id: 'event', time: '2026-01-01T00:00:00Z', params: { projectId: 'p' },
    data: { before: { data: () => ({ status: 'Draft' }) }, after: { data: () => after } } };
  await functions.sendApprovalNotifications.run(event);
  const [path, receipt] = [...currentDb.values].find(([path]) => path.startsWith('approvalEmailDeliveries/'));
  assert.equal(receipt.email, 'existing@example.test'); assert.equal(receipt.status, 'sent');
  assert.deepEqual(transports[0], { service: 'gmail', auth: { user: 'fixture-sender@gmail.com', pass: 'synthetic-test-value' } });
  currentDb.put(path, { ...receipt, status: 'sending', leaseUntil: Date.now() + 600000 });
  await assert.rejects(functions.sendApprovalNotifications.run(event), /delivery is in progress/);
  currentDb.put(path, { ...receipt, status: 'failed', leaseUntil: 0 });
  nodemailer.createTransport.mock.mockImplementation(() => ({ sendMail: async () => { throw new Error('existing raw failure'); } }));
  try {
    await assert.rejects(functions.sendApprovalNotifications.run(event), /existing raw failure/);
    assert.equal(currentDb.data(path).lastError, 'existing raw failure');
    assert.equal(currentDb.data(path).email, 'existing@example.test');
  } finally {
    nodemailer.createTransport.mock.mockImplementation(options => {
      transports.push(options); return { sendMail: async message => { messages.push(message); return {}; } };
    });
  }
});
