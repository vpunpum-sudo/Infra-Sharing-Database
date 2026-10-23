const { createHash } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { claimDelivery } = require('./deliveryClaims');
const { emailContent } = require('./approvalNotifications');
const { REMINDER_DEFAULTS: D, PROJECT_SELECT_FIELDS, resolveReminderMode,
  REMINDER_MODES, reminderTransportOptions } = require('./approvalReminderConfig');

const DAY = 86400000;
const OWNERS = ['ITEL', 'SYMC', 'UIH'];
// Keep these two recognised stage permissions aligned with src/constants.ts.
const STAGE_PERMISSION_DEFAULTS = Object.freeze({
  Admin: { approvePlanning: true, approveOM: true },
  Management: { approvePlanning: false, approveOM: true },
  Planning: { approvePlanning: true, approveOM: false },
  Design: { approvePlanning: true, approveOM: false },
  Viewer: { approvePlanning: false, approveOM: false },
  'Sub-contract': { approvePlanning: false, approveOM: false }
});
const quietLogger = { info() {}, warn() {} };
const code = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const emailOf = user => typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function timestamp(value) {
  if (value === null || value === undefined || value === '') return NaN;
  try {
    const result = typeof value?.toMillis === 'function' ? value.toMillis()
      : value instanceof Date ? value.getTime()
        : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(result) ? result : NaN;
  } catch { return NaN; }
}
function deriveStageReminder(project, time) {
  const a = project?.designApproval;
  if (!a?.id || !a.documentNumber || a.status !== 'Pending Approval' ||
      (project.status !== undefined && project.status !== 'Pending Approval') ||
      ['Completed', 'Rejected'].includes(a.approvalStage)) return { skip: 'not-pending' };
  const configured = Array.isArray(project.owners) && project.owners.length ? project.owners : [project.owner];
  const owners = [...new Set(configured.map(code))].filter(owner =>
    OWNERS.includes(owner) && Object.hasOwn(a.planningSignOffs || {}, owner));
  if (!owners.length) return { skip: 'no-owners' };
  if ([a.planningSignOffs, a.omSignOffs].some(signOffs =>
    Object.values(signOffs || {}).some(s => s?.status === 'Rejected'))) return { skip: 'rejected' };
  const stage = owners.some(owner => a.planningSignOffs[owner]?.status !== 'Approved') ? 'Planning' : 'OM';
  const signOffs = stage === 'Planning' ? a.planningSignOffs : a.omSignOffs;
  const unsignedOwners = owners.filter(owner => signOffs?.[owner]?.status !== 'Approved');
  if (!unsignedOwners.length) return { skip: 'fully-signed' };
  const starts = stage === 'Planning' ? [timestamp(a.requestedAt)]
    : owners.map(owner => timestamp(a.planningSignOffs[owner].signedAt));
  if (starts.some(start => !Number.isFinite(start) || start > time)) return { skip: 'stage-start-unavailable' };
  const stageStart = Math.max(...starts);
  const elapsed = time - stageStart;
  const reminderNumber = elapsed < D.firstReminderDays * DAY ? 0
    : Math.min(D.maxReminders, 1 + Math.floor((elapsed - D.firstReminderDays * DAY) / (D.repeatDays * DAY)));
  const escalationDue = elapsed >= D.escalationDays * DAY;
  return { approvalId: a.id, stage, stageStart, unsignedOwners, reminderNumber, escalationDue,
    daysWaiting: Math.floor(elapsed / DAY), projectName: project.name || 'Project',
    documentNumber: a.documentNumber, routeCode: project.routeCode || '' };
}
function resolveStagePermissions(documents = {}, logger = quietLogger) {
  const result = {};
  for (const [role, defaults] of Object.entries(STAGE_PERMISSION_DEFAULTS)) {
    const document = documents[role];
    const map = document?.permissions;
    const malformed = document !== undefined && (!map || typeof map !== 'object' || Array.isArray(map) ||
      Object.keys(defaults).some(key => Object.hasOwn(map, key) && typeof map[key] !== 'boolean'));
    result[role] = { ...defaults };
    if (malformed) {
      // Numeric reference only: even a malformed document id must not leak an address.
      logger.warn('Reminder permissions fallback', { roleIndex: Object.keys(STAGE_PERMISSION_DEFAULTS).indexOf(role) });
    } else if (map) {
      for (const key of Object.keys(defaults)) if (typeof map[key] === 'boolean') result[role][key] = map[key];
    }
  }
  return result;
}
function reminderRecipients(users, permissions, state) {
  const approved = users.filter(user => user?.isApproved === true && validEmail(emailOf(user)));
  const admins = [...new Set(approved.filter(user => user.role === 'Admin').map(emailOf))].sort();
  const permission = state.stage === 'Planning' ? 'approvePlanning' : 'approveOM';
  const signers = approved.filter(user => user.role !== 'Admin' &&
    permissions[user.role]?.[permission] === true && state.unsignedOwners.includes(code(user.owner)));
  const reminders = [...new Set((signers.length ? signers : approved.filter(user =>
    user.role === 'Admin' && permissions.Admin?.[permission] === true)).map(emailOf))].sort();
  return { reminders, admins };
}
function reminderDeliveryId(projectId, state, kind, reminderNumber, email) {
  return createHash('sha256').update(JSON.stringify([
    'approval-stage-reminder', projectId, state.approvalId, state.stage,
    kind === 'stage-escalation' ? 'escalation' : 'reminder', reminderNumber, email
  ])).digest('hex');
}
function errorCategory(error) {
  if (error?.code === 'EAUTH' || [530, 534, 535].includes(error?.responseCode)) return 'smtp-auth';
  if ([421, 450, 451, 452, 454].includes(error?.responseCode)) return 'smtp-rate-limit';
  if (error?.code === 'EENVELOPE' || [550, 551, 552, 553, 554].includes(error?.responseCode)) return 'smtp-recipient';
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(error?.code)) return 'timeout';
  if (['ECONNECTION', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ESOCKET'].includes(error?.code)) return 'network';
  return 'unknown';
}
function receiptState(data, time) {
  if (data?.status === 'sent') return 'alreadySent';
  if (data?.attempts >= D.maxAttempts) return 'exhausted';
  if (data?.status === 'sending' && data.leaseUntil > time) return 'busy';
  return null;
}
function itemFor(projectId, state, kind, email) {
  const reminderNumber = kind === 'stage-escalation' ? 0 : state.reminderNumber;
  return { projectId, state, kind, reminderNumber, email,
    id: reminderDeliveryId(projectId, state, kind, reminderNumber, email) };
}
function detailsOf(item) {
  return { projectId: item.projectId, approvalId: item.state.approvalId, stage: item.state.stage,
    kind: item.kind, reminderNumber: item.reminderNumber };
}
function makeSummary(mode) {
  return { mode, projectsScanned: 0, scanTruncated: false, candidateTruncated: false,
    truncated: false, candidates: 0, skipped: {}, staleSkipped: 0, dueItems: 0,
    alreadySent: 0, busy: 0, exhausted: 0, escalationExcluded: 0,
    sent: 0, wouldSend: 0, failed: 0, ambiguous: 0,
    deferredByCap: 0, deferredByAbort: 0, deferredByTime: 0 };
}

/** Best-effort dedupe, with two accepted gaps:
 * SMTP acceptance followed by a failed receipt write can cause a later duplicate.
 * Reminder/escalation ids differ: overlapping runs can send an escalation while
 * an Admin reminder is busy (one of each in that overlap; not a lifetime cap).
 * The once-per-project recheck uses the run's users/permissions snapshot; changes
 * after it can still produce mail. No address or address-derived id is logged.
 */
async function runStageReminders({ db, users, permissions, now = Date.now, mode = D.mode,
  maxEmails = D.maxEmails, send, claim = claimDelivery, logger = quietLogger,
  appUrl = 'https://localhost', serverTimestamp = () => FieldValue.serverTimestamp() }) {
  const clock = typeof now === 'function' ? now : () => now;
  const startTime = clock();
  mode = REMINDER_MODES.includes(mode) ? mode : 'off';
  const summary = makeSummary(mode);
  const finish = () => { summary.truncated = summary.scanTruncated || summary.candidateTruncated;
    logger.info('Approval reminder summary', summary); return summary; };
  if (mode === 'off') return finish();
  const budget = Number.isFinite(Number(maxEmails)) ? Math.min(100, Math.max(0, Math.floor(Number(maxEmails)))) : D.maxEmails;
  const states = [];
  let cursor;
  for (let page = 0; page < D.maxPages; page++) {
    let query = db.collection('projects').where('designApproval.status', '==', 'Pending Approval')
      .orderBy('__name__').select(...PROJECT_SELECT_FIELDS).limit(D.pageSize);
    if (cursor) query = query.startAfter(cursor);
    let snapshot;
    try { snapshot = await query.get(); }
    catch { logger.warn('Reminder project scan failed', { category: 'unknown' }); break; }
    for (const doc of snapshot.docs) {
      summary.projectsScanned++;
      const state = deriveStageReminder(doc.data(), startTime);
      if (state.skip) {
        summary.skipped[state.skip] = (summary.skipped[state.skip] || 0) + 1;
        if (state.skip === 'stage-start-unavailable') logger.warn('Reminder project skipped', { projectId: doc.id, reason: state.skip });
      } else if (state.reminderNumber || state.escalationDue) {
        states.push({ projectId: doc.id, state });
        summary.dueItems++;
      }
    }
    if (snapshot.docs.length < D.pageSize) break;
    cursor = snapshot.docs.at(-1);
    if (page === D.maxPages - 1) {
      // Conservatively flag a full final page without an unbounded extra read.
      summary.scanTruncated = true;
      logger.warn('REMINDER SCAN TRUNCATED: 2000-project ceiling', { projectsScanned: summary.projectsScanned });
    }
  }
  if (!states.length) return finish();
  if (users === undefined) {
    try { users = (await db.collection('users').get()).docs.map(doc => doc.data()); }
    catch { logger.warn('Reminder users unavailable', { category: 'unknown' }); return finish(); }
  }
  if (permissions === undefined) {
    let documents = {};
    try {
      for (const doc of (await db.collection('rolePermissions').get()).docs) documents[doc.id] = doc.data();
    } catch {
      documents = Object.fromEntries(Object.keys(STAGE_PERMISSION_DEFAULTS).map(role => [role, null]));
    }
    permissions = resolveStagePermissions(documents, logger);
  }
  states.sort((a, b) => a.state.stageStart - b.state.stageStart || compare(a.projectId, b.projectId));
  const reminders = [], escalations = [];
  for (const { projectId, state } of states) {
    const recipients = reminderRecipients(users, permissions, state);
    if (state.reminderNumber) for (const email of recipients.reminders) reminders.push(itemFor(projectId, state, 'stage-reminder', email));
    if (state.escalationDue) for (const email of recipients.admins) escalations.push(itemFor(projectId, state, 'stage-escalation', email));
  }
  const all = [...reminders, ...escalations];
  summary.candidates = all.length;
  if (all.length > D.maxCandidates) {
    summary.candidateTruncated = true;
    logger.warn('REMINDER CANDIDATES TRUNCATED: 5000-receipt ceiling', { candidates: all.length });
  }
  const receiptRef = id => db.collection('approvalEmailDeliveries').doc(id);
  const surviving = [];
  for (let offset = 0; offset < Math.min(all.length, D.maxCandidates); offset += D.receiptChunkSize) {
    const items = all.slice(offset, Math.min(offset + D.receiptChunkSize, D.maxCandidates));
    try {
      const snapshots = await db.getAll(...items.map(item => receiptRef(item.id)));
      items.forEach((item, index) => {
        const handled = receiptState(snapshots[index].data(), clock());
        if (handled) summary[handled]++; else surviving.push(item);
      });
    } catch {
      summary.skipped['receipt-unavailable'] = (summary.skipped['receipt-unavailable'] || 0) + items.length;
      logger.warn('Reminder receipt read failed', { category: 'unknown', count: items.length });
    }
  }
  const rechecked = new Map();
  const reminderReceived = new Set(); // In memory only; never stored or logged.
  const receivedKey = item => JSON.stringify([item.projectId, item.state.approvalId, item.state.stage, item.email]);
  let attempts = 0, consecutiveFailures = 0;
  const deferReason = () => consecutiveFailures >= 3 ? 'deferredByAbort'
    : clock() - startTime >= D.deadlineMs ? 'deferredByTime'
      : attempts >= budget ? 'deferredByCap' : null;
  async function recheck(item) {
    if (rechecked.has(item.projectId)) return rechecked.get(item.projectId);
    let fresh;
    try {
      const [doc] = await db.getAll(db.collection('projects').doc(item.projectId), { fieldMask: PROJECT_SELECT_FIELDS });
      fresh = deriveStageReminder(doc.data(), clock());
    } catch { fresh = { skip: 'recheck-unavailable' }; }
    const old = item.state;
    const valid = !fresh.skip && fresh.approvalId === old.approvalId && fresh.stage === old.stage &&
      fresh.reminderNumber === old.reminderNumber && fresh.escalationDue === old.escalationDue;
    const result = { valid, state: fresh, recipients: valid ? reminderRecipients(users, permissions, fresh) : null };
    rechecked.set(item.projectId, result);
    return result;
  }
  async function excluded(item) {
    if (reminderReceived.has(receivedKey(item))) { summary.escalationExcluded++; return true; }
    const ids = [1, 2, 3].map(n => reminderDeliveryId(item.projectId, item.state, 'stage-reminder', n, item.email));
    try {
      const snapshots = await db.getAll(...ids.map(receiptRef));
      if (snapshots.some(doc => doc.data()?.status === 'sent')) { summary.escalationExcluded++; return true; }
    } catch {
      // Do not send an escalation when its exclusion cannot be checked safely.
      summary.skipped['exclusion-unavailable'] = (summary.skipped['exclusion-unavailable'] || 0) + 1;
      return true;
    }
    return false;
  }
  async function process(item, newlyEligible = false) {
    if (item.kind === 'stage-escalation' && await excluded(item)) return;
    const reason = deferReason();
    if (reason) { summary[reason]++; return; }
    if (mode === 'live') {
      const fresh = await recheck(item);
      const recipients = item.kind === 'stage-reminder' ? fresh.recipients?.reminders : fresh.recipients?.admins;
      if (!fresh.valid || !recipients.includes(item.email)) { summary.staleSkipped++; return; }
      item = itemFor(item.projectId, fresh.state, item.kind, item.email);
    }
    if (newlyEligible) {
      try {
        const handled = receiptState((await receiptRef(item.id).get()).data(), clock());
        if (handled) { summary[handled]++; return; }
      } catch { summary.skipped['receipt-unavailable'] = (summary.skipped['receipt-unavailable'] || 0) + 1; return; }
    }
    const afterReadReason = deferReason();
    if (afterReadReason) { summary[afterReadReason]++; return; }
    if (mode === 'dry-run') {
      attempts++; summary.wouldSend++;
      if (item.kind === 'stage-reminder') reminderReceived.add(receivedKey(item));
      logger.info('Approval reminder would send', { ...detailsOf(item), recipientCount: 1 });
      return;
    }
    let ref;
    try {
      const claimed = await claim(db, item.id, detailsOf(item), { maxAttempts: D.maxAttempts, now: clock, serverTimestamp });
      if (claimed.result !== 'claimed') {
        summary[claimed.result === 'sent' ? 'alreadySent' : claimed.result]++;
        return;
      }
      ref = claimed.ref;
    } catch {
      summary.skipped['claim-unavailable'] = (summary.skipped['claim-unavailable'] || 0) + 1;
      logger.warn('Reminder claim failed', { ...detailsOf(item), category: 'unknown' }); return;
    }
    // A slow database operation must not permit a new SMTP attempt after the deadline.
    if (clock() - startTime >= D.deadlineMs) { summary.deferredByTime++; return; }
    attempts++;
    try {
      await send({ to: item.email, messageId: `<approval-reminder-${item.id}@gmail.com>`,
        ...emailContent({ kind: item.kind, ...item.state, owners: item.state.unsignedOwners,
          reminderNumber: item.reminderNumber, details: { routeCode: item.state.routeCode } }, appUrl, item.projectId) });
    } catch (error) {
      const category = errorCategory(error);
      summary.failed++; consecutiveFailures++;
      try { await ref.set({ status: 'failed', leaseUntil: 0, lastErrorCategory: category,
        updatedAt: serverTimestamp() }, { merge: true }); } catch { /* Lease still bounds recovery. */ }
      logger.warn('Reminder send failed', { ...detailsOf(item), category, attemptCount: attempts });
      return;
    }
    let recorded = false;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await ref.set({ status: 'sent', sentAt: serverTimestamp(), updatedAt: serverTimestamp(), leaseUntil: 0 }, { merge: true });
        recorded = true; break;
      } catch { /* Retry only the receipt write; never resend in this invocation. */ }
    }
    if (!recorded) {
      summary.ambiguous++; consecutiveFailures++;
      logger.warn('Reminder outcome ambiguous: best-effort dedupe', { ...detailsOf(item), category: 'receipt-write', attemptCount: attempts });
      // Keep sending + live lease; do not mark failed after SMTP acceptance.
      try { await ref.set({ lastErrorCategory: 'receipt-write', updatedAt: serverTimestamp() }, { merge: true }); } catch { /* Already logged without provider text. */ }
      return;
    }
    summary.sent++; consecutiveFailures = 0;
    if (item.kind === 'stage-reminder') reminderReceived.add(receivedKey(item));
  }
  const additionsProcessed = new Set();
  async function processAddedReminders(projectId) {
    const fresh = rechecked.get(projectId);
    if (!fresh?.valid || additionsProcessed.has(projectId)) return;
    additionsProcessed.add(projectId);
    // Include the full planned set: a prefiltered recipient is not newly eligible.
    const planned = new Set(reminders.filter(item => item.projectId === projectId).map(item => item.email));
    for (const email of fresh.recipients.reminders.filter(email => !planned.has(email))) {
      await process(itemFor(projectId, fresh.state, 'stage-reminder', email), true);
    }
  }
  for (const kind of ['stage-reminder', 'stage-escalation']) {
    const phase = surviving.filter(item => item.kind === kind);
    for (let index = 0; index < phase.length;) {
      const projectId = phase[index].projectId;
      const group = [];
      while (index < phase.length && phase[index].projectId === projectId) group.push(phase[index++]);
      if (mode === 'live' && kind === 'stage-escalation' && !rechecked.has(projectId) && !deferReason()) {
        // A project's planned reminders can all have been prefiltered. If its
        // escalation initiates the recheck, include new signers before escalating.
        await recheck(group[0]);
        await processAddedReminders(projectId);
      }
      for (const item of group) await process(item);
      if (mode === 'live' && kind === 'stage-reminder') await processAddedReminders(projectId);
    }
  }
  return finish();
}

// Thin scheduler adapter, exported for isolated mode/registration tests.
function createStageReminderHandler({ getDb, mode, maxEmails, from, appUrl, password,
  createTransport, logger = quietLogger, now = Date.now, run = runStageReminders }) {
  return async () => {
    const db = getDb();
    let documentState;
    try {
      const snapshot = await db.collection('approvalReminderSettings').doc('current').get();
      documentState = snapshot.exists ? { exists: true, mode: snapshot.data()?.mode } : { exists: false };
    } catch { documentState = { unreadable: true }; }
    const param = mode();
    const effective = resolveReminderMode(param, documentState);
    // Exactly one line for off, including invalid/unreadable configuration.
    if (effective === 'off') {
      logger.info('Approval reminders off', { mode: 'off', reason: 'mode-ceiling-or-brake' }); return;
    }
    let send, url;
    if (effective === 'live') {
      const sender = from().trim().toLowerCase(); url = appUrl().trim();
      const secret = password();
      if (!/^[^\s@]+@gmail\.com$/.test(sender) || !/^https:\/\//.test(url) || !secret) {
        throw new Error('Gmail sender, app URL, or Gmail App Password is missing');
      }
      const transport = createTransport(reminderTransportOptions(sender, secret));
      send = message => transport.sendMail({ from: sender, ...message });
    }
    return run({ db, now, mode: effective, maxEmails: maxEmails(), send, logger, ...(url ? { appUrl: url } : {}) });
  };
}
module.exports = { STAGE_PERMISSION_DEFAULTS, deriveStageReminder, resolveStagePermissions,
  reminderRecipients, reminderDeliveryId, errorCategory, runStageReminders, createStageReminderHandler };
