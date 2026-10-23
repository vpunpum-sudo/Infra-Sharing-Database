# Approval email notifications

The `sendApprovalNotifications` Firebase Function watches the named Firestore
database used by the app. It sends one email per address at each transition:

1. New Planning request → approved Design users of participating project owners.
2. All Planning sign-offs approved → approved Management users of those owners.
3. All Management sign-offs approved → approved Design and Management users.

Recipients must have a valid email, an approved user account, and an Owner
explicitly configured on the project. The Owner must also have a Planning
sign-off in the approval request. No email goes to all companies when a project
has no configured Owner. An address shared by multiple matching users receives
one message for the event.

## Required setup before deployment

- The Firebase project must be on Blaze and Cloud Functions must be enabled.
- Use a dedicated Gmail mailbox with 2-Step Verification and generate a unique
  App Password for this function. The account holder must do this in Google
  Account settings; do not put the password in chat or commit it to GitHub.
- Create the `fiberinfrasharing` secret in Google Cloud Secret Manager for
  project `gen-lang-client-0942355314`. Store the Gmail App Password as its
  first enabled version. Never put the password in chat or GitHub.
- Set `APPROVAL_EMAIL_FROM` to that Gmail address and
  `APPROVAL_APP_URL` to the HTTPS application URL when deploying. These are
  Firebase parameter values, not Vite frontend variables.
- Install dependencies in `functions/` and deploy **only when authorized** with
  `firebase deploy --only functions:sendApprovalNotifications --project gen-lang-client-0942355314`.
- The function runs in `asia-southeast1`, matching the named Firestore database.

The Cloudflare frontend deployment is separate. This feature sends no email
until the Firebase Function and its settings are deployed. Delivery receipts
are stored in `approvalEmailDeliveries`, a collection not exposed by client
Firestore rules. A Firestore transaction claims each recipient before sending,
and failed sends are retried. SMTP cannot guarantee exactly-once delivery if
the process stops after Gmail accepts a message but before the receipt is
saved. Gmail also has account sending limits and may block automated SMTP;
a dedicated mail service with a verified domain is preferable for production.

## Stuck approval reminders (backend only)

`sendApprovalStageReminders` is a separate scheduled function on the same named
Firestore database in `asia-southeast1`. It runs daily at 09:00 Asia/Bangkok
(`0 9 * * *`), with scheduler retries disabled, one instance, 512 MiB memory and
a 540-second timeout. The existing transition trigger is unchanged.

Defaults live in `functions/approvalReminderConfig.js` (`REMINDER_DEFAULTS`):
reminders at stage days 3, 6 and 9, at most three reminder numbers per approval
and stage; Admin escalation once at day 7. Catch-up sends only the highest due
number (a request first observed at day 30 receives number 3). Escalation stays
due without an upper time bound. The default per-run budget is 40 actual send
attempts (or would-send entries), configured by `APPROVAL_REMINDER_MAX_EMAILS`
and clamped to 0–100. Failed sends consume the budget too.

Planning uses `requestedAt`; OM uses the latest Planning `signedAt`, with valid,
non-future timestamps required for every participating owner. Only approved users
with a valid address, an explicit unsigned Owner and the stage permission are
reminded. Role permission documents overlay boolean stage permissions on the
built-in defaults (Planning/Design for Planning; Management for OM). Unreadable
or malformed documents fall back to defaults with a warning. When no non-Admin
signer exists for the whole request, approved Admins with stage permission are
the fallback. Escalation goes to approved Admins, excluding addresses with a
`sent` reminder receipt for that approval/stage or a reminder sent earlier in the
run. Busy, failed, exhausted and cap-deferred reminders do not exclude an Admin;
an eligible escalation can still wait for a later run's budget.

### Activation sequence and runtime brake

The `APPROVAL_REMINDER_MODE` Firebase param defaults to `dry-run`. Its mode is a
ceiling. `approvalReminderSettings/current` (`{ mode: 'off' | 'dry-run' | 'live' }`)
is the runtime brake: the effective mode is the more restrictive value
(`off` < `dry-run` < `live`). The document can never enable `live` above the
param. Modes are trimmed and case-insensitive. A missing document is ignored;
an invalid param, invalid document or unreadable document fails closed to `off`
and is logged. The document is read at invocation start; a brake affects the
next invocation and does not cancel sends already in progress.

1. With **separate explicit authorization naming Firebase functions and the
   production project**, deploy only the new function, leaving the mode param
   at `dry-run`:
   `firebase deploy --only functions:sendApprovalStageReminders --project gen-lang-client-0942355314`.
2. Read the dry-run logs of at least one scheduled run. Dry-run reads receipts
   and applies the same filtering/budget, but makes no claims, writes no receipts,
   sends no messages and does not read the Gmail secret value.
3. With a separate owner go-ahead, redeploy that function with
   `APPROVAL_REMINDER_MODE=live`. The brake document must be absent or `live`.
   It uses the existing `APPROVAL_EMAIL_FROM`, `APPROVAL_APP_URL` and
   `fiberinfrasharing` secret; these must be valid before sending.
4. To stop without a deploy, write `{ mode: 'off' }` (or `dry-run`) through the
   Firebase console or Admin SDK. Resume by deleting the brake or setting it to
   `live`, which works only if the deployed param is already `live`.

No deployment or activation is performed by the implementation workflow. No
Cloudflare deployment, frontend change, rules publication or project migration
is needed. The brake and receipts are inaccessible through client rules.

### Bounds, receipts and accepted limitations

- The job pages through pending projects in document-id order, projecting only
  approved metadata and sign-off status/time leaves, 100 per page, at most
  20 pages. **Projects beyond the first 2000 pending projects are never scanned.**
  A full twentieth page conservatively sets `scanTruncated` and logs
  `REMINDER SCAN TRUNCATED`, even if there is no 2001st project.
- Reminder candidates precede escalation candidates; within each phase they
  sort by oldest stage start, project id, then email. **Only the first 5000
  candidate receipt ids are examined** in `getAll` chunks of at most 100.
  `candidateTruncated` and `truncated` accompany
  `REMINDER CANDIDATES TRUNCATED`. Candidates beyond this ceiling remain
  excluded until earlier candidates leave the set; already-sent receipts
  remain candidates while their projects qualify. There is no progress
  guarantee beyond either ceiling and no persistent scan cursor.
- Sent, busy and exhausted receipts are filtered *before* the attempt budget,
  so even more than 1000 handled receipts cannot starve later candidates
  within the ceiling. Failed/expired receipts retry up to three total claims.
  Escalation exclusion checks at most three deterministic reminder documents
  per surviving Admin escalation candidate, in addition to candidate peeks;
  there is no receipt collection query.
- Live mode rechecks a project once before claiming and recalculates recipients.
  New recipients get their own receipt peek. The same users/permissions snapshot
  is reused for the run. A change after the recheck, or to those user records,
  can still cause one stale email in that run (the residual recheck window).
  Dry-run does not recheck projects.
- Delivery uses **best-effort dedupe**: a transaction lease and deterministic
  receipt/message ids suppress recorded sends. **Ambiguous outcome:** SMTP may
  accept a message while all three attempts to save its `sent` receipt fail.
  The receipt stays `sending` with a 10-minute lease; after it expires a later
  run can send a duplicate, subject to the three-claim cap.
- **Reminder and escalation ids differ.** Concurrent overlapping runs can send
  an escalation while another run's reminder to that Admin is busy. The accepted
  overlap is one reminder plus one escalation for that Admin/approval/stage,
  bounded by `maxInstances: 1` and `retryCount: 0`. This is an overlap caveat,
  not a lifetime total: three reminder numbers and ambiguous retries remain
  possible.
- New receipts store no recipient address or address-derived fields; logs omit
  recipient addresses, delivery ids and provider error text. The deterministic
  SHA-256 document id necessarily derives from the address. It is pseudonymous,
  not anonymized: a known candidate address can be guessed and hashed. Reminder
  bodies omit requester/reason/signature/contact/attachment data. The recipient
  appears only in the send's `To` header. Existing trigger receipts retain their
  existing fields and error handling.
- Three consecutive send failures or ambiguous outcomes stop the run. No new
  send starts after 480 seconds; SMTP timeouts are 10s connection, 10s greeting,
  30s socket. These do not bound every Firestore operation or guarantee finish
  before the platform timeout. Summary counts distinguish failures, ambiguous
  outcomes, stale skips and cap/abort/time deferrals.
- Rewinding to Planning reuses `requestedAt` and the same approval id, so the
  clock does not restart and old Planning reminder numbers are not resent.
  A new submission has a new id and clock. Missing legacy timestamps/owners
  are skipped; route-derived owners are not guessed.

For rollback, first lower the runtime brake, then (if authorized) redeploy with
mode `off` or `dry-run`. Deleting the function is a separate authorized operation.
Existing receipts are inert. See `docs/specs/approval-stuck-reminders.md` for the
implementation and test contract.
