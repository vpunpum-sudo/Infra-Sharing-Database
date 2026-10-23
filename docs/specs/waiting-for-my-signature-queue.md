# waiting-for-my-signature-queue

Archived by `agent-flow` on 2026-10-23 after an approved review.

- Branch: `vpunpum-sudo/เอกสารขออนุมัติ-เพิ่มฟังก์ชั่น-v1`
- Base commit: `eb1c88c`
- Verification: `npm run verify`, Started: 2026-10-23T12:13:23Z, Exit code: 0

Status: APPROVED
Feature: waiting-for-my-signature-queue
Risk: STANDARD — the change is a client-side, read-only view of data the dashboard already loads. No Firestore rules, Functions, data model or deployment config change. The risk rationale is corrected as follows:
- `firestore.rules` `canSignApproval` checks only the role, approved status, project access and which fields change. It does **not** check that the signer's Owner matches the signed owner, and it does **not** check the Planning/O&M level permission.
- `DesignApprovalModal.canUserSign` is therefore today the **only** gate for the owner/level rule. Moving that predicate into a shared helper is **security-adjacent**, even though the tier stays STANDARD.
- STANDARD holds only because the extraction must be behaviour-identical, and this plan makes that mechanically provable. The hard requirements are:
  - **R1.** The modal imports and calls the real `canSignAsOwner`. It keeps no duplicated owner/level predicate.
  - **R2.** Scenario 14 compares `canSignAsOwner` against a frozen inline copy of the OLD predicate across the full matrix.
  - **R3.** The review reads the `canUserSign` diff line by line.
  - **R4.** `git diff --name-only` shows no change to `firestore.rules`, `storage.rules`, `functions/` or `src/types.ts`.
- If the implementer needs to change rules, `functions/` or the stored shape of `designApproval`, or if parity cannot be proven, the risk becomes HIGH. Stop and return to the human.

### Objective

Today a user has to open every project to learn whether they must sign. Add a "waiting for me to sign" queue to the projects dashboard. For the logged-in user it lists every project whose design approval is `Pending Approval` and where that user can sign at the current stage. Each row shows:
- project name
- route code
- document number
- stage (Planning or O&M)
- the owners that have not yet signed
- how long the request has been waiting

Clicking a row opens that project's approval document (`DesignApprovalModal`).

This is feature 1 of 7 in the approval-usability series. Reminder emails, version history and diff, saved signature, in-app notifications, delegate signer and Admin bulk legacy lock are separate flows and are not part of this one.

### In scope

- A pure helper module `src/utils/approvalQueue.ts` with these exports:
  - `canSignAsOwner(appUser, permissions, owner, level)`: the owner/level rule extracted verbatim from `canUserSign` (`DesignApprovalModal.tsx:1259`).
    - The role must hold `approvePlanning` for level `Planning`, or `approveOM` for level `OM`.
    - Admin can sign any owner.
    - Any other user can sign only their own Owner. A user whose `owner` is empty or `'None'` is not restricted by owner, exactly as today.
    - `appUser.owner` is compared as-is. It is **not** normalised, while the project owners come normalised from `getParticipatingOwners`. This current behaviour is pinned by tests, not fixed (see scenario 14).
  - `buildSigningQueue(projects, appUser, permissions, now)`: returns the sorted rows.
  - `canSeeSigningQueue(permissions)`: the panel visibility rule, `viewProjects && viewApprovalDocs && (approvePlanning || approveOM)`.
  - `formatWaiting(waitingMs)`: Thai wait text, exported and tested on its own.
  - the `SigningQueueRow` type.
- `DesignApprovalModal.canUserSign` keeps its `!appUser || snapshotUnavailable || usingLivePreview` guards and delegates the owner/level part to the imported `canSignAsOwner`. Its behaviour does not change.
- A small presentational component `SigningQueuePanel` in `src/components/SigningQueuePanel.tsx`, used by `ProjectsDashboard.tsx` above the search and Owner filter bar.
  - It has a title with a count, the rows, and an empty state when the user can sign but nothing is waiting.
  - It imports no browser-only modules, so a unit test can render it with `react-dom/server`.
  - It owns the one-minute tick (see Proposed design). The dashboard does not hold the tick state.
- Row contents:
  - project name and route code
  - document number (`designApproval.documentNumber`)
  - stage chip (Planning or O&M)
  - the owners still unsigned at that stage, with the ones this user can sign visibly marked
  - the waiting time, in Thai
- Clicking or keyboard-activating a row calls the existing `setApprovalModalProject(project)`. The existing modal and its snapshot loading are reused.
- The queue recomputes from the live `projects` state. After a sign-off through the modal (`onProjectUpdated` and the Firestore snapshot listener), the row disappears or changes stage with no extra code.
- Unit tests in `src/utils/approvalQueue.test.ts` and `src/components/SigningQueuePanel.test.ts`. The existing `npm test` glob `src/**/*.test.ts` picks them up.

### Out of scope

- Any change to `firestore.rules`, `storage.rules`, `functions/`, `src/types.ts` (the `Project` and `DesignApproval` types) or stored data.
- Changing who is allowed to sign. The queue mirrors `canUserSign` and does not widen or narrow it.
- Fixing the missing Owner/level check in `firestore.rules` `canSignApproval`. This is a pre-existing gap and is recorded under Risks. It is a candidate for a separate HIGH-risk flow. **Do not change rules here.**
- Normalising `appUser.owner` in the comparison, or fixing any other current quirk of `canUserSign`. Behaviour is pinned as-is.
- A cross-project query beyond the existing dashboard subscription. The queue shows only projects the dashboard already loads for this user: all projects for Admin, otherwise those matching the user's Owner or created by the user.
- Reading approval snapshots to resolve historical participating owners.
- Reminder emails, version history or diff, saved signature, notifications, delegate signer, Admin bulk legacy lock.
- Work-instruction (WI) manual text or screenshot script changes. `scripts/wi-screenshot-figures.ts` and `src/utils/wiScreenshotMaskSpec.ts` are not edited.
- Deploying anything.

### Acceptance criteria

- [ ] A project appears in a user's queue only when all of these hold:
  - `designApproval.status === 'Pending Approval'`.
  - `project.status` is absent or `'Pending Approval'`.
  - The stored `approvalStage` is not `Completed` or `Rejected`.
  - At least one unsigned participating owner at the current stage can be signed by this user under the `canUserSign` rule.
- [ ] The current stage is derived the way the modal enforces it:
  - If any participating owner has no `Approved` Planning sign-off, the stage is Planning. The queue then considers only the Planning level, and the unsigned owners are those without an `Approved` Planning sign-off.
  - Otherwise, if any participating owner has no `Approved` O&M sign-off, the stage is O&M, and the unsigned owners are those without an `Approved` O&M sign-off.
  - Otherwise the project is excluded.
- [ ] Permissions:
  - Admin sees every pending project at its current stage if the Admin role holds the matching level permission. With `approvePlanning` off, Admin sees no Planning rows (this is tested).
  - A non-Admin sees a project only for owners equal to their own Owner (as-is comparison).
  - A role without `approvePlanning` never sees Planning-stage rows. A role without `approveOM` never sees O&M-stage rows.
  - `canSeeSigningQueue(permissions)` is false, and the panel is not rendered, when `viewProjects` is off, when `viewApprovalDocs` is off, or when both approve permissions are off.
- [ ] A sign-off that is already `Approved` is excluded from the unsigned list. A project whose only remaining unsigned owners belong to other Owners is not listed for this user.
- [ ] Each row shows project name, route code (omitted if empty), document number, stage, unsigned owners, and the waiting time. The owners this user can sign are distinguishable from the rest.
- [ ] Waiting time is measured from `designApproval.requestedAt`. After a rejection and resubmission this reflects the **latest** request, because a resubmission creates a new approval. This is intended and is documented in the code comment.
- [ ] `formatWaiting` floors hours and days. Under 1 hour it shows "น้อยกว่า 1 ชม.". From 1 hour up to 24 hours it shows whole hours ("N ชม."). From 24 hours it shows whole days ("N วัน").
- [ ] Rows are sorted by waiting time, longest first. A missing or invalid `requestedAt` shows "ไม่ระบุ" and sorts last. Ties break by project name.
- [ ] Clicking a row opens the project's approval document (`DesignApprovalModal`) for that project. The click does not navigate to the map.
- [ ] After a sign-off the queue updates without a page reload. The row disappears, or moves from Planning to O&M when the last Planning owner signs and the user can sign O&M.
- [ ] The dashboard search box and Owner filter chips do not hide queue rows.
- [ ] `canUserSign` returns the same result as before for every role, owner, level, `snapshotUnavailable` and `usingLivePreview` combination.
  - The modal imports and calls the real `canSignAsOwner`, with no duplicated owner/level predicate.
  - The frozen-copy parity test (scenario 14) passes.
- [ ] WI masking contract (decided; see Proposed design):
  - The panel's **outer container** carries `data-wi-pii="other-project-card"`.
  - There is **no** `data-wi-project-id` anywhere in the panel.
  - Every `aria-label` and `title` lives only on descendants, never on the container.
  - As a consequence the WI dashboard figure never shows the panel. The mask always hides it, and that is intended.
  - A deterministic unit test enforces this, and `npm run verify` runs it.
- [ ] `npm run verify` passes. `git diff --name-only` (against the base commit) shows no change to `firestore.rules`, `storage.rules`, `functions/` or `src/types.ts`.

### Acceptance scenarios

Helper-level scenarios, unit-tested in `src/utils/approvalQueue.test.ts` with a fixture `Project` factory, `DEFAULT_PERMISSIONS` and an injected `now`:

1. **Admin, Planning stage.** Project ITEL+SYMC, Planning sign-offs `{}`. The row has stage `Planning` and unsigned owners `[ITEL, SYMC]`, and the Admin can sign both.
2. **Planning partially signed.** ITEL has an `Approved` Planning sign-off. For Admin the unsigned owners are `[SYMC]`.
3. **Other Owner's user (Planning role, owner ITEL) with only SYMC unsigned.** The project is excluded. With ITEL and SYMC both unsigned, the row is included and ITEL is marked signable. SYMC is shown unsigned but not signable.
4. **Management user (owner UIH) at the O&M stage.**
   - All Planning sign-offs `Approved`, UIH's O&M sign-off missing: the row is included with stage `OM`.
   - Same project at the Planning stage: excluded, because Management lacks `approvePlanning` by default.
5. **Planning or Design user at the O&M stage.** Excluded, because those roles lack `approveOM` by default.
6. **Viewer and Sub-contract.** Always an empty queue.
7. **User with owner `None` or no owner.** Not restricted by owner, matching today's `canUserSign`. They see only projects present in their loaded list.
8. **Status guards.** Excluded in each case:
   - `designApproval` is absent.
   - `designApproval.status` is `Approved`, `Rejected` or `Draft`.
   - `approvalStage` is `Completed` or `Rejected`.
   - `designApproval.status` is `Pending Approval` but `project.status` is `Rejected` or `Approved`.
9. **Participating owners come from `getParticipatingOwners(project, [])`.** The queue uses `project.owners` or `project.owner`, normalised and ordered as in `getParticipatingOwners`. A project with no resolvable owner is excluded rather than guessed.
10. **Stored stage vs sign-offs.**
    - Stored `approvalStage` is missing, or `Planning`, with Planning complete: derived stage is `OM`.
    - Stored `OM` with an unsigned Planning owner: derived stage is `Planning`, matching which sign buttons the modal shows.
    - All owners signed at both levels but status still `Pending Approval`: excluded.
11. **Sign-off with status `Rejected` or `Pending`** is not "Approved" and counts as unsigned.
12. **Sorting and wait text (queue level).**
    - The longest wait comes first, and ties are broken by project name.
    - An invalid or missing `requestedAt` gives "ไม่ระบุ" and sorts last.
    - A future `requestedAt` (clock skew) is clamped to 0 and shown as "น้อยกว่า 1 ชม.".
    - A resubmitted approval uses its own `requestedAt` (the latest request).
12b. **`formatWaiting` boundaries.** Hours and days are floored.
    - 0 ms and 1 minute give "น้อยกว่า 1 ชม.".
    - 59 minutes 59 seconds gives "น้อยกว่า 1 ชม.".
    - Exactly 60 minutes gives "1 ชม.".
    - 5 hours gives "5 ชม.".
    - 23 hours 59 minutes gives "23 ชม.".
    - Exactly 24 hours gives "1 วัน".
    - 47 hours gives "1 วัน".
    - 3 days gives "3 วัน".
    - A very large wait (for example 10 000 days) gives "10000 วัน" and does not throw.
    - `null`, `NaN`, a negative value, and an invalid or missing date at queue level give the "น้อยกว่า 1 ชม." / "ไม่ระบุ" results stated above. A negative value is clamped, `null` and `NaN` give "ไม่ระบุ".
13. **Missing fields.** A project missing `documentNumber` or `routeCode` yields a row with empty strings, and the helper does not throw.
14. **`canSignAsOwner` parity against a frozen copy of the OLD predicate.**
    - The test file contains a verbatim inline copy of the old `canUserSign` owner/level predicate, frozen at the pre-refactor commit. It is marked "do not edit".
    - For every role in `DEFAULT_PERMISSIONS`, each of Planning and OM, a set of owners (own owner, other owner, owner `None`/absent), and each permission on/off combination, `canSignAsOwner(...)` equals the frozen copy. The roles include Admin.
    - It explicitly covers **Admin with `approvePlanning` off** (and with `approveOM` off). The result is false for everyone, including Admin, at that level.
    - It explicitly covers **un-normalised appUser.owner**: lowercase (`itel`), padded (` ITEL `) and mixed-case values against a normalised project owner (`ITEL`). Current behaviour is pinned: `canSignAsOwner` and the frozen copy agree, so a lowercase or padded `appUser.owner` does not match. Do not fix this.
    - It covers `appUser.owner` empty, `'None'` and undefined.
15. **Panel visibility rule.** `canSeeSigningQueue` is false when `viewProjects` is off, when `viewApprovalDocs` is off, and when both `approvePlanning` and `approveOM` are off. It is true when either approve permission is on and both view permissions are on.
16. **Markup and mask contract**, in `src/components/SigningQueuePanel.test.ts`, rendered with `react-dom/server` `renderToStaticMarkup` and `React.createElement`:
    - The outer container has `data-wi-pii="other-project-card"`.
    - No `data-wi-project-id` appears anywhere in the markup.
    - The container has no `aria-label` and no `title`.
    - Row buttons carry the `aria-label` on descendants only.
    - The same assertions hold for the empty state.
    - A `checkMaskResult` fixture test builds a `PageSnapshot` for the `dashboard` spec that includes the panel. The panel region is `matches: 1` with `maskValid: [true]`, and `bodyText` and `attrs` contain none of the panel's project names or document numbers (masked, as `maskPage` would leave them). `checkMaskResult` returns `[]`. The test also asserts that the unmasked variant (panel text left in `bodyText` and `attrs`) fails with `known-value` or `pii:*`, which proves why the container mask is needed.

Dashboard and manual QA scenarios, covered by `.context/qa-checklist.md` and browser or staging QA, not unit tests:

17. The panel shows the correct count and rows for an Admin, a Planning user of one owner, and a Management user of one owner, using synthetic fixtures.
18. Clicking a row opens the approval modal for that project. Closing it returns to the dashboard. Signing in the modal updates the panel.
19. A user with no signable items sees the empty state. A Viewer sees no panel.
20. Typing in the search box or choosing an Owner chip does not change the panel.
21. Regression:
    - The existing project card's approval button, status banner and "ลงนาม 2 ระดับ" behaviour are unchanged.
    - The modal's sign buttons appear for exactly the same owners as before.
    - Narrow (mobile) layout does not overflow, and rows are keyboard-reachable (button semantics).
22. WI regression: `npm test` still passes the WI screenshot unit tests. The panel is always hidden by the WI mask, so the `dashboard` and `card-actions` figures do not show it. `[data-wi-project-id]:visible` still matches only project cards. A real screenshot run is optional and not part of verify. If run, it must show no layout gap or PII.
23. Tick isolation: with the dashboard open, React DevTools or a render counter shows that the one-minute tick re-renders only `SigningQueuePanel` and not the project card grid. The WI screenshot readiness polling (which waits on the cards and `data-wi-project-id`) is unaffected, because the tick changes only text inside the panel and the panel is outside the polled cards.

### Proposed design

**Data flow.** `ProjectsDashboard` already subscribes to `projects`, filtered by the user's role and Owner (Admin sees all, other users see their Owner's projects plus their own). The dashboard derives the permissions once as it does today (`getRolePermissions()[appUser.role]`). The rows are derived with `useMemo` over `projects`, `appUser` and the permissions, and the panel is rendered only when `canSeeSigningQueue(permissions)`. No new Firestore reads, listeners or Functions.

**Tick isolation.** The one-minute `now` tick lives inside `SigningQueuePanel` (a `useNow(60_000)` hook in the same file, with `setInterval` cleaned up on unmount).
- The queue rows are built from `projects` by the dashboard's `useMemo`, which does not depend on `now`.
- The panel receives the unsorted-by-time inputs it needs and calls `buildSigningQueue(..., now)` itself (memoised on `[projects, appUser, permissions, now]`), or the dashboard passes `projects` and the panel does the build. Either way `now` stays in the child, so the card grid does not re-render each minute.
- The tick changes only text inside the panel. It does not touch card markup, so the WI screenshot scripts' readiness polling is unaffected.

**Row model.**

```ts
type SigningQueueRow = {
  project: Project;
  projectId: string; name: string; routeCode: string; documentNumber: string;
  stage: 'Planning' | 'OM';
  unsignedOwners: CoreOwner[];
  signableOwners: CoreOwner[];
  waitingMs: number | null;
};
```

**Algorithm per project:**

1. Require `designApproval.status === 'Pending Approval'`.
2. Require `project.status` to be absent or `'Pending Approval'`.
3. Skip when the stored `approvalStage` is `Completed` or `Rejected`.
4. Take `owners = getParticipatingOwners(project, [])`. A project with no owner information is excluded, and the modal remains authoritative.
5. Derive the stage:
   - `unsignedPlanning` is the owners whose Planning sign-off status is not `Approved`. If it is non-empty, the stage is Planning and the unsigned owners are `unsignedPlanning`.
   - Otherwise take `unsignedOM` the same way. If it is non-empty, the stage is O&M. If not, skip the project.
6. `signableOwners = unsigned.filter(o => canSignAsOwner(appUser, permissions, o, level))`. Skip the project when `signableOwners` is empty.
7. `waitingMs = max(0, now - Date.parse(designApproval.requestedAt))`, or `null` if the date is missing or invalid. `requestedAt` reflects the latest request, because a resubmission creates a new approval.
8. Sort by `waitingMs` descending, with `null` last, then by name.

**Shared predicate (hard requirements).**
- `canSignAsOwner` is a verbatim extraction of the owner/level portion of `canUserSign`, with no normalisation added.
- `DesignApprovalModal.tsx` imports `canSignAsOwner` from `../utils/approvalQueue` and calls it. It keeps no copy of the predicate.
- The modal keeps its own `!appUser || snapshotUnavailable || usingLivePreview` guards. The queue deliberately does not apply those guards, because they need the loaded snapshot. The modal still blocks signing when they apply.
- The only change to `DesignApprovalModal.tsx` is the `canUserSign` body and one import line.

**UI.**
- The panel is rendered only when `canSeeSigningQueue(permissions)` is true.
- Each row is a real `<button>` with an `aria-label` (project name and document number) on the button. The button is a descendant of the panel container.
- `onClick` calls `setApprovalModalProject(project)`. The `project` is the exact object from the dashboard's `projects` state, which is the same object shape the dashboard card's approval button passes (`ProjectsDashboard.tsx:657`). The queue does not clone or reshape it.
- Match the dashboard's existing Tailwind patterns (amber for Planning, sky for O&M, as the modal uses) and its Thai wording.
- **WI masking (decided):**
  - The panel's **outer container** has `data-wi-pii="other-project-card"`.
  - No element in the panel has `data-wi-project-id`.
  - Every `aria-label` and `title` is on a descendant only, never on the container.
  - `maskPage` therefore always hides the panel: it clears `textContent` (which removes the descendant `aria-label` elements) and sets `display:none`, because the panel has no matching `dataset.wiProjectId`.
  - This is intended: the WI dashboard figure never shows the panel.
  - The scripts and the mask spec stay untouched.
  - The wording "if the mask spec requires it" no longer applies.

**Error handling and security.**
- The helper is total: it never throws on missing `designApproval`, sign-offs, `requestedAt` or owners.
- The queue grants no new capability. The row only opens the modal. Whether the user can actually sign is still decided by `canUserSign` inside the modal, and the Firestore rules only partly enforce it on write (see Risks).
- No credentials or secrets are involved.

### Expected files

- `src/utils/approvalQueue.ts` (new): `canSignAsOwner`, `buildSigningQueue`, `canSeeSigningQueue`, `formatWaiting` and the row type.
- `src/utils/approvalQueue.test.ts` (new): scenarios 1–15, including `formatWaiting` boundaries and the frozen-copy parity matrix.
- `src/components/SigningQueuePanel.tsx` (new): presentational panel, `useNow` tick, mask attributes.
- `src/components/SigningQueuePanel.test.ts` (new): scenario 16 (markup contract and `checkMaskResult` fixture).
- `src/components/ProjectsDashboard.tsx`: render `SigningQueuePanel` above the filter bar, derive rows or inputs, and pass `setApprovalModalProject`.
- `src/components/DesignApprovalModal.tsx`: `canUserSign` delegates to the imported `canSignAsOwner`, with no behaviour change.

`docs/specs/waiting-for-my-signature-queue.md` is archived by the flow after approval. It is flow-owned, and the implementer must not create or edit it.

### Risks and rollback

- **Security-adjacent refactor.** `canUserSign` is the only gate for the Owner and Planning/O&M-level rule. Mitigations: R1–R4 above, the frozen-copy parity matrix (scenario 14), and a review that reads the `canUserSign` diff line by line.
- **Pre-existing gap, out of scope.** `firestore.rules` `canSignApproval` does not check the signer's Owner or the Planning/O&M level. A client that bypasses the UI could sign for another Owner or level. This feature neither introduces nor widens the gap, and it does **not** change the rules. It is recorded in `.context/implementation.md` and the PR description so the human can open a separate HIGH-risk flow.
- **Pinned quirk.** `canUserSign` compares an un-normalised `appUser.owner` with a normalised owner, so a lowercase or padded `appUser.owner` never matches. This behaviour is pinned by scenario 14 and not fixed here.
- **Participating owners can differ from the snapshot.** The modal uses `viewedSnapshot.metadata.participatingOwners` for frozen approvals. The queue reads `project.owners` or `project.owner`. If a project's owners are edited after submission, the queue could list or omit a row that the modal treats differently. The modal stays authoritative, since a row only opens it. The limitation goes in `.context/implementation.md` and the PR description.
- **Signing may still be blocked in the modal.** The modal can block signing (snapshot unavailable, or live-preview mode on a Rejected approval) in a way the queue cannot see. The row then opens a document that cannot be signed yet. The modal's own notice explains it.
- **Visibility depends on the dashboard subscription.** An Owner-less non-Admin sees only projects they created. This matches current visibility rules.
- **Waiting time semantics.** `requestedAt` reflects the latest request. A resubmission after rejection resets the wait, which is intended.
- **WI screenshot pipeline.** The panel is always masked out of WI figures (see Proposed design), and the unit tests enforce the markup contract. The real screenshot run is not part of verify, so scenario 22 is a manual optional check.
- **Rollback.** The change is frontend-only with no data or rules changes. Revert the commit. Nothing is deployed in this flow.

### Verification

- Focused tests:
  - `node --import tsx --test src/utils/approvalQueue.test.ts src/components/SigningQueuePanel.test.ts`
  - The existing `src/utils/approvalSnapshot.test.ts`.
  - The WI screenshot tests (`src/utils/wiScreenshot*.test.ts`).
- Scope check: `git diff --name-only <base>` must show **no** change to `firestore.rules`, `storage.rules`, `functions/` or `src/types.ts`. Also confirm that the files under `scripts/` and `src/utils/wiScreenshot*` are unchanged.
- Review: the reviewer reads the `canUserSign` diff in `DesignApprovalModal.tsx` line by line and confirms that the modal imports and calls `canSignAsOwner` with no duplicated predicate.
- Full gate: `npm run verify`
- Manual or browser QA after implementation, synthetic fixtures only, scenarios 17–23. Local or staging only. Do not use production data and do not deploy.

### Deployment

- Target: NONE
- Surface: not applicable (a later Cloudflare frontend deploy is a separate decision)
- Required authorization: none for this flow. Any production deploy of the Cloudflare frontend needs separate explicit human authorization that names the target. Review approval is not deployment authorization.

Status: APPROVED

## Independent review

Feature: waiting-for-my-signature-queue

### Diff reviewed

- Base: eb1c88cf891a4abad5d3a0a618edfcd71a407f68 (`git diff` of the 2 modified tracked files, plus the 4 untracked new files read in full)
- Head: working tree (uncommitted)
- Verification evidence checked: `npm run verify` exit 0 on the current tree, as stated in the stage prompt. `.context/verify.log` was not read, as instructed. `git diff --name-only eb1c88c` lists only `DesignApprovalModal.tsx` and `ProjectsDashboard.tsx`. The other four files are untracked. No change to `firestore.rules`, `storage.rules`, `functions/`, `src/types.ts`, `scripts/` or the WI helpers/specs (plan R4).

### R3: line-by-line read of the `canUserSign` diff (`src/components/DesignApprovalModal.tsx:1259-1263`)

- The three guards `!appUser || snapshotUnavailable || usingLivePreview` are byte-identical and still run first.
- The removed lines are the `approvePlanning`/`approveOM` check, the `Admin` shortcut, and the `appUser.owner && !== 'None' && !== owner` test. They are replaced by `canSignAsOwner(appUser, permissions, owner, level)`.
- `canSignAsOwner` (`src/utils/approvalQueue.ts:17-23`) has the same three statements, in the same order and with the same operators and no normalisation. The only addition is an `if (!appUser) return false` that the modal's guard already makes unreachable. No behaviour change.
- The modal keeps no duplicated owner/level predicate (R1). The only other modal change is one import line.
- Parity is mechanically pinned (R2) by `src/utils/approvalQueue.test.ts` scenario 14. It checks a frozen verbatim copy of the old predicate against the new one over every role, 9 user-owner values (including `itel`, ` ITEL ` and `ItEl`), 4 target owners, both levels, and all 4 level-permission combinations. It also checks undefined permissions, un-normalised owners (which must not match) and Admin with the level permission off.

### Findings

- LOW: Browser scenarios 17-23 are not verified end to end. The emulator and browser tooling were unavailable. The panel tests, the `src/components/SigningQueuePanel.test.ts` mask fixture and the integration test that reads source text give structural evidence only. They do not show real DOM masking, keyboard activation, mobile overflow, the one-minute tick re-rendering only the panel, or sign-then-update through the modal. `.context/implementation.md` states this openly. Run these checks before any release. They are not a code defect.
- LOW: `src/utils/approvalQueue.ts:44` builds the queue from `project.owners` or `project.owner`. The modal uses frozen snapshot `participatingOwners`. If owners are edited after submission, a row can be listed or omitted differently from what the modal shows. This was accepted in the plan, since the modal stays authoritative and a row only opens it. Carry the note into the PR description.
- LOW: The queue does not apply the modal's `snapshotUnavailable` and `usingLivePreview` guards (`src/components/DesignApprovalModal.tsx:1261`). A row can therefore open a document that cannot yet be signed. This was accepted in the plan, and the modal's own notice explains it.
- LOW: `src/components/SigningQueuePanel.tsx:24` re-checks `canSeeSigningQueue`, and the dashboard (`src/components/ProjectsDashboard.tsx:471`) gates on it too. The duplication is harmless and gives defence in depth. Hook order is correct, because the early return comes after all hooks.
- LOW: `src/components/SigningQueuePanel.test.ts` (tests 20-23) asserts on source text with regexes. This is brittle to reformatting, but it does pin the wiring contract (unfiltered `projects`, panel above the filter bar, no `useNow`/`setInterval` in the dashboard, modal delegation).
- LOW (pre-existing, out of scope): `firestore.rules` `canSignApproval` does not check the signer's Owner or Planning/O&M level, so this client predicate is the only gate. This change neither widens nor narrows it. A separate HIGH-risk flow is needed, and the note must go into the PR description.

### Acceptance-criteria result

- [x] Inclusion rules: `approvalQueue.ts:41-49` covers the `Pending Approval` approval status, absent or `Pending Approval` project status, stored stage not `Completed`/`Rejected`, and at least one signable unsigned owner.
- [x] Stage derivation: any participating owner without an `Approved` Planning sign-off puts the project at Planning. Otherwise O&M applies. If both levels are complete, or there are no owners, the project is excluded. This is consistent with the modal's `isPlanningComplete`.
- [x] Permissions: Admin is subject to the level permission. A non-Admin is limited to their own Owner as-is. Viewer and Sub-contract see no panel. `canSeeSigningQueue` follows the specified rule, tested over all 16 combinations.
- [x] `Rejected` and `Pending` sign-offs count as unsigned.
- [x] Row content: name, route code (omitted if empty), document number, stage chip, unsigned owners with the signable ones marked "(คุณลงนามได้)", and the wait text.
- [x] `formatWaiting` floors hours and days and handles null, NaN and negative values. Boundary values are tested.
- [x] Sorting is longest wait first, with null last and ties broken by name. A future `requestedAt` is clamped to 0. Waiting time is measured from the latest `requestedAt`, as the code comment states.
- [x] A row click calls `setApprovalModalProject(row.project)` with the original project object, so the click does not navigate. The row is a native `<button>`.
- [x] The panel receives the unfiltered `projects`, above the filter bar, so search and Owner chips do not affect it. The queue recomputes from live state.
- [x] The one-minute tick and `setInterval` cleanup live inside the panel only.
- [x] WI mask contract: the outer `<section>` carries `data-wi-pii="other-project-card"`, with no `data-wi-project-id`, `aria-label` or `title` on the container. Labels are on descendant buttons. Tests enforce this for the populated and empty states, and the `checkMaskResult` fixtures fail when unmasked.
- [x] `canUserSign` parity (R1-R3) holds, as shown above.
- [x] Scope (R4): no rules, storage rules, Functions or types changes. No deployment was performed.
- [x] `npm run verify` exit 0.
- [ ] Browser/manual QA (scenarios 17-23) is still pending and is recorded as a pre-release gate. It does not block code approval.

### Verdict

No unresolved BLOCKER or HIGH findings.

Verdict: APPROVED
