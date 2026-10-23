# approval-stuck-reminders

Archived by `agent-flow` on 2026-10-23 after an approved review.

- Branch: `vpunpum-sudo/เอกสารขออนุมัติ-เพิ่มฟังก์ชั่น-v1`
- Base commit: `72446be`
- Verification: `npm run verify`, Started: 2026-10-23T15:39:08Z, Exit code: 0

Status: APPROVED
Feature: approval-stuck-reminders
Risk: HIGH — adds a new scheduled backend Cloud Function that sends email to real users. It also adds deployment configuration (a Firebase param, a runtime brake document and a scheduler), refactors the delivery-claim code shared with the existing approval trigger, and reads user, role-permission and project data with the Admin SDK. It sits on the approval permission model. There is no frontend, rules, project-schema or attachment change.

### Objective

Feature 2 of 7 in the approval-usability series. Today an approval email goes out only at a stage transition, so a request nobody signs is never mentioned again. Add a scheduled Firebase function that nudges only the people who can still sign the current stage of a stuck `Pending Approval` request. It repeats on a fixed cadence and stops after a cap. One escalation email goes to Admin users when a request has waited 7 days in a stage.

Delivery must be idempotent and race-safe on a best-effort basis. It is not exactly-once; see "Delivery guarantee". It must keep the existing privacy rule that no reason text or signature data appears in a subject or preview, and new reminder receipts must not store recipient addresses. It must be bounded per run and stoppable without a code deploy.

### DEFAULTS the owner can change

These are named constants in one exported `REMINDER_DEFAULTS` object in `functions/approvalReminderConfig.js`. Changing one means a one-line edit plus a functions deploy. Tests pin the current values, so a change updates one test.

| Setting | Default | Meaning |
| --- | --- | --- |
| First reminder | 3 days | Time waiting in the current stage before reminder #1. |
| Repeat interval | 3 days | Reminder #n is due at `stageStart + n × 3 days`, so reminders land at day 3, 6 and 9. Measured from the stage start, not the last send, so it never drifts and delivery ids stay deterministic. |
| Max reminders per approval stage | 3 | Counted per `approvalId + stage`. Escalation is not counted in the 3. |
| Admin escalation | once, at 7 days waiting in the stage | One email per `approvalId + stage + Admin address`. It stays due for as long as the stage stays pending (no upper time bound) until it is sent. |
| Schedule | daily 09:00 `Asia/Bangkok` | Reminders arrive at most about 24h after they become due and never overnight. |
| Max send attempts per run | 40 | Counts only actual send attempts (live) or would-send entries (dry-run). Clamped to 0–100 via `APPROVAL_REMINDER_MAX_EMAILS`, default 40. Gmail daily limits are shared with the existing transition emails. |
| Candidate receipt ids examined per run | 5000 (read in `getAll` chunks of 100) | Hard ceiling. Exceeding it sets `candidateTruncated` with a prominent warning (see "Bounded scan and receipt pre-filter"). |
| Max claims (attempts) per receipt | 3 | A recipient whose claims keep failing or staying ambiguous is skipped as `exhausted`. |
| Run deadline | 480 s | No new send is started after 480 s from run start (function timeout is 540 s). Remaining items are counted `deferredByTime`. |
| SMTP timeouts (new function's transport) | connectionTimeout 10 s, greetingTimeout 10 s, socketTimeout 30 s | Gives the sequential-send bound a concrete limit. |
| Mode param on first deploy | `dry-run` | Deploying sends nothing until the owner redeploys with `live` (see "Activation"). |

**Catch-up rule.** If the scheduler was down and a request has waited past several due times, send only the highest due number, `min(3, floor(elapsed / 3d))`. Never burst #1, #2 and #3 together. Lower numbers that were skipped are never sent late. A request first observed at day 30 gets reminder 3 once, and nothing more after that.

### Activation (go-live sequence, used consistently everywhere)

The param `APPROVAL_REMINDER_MODE` is the **ceiling**. The Firestore document `approvalReminderSettings/current` (`{ mode }`) is the **instant brake**. The effective mode is the more restrictive of the two (`off` < `dry-run` < `live`). The document can only lower the mode; it can never raise it above the param.

1. First deploy, with the param left at its default `dry-run`. Nothing is sent.
2. Read the dry-run logs of at least one scheduled run.
3. With a separate go-ahead from the owner, redeploy the function with `APPROVAL_REMINDER_MODE=live`. The document must be absent or `{ mode: 'live' }` for the effective mode to be `live`.
4. To stop instantly without a deploy, write `{ mode: 'off' }` (or `'dry-run'`) to the document. To resume after a brake, delete the document or set it to `'live'` (this works only if the deployed param is `live`).

A missing document is ignored. A document or param value that is invalid, or a document that cannot be read, fails closed to `off` and is logged. Values are trimmed and compared case-insensitively.

### Delivery guarantee

Receipts, leases and deterministic ids give best-effort deduplication: one send attempt per claimed receipt, and no second send for a receipt recorded as `sent`. This is not exactly-once. Two known gaps are accepted and must be documented next to this wording in `APPROVAL_EMAIL_SETUP.md`, the spec and the code comments:

- **Ambiguous outcome.** If SMTP accepts a message and the `sent` receipt write then fails, the outcome is ambiguous, and a later run may send a second copy after the lease expires.
- **Reminder and escalation have different receipt ids.** A concurrent run can therefore send an escalation to an Admin while another run's reminder for that same Admin is still `busy`. This is accepted; it is bounded by `maxInstances: 1` and `retryCount: 0`, and it cannot exceed one reminder plus one escalation per Admin per approval stage.

All docs, comments and logs say "best-effort dedupe", never "exactly once".

### In scope

- New `functions/approvalReminderConfig.js`: a module with no Firebase side effects. It exports `STAGE_REMINDER_OPTIONS` (region `asia-southeast1`, schedule `0 9 * * *`, `timeZone: 'Asia/Bangkok'`, `retryCount: 0`, `maxInstances: 1`, `timeoutSeconds: 540`, `memory: '512MiB'`), `REMINDER_DEFAULTS`, `PROJECT_SELECT_FIELDS`, `resolveReminderMode`, the allowed mode names, and `reminderTransportOptions(from, password)`, which returns the nodemailer options for the new transport (`service: 'gmail'`, the credentials, `connectionTimeout: 10000`, `greetingTimeout: 10000`, `socketTimeout: 30000`).
- New `functions/approvalReminders.js`: the pure derivation plus the run orchestrator `runStageReminders({ db, users, permissions, now, mode, maxEmails, send, claim, logger })`. It holds stage derivation, stage-start derivation, recipient resolution, due-item calculation, the receipt pre-filter, the escalation exclusion lookup, reminder email content and error-category mapping. Every external effect (Firestore handle, clock, mailer, claim, logger) is injected.
- A new exported scheduled function `sendApprovalStageReminders` in `functions/index.js`, using `onSchedule` from `firebase-functions/v2/scheduler` with `STAGE_REMINDER_OPTIONS` plus `secrets: [gmailAppPassword]` (the existing `fiberinfrasharing` secret), the same `APPROVAL_EMAIL_FROM` and `APPROVAL_APP_URL` params, and the same named Firestore database. It adds the params `APPROVAL_REMINDER_MODE` and `APPROVAL_REMINDER_MAX_EMAILS`, and builds its transport from `reminderTransportOptions`. The existing trigger's transport is not changed.
- Extract `claimDelivery` from `functions/index.js` into `functions/deliveryClaims.js`:
  - The behaviour for the existing trigger is unchanged: `sent` skips, an unexpired `sending` lease returns `busy` and the trigger still throws on `busy` so Firebase retries (`retry: true` stays), otherwise it claims with a 10-minute lease and `attempts + 1`.
  - The existing trigger keeps passing `email` in its receipt details and keeps its raw `lastError` failure write exactly as today. Its receipts and behaviour do not change.
  - Add an optional `maxAttempts` argument returning `exhausted` without writing when `attempts >= maxAttempts` and the status is not `sent`. The existing trigger does not pass it.
  - Add injectable clock and serverTimestamp.
- Reminder email templates (Thai), built on the existing `emailContent` in `functions/approvalNotifications.js`. Add the kinds `stage-reminder` and `stage-escalation` and a "waiting" row, or export the needed helpers. The change is additive; the five existing kinds render byte-identical output (see S34).
- The mode resolution, dry-run, and the bounded-run behaviour described below.
- Tests: `functions/approvalReminders.test.js`, `functions/deliveryClaims.test.js`, `functions/approvalReminderRegistration.test.js` and `functions/approvalNotifications.golden.test.js` with its fixture.
- Documentation: a section in `APPROVAL_EMAIL_SETUP.md` (function, params, Activation sequence, the 2000-project and 5000-receipt limitations, best-effort dedupe caveats, deploy command) and `docs/specs/approval-stuck-reminders.md`.

### Out of scope

- Frontend, `firestore.rules`, `storage.rules`, project schema (no new stored field), attachments, and any deployment. See "Why no rules or schema change".
- Changing the existing trigger's recipients, timing, retry behaviour, receipts or templates.
- The other 5 features: version history and diff, saved signature, in-app notifications, delegate signer, Admin bulk legacy lock.
- Digest emails (one mail per person per run). Each project gets its own email, bounded by the per-run budget.

### Acceptance criteria

- [ ] A scheduled function `sendApprovalStageReminders` exists in `asia-southeast1` and is exported from `functions/index.js`. Loading `functions/index.js` registers it, and all previously exported names are still present.
- [ ] A project is considered only when `designApproval.status === 'Pending Approval'`, the project `status` is `Pending Approval` (or absent, as in `buildSigningQueue`), and `approvalStage` is neither `Completed` nor `Rejected`.
- [ ] The stage is derived like `src/utils/approvalQueue.ts`:
  - Participating owners come from `owners`, or `owner` when `owners` is empty. The result is limited to the known owner codes and to owners that have a `planningSignOffs` entry, as the existing `participatingOwners` in `approvalNotifications.js` does. Route-derived owners are not available server-side, so a legacy project with no configured owner is skipped, matching the existing "never notify all companies" rule.
  - If any owner's Planning sign-off is not `Approved`, the stage is `Planning`. Otherwise it is `OM`, with unsigned owners taken from `omSignOffs` (a missing entry counts as unsigned).
  - If no owner is unsigned at the derived stage, nothing is sent.
  - If any sign-off at either level is `Rejected`, nothing is sent.
- [ ] The stage start is derived from stored data only:
  - `Planning`: `designApproval.requestedAt`. A resubmission creates a new approval with a new `id` and a new `requestedAt`, so the clock restarts. It must be a valid, non-future timestamp.
  - `OM`: the latest `signedAt` among the participating owners' `Approved` Planning sign-offs. **Every** participating owner's Approved Planning sign-off must carry a valid, non-future `signedAt`; if any is missing, unparseable or in the future, the approval is skipped (it does not use the maximum of the parseable ones).
  - A skip logs a structured warning with reason `stage-start-unavailable` and is counted. There is no fallback to `requestedAt` for OM.
  - The known rewind-clock limitation is kept (below).
- [ ] Reminder #n (n = 1..3) is due when `now − stageStart ≥ n × 3 days`. Only the highest due number is a candidate (catch-up rule), never more than 3 per `approvalId + stage`. The Admin escalation is due when `now − stageStart ≥ 7 days` and is sent once per `approvalId + stage + Admin address`; it has no upper time bound.
- [ ] Reminder recipients, for each unsigned owner at the current stage, are:
  - users with `isApproved === true`, a valid email and `role` ≠ Admin;
  - a normalised `owner` code equal to one of the unsigned owners;
  - a role that holds `approvePlanning` (Planning stage) or `approveOM` (OM stage).
  - Role permissions are resolved at run time from the `rolePermissions/{role}` documents (`permissions` map) merged over built-in defaults copied into `functions/` with a comment pointing at `src/constants.ts`, overlaying only recognised boolean permissions (mirroring `mergeWithDefaults`). The defaults are Planning and Design for Planning, and Management for OM. An unreadable or malformed permissions document falls back to the defaults for that role, and the fallback is logged.
  - Emails are lower-cased, de-duplicated and sorted.
  - This is deliberately stricter than the in-app queue (`canSignAsOwner`), which also lets a user with no Owner sign. The existing email rule requires an explicit Owner match and is kept.
- [ ] Admin handling:
  - Admins are not reminded as signers while any non-Admin recipient exists for the request.
  - If there is none, reminders go to approved Admin users with a valid email who hold the stage permission (fallback).
  - Escalation (due at 7 days) goes to all approved Admin users with a valid email, de-duplicated, minus any Admin address that **actually received** a reminder for the same `approvalId + stage`, as defined by "Escalation exclusion".
  - A failed, busy, exhausted or cap-deferred reminder does not count as received. That Admin therefore **remains eligible** for the escalation. Eligibility is not a promise of same-run delivery: the escalation is sent in the same run only if budget remains, and otherwise in a later run (it stays due, with no upper time bound), and never twice.
- [ ] **Escalation exclusion (no collection query).** After the reminder phase, for each escalation candidate that survives the pre-filter, the function checks, in order: the in-memory set of reminders actually sent (or, in dry-run, would be sent) earlier in this run, then the deterministic reminder receipt documents for reminder numbers 1 to 3 of the same `approvalId` and stage, read directly by id in `getAll` chunks of 100 (at most 3 gets per Admin address per approval stage per run). The Admin is excluded only if any receipt has `status === 'sent'`. Excluded Admins are counted as `escalationExcluded` and consume no budget.
  - The 3 exclusion ids per surviving escalation candidate are read in addition to the 5000 candidate-id ceiling, so the total is bounded at 5000 + 3 × (surviving escalation candidates).
- [ ] Idempotency and race safety (best-effort dedupe):
  - The delivery id is `sha256(JSON([ 'approval-stage-reminder', projectId, approvalId, stage, 'reminder' | 'escalation', reminderNumber (0 for escalation), email ]))`. It contains no run id or timestamp and cannot be reversed to the address.
  - The send path uses the `approvalEmailDeliveries` transaction claim from `deliveryClaims.js`. `sent` skips, an unexpired `sending` lease skips (the scheduler does not throw), `maxAttempts` 3 returns `exhausted`.
  - The `messageId` is deterministic from the delivery id.
  - **New reminder and escalation receipts store only** `projectId`, `approvalId`, `stage`, `kind` (`stage-reminder` | `stage-escalation`), `reminderNumber`, `status`, `attempts`, `leaseUntil`, the sanitized error category (`lastErrorCategory`, only on failure), and timestamps. They store **no recipient email and no hash or other derivative of it**. All lookups use the deterministic receipt id. The existing trigger's receipts and behaviour are unchanged.
- [ ] **Receipt pre-filter and per-run budget.** The send-attempt cap counts only actual send attempts (live) or would-send entries (dry-run). It is applied only after receipts have been read and handled items removed:
  1. Candidate receipt ids are built for every reminder item (per recipient), then every escalation item (per Admin), in the deterministic order (oldest stage start, then project id, then email; reminders before escalations).
  2. Up to the ceiling of 5000 candidate ids are read in `db.getAll` chunks of 100, before any claim and before the cap is applied (live and dry-run alike).
  3. Items whose receipt is `sent` (`alreadySent`) or `exhausted` (status not `sent` and `attempts >= 3`) are dropped. Items with a live `sending` lease are skipped as `busy`. None of these consumes budget or a claim.
  4. Only the remaining candidates (never attempted, `failed` with attempts below 3, or lease-expired) are walked, in the same deterministic order, until the send-attempt budget is spent. An item that loses a claim race (`sent`/`busy`/`exhausted` from the transaction) also consumes nothing.
  5. Remaining unwalked candidates are counted `deferredByCap`.
  - Because already-handled receipts are removed before the cap, a prefix of any length (including more than 1000) of already-sent receipts cannot starve later unsent recipients.
  - There is no separate walk bound.
- [ ] **Candidate ceiling (limitation).** If more than 5000 candidate receipt ids exist in a run, only the first 5000 in deterministic order are examined, `candidateTruncated: true` (and the aggregate `truncated: true`) is set in the summary, and a prominent `logger.warn` starting `REMINDER CANDIDATES TRUNCATED` is logged. This limitation is documented in the setup doc: candidates beyond the first 5000 are not examined until earlier receipts leave the candidate set.
- [ ] **Eligibility recheck with recipient recalculation.** In live mode, right before the first claim of a project in the walk, the function reads that project once more (a single `getAll` with the same `fieldMask`) and reruns the same pure derivation. Recipients are **recalculated** from the fresh project (unsigned owners, stage) together with the users and role-permission data read at the start of the run (the users collection is not re-read per project, to keep reads bounded):
  - If the project no longer qualifies, or its `approvalId`, stage, or due item (kind and reminder number) differs from the planned one, all its remaining items are skipped and counted `staleSkipped`.
  - If the approval id, stage and number are unchanged but the unsigned-owner set changed, recipients that are no longer eligible are skipped (each counted `staleSkipped`), and recipients that have become eligible are included. Newly eligible recipients get their own receipt peek (a single get) and are processed immediately after that project's planned items, sorted by email, each consuming budget only if actually sent.
  - The recheck result is reused for that project's other items in the same run.
  - A project with no items left after the pre-filter triggers no recheck read.
  - Residual window: a change after the recheck, or in the users data read at run start, can still lead to an email in that run (bounded by the run deadline and SMTP timeouts). This is documented in the setup doc. Dry-run skips the recheck.
- [ ] Reminders stop automatically, because eligibility is re-derived from live data each run: on stage advance (new stage means new ids and a new clock), rejection, completion, rewind to Draft, and a rewind that leaves a state that no longer qualifies. Nothing is cached between runs.
- [ ] Privacy: reminder and escalation subjects, hidden preview text, body, HTML, logs and new receipts contain none of the following: `rejectionReason`, sign-off `comment`, `signatureDataUrl`, `signedBy`, signer emails, `requestedByEmail`, `designNotes`, contractor contact or phone, attachments, raw mailer error text, or any recipient address. The only place a recipient address appears is the `To` header of the send itself.
  - The subject and preview contain only the reminder label, project name and document number.
  - The body may show stage, document number, project, route code, Operators still unsigned, days waiting, `n จาก 3` and the project link.
  - Logs use counts, project ids, approval ids and numeric references only. They contain no addresses and no email-derived values (no delivery ids or hashes).
- [ ] **Error handling and categories.** Send errors map to one of `smtp-auth`, `smtp-recipient`, `smtp-rate-limit`, `network`, `timeout`, `unknown` (from `error.code` and `error.responseCode`, never from message text). A post-accept receipt-write failure is `receipt-write`. Only the category and attempt count are stored in receipts and logs.
- [ ] **Ambiguous outcome.** After `sendMail` succeeds, the `sent` receipt write is attempted up to 3 times in total. If every attempt fails, the item is counted as `ambiguous` (not `sent`), logged with category `receipt-write`, the receipt stays `sending` until its lease expires, and it counts toward the consecutive-failure abort. A later run may reclaim it after the lease expires (attempts capped at 3), so a duplicate copy is possible in this case. This residual is documented.
- [ ] Abort and time bounds: after 3 consecutive failed or ambiguous items the run stops without throwing and the remaining items are counted `deferredByAbort`. No new send starts after the 480 s run deadline (measured with the injected clock); the remaining items are counted `deferredByTime`. The new transport uses `connectionTimeout` 10 s, `greetingTimeout` 10 s and `socketTimeout` 30 s, so a single send cannot hang the sequential walk.
- [ ] Mode resolution implements the Activation section and `resolveReminderMode(paramValue, documentState)`:
  - `off`: the run exits before any project or user is read and logs one line.
  - `dry-run`: full evaluation and receipt reads, with no claims, no receipt writes, no SMTP, no secret needed. It logs one structured entry per would-send (projectId, approvalId, stage, kind, reminderNumber, recipient count, no addresses) and the summary. It applies the same pre-filter and budget.
  - `live`: validates sender, app URL and secret (same checks as the existing trigger) before the first send, then sends.
  - Switching to `live` sends only what is currently due; nothing missed while off is replayed beyond the catch-up rule.
- [ ] Bounded scan:
  - Query `where('designApproval.status', '==', 'Pending Approval')`, `orderBy('__name__')`, `limit(100)` per page with `startAfter(lastDoc)`, at most 20 pages (2000 projects), using `select(...PROJECT_SELECT_FIELDS)`.
  - `PROJECT_SELECT_FIELDS` lists: `name`, `routeCode`, `status`, `owner`, `owners`, `designApproval.id`, `designApproval.status`, `designApproval.documentNumber`, `designApproval.approvalStage`, `designApproval.requestedAt`, and for each of ITEL, SYMC, UIH at each level (`planningSignOffs`, `omSignOffs`) the leaf paths `status` and `signedAt`. It never includes `signatureDataUrl`, `comment`, `signedBy`, `signedByEmail`, `designNotes`, `rejectionReason` or contractor fields.
  - The 2000-project ceiling is an operational limitation: if more than 2000 pending projects exist, projects later in document-id order are never scanned. Truncation sets `scanTruncated: true` (and `truncated: true`) in the summary and logs a prominent `logger.warn` starting `REMINDER SCAN TRUNCATED`. The setup doc states this limitation.
  - Users and `rolePermissions` are read once per run, and only if at least one item is due.
  - Sends are sequential on one transport.
- [ ] The run summary log carries counts only: mode, projectsScanned, scanTruncated, candidateTruncated, truncated, candidates, skipped by reason (including `stage-start-unavailable`), staleSkipped, dueItems, alreadySent, busy, exhausted, escalationExcluded, sent, wouldSend, failed, ambiguous, deferredByCap, deferredByAbort, deferredByTime.
- [ ] No change under `src/`, `firestore.rules`, `storage.rules`, or any project field. The existing `sendApprovalNotifications` behaviour (including `retry: true` and its receipts) and the five existing email templates are unchanged.
- [ ] `npm run verify` passes.

### Acceptance scenarios

Test fakes. The fake Firestore (in a shared test helper or inline) supports `collection().where().orderBy().select().limit().startAfter().get()`, `doc().get()/set()`, `getAll(...refs, { fieldMask })` and `runTransaction`. It applies field projections to returned data and records every query (filters, order, limit, select list, cursor), every `getAll` call (id count) and every read. `runTransaction` models optimistic concurrency: it records the version of each document read, validates versions at commit, and on conflict retries the callback up to 5 times (like the real SDK); it also yields to the event loop between the read and the commit so that concurrent transactions genuinely interleave, and it exposes a conflict-retry counter. A flag disables the conflict model (negative control). Time is an injected clock; the mailer is a fake `send` with failure injection per call. Receipt ids in tests are computed with the exported delivery-id function.

Thresholds and spacing
1. S1 Planning request waiting 2d23h: nothing is due.
2. S2 Exactly 3d: reminder 1 is due. 3d + 1ms: also reminder 1.
3. S3 Reminder 1 already sent, 5d: nothing. 6d: reminder 2 is due, same recipients, new delivery id.
4. S4 At 9d: reminder 3 is due. After reminder 3 was delivered, runs at 12d, 30d and 90d send nothing more (max 3); the only possible further send is the Admin escalation. A request first observed at day 30 with no receipts still sends reminder 3 (catch-up rule), once.
5. S5 Catch-up: no receipts, first seen at 10d. Only reminder 3 is sent, not 1, 2 and 3. The escalation is also due (7d passed) and is sent in the escalation phase.
6. S6 A stage start in the future (clock skew), or `now` equal to the start: not due, and a future start is skipped as `stage-start-unavailable`.

Stage derivation and stop conditions
7. S7 Planning stage with one of two owners approved: the unsigned owner is the only target; the approved owner's users get nothing.
8. S8 OM stage: the stage start is the latest `signedAt` of the approved Planning sign-offs, not `requestedAt`. An OM request requested 20 days ago whose Planning completed 1 day ago is not due.
9. S9 OM stage-start validity: with two participating owners, one Approved Planning sign-off has a valid `signedAt` and the other has a missing, unparseable or future `signedAt` → skipped with `stage-start-unavailable`, even though the other timestamp alone would be old enough. Not defaulted to `requestedAt`.
10. S10 Stage advance: Planning reminders were sent, then Planning completes. The next run treats it as OM with a new clock, and Planning reminder ids are never reused.
11. S11 Rejection (`status` or `approvalStage` Rejected, or any sign-off Rejected), Completed/Approved, Draft, and no `designApproval`: no reminder, even if old receipts exist.
12. S12 Rewind OM→Planning (planning sign-offs reset to Pending): evaluated as Planning using `requestedAt`; the Planning delivery ids for numbers already sent are not resent. This documents the known rewind-clock limitation (a long-waiting rewound request can get its first Planning reminder at the next run). Rewind to Draft: nothing.
13. S13 Sign-offs already satisfy the stage (all owners Approved at OM while `approvalStage` is stale): nothing.
14. S14 Resubmission: a new approval id gets a fresh clock and fresh ids; the old approval's receipts are irrelevant.

Recipients and permissions
15. S15 Planning stage: approved Planning and Design users whose Owner matches an unsigned owner are included. Management users, Viewers, Sub-contract users, unapproved users, users with an invalid or missing email, users with Owner `None` or missing, and users of a non-unsigned owner are excluded.
16. S16 OM stage: only Management users matching an unsigned owner.
17. S17 Role permission override: `rolePermissions/Viewer` grants `approveOM`, so a Viewer with the matching Owner receives the OM reminder. Removing `approvePlanning` from Design removes Design from Planning reminders. A malformed permissions doc falls back to the defaults and logs it. A test pins the approvePlanning/approveOM defaults against `src/constants.ts` text so drift is caught.
18. S18 Case and whitespace in emails and owner codes (`a@X.com`, `' uih '`) are normalised; duplicates across users send once.
19. S19 Admins are not recipients when a non-Admin recipient exists. When none exists, approved Admins holding the stage permission receive the reminder instead.
20. S20 Escalation basics: due at 7d (not at 6d23h). It goes to all eligible Admins once, does not count toward the 3-reminder cap, and a second run at 8d does not send again.
21. S20a Escalation exclusion: an Admin received a fallback reminder (receipt `sent`) on day 3; before day 7 a non-Admin signer appears, so the Admin is no longer a reminder recipient (fallback eligibility changed). The day-7 escalation excludes that Admin because the day-3 receipt (read by deterministic id) is `sent`. Other Admins still receive it. The lookup performs at most 3 document gets per Admin address for that approval stage, and no collection query is issued for it.
22. S20b Escalation eligibility versus sending after non-delivery:
    - (a) A reminder for an Admin is `failed` (attempts below 3): the Admin is not excluded; the escalation is walked and, with budget available, sent in that run.
    - (b) Reminder `busy` (live lease), and (c) reminder `exhausted`: same result, the Admin is eligible and the escalation is sent when budget allows.
    - (d) Cap-deferred reminder, eligibility preserved but not guaranteed same-run delivery: two fallback Admins A and B, both reminders due, cap 1. Run 1: the reminder goes to A; B's reminder is deferred by the cap (`deferredByCap`). A is excluded from the escalation (reminder sent this run). B is eligible for the escalation but no budget remains, so it is **not** sent in run 1 (counted deferred). Before run 2 a non-Admin signer appears, so B is no longer a reminder recipient. Run 2: B's escalation is sent. Run 3: B's escalation is not sent again, and A never receives an escalation.
    - (e) Escalation-only deferral: an Admin C who is never a reminder recipient (non-Admin signers exist) has an escalation that is cap-deferred in run 1 because reminders used the budget. It is sent in run 2 when budget allows and never sent twice (run 3 resolves it as `alreadySent`).
23. S20c Same-run exclusion: with reminders processed before escalations in one run, an Admin whose fallback reminder was sent earlier in the same run does not receive the escalation in that run; an Admin whose same-run reminder failed does (when budget allows).

Idempotency and races
24. S21 Re-running at the same moment sends nothing the second time (`alreadySent`). The sender is called exactly once per recipient.
25. S22 Race safety with a transaction-modelling fake: two `runStageReminders` runs started concurrently over the same store. The fake's `runTransaction` interleaves and enforces optimistic-concurrency conflicts with retries. The test asserts each recipient's send function is called exactly once in total, the loser observes `busy` or `sent`, and the conflict-retry counter is greater than zero (proving the interleaving actually happened). A negative control with the conflict model disabled produces at least one duplicate send, proving the test can detect a race.
26. S23 Send failure: the receipt is `failed` with `leaseUntil: 0`, `lastErrorCategory` set and no raw error text. The next run retries and marks it `sent`. After 3 claims it is `exhausted` and skipped with no thrown error.
27. S24 An expired `sending` lease is reclaimed; a live lease is skipped.
28. S25 Delivery ids are stable for the same inputs, differ by approval, stage, number, kind and email, and are independent of any run id.
29. S26 Three consecutive failures abort the run without throwing; remaining items are counted as `deferredByAbort` and not attempted.
30. S26a Ambiguous outcome by failure injection: `send` resolves but the `sent` receipt write fails (a) once (retry succeeds → counted `sent`), (b) every time (counted `ambiguous`, category `receipt-write`, receipt left `sending`, counts toward the abort rule). A later run after the lease expires reclaims the receipt (attempts incremented, capped at 3). The test documents that a duplicate is possible here and no log says "exactly once".
31. S26b Recheck, project changed: the fake mutates a project between the scan and the recheck so that it is rejected, advanced, rewound or re-requested (different approval id, stage or due number). Nothing is sent for that project, `staleSkipped` increments, no receipt is claimed, and other projects are unaffected. A project whose items were all dropped by the pre-filter triggers no recheck read.
32. S26c Recheck, recipients recalculated with the same approval id, stage and reminder number:
    - (a) Two owners ITEL and UIH are unsigned at scan; before the recheck ITEL approves. ITEL's Planning recipients are skipped and counted `staleSkipped`; UIH's recipients are sent.
    - (b) Only ITEL is unsigned at scan (UIH approved); before the recheck UIH's approved Planning sign-off is rewound to Pending while the stage stays Planning. UIH's Planning recipients, newly eligible, are included (own receipt peek, sent, consuming budget) and ITEL's are still sent.
    - In both cases the approval id, stage and reminder number never change.
33. S26d Run deadline and transport timeouts: with an injected clock advancing past 480 s, no new send is started and the remaining items are counted `deferredByTime`; the run does not throw. The nodemailer options returned by `reminderTransportOptions` contain `connectionTimeout: 10000`, `greetingTimeout: 10000`, `socketTimeout: 30000` and `service: 'gmail'`.

Modes and bounds
34. S27 Mode matrix for `resolveReminderMode` and the scheduled handler: param ∈ {`off`, `dry-run`, `live`, invalid} × document ∈ {missing, `off`, `dry-run`, `live`, invalid, unreadable}, 24 cases, table-driven. Expected result: invalid param → `off`; invalid or unreadable document → `off`; missing document → the param; otherwise the more restrictive of the two. Explicit cases include param `dry-run` + document `live` → `dry-run`, param `live` + document `off` → `off`, param `live` + document missing → `live`, param `off` + document `live` → `off`. For `off`, the test asserts no project, user or receipt reads and a single log line. Param default (unset) resolves as `dry-run`.
35. S28 Mode `dry-run`: no claims, receipt writes or sends; would-send log entries and summary with `wouldSend`; the pre-filter and budget apply; already-sent receipts are dropped as `alreadySent` without consuming budget; no addresses in logs.
36. S29 Budget: with a cap N and M > N due unsent recipients, exactly N sends happen in one run, in the deterministic order (oldest stage start, then project id, then email), the rest counted as `deferredByCap`.
37. S29a Multi-run non-starvation, exact fixture. 12 recipient receipts across one or more projects, all Planning-stage reminder items of the same reminder number, escalation not due. In the deterministic order they are positions 1–12 with initial states: 1 sent, 2 never attempted (A), 3 busy with a live lease (lease expires at t0 + 10 minutes), 4 sent, 5 never attempted (B), 6 exhausted (`failed`, attempts 3), 7 never attempted (C), 8 sent, 9 never attempted (D), 10 busy with a live lease (same expiry), 11 sent, 12 never attempted (E). That is 4 sent, 2 busy, 1 exhausted and 5 never attempted. Cap N = 3, all sends succeed, the exhausted receipt is `failed` with attempts 3.
    - Run 1 (t0): sends exactly A, B, C (3 sends). The 4 sent, 2 busy and 1 exhausted consume no budget (summary `alreadySent` 4, `busy` 2, `exhausted` 1). D and E are left: `deferredByCap` = 2.
    - Run 2 (t0 + 15 minutes; both leases have expired): the candidates are D, E and the two lease-expired receipts (positions 3 and 10), 4 candidates, cap 3, so exactly 3 are sent in order: position 3, D, position 10. E is left: `deferredByCap` = 1. The exhausted receipt remains dropped.
    - Run 3: exactly 1 send (E). `deferredByCap` = 0.
    - Assertions: per-run send counts are 3, 3, 1; per-run `deferredByCap` values are 2, 1, 0; total sends 7; the 4 originally sent receipts are never resent; the exhausted receipt is never sent in any run and its attempts stay 3; no receipt is ever sent twice; no new receipt contains an email field.
38. S29b Large prefix beyond 1000: more than 1000 candidates (for example 1200 recipients across about 120 projects) where the first 1100 in deterministic order already have `sent` receipts, cap 5. Run 1 sends exactly the 5 earliest unsent recipients (positions 1101–1105), makes no claim and no send for the 1100 sent ones, reads receipts through `getAll` chunks of at most 100 ids (at least 12 calls), and counts `alreadySent` 1100 and `deferredByCap` 95. Later runs reach the remaining unsent ones with no duplicates, so the later unsent recipients are never starved by the sent prefix.
39. S29c Candidate ceiling: with more than 5000 candidate receipt ids (for example 5200), only the first 5000 are read (checked via the recorded `getAll` calls), `candidateTruncated` and `truncated` are true in the summary, a prominent warning starting `REMINDER CANDIDATES TRUNCATED` is logged, and the run does not throw.
40. S30 Paging and projection: 250 pending projects across pages. The recorded queries show `where designApproval.status == 'Pending Approval'`, `orderBy __name__`, `limit 100`, and `startAfter` the last document of the previous page (pages of 100, 100, 50, no overlap or gap), and all 250 are evaluated. The select list equals `PROJECT_SELECT_FIELDS` and does not contain `signatureDataUrl`, `comment`, `signedBy`, `designNotes` or `rejectionReason`. Because the fake applies the projection, the derivation is proved to work from projected data only, and sentinel values planted in unselected fields never reach any output. With more than 2000 pending projects, `scanTruncated` and `truncated` are true, scanning stops after 20 pages, and the prominent warning is logged. The recheck read uses the same field mask.
41. S31 `maxEmails` of 0 sends nothing and does not error; values above 100 clamp to 100.

Content and privacy
42. S32 Reminder email: Thai subject and body, `n จาก 3` for reminders, a distinct escalation heading, a project deep link, an HTML-escaped project name, and a plain-text part.
43. S33 Privacy with planted sentinels: sentinel strings are planted in `rejectionReason`, comments, `signatureDataUrl`, `signedBy`, `signedByEmail`, `designNotes`, `requestedByEmail` and contractor contact, and sentinel recipient addresses are planted in the users list and inside raw mailer error messages. None of them appears in any new receipt (the stored documents are scanned in full, including that there is no `email` field), any log entry, the subject, the preview, the text or the HTML. The only place a recipient address appears is the `To` header passed to `send`. A raw mailer error containing an address and a hostname reaches logs and receipts only as its category. Logs contain no `@`. The existing trigger's receipts are untouched (a test confirms its claim details still include `email`).
44. S33a Error categories: representative `code`/`responseCode` values map to `smtp-auth`, `smtp-recipient`, `smtp-rate-limit`, `network`, `timeout`, `unknown`.
45. S34 Regression of the existing templates (byte equality): before any source change, golden outputs (subject, text, html) are captured from the current code, by running the unmodified `functions/approvalNotifications.js` (`git show HEAD:functions/approvalNotifications.js` if captured later), for all five existing kinds: `planning-requested`, `management-requested`, `approval-completed`, `final-documents` (with an attachment note), and `approval-rejected` (with a rejection reason). The fixtures use fixed inputs and are stored in a committed JSON fixture. `functions/approvalNotifications.golden.test.js` asserts strict string equality for each field after the refactor. The existing `approvalNotifications.test.js`, `userAccounts.test.js` and the other existing suites pass unchanged.

Registration and refactor
46. S35 Claim refactor: the extracted claim function behaves like the old one for the existing trigger. `sent` returns `sent`, a live lease returns `busy`, otherwise it sets `sending`, increments `attempts` and sets a 10-minute lease; the trigger still throws on `busy`. `maxAttempts` returns `exhausted` only when supplied. Clock and timestamp injection work. A source-level check asserts that `sendApprovalNotifications` still has `retry: true`.
47. S36 Registration: `functions/approvalReminderRegistration.test.js` asserts the exported `STAGE_REMINDER_OPTIONS` (region `asia-southeast1`, schedule `0 9 * * *`, `timeZone: 'Asia/Bangkok'`, `retryCount: 0`, `maxInstances: 1`, `timeoutSeconds: 540`, `memory: '512MiB'`) and the transport options from `reminderTransportOptions` (S26d values). It also loads `functions/index.js` and asserts that `Object.keys(exports)` still contains `manageProjectFile`, `getProjectCreatedDates`, `createManagedUser`, `deleteManagedUser`, `cleanupProjectFiles`, `sendApprovalNotifications` and now `sendApprovalStageReminders`. Through the function's `__endpoint` (set by the installed firebase-functions 6.x scheduler provider), it asserts the schedule trigger (`schedule`, `timeZone`, `retryConfig.retryCount` 0), region, `maxInstances`, timeout, memory, and that the secret `fiberinfrasharing` is bound. It also asserts the existing trigger endpoint keeps its region and retry flag.

### Proposed design

**Data flow (per run)**
1. Read the param and the `approvalReminderSettings/current` document and resolve the effective mode. `off` exits (one log line, nothing else read).
2. Page through pending-approval projects with the field projection (≤100 per page, ≤20 pages).
3. For each project, derive owners → stage → unsigned owners → stage start → due item. Pure functions, no I/O. Skips are counted by reason.
4. If anything is due, read `users` and `rolePermissions` once and resolve recipients per item.
5. Build the ordered candidate lists: reminder items (per recipient) first, then escalation items (per Admin); within each, oldest stage start, then project id, then email.
6. Pre-filter: read the deterministic receipt documents for the first 5000 candidate ids with `db.getAll` in chunks of 100. Drop `sent` (alreadySent) and `exhausted`, skip live-lease `busy`. Nothing here consumes budget.
7. Reminder phase: walk the surviving reminder items in order until the send-attempt budget is spent, the run deadline passes, or the run aborts. For each item:
   - live only: on the first item of a project, recheck the project once, recalculate recipients, and apply the stale/new-recipient rules;
   - live: claim by transaction (losing a race resolves to `sent`/`busy`/`exhausted` and consumes nothing), send, write the `sent` receipt (up to 3 tries); on failure write `failed` with the sanitized category;
   - dry-run: log the would-send and consume one budget unit.
8. Escalation phase: for the surviving escalation items, apply the exclusion (in-run set, then direct gets of reminder receipts 1–3 in chunks of 100), then walk the rest with the remaining budget as in step 7.
9. Log the summary (counts only).

**Why derive instead of store the stage start.** Sign-offs already carry `signedAt` and the approval carries `requestedAt`. That gives Planning its start and OM its start, so no new stored field is needed. The same derivation covers resubmission (new approval id and `requestedAt`), advance, and rewind from Completed to OM.

**Known limitation (rewind to Planning), kept.** `DesignApprovalModal` resets sign-offs to Pending on rewind to Planning and keeps `requestedAt`, so the new Planning clock still starts at the original request time. A request rewound after a long time can therefore receive its first Planning reminder at the next run. Delivery ids for numbers already sent in that approval's earlier Planning stage are not resent, which also holds the cap. Fixing this needs a stored `stageStartedAt`, which means a frontend write and a rules allow-list change, so it is deliberately not done here.

**Why no rules or schema change.** The function reads and writes with the Admin SDK, which bypasses rules. Receipts reuse `approvalEmailDeliveries`, and the new `approvalReminderSettings` document is covered by the default deny (no catch-all match exists in `firestore.rules`). Reading `rolePermissions` and `users` needs no rules change. No new field is written to projects.

**Recipient rules.** They follow `notificationRecipients` (approved, valid email, explicit Owner match, lower-cased, de-duplicated, sorted), but the role set comes from stage permissions rather than hardcoded roles. For the default permissions this gives the same audience as the existing transition emails: Design + Planning for Planning, Management for OM.

**Email.** Reuse the existing layout (`emailContent`), with Thai copy:
- Reminder subject: `[Fiber Sharing] เตือน: เอกสารรออนุมัติขั้น Planning ค้างอยู่ 3 วัน: <project> (<docNo>)`. The Management stage reads `ขั้น Management (O&M)`. Subjects use the whole-day count.
- Reminder body: the stage, `เตือนครั้งที่ n จาก 3`, days waiting, Operators that have not signed, a button `ตรวจสอบและอนุมัติเอกสาร`, and the standard footer. Intro: `เอกสารขออนุมัติการออกแบบโครงการนี้รอการลงนามของคุณมาแล้ว N วัน กรุณาตรวจสอบและลงนามเพื่อให้โครงการดำเนินต่อได้`.
- Escalation subject: `[Fiber Sharing] เอกสารรออนุมัติค้างเกิน 7 วัน: <project> (<docNo>)`. Intro: `เอกสารขออนุมัติรายการนี้ค้างอยู่ในขั้น <stage> เกิน 7 วัน ยังไม่ลงนาม: <operators>`, with a link.
- The preview text is `project · docNo` only. No sign-off table with names or dates, no requester email, no reason.

**Error handling.** The run never throws for per-item problems (logged and counted). Configuration errors in `live` (sender, URL or secret) throw once before any send. `retryCount: 0` plus deterministic ids means a scheduler retry cannot cause a burst. A claim race or overlapping run resolves through the transaction.

**Security.** Logs and new receipts hold no addresses, no address-derived values and no raw provider text. The Gmail secret is bound only to the new function. The params carry no secrets. Escalation and fallback addresses come from the same approved-user list. The brake document is writable only through the Firebase console or Admin SDK.

### Expected files

- `functions/approvalReminderConfig.js` (new)
- `functions/approvalReminders.js` (new)
- `functions/deliveryClaims.js` (new, extracted `claimDelivery` with optional `maxAttempts`)
- `functions/index.js` (export `sendApprovalStageReminders`, use the shared claim module, add the `APPROVAL_REMINDER_MODE` and `APPROVAL_REMINDER_MAX_EMAILS` params; no change to the existing trigger's options, transport, receipts or failure write)
- `functions/approvalNotifications.js` (additive: reminder/escalation copy kinds or exported helpers)
- `functions/approvalReminders.test.js`, `functions/deliveryClaims.test.js`, `functions/approvalReminderRegistration.test.js`, `functions/approvalNotifications.golden.test.js` (new)
- `functions/fixtures/approvalEmailGolden.json` (new, captured from unmodified code before the refactor)
- `APPROVAL_EMAIL_SETUP.md` (new section: reminders, defaults, Activation sequence, ceiling/brake, 2000-project and 5000-receipt limitations, best-effort dedupe caveats including the ambiguous outcome and the reminder/escalation id difference, residual recheck window, deploy command)
- `docs/specs/approval-stuck-reminders.md`

Implementation order requirement: capture the golden fixture first (before touching `approvalNotifications.js`), and record in `.context/implementation.md` which source revision produced it.

### Risks and rollback

- **Email volume and Gmail limits.** Mitigated by the per-run attempt budget (40), the daily schedule, the 3-reminder cap, the 3-claims-per-receipt cap, the abort after 3 consecutive failures, the 480 s run deadline with finite SMTP timeouts, and a first deploy that is dry-run only.
- **Duplicate delivery.** Mitigated by deterministic receipt ids, transaction claims with leases, `maxInstances: 1`, `retryCount: 0`, and the recheck. It remains best-effort: the ambiguous SMTP-accepted/receipt-write-failed case can produce a second copy after the lease expires; and reminder and escalation receipts have different ids, so a concurrent run can send an escalation while another run's reminder for that Admin is still busy (accepted, bounded by `maxInstances: 1`). The existing function carries the same SMTP caveat.
- **Stale send within a run.** The recheck narrows the window, but a change after the recheck, or in the users data read at run start, can still produce one email. Documented.
- **Scan and candidate ceilings.** Projects beyond the first 2000 pending ones (by document id) are never scanned, and candidates beyond the first 5000 receipt ids in deterministic order are not examined. Both set a summary field and a prominent warning. Fixing them would need a different paging or cursor strategy and is not in scope.
- **Wrong audience.** Reminders go only to approved users with an explicit matching Owner and a stage permission. The built-in permission defaults duplicate `src/constants.ts`; a comment and the S17 drift test cover it.
- **Stale clock after rewind to Planning** (above), accepted.
- **Legacy data.** Approvals with missing or invalid timestamps are skipped and logged rather than guessed. Projects whose owners are only derivable from routes are not reminded.
- **Rollback.** First, write `{ mode: 'off' }` to `approvalReminderSettings/current` (instant, no deploy). Second, redeploy with `APPROVAL_REMINDER_MODE=off` or `dry-run`. Third, delete the function (`firebase functions:delete sendApprovalStageReminders`, which needs authorization). Receipts are inert. The shared `claimDelivery` extraction is covered by S35, and reverting the commit restores the previous inline version. Nothing else (frontend, rules, project data) changes.

### Verification

- Focused tests: `npm --prefix functions test` (the new test files plus the existing suites, unchanged).
- Confirm by `git diff --stat` that nothing under `src/`, `firestore.rules` or `storage.rules` changed, and that the golden fixture was generated from the pre-change template code.
- Full gate: `npm run verify`

### Deployment

- Target: NONE. Nothing is deployed in this flow.
- Surface: Firebase functions only. The new scheduled function `sendApprovalStageReminders`; `functions/index.js` is also the source for the existing functions. No Cloudflare frontend deploy.
- Required authorization: explicit human authorization that names the target, for example "deploy Firebase functions to production (`gen-lang-client-0942355314`)". A review approval is not deployment authorization. The go-live sequence, if later authorized, is the Activation sequence above:
  1. Deploy with `firebase deploy --only functions:sendApprovalStageReminders --project gen-lang-client-0942355314`, leaving `APPROVAL_REMINDER_MODE` at `dry-run`.
  2. Read at least one scheduled run's dry-run logs.
  3. With a separate owner go-ahead, redeploy with `APPROVAL_REMINDER_MODE=live` (the brake document must be absent or `live`).
  4. To stop instantly without a deploy, write `{ mode: 'off' }` or `'dry-run'` to `approvalReminderSettings/current`.
  The document alone can never turn `live` on.

### Open questions for the owner (defaults apply if unanswered)

1. Is it acceptable that a rewind to Planning does not restart the Planning clock (needs a stored `stageStartedAt`, a frontend and rules change in a separate flow)? Default: yes.
2. Should Admin fallback and escalation use the "per whole request" rule (default), or per unsigned owner with no eligible non-Admin signer?
3. Is a daily 09:00 Bangkok run right, or should it run hourly during working hours? Default: daily.

Status: APPROVED

## Independent review

### Diff reviewed

- Base: `72446be` (HEAD, "Add a waiting-for-my-signature queue to the projects dashboard")
- Head: uncommitted working tree on top of HEAD. Modified: `APPROVAL_EMAIL_SETUP.md`, `functions/approvalNotifications.js`, `functions/index.js`. Untracked: `docs/specs/approval-stuck-reminders.md`, `functions/approvalReminderConfig.js`, `functions/approvalReminders.js`, `functions/deliveryClaims.js`, `functions/approvalReminders.test.js`, `functions/approvalReminderRegistration.test.js`, `functions/deliveryClaims.test.js`, `functions/approvalNotifications.golden.test.js`, `functions/fixtures/reminderStore.js`, `functions/fixtures/approvalEmailGolden.json`.
- Verification evidence checked: `npm run verify` passed on the current tree (exit 0, as the stage contract states). I read the full source of the new modules, the `index.js` and `approvalNotifications.js` diffs, the test fake, the registration and mode-matrix tests, and the race, ambiguity, abort, deadline and cap-progression tests. Nothing under `src/`, `firestore.rules` or `storage.rules` changed. I cross-checked the `rolePermissions/{role}.permissions` layout against `src/services/rolePermissionsService.ts`, and the approvePlanning/approveOM defaults against `src/constants.ts`.

### Findings

- MEDIUM: `functions/approvalReminders.js:283`. If a claim succeeds but the run deadline has passed by the time the claim transaction returns, the item is counted `deferredByTime` and the function returns. The receipt is left `status: 'sending'` with a live 10-minute lease and `attempts` already incremented, even though no SMTP attempt was made. The next run reclaims it once the lease expires, so nothing is lost or duplicated. But each such deadline-straddling claim uses up one of the 3 allowed attempts, so a recipient could in theory become `exhausted` without ever being sent to. It is rare: it needs a slow transaction exactly at the 480 s boundary, three times. Suggested follow-up: release the claim, either by writing `leaseUntil: 0` with a non-sent status or by not counting the attempt. Not blocking.
- LOW: `functions/approvalReminders.js:149-150`. If a project page query fails, the scan stops (`break`) and logs `Reminder project scan failed`, but the summary keeps `scanTruncated`/`truncated` false. So a partial scan looks like a complete one in the summary line. Consider a `scanFailed` flag or counter, or setting `truncated`.
- LOW: `functions/approvalReminders.js:35-37`. An approval with no `id` or no `documentNumber` is counted under skip reason `not-pending`. This matches the existing trigger, which also requires both (`approvalNotifications.js:57`). A separate reason such as `incomplete-approval` would make the operational logs clearer.
- LOW: `functions/approvalReminders.js:159`. `summary.dueItems` counts due projects, not due items (recipients). The field name could mislead an operator reading the summary. Rename it, or document it in `APPROVAL_EMAIL_SETUP.md`.
- LOW: `functions/deliveryClaims.js:13-14`. When `maxAttempts` is supplied, a receipt with a live `sending` lease and `attempts >= maxAttempts` returns `exhausted` instead of `busy`. Only the new reminder path is affected (the existing trigger never passes `maxAttempts`). The outcome is the same either way (no send, no budget used), so this only changes which counter goes up.

### Acceptance-criteria result

- [x] Every criterion checked against the implementation.
  - **Registration and options:** `sendApprovalStageReminders` is registered through `onSchedule` with `STAGE_REMINDER_OPTIONS` and the `fiberinfrasharing` secret. All earlier exports are kept. S36 asserts the installed `__endpoint` and that the existing trigger keeps `retry: true` and its region.
  - **Eligibility and stage derivation:** match the plan (`deriveStageReminder`, lines 33-59).
    - Explicit owners only, limited to those with Planning entries.
    - A Rejected sign-off at either level means no send.
    - The OM start requires a valid, non-future `signedAt` for every participating owner.
    - There is no fallback to `requestedAt` for OM.
    - The 3/6/9 cadence follows the catch-up rule with a cap of 3. Escalation is due at ≥7d with no upper bound.
  - **Recipients:** approved users, valid email, explicit Owner match, the stage permission resolved from `rolePermissions` over the built-in defaults, Admin excluded.
    - Admin fallback applies only when the whole request has no non-Admin signer. Escalation goes to all approved Admins.
    - A malformed or unreadable permissions document falls back to the defaults and is logged with a numeric reference.
  - **Escalation exclusion:** checks the in-run set first, then direct `getAll` reads of reminder receipts 1–3, and excludes only on `sent`. A failed exclusion read is skipped safely.
  - **Delivery ids:** match the plan's tuple exactly (S25 pins the hash). New receipts store only `projectId`, `approvalId`, `stage`, `kind`, `reminderNumber`, status, attempts, lease, `lastErrorCategory` and timestamps. There is no email field.
  - **Pre-filter:** runs before the cap in chunks of 100 up to 5000 ids. `alreadySent`, `exhausted` and `busy` use no budget. Budget counts only claimed sends or would-sends. Lost claim races use nothing. S29a and S29b assert the exact progressions.
  - **Live recheck:** one `getAll` with the same field mask, cached per project.
    - A changed approval id, stage, due number or eligibility gives `staleSkipped`.
    - Recipients that are no longer eligible are skipped, and newly eligible ones are peeked and processed after the planned items.
    - The escalation-initiated recheck path is covered too. Dry-run skips the recheck.
  - **Error handling:** the error mapping uses only `code`/`responseCode`.
    - The `sent` write is retried 3 times. After that the item is counted `ambiguous` and the receipt is left `sending`.
    - 3 consecutive failures stop the walk (`deferredByAbort`). The 480 s deadline is checked before and after the claim.
    - The transport has finite SMTP timeouts.
  - **Mode resolution:** fails closed, and the brake document can only lower the param. The 24-case matrix is exercised through the actual exported handler.
    - `off` reads only the settings document and logs one line.
    - Dry-run and off never read the secret. Live validates its configuration before any send.
    - When the env value is absent, the handler resolves to dry-run and 40 sends.
  - **Bounded scan:** equality filter, `orderBy('__name__')`, pages of 100 with `startAfter`, at most 20 pages, projection with `PROJECT_SELECT_FIELDS`, which contains no private fields. Both truncation warnings use the required prefixes.
  - **Privacy:** the reminder kinds pass through a strict field allow-list in `emailContent`, so they carry no requester, sign-off table, rejection or attachment. The preview is `project · docNo`. Logs contain counts and ids only. S33 plants sentinels.
  - **Existing behaviour:** `sendApprovalNotifications` is unchanged apart from importing the extracted claim, whose behaviour is identical when `maxAttempts` is omitted. Its transport, receipt `email` and raw `lastError` are kept. The five templates are pinned byte for byte by the golden fixture, whose provenance from `72446be` is recorded.
  - **Race test:** S22 uses a fake that models optimistic concurrency and really interleaves the two runs. It asserts that conflicts happened and that the negative control produces a duplicate.
  - **Documentation:** `APPROVAL_EMAIL_SETUP.md` and the spec document the activation and brake, the 2000-project and 5000-receipt ceilings, the best-effort dedupe caveats (the ambiguous outcome and the different reminder/escalation ids), the residual recheck window and the authorized deploy command. No new text claims "exactly once".
  - **Deployment:** none performed. Deploying still needs separate explicit authorization that names Firebase functions.

### Verdict

No BLOCKER or HIGH findings. The MEDIUM and LOW items are non-blocking follow-ups.

Verdict: APPROVED
