# approval-history-review-fixes

Archived by `agent-flow` on 2026-10-24 after an approved review.

- Branch: `vpunpum-sudo/เอกสารขออนุมัติ-เพิ่มฟังก์ชั่น-v1`
- Base commit: `029acea`
- Verification: `npm run verify`, Started: 2026-10-24T01:47:37Z, Exit code: 0

Status: APPROVED
Feature: approval-history-review-fixes
Risk: STANDARD. The changes are limited to the read-only history viewer's client-side wording, controller state handling and display formatting. They touch no auth, permissions, Firestore rules, Storage rules, Functions, migrations, CI or deployment config. The isolation scan test already guards the viewer's imports. Nothing is deployed.

### Objective

Fix the review findings from the approved independent review (`.context/f3-review/review.md`) on the uncommitted feature 3 work (approval version history and diff). Spec: `docs/specs/approval-version-history-and-diff.md`. The follow-up fixes:

1. An orphan snapshot no longer claims it "was replaced by the next round's request".
2. Retrying a failed "load more" page re-requests only that page and keeps what is already loaded.
3. Three cheap display cleanups: rounded km totals with a safe `display()` fallback, show-more state kept across `openVersion` and `compare`, and structured time parts so the view stops regex-parsing Thai text.

The feature's scope does not change. The viewer stays read-only and isolated.

### In scope

- `src/utils/approvalHistory.ts`:
  - Outcome wording for non-current entries (finding 1).
  - A structured `timeParts` field on `TimelineEntry`, with `timeLabel` composed from the same parts (finding 3c).
- `src/utils/approvalHistoryController.ts`:
  - Page-scoped retry for a failed append (finding 2).
  - Row-state reset limited to the slot being replaced (finding 3b).
- `src/components/ApprovalDiffSummary.tsx`:
  - Rounded display of the stored-length km totals (before, after and delta).
  - A `display()` fallback that never prints `[object Object]` (finding 3a).
- `src/components/ApprovalHistoryView.tsx`:
  - `localTime` built from `entry.timeParts` instead of a regex on `timeLabel` (finding 3c).
- Regression tests in the existing test files:
  - `src/utils/approvalHistory.test.ts`
  - `src/utils/approvalHistoryController.test.ts`
  - `src/components/ApprovalHistoryView.test.ts`
  - a new test for `ApprovalDiffSummary`, placed in `ApprovalHistoryView.test.ts`, which already renders the diff.
  - Extra fixtures only if needed, in `src/utils/approvalHistory.testFixtures.ts`.

### Out of scope

- Every other LOW item in the review. That includes the stale "current" entry while the panel is open, and the process/browser QA gate.
- `src/components/DesignApprovalModal.tsx`, `firestore.rules`, `storage.rules`, `functions/`, `src/types.ts`, `approvalSnapshot.ts` and `package.json`.
- New source files. The isolation test keeps a closed list of viewer files, so the helpers live in the files above.
- Any rules or Functions change, any deployment, any data model change.
- Changes to the spec's wording table. The code is brought in line with it.

### Acceptance criteria

- [ ] Finding 1, orphan wording:
  - A `not-current` entry's `outcome` is exactly `HISTORY_LABELS.notCurrent`. It never contains `HISTORY_LABELS.replaced`.
  - This applies to orphans with no current approval, and to orphans newer than the current approval.
  - `HISTORY_LABELS.replaced` appears only on an `earlier` entry. That is an entry whose `createdAt` and the current approval's `requestedAt` are both parseable and the entry is not newer, with a different, current approval present.
  - If either time is unparsable, the outcome for that entry is the neutral wording without `replaced`.
  - The current entry's outcome, time labels, kinds, `comparable`, `openable` and default comparison are unchanged.
- [ ] Finding 2, page-scoped retry:
  - If a "load more" page fails, `retry('list')` re-requests only that page, using the stored cursor.
  - Loaded `docs` and `entries`, the `selection` (including the default comparison), and `rows` are preserved through the failure and the retry.
  - The retry makes no direct snapshot get, because pagination never makes one.
  - A page-1 failure still retries from the start, including the direct get.
  - A response arriving after `close`, a session change or `dispose` is still discarded and counted in `staleDropped`.
  - The "retry from the failed page" marker is reset on `open`, `close` and session change, and cleared on success.
- [ ] Finding 3a, display cleanups:
  - Stored-length km totals (`before`, `after`, `delta`) render rounded to at most 3 decimals, with no float tails and no trailing zeros. `0.1 + 0.2` prints `0.3`.
  - Other totals (routes, enclosures, loops, routes without stored length) keep printing their integers.
  - `display()` never returns `[object Object]`:
    - An unrecognised plain object returns `-`.
    - Arrays whose elements are objects are mapped through `display()`.
    - A known shape with a malformed field, such as a non-numeric `movedMetres`, does not throw.
- [ ] Finding 3b, show-more state:
  - `openVersion` clears only the `version/*` row keys and keeps `diff/*`.
  - `compare` clears only the `diff/*` row keys and keeps `version/*`.
  - Expanding a diff, then opening a version, leaves the diff expanded.
- [ ] Finding 3c, structured time parts:
  - `TimelineEntry` gains `timeParts: { prefix: string; time?: string; suffix?: string }`.
  - `timeLabel` equals `${prefix} ${time}${suffix}` when `time` is set, and keeps its current text for unknown-time, invalid, legacy and unavailable entries.
  - `ApprovalHistoryView` formats `time` through `formatTime` using `timeParts` only. It contains no regex over `timeLabel`.
  - The timeline label and the version summary header both receive the localised text, as before.
- [ ] The isolation scan test passes unchanged, with no new files and no new imports outside the allowed list.
- [ ] `npm run verify` passes.
- [ ] `git diff --name-only` shows no change to `DesignApprovalModal.tsx`, `firestore.rules`, `storage.rules`, `functions/` or `src/types.ts` beyond what the previous flow already left uncommitted.
- [ ] No deployment. No credentials in any file.

### Acceptance scenarios

1. **Table-driven timeline outcomes** (`approvalHistory.test.ts`). Each row builds the timeline and asserts `kind`, `outcome`, `timeLabel`, `timeParts`, `openable` and `comparable`:
   - Orphan, no current approval (`current = null`): `not-current`, outcome equals `notCurrent` only, `timeParts.suffix` is the "ไม่ยืนยันว่ายื่นสำเร็จ" text.
   - Orphan newer than the current approval: the same expectations, and the current entry is unchanged.
   - Orphan with equal `createdAt` and `requestedAt`: treated as `earlier` (existing strict `>` behaviour), outcome is `earlier` plus `replaced`.
   - Orphan older than the current approval, hence `earlier`: outcome is `earlier` plus `replaced`.
   - Replaced by a newer round: a different current approval with a later `requestedAt` and a different `snapshotId`. The older snapshot gets `earlier` plus `replaced`, a "บันทึกเมื่อ …" time label and no "ไม่ยืนยัน" suffix.
   - Unparsable `createdAt` or `requestedAt`: the outcome contains no `replaced` text.
   - Backfill lock, current backfilled entry: `current-backfilled`, prefix "ล็อกเมื่อ", no suffix, outcome built from status and stage.
   - Backfill lock, non-current backfill snapshot: prefix "ล็อกเมื่อ", never the "ไม่ยืนยัน" suffix, submitter "ไม่ได้เก็บชื่อผู้ยื่นไว้".
   - Legacy current approval (no `snapshotId`): pinned `current-legacy-live`, not openable or comparable, no snapshot get, `timeLabel` equals `HISTORY_LABELS.legacy`, `timeParts.time` undefined.
   - Current snapshot unavailable: `current-unavailable`, generic unavailable text.
   - Invalid metadata entry: `invalid`, "บันทึกเมื่อ ไม่ทราบเวลา", `timeParts.time` undefined.
   - Every row asserts the raw uid and email never appear in any rendered field.
2. **Page-2 failure then retry** (`approvalHistoryController.test.ts`, fake loader):
   - Open and load page 1 with 20 docs. `paginate()` with a page that throws moves `list.status` to `error`, and entries, docs, cursor, selection and rows are unchanged.
   - Switch the fake to succeed and `retry('list')`. The loader is called for page 2 only, with the same cursor.
   - The metadata call count does not increase.
   - Entries now include page 2, the default comparison selection is unchanged, and a chosen non-default selection is also unchanged.
   - Expanded rows (`rows`) are preserved.
3. **Page-1 failure retry**: `open` with a failing first page, then a successful `retry('list')`. It restarts page 1 and calls the direct get again. The existing test stays green.
4. **Repeated page-2 failure**: a second failure leaves the state retryable and keeps the loaded pages. A third attempt succeeds.
5. **Stale after close** (using deferred promises):
   - Start a page-2 request, `close()`, then resolve the request. The state stays idle and `staleDropped` increments.
   - After a reopen, no page-2 retry marker leaks. `retry('list')` restarts at page 1.
   - A failed page-2 request that rejects after `close` is also discarded.
   - Session change and `dispose` behave the same.
6. **Rows state** (controller test): set `rows` for `diff/routes` and `version/loops` via `showMoreRows`.
   - `openVersion` keeps `diff/routes` and clears `version/loops`.
   - `compare` keeps `version/loops` and clears `diff/routes`.
7. **Km totals rounding** (`ApprovalHistoryView.test.ts`, or a direct export test): render a diff whose `storedRouteLengthKm` totals come from `0.1 + 0.2` and `12.345000000000001`. The markup contains `0.3` and `12.345` and no 8-or-more-decimal tails. A plain integer total such as routes `3 → 4` is unchanged.
8. **`display()` safety**: a table of inputs asserts the output string:
   - `undefined`, `null`, empty array.
   - An array of objects.
   - `{ foo: 1 }` gives `-`.
   - `{ movedMetres: 'x' }` does not throw.
   - `{ points: 3 }`, `{ lat, lng }` and a plain string keep their current output.
   - `[object Object]` never appears in any result.
9. **Time parts in the view**: the view test sets an entry's `timeLabel` to a deliberately different string while keeping valid `timeParts`. The rendered output uses `prefix + formatTime(time) + suffix` and not the label text. Entries without `time` render `timeLabel` verbatim and `formatTime` is not called for them. The version summary header shows the localised time.
10. **Regressions**:
    - The existing tests 8 to 14 from the previous flow still pass.
    - The Draft-with-orphans view still renders "ไม่ยืนยันว่ายื่นสำเร็จ" and `บันทึกเมื่อ LOCAL TIME`.
    - The default comparison is unchanged.
    - The isolation test, including the modal import and element assertions, passes.
    - The viewer still performs no writes. The service imports only the read APIs.
11. **Permissions**: this change adds no permission surface. The button is still gated by `viewApprovalDocs`, and a user without it sees no entry button and triggers no read. The existing view and isolation tests cover this and must stay green.

### Proposed design

All changes are in-memory presentation or controller logic. No new reads, writes, imports or dependencies.

**Finding 1** (`approvalHistory.ts`, outcome for non-current entries):
- Replace the combined string `${orphan ? notCurrent : earlier} · ${replaced}` with a branch.
- Orphan: `HISTORY_LABELS.notCurrent`.
- `earlier`: `${HISTORY_LABELS.earlier} · ${HISTORY_LABELS.replaced}` only when `current` exists and both `m.createdAt` and `current.requestedAt` parse to finite numbers. This is the "derivably older than a different current approval" condition.
- `earlier` with an unparsable time: `HISTORY_LABELS.earlier` alone.
- In the current code, a `NaN` comparison falls through to `earlier`. That is why the explicit finite check is needed.
- Do not change `kind` assignment, `HISTORY_LABELS` text or the spec.

**Finding 2** (`approvalHistoryController.ts`):
- Add a marker for a failed append, for example `list.retryAppend?: boolean`, or a closure flag reset in `clear` and `open`. State is preferred, so it is reset by `initialHistoryState`.
- In the `catch` of `listRequested`, set the marker to `append` while keeping `...prior` (entries, docs, cursor, `hasMore`, `fetchedCount`, `currentLookup`) and `status: 'error'`.
- On success, clear the marker.
- `retry('list')` calls `listRequested(state.list.retryAppend === true)`.
- The existing append guard stays: it needs `hasMore` and `fetchedCount < MAX_FETCHED_DOCS`, both preserved from `prior`.
- The selection already persists on append, and `rows` is carried by the `...state` spread.
- The `valid()` guard is unchanged, so stale responses are dropped.
- The view keeps rendering the loaded entries beside the error banner. It does that today, because `entries.map` is not gated on status.

**Finding 3a** (`ApprovalDiffSummary.tsx`):
- Add an exported pure helper `formatTotalValue(key, n)`. For `storedRouteLengthKm` it rounds with `Number(n.toFixed(3))`, and `String()` of that drops trailing zeros. Other keys pass through.
- `-0` must print `0`, so normalise it.
- Use the helper for `before`, `after` and `delta`.
- Export `display` and harden it:
  - Unknown objects return `-`.
  - Arrays are mapped through `display`.
  - `movedMetres` is guarded with `typeof === 'number'`.
  - The helper is exported only so tests can call it.

**Finding 3b** (controller):
- Add a tiny helper `withoutRows(rows, keep: (key) => boolean)`.
- `openVersion` keeps keys starting with `diff/`.
- `compare` keeps keys starting with `version/`.
- The key names come from the existing `version/` and `diff/` prefixes in the two summary components.

**Finding 3c** (`approvalHistory.ts`, `ApprovalHistoryView.tsx`):
- Introduce `historyTimeParts(meta, current, notCurrent)` returning `{ prefix, time?, suffix? }`.
- `historyTimeLabel(meta, current, notCurrent, format)` becomes a thin composer over the parts. It keeps its signature and current output, so the existing tests pass.
- `TimelineEntry` gets `timeParts`. The invalid, legacy and unavailable entries set `{ prefix: <label> }` with no `time`, and keep their `timeLabel`.
- In the view, `localTime(entry)` is `entry.timeParts.time ? `${prefix} ${formatTime(time)}${suffix ?? ''}` : entry.timeLabel`. The regex is deleted.

**Error handling and security:**
- No new data is read or rendered.
- The submitter privacy rules are unchanged and still asserted in tests.
- A failed retry shows the same Thai error text as before.

### Expected files

- `src/utils/approvalHistory.ts`
- `src/utils/approvalHistoryController.ts`
- `src/components/ApprovalDiffSummary.tsx`
- `src/components/ApprovalHistoryView.tsx`
- `src/utils/approvalHistory.test.ts`
- `src/utils/approvalHistoryController.test.ts`
- `src/components/ApprovalHistoryView.test.ts`
- `src/utils/approvalHistory.testFixtures.ts`, only if a fixture such as a controllable multi-page fake loader or a custom `createdAt` is needed.

### Risks and rollback

- **Isolation scan:**
  - Adding a new file or import would fail it.
  - Mitigation: reuse the existing files and import nothing new.
- **Marker handling:**
  - A leaked retry marker could make `retry('list')` request a page after a reopen.
  - Mitigation: keep the marker in `HistoryState.list`, so `initialHistoryState` resets it on `open`, `close` and session change. Scenario 5 covers it.
- **Consumers of `timeParts`:**
  - Adding a required field could break fixtures that build `TimelineEntry` literals.
  - Mitigation: update the fixtures and `tsc` will point at each one. `npm run build` is part of the gate.
- **Wording regression:**
  - Existing assertions about `earlier` entries could depend on the old combined text.
  - Mitigation: the table-driven test pins both branches.
- **Rollback:** the work is uncommitted and touches only the files above. Reverting these files returns to the approved state.

### Verification

- Focused tests:
  - `node --import tsx --test src/utils/approvalHistory.test.ts src/utils/approvalHistoryController.test.ts src/utils/approvalHistoryIsolation.test.ts src/components/ApprovalHistoryView.test.ts src/utils/approvalSnapshotDiff.test.ts`
- Full gate: `npm run verify`
- Scope check: `git diff --name-only` must not list `DesignApprovalModal.tsx`, `firestore.rules`, `storage.rules`, `functions/` or `src/types.ts` beyond what the previous flow already left uncommitted. Compare against the status snapshot, where only `DesignApprovalModal.tsx`, `wiScreenshotMaskSpec.ts` and `wiScreenshotMaskSpec.test.ts` were modified.
- Out of this gate: the owner-run browser QA and zero-write evidence from the review remain a pre-release step.

### Deployment

- Target: NONE
- Surface: not applicable
- Required authorization: none. This is local, uncommitted work. Any later deployment needs separate explicit human authorization naming the target.

Status: APPROVED

## Independent review

### Diff reviewed

- Base: the uncommitted approval-history feature (feature 3) left by the previous flow, plus the pre-follow-up baseline in `.context/history-follow-up-baseline/`. The tree is untracked or uncommitted relative to `029acea`.
- Head: the current working tree. I read the final contents of `src/utils/approvalHistory.ts`, `src/utils/approvalHistoryController.ts`, `src/components/ApprovalDiffSummary.tsx`, `src/components/ApprovalHistoryView.tsx` and the consumer `src/components/ApprovalVersionSummary.tsx`. I read the source files directly because Bash was denied. I did not diff against the baseline copies or re-read the test files line by line.
- Verification evidence checked: the stage statement that `npm run verify` passed on the current tree (exit 0), and the implementer's report of 49/49 focused tests and 296/296 frontend tests. `git status` shows the same file set as the pre-follow-up snapshot. Only the seven expected files plus the already-uncommitted modal and screenshot-mask files changed, with no new source files. `src/types.ts`, the rules files and `functions/` are not listed.

### Findings

- None at BLOCKER or HIGH severity.
- LOW: `src/components/ApprovalDiffSummary.tsx:23-25`. `formatTotalValue` does not guard non-finite input. `NaN` or `Infinity` would print as `NaN` or `Infinity`. The diff totals are computed from sanitised numbers, so this is not reachable today, and the plan did not require a guard.
- LOW: `src/utils/approvalHistoryController.ts:71`. `retryAppend` is also carried through the `loading` state via `...prior`. That is harmless because every reset path (`open`, `close`, `sessionChange`, `dispose`) goes through `initialHistoryState`, and success replaces the whole `list` object. A short code comment would help a future reader.
- LOW: `src/utils/approvalHistory.ts:82-88`. The `orphan` and `earlier` classification still uses the strict `>` on `Date.parse`, so an unparsable time falls through to `earlier`. The finite-time check on the `replaced` suffix handles this correctly, as the plan intended. The branch is dense on one line, but I found no behavioural defect.
- LOW (carried over, out of scope): the stale "current" entry while the panel is open, and the owner-run browser QA and zero-write evidence, remain pre-release gates.

### Acceptance-criteria result

- [x] Finding 1, orphan wording. Non-current entries get exactly `HISTORY_LABELS.notCurrent` (`approvalHistory.ts:88`). `replaced` is appended only on an `earlier` entry when `current` exists and both `createdAt` and `requestedAt` parse as finite. An unparsable time gives `earlier` alone. The current entry's outcome, kinds, `openable` and `comparable` are unchanged. The default comparison logic is untouched.
- [x] Finding 2, page-scoped retry. A failed append keeps `...prior` (entries, docs, cursor, `hasMore`, `fetchedCount`, `currentLookup`) and sets `retryAppend: append` (`approvalHistoryController.ts:71`). `retry('list')` passes `state.list.retryAppend === true` (line 108). On append, the page request uses the stored cursor and skips the direct snapshot get (lines 51-52). `selection` and `rows` are preserved by the `...state` spread. A page-1 failure sets `retryAppend: false`, so the retry restarts from the start with the direct get. Stale responses are still gated by `valid()` and counted in `staleDropped`. The marker lives in `HistoryState.list`, so `initialHistoryState` resets it on `open`, `close` and session change. Success replaces the list object, which clears it.
- [x] Finding 3a, display cleanups. Km totals (`before`, `after`, `delta`) go through `formatTotalValue`, which uses `Number(value.toFixed(3))` (`ApprovalDiffSummary.tsx:23-24`, `:30`). That rounds to 3 decimals, drops trailing zeros and normalises `-0` to `0`. Other keys print unchanged. `display()` is exported. Unknown objects return `-`, arrays are mapped through `display`, and `movedMetres` is guarded with `typeof` and `Number.isFinite`. It cannot return `[object Object]`.
- [x] Finding 3b, show-more state. `openVersion` keeps only keys starting with `diff/` (line 78). `compare` keeps only keys starting with `version/` (line 90). The `withoutRows` helper takes a keep predicate. Expanding a diff and then opening a version leaves the diff expanded.
- [x] Finding 3c, structured time parts. `TimelineEntry.timeParts` exists and is set on current, earlier, not-current, invalid, legacy and unavailable entries. `historyTimeLabel` composes from `historyTimeParts`. `ApprovalHistoryView.localTime` builds from `timeParts` and falls back to `timeLabel` when there is no `time`. No regex over `timeLabel` remains. The version summary header receives the same localised text (`ApprovalHistoryView.tsx:36`, `ApprovalVersionSummary.tsx:21`).
- [x] Isolation. No new source files and no new imports outside the allowed list. The view imports only from `approvalHistory`, `approvalHistoryController`, `ApprovalVersionSummary` and `ApprovalDiffSummary`.
- [x] `npm run verify` passes, per the stage statement (exit 0).
- [x] The modal, rules, Functions and types are unchanged beyond what the previous flow left uncommitted.
- [x] No deployment and no credentials in the reviewed files.
- [x] The privacy rules for the submitter label (`safeSubmitterName`, `submitterLabel`) are unchanged.

### Verdict

Verdict: APPROVED
