# backfill-approval-snapshot-lock

Archived by `agent-flow` on 2026-10-22 after an approved review.

- Branch: `vpunpum-sudo/เอกสารขออนุมัติ-เพิ่มฟังก์ชั่น-v1`
- Base commit: `ea99371`
- Verification: `npm run verify`, Started: 2026-10-22T13:04:31Z, Exit code: 0

Status: APPROVED
Feature: backfill-approval-snapshot-lock
Risk: HIGH — this changes `firestore.rules`. It adds an exception to the content whitelist on `projects/{projectId}.designApproval`, and it changes the create rules for `approvalSnapshots` metadata and child documents. It also adds a write path that changes an existing approval document, with values enforced by the server and checked against the auth token.

### Objective

Approval requests submitted before `freeze-approval-document-snapshot` (ea99371) have a `designApproval` with no `snapshotId`. They still render from live project data, and the amber banner at `src/components/DesignApprovalModal.tsx:2538` warns about this.

An Admin needs a "ล็อกเอกสารนี้" button that freezes such a request with the current project data. The request keeps its status, signatures, document number, `approvalDraft` and `finalDocuments`.

The on-screen approval modal must clearly say that the document was locked after submission. It must show only verifiable provenance:
- the time set by the server (`request.time`);
- the authenticated user, identified by uid and token email, with the display name looked up at read time.

The owner decided that the exported PDF and every generated file stay unchanged and carry no backfill notice.

The lock succeeds exactly when the attach transaction resolves. Before that point, a failure shows its real cause:
- the UI says the request changed only when a fresh server read proves it;
- a permission problem or a transient error is never reported as a state change.

After that point, nothing can turn the outcome into a failure.

### In scope

- An Admin-only "ล็อกเอกสารนี้" button inside the legacy (no `snapshotId`) banner of the approval modal. It is gated on all six data sets being loaded with no error.
- A confirm dialog, shown before any write. It says that the frozen content is the current project data, not the data at submission time, and that the notice is shown on screen only.
- Reusing the existing snapshot builder and writer (`buildApprovalSnapshot`, `writeApprovalSnapshot`) with a fresh snapshot id on every click.
- A new transaction, `backfillApprovalSnapshot`. It attaches only five keys to the same `designApproval`:
  - `snapshotId`
  - `snapshotCreatedAt`
  - `snapshotBackfilledAt` (a server Timestamp)
  - `snapshotBackfilledByUid`
  - `snapshotBackfilledByEmail`

  It aborts with no write if the request has changed.
- An explicit commit boundary. Before commit, failures go through the pure `classifyBackfillFailure`. After commit, every step (project re-read, UI state, activity log) has its own `try`/`catch` and never reports failure.
- An on-screen backfill notice inside the approval modal only. The time comes from `snapshotBackfilledAt`. The locker is shown as their display name from `users/{uid}` when readable, otherwise the verified email.
- Best-effort `logActivity` calls for a successful lock and for a pre-commit failure, using the existing `logService` as it is.
- Snapshot identity split: metadata `id` equals the path and `designApproval.snapshotId`, and `approvalId` is the real `designApproval.id`. The resolver, reader, `chooseApprovalSource` and tests are updated. Normal snapshots (path = approval id) must stay readable.
- `firestore.rules`:
  - the narrowest absent → set exception, including `snapshotBackfilledAt == request.time` and `snapshotBackfilledByEmail == request.auth.token.email`;
  - metadata create for a backfill path bound to the current, unlocked approval;
  - child create bound to the parent metadata.
- Unit tests in `src/utils/approvalSnapshot.test.ts`.
- Rules Playground rows in `.context/qa-checklist.md` (owned by Claude during build).
- `docs/specs/backfill-approval-snapshot-lock.md`, with an evidence section and a Known limitations section.

### Out of scope

- Any change to `src/services/logService.ts`. Its client ISO timestamp, its internal error swallowing and its silent return when `auth.currentUser` is null stay as they are. A trustworthy log is a separate follow-up.
- Any change to `buildPrintDocument`, `generatePrintableHtml`, print markup, `createApprovalPdf`, the exported PDF, the KMZ output, or `finalDocuments` creation or content.
- Telling a normal submission apart from a backfill inside `firestore.rules` (Known limitation 1).
- Changing `users` read or update rules, or adding a user-lookup mechanism other than a direct `getDoc(users/{uid})`.
- Cleaning up orphaned snapshot documents.
- Automatic retry. Retry stays a manual click, and only before commit.
- Classifying errors in the normal submission flow.
- Regenerating or editing existing `finalDocuments` files.
- Recovering the data as it was at submission time (impossible).
- Bulk or automatic backfill.
- The three LOW findings from the previous review:
  - metadata does not check `createdByUid == auth.uid`;
  - `planApprovalAttach` blocks legacy projects whose status is inconsistent;
  - signing writes `rejectionReason: ''`.
- The general `appUser.id` vs auth uid issue (`src/App.tsx:2783`). The only exception: backfill code uses `auth.currentUser.uid` and `auth.currentUser.email`.
- These follow-ups are addressed in [approval identity and legacy attach fixes](approval-identity-and-legacy-attach-fixes.md); they remain outside this archived backfill feature's scope.
- Deployment of any kind.

### Acceptance criteria

- [ ] The button appears only when all of these hold:
  - `appUser.role === 'Admin'`;
  - `project.designApproval` exists;
  - `project.designApproval.snapshotId` is absent;
  - the modal has not already recorded a committed lock for this approval in this session (`committedLock` state, see below).
- [ ] While any of the six sources (routes, enclosures, loops, enclosureTypes, fiberTypes, fiberColorConfigs) is loading or has an error, the button is disabled. Next to it the modal shows one of:
  - `กำลังโหลดข้อมูลโครงการ… ยังล็อกเอกสารไม่ได้`
  - `โหลด <source> ไม่สำเร็จ ล็อกเอกสารไม่ได้`

  Readiness uses the existing `sourceReadiness(...)`.
- [ ] Clicking the button opens the existing `useConfirm()` dialog before any write. The dialog states that:
  - content is frozen from current project data at the moment of locking, not the data on the submission date (`requestedAt` shown);
  - signatures, status and document number are kept;
  - the approval screen will permanently show that the document was locked afterwards, with server time and the locking account;
  - the exported PDF will not show this;
  - this cannot be undone.

  Cancel performs no write and no log.
- [ ] The action aborts before any write, with an error message, if either of these is missing:
  - `auth.currentUser`;
  - `auth.currentUser.email`.
- [ ] When the user confirms, the handler records `expected = { approvalId: project.designApproval.id }`, meaning the approval has this id and no `snapshotId`.
- [ ] On confirm, the snapshot is written through `writeApprovalSnapshot` at `projects/{projectId}/approvalSnapshots/{snapshotId}`:
  - the `snapshotId` is a new `snap_<uuid>` on every click and is never equal to `designApproval.id`;
  - metadata has `id == snapshotId`, `approvalId == designApproval.id`, `projectId`, `createdAt` (an ISO string), `createdByUid == auth.currentUser.uid` and `backfill: true`;
  - child and index wrappers have `approvalId == designApproval.id`.
- [ ] A transaction reads the project and checks that `designApproval` exists, its `id` equals `expected.approvalId`, and `snapshotId` is absent. Otherwise it throws `ApprovalStateChangedError` with no write.
- [ ] When the checks pass, the transaction updates exactly these dotted fields:

  | Field | Value written |
  |---|---|
  | `designApproval.snapshotId` | the new snapshot id |
  | `designApproval.snapshotCreatedAt` | the ISO string from the metadata |
  | `designApproval.snapshotBackfilledAt` | `serverTimestamp()` |
  | `designApproval.snapshotBackfilledByUid` | `auth.currentUser.uid` |
  | `designApproval.snapshotBackfilledByEmail` | `auth.currentUser.email` |

  No other `designApproval` key or top-level key is touched. It never deletes or changes `approvalDraft` or `status`.
- [ ] **Commit boundary.** The lock counts as successful when, and only when, `await backfillApprovalSnapshot(...)` resolves.
  - The handler sets `committed = true` on the very next line, and stores `committedLock = { approvalId, snapshotId }` in component state.
  - The pre-commit `try` wraps only the snapshot build, `writeApprovalSnapshot` and `backfillApprovalSnapshot`. The pre-commit failure handling (classification, failure messages, failure log) runs only when `committed === false`.
- [ ] **Post-commit steps.** Each step runs in its own `try`/`catch`. None of them may set a failure message, call `classifyBackfillFailure`, invite a retry, or show the lock button again.
  1. Refresh: `getDocFromServer(projects/{id})`, then `onProjectUpdated(...)`.
  2. Success log: `logActivity('backfill_approval_snapshot', …)`.
  3. Local UI state updates: clear the busy flag and show the result message.
- [ ] Post-commit result messages, shown in a success or info area, not in `actionError`:
  - refresh succeeded: `ล็อกเอกสารสำเร็จ`;
  - refresh threw, or `onProjectUpdated` threw: `ล็อกเอกสารสำเร็จแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ โปรดโหลดหน้าใหม่`. It says nothing about failure and does not suggest locking again.
  - While `committedLock.approvalId === project.designApproval?.id` and the prop still lacks `snapshotId` (stale state), the button stays hidden. A second click, which the rules would deny because `snapshotId` is already set, therefore cannot happen from the same modal session.
- [ ] Pre-commit failure handling (`writeApprovalSnapshot` or the transaction rejects). It never guesses the cause from `err.message`.
  1. `ApprovalStateChangedError` → **state-changed**.
  2. `firestoreErrorCode(err) === 'permission-denied'`:
     - re-read `projects/{projectId}` once with `getDocFromServer` (the server-only variant of `getDoc`);
     - pass `{ ok: true, project: data | null }`, or `{ ok: false }` if the read throws, to `classifyBackfillFailure`.
  3. Any other code, or none → **failed**, with no re-read.
- [ ] `classifyBackfillFailure` is pure and returns:

  | Input | Result |
  |---|---|
  | `'permission-denied'`, the re-read succeeded, and the project is missing, `designApproval` is missing, the `id` differs from expected, or `snapshotId` is present | `'state-changed'` |
  | `'permission-denied'`, the re-read succeeded, and the project still matches `expected` | `'permission-error'` |
  | `'permission-denied'`, and the re-read failed or was not provided | `'failed'` |
  | any other code, or none | `'failed'` |
- [ ] Pre-commit UI messages, shown in `actionError`:

  | Outcome | Message |
  |---|---|
  | state-changed | `คำขอเปลี่ยนไปแล้ว (อาจมีผู้ล็อกก่อน หรือคำขอถูกยื่นใหม่/ถอยกลับ) กรุณาโหลดหน้าใหม่` |
  | permission-error | `ไม่มีสิทธิ์ล็อกเอกสารนี้ (permission-denied) กรุณาติดต่อผู้ดูแลระบบ` |
  | failed | `ล็อกเอกสารไม่สำเร็จ (<code หรือ unknown>) กรุณากดล็อกอีกครั้ง` |
  | failed, and the re-read also failed | `ล็อกเอกสารไม่สำเร็จ และตรวจสอบสาเหตุไม่ได้ กรุณากดล็อกอีกครั้ง` |
- [ ] Every pre-commit failure does all of the following:
  - calls `console.error` with the original error, code, `snapshotId`, stage (`snapshot` or `attach`) and classification;
  - calls `logActivity('backfill_approval_snapshot_failed', …)` with `projectId`, `approvalId`, `snapshotId`, `stage`, `errorCode` and `classification`, as a best-effort trace;
  - writes nothing to the project.
- [ ] **Logging expectations match `src/services/logService.ts`:**
  - `logActivity` catches its own errors and only `console.error`s them;
  - it stores `timestamp: new Date().toISOString()`, which is the client clock;
  - it returns silently when `auth.currentUser` is null.

  So callers do not and cannot detect a failed log write. The plan makes no claim that logs carry a server time, and no lock outcome depends on a log. `logService.ts` is not modified.
- [ ] After a pre-commit failure, `designApproval`, all signatures, `status`, `approvalDraft` and `finalDocuments` are unchanged, and the project does not reference that attempt's `snapshotId`. After the commit, the project referencing that `snapshotId` is the intended result, whatever happens in the post-commit steps.
- [ ] `DesignApproval` in `src/types.ts` declares:
  - `snapshotBackfilledAt?: Timestamp`, imported from `firebase/firestore` and documented as server-set, never an ISO string;
  - `snapshotBackfilledByUid?: string`;
  - `snapshotBackfilledByEmail?: string`.

  `snapshotCreatedAt?: string` is unchanged.
- [ ] The modal never fabricates a local timestamp or name for the backfill fields. Local state receives them only from `getDocFromServer` or from the `App.tsx` project listener.
- [ ] The on-screen notice appears only in the approval modal, as a persistent banner above the document body in every view mode and for every role. Its text is:

  `เอกสารนี้ถูกล็อกย้อนหลังเมื่อ <snapshotBackfilledAt แสดงแบบ th-TH วันเวลา> โดย <ผู้ใช้> — เนื้อหาเป็นข้อมูลโครงการ ณ เวลาที่ล็อก ไม่ใช่ข้อมูลตอนที่ยื่นขออนุมัติ`

  - The time comes only from `snapshotBackfilledAt`.
  - `<ผู้ใช้>` is `displayName` from `getDoc(users/{snapshotBackfilledByUid})` when the read succeeds and the name is non-empty. Otherwise it is `snapshotBackfilledByEmail`.
- [ ] A backfilled approval is one where `snapshotId` exists and `snapshotId !== id`. For such an approval:
  - the modal never renders the document without the notice;
  - if `snapshotBackfilledAt` is not a `Timestamp` instance, the notice shows `กำลังยืนยันเวลาล็อกจากเซิร์ฟเวอร์…` and `snapshotUnavailable` is true, so signing, rewind and export stay disabled.
- [ ] Exported files do not change:
  - `buildPrintDocument`, `generatePrintableHtml` and the print markup are not modified;
  - after a backfill, the exported PDF contains no backfill or lock wording;
  - its content matches what the modal displays from the snapshot, excluding the notice.
- [ ] A normally submitted approval (`snapshotId == id`) shows no notice and renders and exports exactly as before.
- [ ] Locking causes no visible content change except the notice. The metadata `participatingOwners` equals the live `getParticipatingOwners(project, liveSource.routes)` (about :403).
- [ ] Locking is allowed in Pending Approval, Approved, Rejected and Completed. `status`, `approvalStage`, sign-offs, `documentNumber`, `rejectionReason`, `finalApproved*`, `approvalDraft` and `finalDocuments` are untouched.
- [ ] Retry after any pre-commit failure uses a new `snapshotId`. A partially written snapshot from the failed click stays as an unreferenced orphan. The project only ever receives the `snapshotId` of the click whose transaction committed.
- [ ] Rules allow exactly the write above. Every deny row R2–R12 and R15–R19 is denied for every role, including Admin and the hard-coded admin emails in `isAdmin()`.
- [ ] `npm run verify` exits 0. The implementation summary states that verify does not prove the rules.
- [ ] `docs/specs/backfill-approval-snapshot-lock.md` contains:
  - a section "หลักฐานของการล็อกย้อนหลัง" (Evidence of a backfill lock):
    - the trustworthy evidence is `designApproval.snapshotBackfilledAt` (rules force it to equal `request.time`) together with `snapshotBackfilledByUid` and `snapshotBackfilledByEmail` (rules check both against the auth token), plus metadata `backfill: true`;
    - the activity log is a supplementary, best-effort trace. It uses the client clock, can be missing silently if the write fails or the user is signed out, and must never be the only evidence in an investigation;
    - a trustworthy log (using `serverTimestamp` and reporting write results to callers) is a separate follow-up;
  - a section "ข้อจำกัดที่รู้ตัว" (Known limitations) listing limitations 1–7 below, including: "ผู้อนุมัติที่ดูเฉพาะไฟล์ PDF จะไม่เห็นว่าเอกสารถูกล็อกย้อนหลัง ร่องรอยที่เหลือคือ field บน designApproval (หลักฐานหลัก) และ activity log (ร่องรอยเสริมแบบ best-effort)".

### Acceptance scenarios

UI and flow:

1. **Admin, legacy Pending Approval, sources loaded.**
   - The button is enabled.
   - Confirm → snapshot at a new `snap_…` path → the project gains exactly five keys, and `snapshotBackfilledAt` is a Firestore Timestamp.
   - Status, sign-offs, document number and `approvalDraft` are unchanged.
   - The modal shows `ล็อกเอกสารสำเร็จ` and the notice, with the server time and the Admin's displayName.
2. **PDF unchanged (inverse check).** After scenario 1, export the PDF.
   - It contains no lock or backfill text.
   - Its content matches the on-screen slides.
   - The file name format is unchanged.
   - `git diff` shows no changes to the print or export functions.
3. **Legacy Approved/Completed with existing `finalDocuments`.** The lock succeeds. `finalDocuments` and its files are unchanged, and no regeneration starts.
4. **Legacy Rejected.** The lock succeeds and the status stays Rejected. `approvalDraft` is unchanged. A resubmission creates a normal approval, and the notice disappears.
5. **Non-Admin roles:**
   - on a legacy request: the amber banner with no button;
   - on a backfilled request: the notice, with the locker shown as the verified email.
6. **Locker's `users` doc missing**, or its id is not the auth uid: the notice shows the verified email.
7. **Approval already has `snapshotId`:** no button.
8. **A source is loading or has an error:** the button is disabled with the matching message.
9. **Cancel in the confirm dialog:** no writes and no log.

Pre-commit failure points, each a separate check:

10. **(ก) Metadata create denied because the state changed.**
    - Setup: stale tab B. Tab A locks, rewinds to Draft, or resubmits. Then B confirms a lock.
    - The metadata create returns `permission-denied`. The re-read leads to `state-changed`, and B shows the reload message.
    - There is no project write from B.
    - A's lock, signatures and `approvalDraft` are intact.
    - Console output includes `stage: 'snapshot'`. A failure log entry may be present, but it is best-effort and not asserted.
11. **(ข) Transaction state check fails.**
    - Setup: pause B after `writeApprovalSnapshot` resolves. Tab A locks, rewinds or resubmits. Resume B.
    - B gets `ApprovalStateChangedError` and shows the reload message.
    - There is no project write, and B's snapshot remains an unreferenced orphan.
    - Console output includes `stage: 'attach'`.
12. **(ค) Permission denied while the state still matches.**
    - Setup: run the new frontend against the currently published ea99371 rules, or against a test-project rules variant without the backfill branch.
    - The metadata create is denied, and the re-read matches `expected`, so the result is `permission-error`.
    - The UI shows `ไม่มีสิทธิ์ล็อกเอกสารนี้ (permission-denied) กรุณาติดต่อผู้ดูแลระบบ`, not the reload message.
    - The console holds `permission-denied`.
    - The project, signatures and `approvalDraft` are unchanged.
13. **Non-permission error before commit** (offline or throttled, giving `unavailable` or `deadline-exceeded`):
    - the generic failure message with the code is shown, with no re-read;
    - the button stays usable, and the next click succeeds with a new `snapshotId`.
14. **Permission denied and the re-read also fails:**
    - the "ตรวจสอบสาเหตุไม่ได้" message is shown;
    - no cause is claimed and no write is made.
15. **Retry after scenarios 12–14:**
    - the second click uses a different `snapshotId`;
    - the project's `snapshotId` equals the second id;
    - the first partial snapshot is unreferenced.

Post-commit, separate checks:

16. **Attach committed, then the refresh read fails.**
    - Setup: a devtools breakpoint right after `backfillApprovalSnapshot` resolves; switch the network offline; resume.
    - The modal shows `ล็อกเอกสารสำเร็จแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ โปรดโหลดหน้าใหม่`.
    - There is no error message, the button is hidden, and nothing invites a retry.
    - Firestore (console, once back online) shows the project with all five keys and `snapshotId` equal to this attempt's id.
    - After a page reload, the document renders from the snapshot with the backfill notice and no amber "not locked" banner.
17. **Attach committed, then the success log write fails** (block `logs` writes, for example offline after the refresh, or a test rules variant denying `logs`):
    - the result is still `ล็อกเอกสารสำเร็จ` (or the refresh-warning variant if the refresh also failed);
    - there is no failure message;
    - the five keys are present;
    - the reloaded page shows the locked document;
    - only `logService`'s own `console.error` appears.
18. **Stale prop after commit:** the refresh failed and the `App.tsx` listener has not yet delivered the update. The button stays hidden (`committedLock`) and no second write is attempted.
19. **Commit result unknown:** the transaction rejects with `unavailable` after the server actually committed.
    - The pre-commit "failed" message is shown.
    - A retry's metadata create is denied, because `snapshotId` is now set. The re-read gives `state-changed` and the reload message.
    - After a reload, the document is locked with the first attempt's id.
    - Nothing is double-written.

Other:

20. **`auth.currentUser` is null, or its email is null:** abort before any write.
21. **Pending timestamp guard:** a backfilled approval whose `snapshotBackfilledAt` is null or a plain object. The pending notice is shown, signing, rewind and export are disabled, and no `designApproval` write is attempted.
22. **Regression after lock:**
    - signing succeeds with all five keys unchanged;
    - rewind to Planning or O&M keeps them;
    - rewind to Draft removes `designApproval` as today.
23. **Regression, normal submission:**
    - a new request writes `approvalSnapshots/{approvalId}` with `id == approvalId` and reads back;
    - ea99371 snapshots still read back;
    - submission error handling is unchanged.

Unit tests (`src/utils/approvalSnapshot.test.ts`):

24. `planSnapshotBackfill`:
    - returns exactly the five dotted keys for all four statuses;
    - throws `ApprovalStateChangedError` when the approval is missing, the id differs, or a `snapshotId` exists;
    - throws when `record.snapshotId === expectedApprovalId`;
    - never contains a name key, `approvalDraft` or `status`.
25. `classifyBackfillFailure`, the full input table:
    - `'permission-denied'` with the project null, `designApproval` missing, the id changed, or `snapshotId` present → state-changed;
    - with a matching state → permission-error (for all four statuses, with and without `approvalDraft`);
    - with `{ok:false}` or undefined → failed;
    - `'unavailable'`, `'deadline-exceeded'`, `'aborted'`, undefined or `''`, combined with every reread variant → failed.
26. `firestoreErrorCode`:
    - returns string `code`s;
    - returns undefined for a plain `Error` whose message mentions "permission", for a non-string `code`, and for null.
27. `backfillFailureMessage(classification, code, rereadFailed)` returns the exact four pre-commit messages, and permission-error is not the reload text.
28. `backfillCommitMessage(refreshFailed: boolean)`:
    - returns `ล็อกเอกสารสำเร็จ`, or `ล็อกเอกสารสำเร็จแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ โปรดโหลดหน้าใหม่`;
    - neither contains "ไม่สำเร็จ (" or "กรุณากดล็อกอีกครั้ง".
29. `buildApprovalSnapshot(..., snapshotId)`: the identity fields, and `backfill: true` only when the id differs.
30. `resolveApprovalSnapshot(..., { snapshotId, approvalId })`: accepts the normal and the backfill identity, rejects mismatches, and existing tests pass.
31. `chooseApprovalSource` requires both identities to match.
32. `isBackfilledApproval`, `backfillLockedAt` (`Timestamp` instance only), `formatBackfillNotice`, `resolveBackfillLocker`.
33. `nextSnapshotId()` returns distinct `snap_` ids.

Rules Playground rows (not runnable locally; no Java or emulator).

Allow:

- **R1 (allow).** A project editor (an Admin, and also a Design user of the owner). Before the write, `designApproval {id: A}` has no snapshot keys, and metadata S has `id == S`, `approvalId == A` and `projectId`. The update adds exactly the five keys, with `snapshotBackfilledAt == request.time`, uid = `auth.uid` and email = `auth.token.email`.

Deny for every role, including Admin:

- **R2.** Changes an existing `snapshotId`. This covers a second lock attempt after commit.
- **R3.** Removes `snapshotId` or any backfill key.
- **R4.** R1 plus a `contractorName` change.
- **R5.** R1 plus a top-level key change (`name`, `status` or `approvalDraft`).
- **R6.** Only a subset of the five keys.
- **R7.** Wrong uid.
- **R8.** Metadata S is missing, or its `approvalId != A`.
- **R9.** A sign-only user.
- **R15.** `snapshotBackfilledAt` is not equal to `request.time`.
- **R16.** `snapshotBackfilledAt` is an ISO string.
- **R17.** The email does not match the token.
- **R18.** An extra `snapshotBackfilledByName`, or any other key.
- **R19.** The token has no email claim.

Snapshot create:

- **R10 (allow).** A backfill metadata create bound to the current, unlocked approval, with `backfill == true`.
- **R11 (deny).** Any of:
  - (a) a different approval id;
  - (b) the approval already has a `snapshotId`;
  - (c) there is no `designApproval`;
  - (d) `id != S`;
  - (e) `projectId` mismatches.
- **R12.** Children:
  - (allow) `approvalId == A`;
  - (deny) `approvalId == S`;
  - (deny) a missing parent;
  - (deny) any update or delete.

Regression:

- **R13 (allow).** A normal submission (old and new frontend).
- **R14 (allow).** Signing, rewind and `finalDocuments` writes with the five keys unchanged.

### Proposed design

**Snapshot identity** (`src/utils/approvalSnapshot.ts`, `src/types.ts`):

- Metadata gains an optional `backfill?: true`. `id` is the path and `snapshotId`, and `approvalId` is the real approval id.
- `buildApprovalSnapshot(..., snapshotId = approvalId)`.
- `resolveApprovalSnapshot(..., expected: { snapshotId, approvalId })`.
- `chooseApprovalSource` checks both identities.

**New pure helpers** (`src/utils/approvalSnapshot.ts`):

- `nextSnapshotId`
- `backfillStateMatches(expected, project)`, shared by the next two helpers
- `planSnapshotBackfill`
- `classifyBackfillFailure`
- `firestoreErrorCode`
- `backfillFailureMessage`
- `backfillCommitMessage`
- `isBackfilledApproval`
- `backfillLockedAt`
- `formatBackfillNotice`
- `resolveBackfillLocker`

Types: `BackfillExpected`, `BackfillReread`, `BackfillFailure`.

**Service** (`src/services/approvalSnapshotService.ts`):

- `writeApprovalSnapshot` uses `metadata.id` for the path.
- `readApprovalSnapshot(projectId, snapshotId, approvalId)`.
- `backfillApprovalSnapshot(projectId, expected, record)`: a transaction with the five dotted paths, where `snapshotBackfilledAt` is `serverTimestamp()`.
- `rereadProjectForBackfill(projectId)`: `getDocFromServer`, and returns `{ok:false}` if it throws.
- `readBackfillLockerProfile(uid)`.

**Modal** (`src/components/DesignApprovalModal.tsx`), `handleLockLegacyApproval`:

1. Guards and the confirm dialog.
2. `expected`, `snapshotId`, `let committed = false`, `let stage`.
3. Pre-commit block:

   ```
   try {
     stage = 'snapshot'; await writeApprovalSnapshot(snapshot);
     stage = 'attach';   await backfillApprovalSnapshot(project.id, expected, record);
     committed = true;   setCommittedLock({ approvalId, snapshotId });
   } catch (err) {
     if (!committed) { /* classify → actionError, console.error, best-effort failure log */ }
     setBusy(false); return;
   }
   ```

   Only lines that can run before commit live in this `try`. `committed` is set immediately after the awaited transaction.
4. Post-commit, each step isolated:
   - `let refreshFailed = false; try { const fresh = await getDocFromServer(projectRef); onProjectUpdated?.({ id: fresh.id, ...fresh.data() }) } catch (e) { refreshFailed = true; console.warn(e) }`
   - `try { await logActivity('backfill_approval_snapshot', …) } catch (e) { console.warn(e) }`. This is defensive only; `logActivity` already swallows its own errors.
   - `try { setActionError(null); setActionNotice(backfillCommitMessage(refreshFailed)) } catch { /* ignore */ }`
   - `finally`: clear the busy flag.
5. The button is hidden when `committedLock?.approvalId === project.designApproval?.id`.

Other modal changes:
- The snapshot effect reads with `(project.id, snapshotId, designApproval.id)`.
- The `snapshotUnavailable` guard covers a backfilled approval without a real `Timestamp`.
- A locker-label effect looks up the display name.
- The banner at about :2538, inside the modal only.

**Rules** (`firestore.rules`), unchanged from the previous draft:

- `isSnapshotBackfill()` is OR'd into `approvalContentUnchanged()`. All of these must hold:
  - the five keys K are all absent before;
  - `hasOnly(K) && hasAll(K)`;
  - the types are as specified;
  - `snapshotBackfilledAt == request.time`;
  - the uid equals `auth.uid`, and the email equals `auth.token.email`;
  - the top-level `hasOnly(['designApproval'])`;
  - `canEditProject`;
  - metadata S exists and is bound to A and the project.
- Metadata create: `id == path`, and either the normal path (`approvalId == path`) or the backfill branch bound to the current, unlocked approval with `backfill == true`.
- Child create is bound to `parent.id == path` and `parent.approvalId`.

**Known limitations** (spec "ข้อจำกัดที่รู้ตัว"):

1. Admin-only is enforced in the UI only. The rules cannot tell a backfill from a normal snapshot. Any `canEditProject` user could call the API, but the record binds their verified uid, their email and the server time.
2. Orphan snapshots remain after pre-commit failures or races. They are unreferenced and not cleaned up.
3. ผู้อนุมัติที่ดูเฉพาะไฟล์ PDF จะไม่เห็นว่าเอกสารถูกล็อกย้อนหลัง (approvers who only see the PDF will not know the document was locked afterwards). The remaining evidence is the `designApproval` fields (primary) and the activity log (supplementary, best-effort).
4. The displayed name is the locker's current self-editable `users` displayName. Non-Admins see the email.
5. Old `finalDocuments` files keep their live-data content.
6. Failure classification is a best-effort read after the fact. It reports what the re-read sees. A child or index denial is classified like a metadata denial.
7. Activity log entries use the client clock, may be missing silently, and callers cannot detect a failed write. A trustworthy log is a follow-up: `serverTimestamp` in `logService` plus surfacing write results. If a transaction's commit result is unknown (scenario 19), the UI may first say "failed". The next attempt then resolves to the reload message, and the data is correct.

**Deploy compatibility:**

- New rules with the old frontend: works.
- New frontend with the old rules: the metadata create is denied, which is reported as permission-error with no project write.
- Publish the rules before or together with the frontend.

### Expected files

- `firestore.rules`
- `src/types.ts`
- `src/utils/approvalSnapshot.ts`
- `src/utils/approvalSnapshot.test.ts`
- `src/services/approvalSnapshotService.ts`
- `src/components/DesignApprovalModal.tsx`. The banner, guards, lock handler and the `committedLock` and notice state only; the print and export functions are untouched.
- `.context/qa-checklist.md` (Claude, during build): scenarios 1–23 and the Rules Playground table R1–R19, noting that every deny row also applies to Admin and that `npm run verify` cannot prove rules.
- `docs/specs/backfill-approval-snapshot-lock.md`, with the evidence section and the Known limitations section.
- Not modified: `src/services/logService.ts`.

### Risks and rollback

- **A rule widens approval edits.** Mitigation: exactly five keys, absent-before checks, a top-level `hasOnly`, values pinned to the server or the token, and deny rows R2–R9 and R15–R19.
- **A misleading outcome.**
  - Before commit: the pure classifier (test 25), and no `message` heuristics (test 26).
  - After commit: isolated `try`/`catch` blocks, `backfillCommitMessage` (test 28), and scenarios 16–18.
- **A whole-object `designApproval` write drops the Timestamp.** Mitigation: the `snapshotUnavailable` guard, R14 and scenario 22.
- **Over-trusting the activity log.** Mitigation: the spec names the `designApproval` fields as the primary evidence and the log as best-effort.
- **Breaking reads of existing snapshots.** Mitigation: scenario 23, tests 30–31 and R13.
- **Rollback.** After any backfill, the ea99371 reader rejects backfilled snapshots. Prefer a forward fix.

### Verification

- Focused tests: `node --import tsx --test src/utils/approvalSnapshot.test.ts` (tests 24–33 and the existing suite).
- Full gate: `npm run verify`. It does not exercise `firestore.rules`.
- Rules: Rules Playground rows R1–R19, run manually before publishing.
- Browser QA:
  - scenarios 1–23 with an Admin and a non-Admin account;
  - scenarios 10–12 and 16–17 must each be run separately, using devtools breakpoints or offline mode as described.

### Deployment

- Target: NONE
- Surface: not applicable in this flow. A later release touches Firestore rules and the Cloudflare frontend; the rules must be published first or together.
- Required authorization: explicit human authorization naming each target (rules publish, frontend deploy). A review approval is not deployment authorization.

Diff, rules, modal, tests and spec all read; writing the review now.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: ea99371 (Freeze the approval document at submission time (#89))
- Head: uncommitted working tree. Changes: `firestore.rules`, `src/types.ts`, `src/utils/approvalSnapshot.ts`, `src/utils/approvalSnapshot.test.ts`, `src/services/approvalSnapshotService.ts`, `src/components/DesignApprovalModal.tsx`, and the untracked `docs/specs/backfill-approval-snapshot-lock.md`. `src/services/logService.ts` was not modified. No print or export function was modified (`buildPrintDocument`, `generatePrintableHtml`, `createApprovalPdf`, KMZ). The diff confirms this.
- Verification evidence checked: `npm run verify` exit 0 on the current tree, as stated by the stage contract. Implementation handoff: focused `approvalSnapshot.test.ts` 16/16, lint, and `git diff --check`. verify does not exercise `firestore.rules`. The rules were reviewed by reading only.

### Findings

- MEDIUM: The Rules Playground matrix R1–R19 and scenarios 1–23 have not been recorded. `.context/qa-checklist.md` is still the `Status: NOT_STARTED` template, with no R-rows. This is the Claude-owned QA artifact, not a Codex defect. It must still be completed and run before `firestore.rules` is published, because verify cannot prove the new `isSnapshotBackfill` branch (`firestore.rules:180-199`) or the changed snapshot create and child rules (`firestore.rules:422-447`). It does not block this review, since deployment target is NONE. It does block publication.
- LOW: The new `actionError` alert at the top of the modal body (`src/components/DesignApprovalModal.tsx:2642`) duplicates the existing `actionError` renders in the request form (`:4118`) and the signing panel (`:4285`). A submission or signing error is now shown twice in those views. Consider showing the top alert only in slides mode or only for lock and rewind errors.
- LOW: The backfill patch test iterates `'Pending Approval', 'Approved', 'Rejected', 'Draft'` (`src/utils/approvalSnapshot.test.ts:13`). The plan says "Completed", which in this codebase is an `ApprovalStage`, not a `ProjectStatus` (`src/types.ts:51-52`). The test covers Approved with `approvalStage: 'Completed'`, so coverage is equivalent. This is noted only as a wording mismatch with scenario 24.
- LOW: `setCommittedLock` is called after the pre-commit `try`/`catch`, not on the line right after `committed = true` (`src/components/DesignApprovalModal.tsx:1313-1314`). Nothing can run in between, and it sits in its own `try`, so the behaviour matches the commit-boundary criterion. This is a structural deviation from the plan sketch only.
- LOW: `actionNotice` and `committedLock` are reset only when `project.id` or `designApproval.id` changes (`src/components/DesignApprovalModal.tsx:166-169`). If the modal component stays mounted across close and reopen, the success notice can persist. This is cosmetic. It never re-enables the button incorrectly, because the prop then has `snapshotId`.

Checked and found correct:
- **Rules update exception** (`firestore.rules:171-199`):
  - It is OR'd only after the existing whitelist, and only when the approval id is unchanged.
  - It requires all of: `canEditProject`; top-level `hasOnly(['designApproval'])`; all five keys absent before, with `hasOnly(K) && hasAll(K)`; `snapshotId != before.id`; `snapshotBackfilledAt == request.time`; uid and token email bound, with the email claim required; metadata exists with `id`, `approvalId == before.id`, `projectId` and `backfill == true`.
  - This covers deny rows R2–R9 and R15–R19 for every role, including Admin, because none of the checks are role-bypassable.
  - A mixed status-plus-backfill write fails both branches.
- **Snapshot create** (`firestore.rules:422-433`): `id == path` is enforced.
  - The normal branch needs `approvalId == path` and no `backfill` key, so R13 and ea99371 snapshots stay valid.
  - The backfill branch is bound to the current `designApproval.id` with no `snapshotId` (R10, R11a–e).
  - Child create is bound to `parent.id == path` and `parent.approvalId` (R12). Update and delete stay denied.
- **Service** (`src/services/approvalSnapshotService.ts:60-82`):
  - The transaction re-reads the project and uses the pure `planSnapshotBackfill`, which throws `ApprovalStateChangedError` with no write.
  - It writes exactly five dotted paths, with `serverTimestamp()`.
  - `rereadProjectForBackfill` uses `getDocFromServer` and maps a throw to `{ok:false}`.
  - The writer path uses `metadata.id`, and wrappers carry the real `approvalId`.
- **Classifier and messages** (`src/utils/approvalSnapshot.ts:47-70`):
  - The code is taken only from a string `code`, with no `message` heuristics.
  - `permission-denied` with no read or a failed read gives `failed`.
  - The four pre-commit messages and two commit messages match the plan exactly. The tests cover the full table.
- **Modal flow** (`src/components/DesignApprovalModal.tsx:1270-1327`):
  - Guards: Admin, legacy, not already committed, readiness, not busy.
  - The confirm dialog comes before any write, and cancel causes no write and no log.
  - The auth uid and email guard runs before any write.
  - A new `snap_` id is generated per click.
  - The pre-commit `try` covers only build, write and attach. Failure handling is gated on `!committed`, with `console.error` including stage and classification, plus a best-effort failure log.
  - Post-commit refresh, log, message and busy flag are each isolated, and none sets `actionError` or classifies.
- **UI gating and notice**:
  - The button sits inside the legacy banner, and the banner is hidden once `committedLock` matches (scenario 18).
  - The readiness messages match.
  - The notice renders above every view mode for every role.
  - The time comes only from a `Timestamp` instance. The locker name comes only from a `users/{uid}` profile whose id equals the stored uid, otherwise the email. Non-Admins fall back to the email because the users `get` rule allows only self or Admin.
  - The pending-timestamp guard sets `snapshotUnavailable`, which disables sign, rewind (newly guarded at `:1329` and `:2609`), final documents and export.
- **Types and identity**:
  - `snapshotBackfilledAt?: Timestamp` is documented as server-set.
  - `resolveApprovalSnapshot` and `chooseApprovalSource` check both identities and accept the normal `id == approvalId`.
  - `participatingOwners` comes from the live `getParticipatingOwners(project, liveSource.routes)`.
- **Spec**: it contains "หลักฐานของการล็อกย้อนหลัง" (primary evidence fields; log is best-effort, client clock, follow-up) and "ข้อจำกัดที่รู้ตัว" (limitations 1–7, including the required PDF sentence). It states that verify does not prove the rules.

### Acceptance-criteria result

- [x] Every criterion checked against the implementation. Pure-helper criteria (scenarios 24–33) are covered by unit tests. The UI, flow and commit-boundary criteria were checked by reading the code.
- [ ] Not yet done, and needed before publication: the Rules Playground rows R1–R19, and browser scenarios 1–23 with Admin and non-Admin accounts, including the separate breakpoint and offline runs for 10–12 and 16–17.

### Verdict

APPROVED. This covers the code only. It does not authorize deployment. Publishing the rules and deploying the frontend each need separate, explicit human authorization naming the target. The R1–R19 matrix must be recorded and passed first.

Verdict: APPROVED
