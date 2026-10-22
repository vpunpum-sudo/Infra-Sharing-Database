# approval-rejection-email

Archived by `agent-flow` on 2026-10-22 after an approved review.

- Branch: `vpunpum-sudo/เอกสารขออนุมัติ-เพิ่มฟังก์ชั่น-v1`
- Base commit: `02ca30d`
- Verification: `npm run verify`, Started: 2026-10-22T13:20:57Z, Exit code: 0

## Delivery plan

Status: APPROVED
Feature: approval-rejection-email
Risk: HIGH — changes a deployed backend function (`functions/approvalNotifications.js`, used by the Firestore trigger `sendApprovalNotifications` in `functions/index.js`) that sends rejection reasons, which may be commercially sensitive, to users outside the person who rejected.

### Objective

When a design approval request is rejected at the Planning or O&M level, send an email that says it was rejected and why. Today the requester only finds out by opening the system. The email goes to the same audience as the completion email: approved Design, Planning and Management users of the participating operators. It shows the document number, project name, the rejection reason (`designApproval.rejectionReason`), who rejected it (owner code and signer name) and at which level (Planning or O&M).

### In scope

- New notification kind `approval-rejected` in `notificationForTransition` (`functions/approvalNotifications.js`).
- Recipients `roles: ['Design', 'Planning', 'Management']`, resolved by the existing `notificationRecipients`. The recipient logic does not change.
- A `KIND_COPY['approval-rejected']` entry in the same style and Thai wording as the other kinds.
- Rejection details carried on the notification and shown in both the plain-text and HTML bodies:
  - the reason
  - the rejecting owner and signer name
  - the level
  - the rejection time
- A fixed, documented rule for which rejector to show when more than one sign-off is `Rejected`.
- Unit tests in `functions/approvalNotifications.test.js`.

### Out of scope

- Any change to the client approval or rejection logic (`src/components/DesignApprovalModal.tsx`). One rejection still cancels the whole request, as the owner confirmed.
- Changes to `notificationRecipients`, `deliveryId`, `firestore.rules`, the trigger options in `functions/index.js`, or attachment handling. Rejection emails carry no attachments, which `index.js` already does for any kind other than `approval-completed` and `final-documents`.
- Emails for an Admin rewind or for resubmission. Resubmission already sends `planning-requested`.
- Deploying anything.

### Acceptance criteria

- [ ] `notificationForTransition(before, after)` returns `kind: 'approval-rejected'` only when all of these hold:
  - `after.designApproval.approvalStage === 'Rejected'`
  - `after.status === 'Rejected'`
  - `before.designApproval?.id === after.designApproval.id`
  - `before.designApproval.approvalStage !== 'Rejected'`
  - the existing preconditions pass: approval `id` and `documentNumber` are present, and there is at least one participating owner.
- [ ] For this kind, `roles` is exactly `['Design', 'Planning', 'Management']`. `owners` is the existing `participatingOwners(after)` result, so recipients are approved users with one of those roles whose `owner` is a participating operator. That is a subset of the users `firestore.rules` already lets read the project (`isApproved == true` and owner in `project.owners`).
- [ ] The notification has a `details.rejection` object: `{ reason, owner, signedBy, level, signedAt }`.
  - `reason` is `designApproval.rejectionReason`, trimmed, or `''`.
  - `level` is `'Planning'` or `'OM'`.
  - `owner`, `signedBy` and `signedAt` are `''` when no rejected sign-off is found.
- [ ] Choosing the rejector (deterministic):
  - Candidates are the participating owners' sign-offs with `status === 'Rejected'` in `planningSignOffs` (level `Planning`) and `omSignOffs` (level `OM`).
  - The candidate with the latest parseable `signedAt` wins, because that is the sign-off that caused the transition.
  - Ties, or candidates without a parseable `signedAt`, are ordered as follows: O&M before Planning, then the order of the participating owners. Any candidate with a parseable `signedAt` beats any candidate without one.
  - If no candidate exists, the email is still sent and the rejector and level rows are left out. The reason row is still shown.
- [ ] Email content for `approval-rejected`:
  - **Subject:** `[Fiber Sharing] เอกสารไม่ได้รับอนุมัติ: <projectName> (<documentNumber>)`. The subject and the hidden preheader must **not** contain the rejection reason.
  - **Summary rows:** the existing rows, plus `ระดับที่ไม่อนุมัติ` (`Planning` or `Management (O&M)`), `ผู้ไม่อนุมัติ` (`<OWNER> — <signedBy>`, or just the owner code if there is no name) and `วันที่ไม่อนุมัติ` (formatted with the existing `formatDate(…, true)`).
  - **Reason block:** a `เหตุผลที่ไม่อนุมัติ` block with the reason, or `ไม่ระบุเหตุผล` when it is empty. In HTML it is a separate box in red (`#b91c1c` on `#fee2e2`, the existing `STATUS_LABELS.Rejected` colors) with `white-space:pre-wrap` so line breaks show. In plain text it is a labelled block.
  - **Sign-off table:** the existing table, which already shows `ไม่อนุมัติ`.
  - **Action:** `เปิดดูโครงการ`, using the existing project link.
- [ ] Every user-supplied value is passed through `escapeHtml` before it goes into HTML: reason, signer name, project name and owner code.
- [ ] The other four kinds behave exactly as before. All existing tests pass unchanged.
- [ ] `npm run verify` passes.

### Acceptance scenarios

1. **Planning rejection:**
   - Before: stage `Planning`, status `Pending Approval`, id `approval-1`.
   - After: same id, stage `Rejected`, status `Rejected`, `planningSignOffs.ITEL = { status: 'Rejected', signedBy: 'Somchai', signedAt: T1 }`, `rejectionReason: 'ระยะไม่ถูกต้อง'`.
   - Expected: kind `approval-rejected`, roles `['Design','Planning','Management']`, owners `['ITEL','UIH']`, rejection `{ reason: 'ระยะไม่ถูกต้อง', owner: 'ITEL', signedBy: 'Somchai', level: 'Planning', signedAt: T1 }`.
2. **O&M rejection:** before at stage `OM` with all Planning sign-offs approved; after has `omSignOffs.UIH` rejected. Expected: kind `approval-rejected`, level `OM`, owner `UIH`. The email shows `Management (O&M)` as the level.
3. **No duplicate on later writes:** before and after are both `Rejected` with the same id, and an unrelated field changes (for example `approvalDraft` or contractor details). Expected: `null`.
4. **New request id:** before is approval `approval-1`, after is approval `approval-2` with stage `Rejected`. Expected: not `approval-rejected`. It returns `null`, because the existing `planning-requested` branch needs stage `Planning`.
5. **No previous approval:** before has no `designApproval`, after is `Rejected`. Expected: `null`.
6. **Stage and status disagree:** stage `Rejected` but `after.status` is `Pending Approval`, or status `Rejected` with stage `Planning`. Expected: no `approval-rejected` in either case.
7. **Several rejected sign-offs:**
   - Planning ITEL is rejected with `signedAt` `2026-10-20T01:00Z`, and O&M UIH is rejected with `2026-10-21T01:00Z`. Expected: rejector UIH, level `OM`.
   - Swap the timestamps. Expected: ITEL, level `Planning`.
8. **Tie or missing timestamps:**
   - Two rejected sign-offs with the same or missing `signedAt`, one Planning and one O&M. Expected: the O&M one.
   - Two Planning rejections, ITEL and UIH, with no timestamps and owners `['ITEL','UIH']`. Expected: ITEL.
   - A candidate with a valid timestamp beats one without.
9. **Non-participating owner is ignored:** a `Rejected` sign-off under an owner that is not participating (for example `SYMC` when it is not in `owners`) is never chosen.
10. **No rejected sign-off found:** stage and status are `Rejected` but no sign-off is `Rejected`. Expected: the notification is still produced, the rejector and level rows are left out of the text, and the reason is still shown.
11. **Empty reason:** the email text contains `เหตุผลที่ไม่อนุมัติ` and `ไม่ระบุเหตุผล`.
12. **HTML escaping:**
    - Reason `<script>alert(1)</script> & "x"` and signer name `<b>Evil</b>`. Expected: the HTML contains `&lt;script&gt;` and `&lt;b&gt;Evil&lt;/b&gt;`, and does not match `/<script>/` or `/<b>Evil/`.
    - The plain text contains the raw reason.
13. **Reason kept out of the subject:** a reason with a unique marker string does not appear in `subject` and does not appear in the hidden preheader `<div style="display:none…">`.
14. **Recipients:** with users across roles, owners and approval states, `notificationRecipients(users, rejectedNotice)` returns only approved Design, Planning and Management users of the participating owners. It excludes:
    - `isApproved: false` users
    - `Sub-contract` and `Admin` roles
    - non-participating owners such as `SYMC`
    - invalid emails.

    Emails are de-duplicated and lower-cased.
15. **Delivery id:** `deliveryId` for an `approval-rejected` notice differs from an `approval-completed` notice with the same project, approval, email and event.
16. **Reject, rewind, reject again:** before is stage `Planning` on the same id (after an Admin rewind) and after is `Rejected` again. Expected: `approval-rejected` again. It is a separate event, so the delivery id is new.
17. **Regression:** all existing tests in `functions/approvalNotifications.test.js` pass unchanged, including `planning-requested`, `management-requested`, `approval-completed`, `final-documents`, the escaping tests and the full email-content test.

### Proposed design

**Where the trigger is chosen.** In `notificationForTransition`, add a branch before the final `else { return null; }`. The four existing branches all need stage `Planning`, `OM` or `Completed`, so the new branch cannot overlap them. The branch:

```js
} else if (stage === 'Rejected' && after.status === 'Rejected' &&
    previous?.id === approval.id && previous.approvalStage !== 'Rejected') {
  kind = 'approval-rejected';
  roles = ['Design', 'Planning', 'Management'];
}
```

**Choosing the rejector.** Add a small helper `rejectingSignOff(approval, owners)`. It:

1. Builds candidates from `planningSignOffs` (level `Planning`) and `omSignOffs` (level `OM`), limited to the participating `owners` and to `status === 'Rejected'`.
2. Sorts by parsed `signedAt` descending; non-parseable times go last.
3. Breaks ties with O&M before Planning, then owner order.
4. Returns the first candidate or `null`.

**Notification shape.** Add `details.rejection` only when `kind === 'approval-rejected'`, so the other kinds' payloads stay the same. Its `reason` is `String(approval.rejectionReason || '').trim()`.

**Email copy.**

- `KIND_COPY['approval-rejected']`:
  - `description: 'เอกสารไม่ได้รับอนุมัติ'`
  - `stage: 'ไม่อนุมัติ'`
  - `intro: 'คำขออนุมัติการออกแบบนี้ไม่ได้รับอนุมัติ คำขอทั้งหมดถูกยกเลิก ผู้ขออนุมัติต้องแก้ไขและยื่นคำขอใหม่'`
  - `action: 'เปิดดูโครงการ'`
  - `accent: '#b91c1c'`
- `summaryRows` gains the three rejection rows when `details.rejection` is present. The level label maps `OM` to `Management (O&M)`. Empty values are already filtered out.
- `emailContent` adds the reason block:
  - In text: `'', 'เหตุผลที่ไม่อนุมัติ', reason || 'ไม่ระบุเหตุผล'`, placed after the summary rows.
  - In HTML: an escaped `<p>` or `<div>` with `white-space:pre-wrap`, styled with `STATUS_LABELS.Rejected` colors and placed before the sign-off table.
- The subject and preheader keep their existing formulas, which contain only the project name and document number. That keeps the reason out of mail-list previews.

**No `index.js` change needed.** The trigger calls the pure functions generically and logs `kind`. Rejection emails take the no-attachments path.

**Security.**

- **Recipients.** The audience is the same as `approval-completed`, which already receives full sign-off details. `notificationRecipients` requires `isApproved === true`, an allowed role, and an owner in `participatingOwners(after)`. `participatingOwners` is the intersection of `project.owners` (or the legacy `owner`) with the owners that have Planning sign-offs. So every recipient already passes the read rule in `firestore.rules` for that project, which needs an approved user whose owner is in `project.owners` or equals `project.owner`.
- **Who is excluded.** No Admin, `Sub-contract` or cross-operator user receives it.
- **Free text.** The reason is free text. It is escaped in HTML and never placed in the subject or the `href`.

**Errors.** This is a pure function. A missing or odd sign-off shape falls back to empty strings. A missing `rejectionReason` falls back to `ไม่ระบุเหตุผล`.

### Expected files

- `functions/approvalNotifications.js`: the new branch, the `rejectingSignOff` helper, `details.rejection`, the `KIND_COPY` entry, the extra summary rows, and the reason block in text and HTML.
- `functions/approvalNotifications.test.js`: tests for scenarios 1–17.

### Risks and rollback

- **Commercial information.** Rejection reasons may hold commercial details. This is mitigated by reusing the existing completion-email audience, which is limited to owners and roles, and by keeping the reason out of the subject and preheader.
- **Older rejections.** Requests already in `Rejected` before deployment do not trigger an email, because the `previous.approvalStage !== 'Rejected'` guard blocks them. This is intended.
- **Duplicate mail.** Firestore retries reuse `event.id` in `deliveryId`, and later edits are blocked by the stage guard.
- **Signing order.** The tie-break order is chosen here, not derived from the client. Rejector selection is display-only and does not affect who receives the email.
- **Rollback.** Revert the commit and redeploy functions. Doing that needs separate authorization that names the target. There is no data migration, and stored `mailDeliveries` records stay valid.

### Verification

- Focused tests: `npm --prefix functions test` (`functions/approvalNotifications.test.js`).
- Full gate: `npm run verify`.

### Deployment

- Target: NONE
- Surface: Firebase functions (when deployed later). No change to the Cloudflare frontend.
- Required authorization: explicit human approval naming **Firebase functions** as the target, requested separately after review. A review approval does not authorize deployment.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: 02ca30d (HEAD, "Let an Admin lock an approval submitted before snapshots existed")
- Head: working tree. Modified: `functions/approvalNotifications.js` and `functions/approvalNotifications.test.js`. No untracked source files.
- Verification evidence checked: `npm run verify` exit 0 on the current tree, as the stage contract states. I also checked the implementer's table (20/20 focused tests, 50/50 functions tests, 221 frontend tests, Vite build). I read the actual diff, not just the summary. I also checked how the client writes a rejection in `src/components/DesignApprovalModal.tsx:1576-1607`, which sets `approvalStage: 'Rejected'`, project `status: 'Rejected'`, and `rejectionReason: signerComment.trim()`, with sign-offs at `{ status: 'Rejected', signedBy, signedAt: ISO }`. These field names and values match what the new branch and the rejector helper read.

### Findings

- LOW: `functions/approvalNotifications.test.js:270-282`. The scenario 16 test (reject, rewind, reject again) calls `notificationForTransition` twice with the same `project('Planning')` before-state. It then checks that different event ids give different delivery ids. That does show a second rejection after a rewind produces `approval-rejected` again with a new delivery key. But it never builds a real rewound before-state, such as a Planning stage that still has the old rejected sign-offs. Behaviour is correct by inspection, since the guard only looks at `previous.approvalStage`. This is a coverage gap only.
- LOW: `functions/approvalNotifications.js:31-32`. `rejectingSignOff` keeps any truthy `signedAt` or `signedBy` as it is, without forcing it to a string. Today the client always writes strings. An odd stored shape would still be escaped, because `escapeHtml` uses `String(value)`, and `formatDate` handles bad dates. So there is no injection or crash risk. It is just slightly looser than the plan's "falls back to empty strings" wording.
- LOW: `functions/approvalNotifications.js:111-114`. When no rejected sign-off is found, the payload has `level: ''`. The plan's criterion says `level` is `'Planning'` or `'OM'`, but it also says rows are left out when there is no candidate. The tests (`approvalNotifications.test.js:220`) lock in `''`, the row is filtered out, and this matches the intent of scenario 10. Noted only for the record. No change needed.

### Acceptance-criteria result

- [x] Every criterion checked against the implementation.
  - Trigger: `functions/approvalNotifications.js:87-90` needs stage `Rejected`, status `Rejected`, the same approval id, and a previous stage that is not `Rejected`. The existing id, documentNumber and owners preconditions run first (`:58-60`). The other branches all need stage Planning, OM or Completed, so they cannot overlap. Scenarios 3–6 are tested at `test.js:158-177`.
  - Roles and owners: `['Design','Planning','Management']` with `participatingOwners(after)`. `notificationRecipients` is unchanged. Scenario 14 is tested at `test.js:255-268`, and the expected output (`a@`, `b@`, `c@`) correctly excludes users who are unapproved, Sub-contract, Admin, SYMC, or have an invalid email, and it de-duplicates and lower-cases.
  - `details.rejection` is added only for this kind, so the other kinds' payloads are unchanged. `reason` is trimmed (scenario 1 passes `' ระยะไม่ถูกต้อง '`).
  - Rejector choice (`:23-48`): candidates are limited to participating owners and `status === 'Rejected'`. The latest parseable timestamp wins, and any parseable timestamp beats one that can't be parsed. Ties go O&M before Planning, then owner order. The sort comparator is consistent. Scenarios 7, 8 and 9 are tested at `test.js:179-212`, including the `'invalid'` timestamp case.
  - Email content: the subject and preheader formulas are unchanged, so they contain no reason (scenario 13 is asserted against both). The three summary rows are added, with `OM` mapped to `Management (O&M)`, the owner code alone when there is no name, and `formatDate(…, true)`. The reason block in text comes after the summary rows. In HTML it is a red `#b91c1c`/`#fee2e2` box with `white-space:pre-wrap`, placed before the sign-off table. The `ไม่ระบุเหตุผล` fallback is in place, and the action is `เปิดดูโครงการ` with the existing link.
  - Escaping: the reason, signer name, project name and owner code all go through `escapeHtml`, either in the summary rows or in `rejectionHtml`. Scenario 12 is tested at `test.js:238-253`.
  - Delivery id: `deliveryId` already includes `kind` and the event id. Scenarios 15 and 16 are tested.
  - No changes to `index.js`, `firestore.rules`, the client, attachments or recipient logic. Rejection emails take the no-attachments path. The 9 existing tests are unchanged (the diff only appends lines), which covers scenario 17.
  - `npm run verify` passed.
  - Deployment: none was done. Firebase functions still need separate explicit authorization that names that target.

### Verdict

Verdict: APPROVED
