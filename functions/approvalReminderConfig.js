// Deployment defaults for the backend-only reminder job. No Firebase side effects.
const REMINDER_DEFAULTS = Object.freeze({
  firstReminderDays: 3, repeatDays: 3, maxReminders: 3, escalationDays: 7,
  maxEmails: 40, maxCandidates: 5000, receiptChunkSize: 100, maxAttempts: 3,
  deadlineMs: 480000, pageSize: 100, maxPages: 20,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000,
  mode: 'dry-run'
});
const STAGE_REMINDER_OPTIONS = Object.freeze({
  region: 'asia-southeast1', schedule: '0 9 * * *', timeZone: 'Asia/Bangkok',
  retryCount: 0, maxInstances: 1, timeoutSeconds: 540, memory: '512MiB'
});
const REMINDER_MODES = Object.freeze(['off', 'dry-run', 'live']);
const PROJECT_SELECT_FIELDS = Object.freeze([
  'name', 'routeCode', 'status', 'owner', 'owners', 'designApproval.id',
  'designApproval.status', 'designApproval.documentNumber', 'designApproval.approvalStage',
  'designApproval.requestedAt',
  ...['planningSignOffs', 'omSignOffs'].flatMap(level =>
    ['ITEL', 'SYMC', 'UIH'].flatMap(owner =>
      ['status', 'signedAt'].map(field => `designApproval.${level}.${owner}.${field}`)))
]);
function normalizeMode(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
// documentState: { exists: false }, { exists: true, mode }, or { unreadable: true }.
function resolveReminderMode(paramValue = REMINDER_DEFAULTS.mode, documentState = { exists: false }) {
  const param = normalizeMode(paramValue);
  if (!REMINDER_MODES.includes(param) || documentState.unreadable) return 'off';
  if (documentState.exists === false) return param;
  const brake = normalizeMode(documentState.mode);
  if (!REMINDER_MODES.includes(brake)) return 'off';
  return REMINDER_MODES[Math.min(REMINDER_MODES.indexOf(param), REMINDER_MODES.indexOf(brake))];
}
function reminderTransportOptions(from, password) {
  return { service: 'gmail', auth: { user: from, pass: password },
    connectionTimeout: REMINDER_DEFAULTS.connectionTimeout,
    greetingTimeout: REMINDER_DEFAULTS.greetingTimeout, socketTimeout: REMINDER_DEFAULTS.socketTimeout };
}
module.exports = { REMINDER_DEFAULTS, STAGE_REMINDER_OPTIONS, PROJECT_SELECT_FIELDS,
  REMINDER_MODES, resolveReminderMode, reminderTransportOptions };
