# approval-version-history-and-diff

Archived by `agent-flow` on 2026-10-24 after an approved review.

- Branch: `vpunpum-sudo/เอกสารขออนุมัติ-เพิ่มฟังก์ชั่น-v1`
- Base commit: `029acea`
- Verification: `npm run verify`, Started: 2026-10-24T01:32:58Z, Exit code: 0

Status: APPROVED
Feature: approval-version-history-and-diff
Risk: STANDARD — the change is frontend-only and read-only, and it is isolated from every write path by construction. The viewer is a separate component tree with its own state. It imports no write, export or callable API. It never imports `DesignApprovalModal` or any of its state, handlers, permission flags or effects, so it cannot reach sign, reject, rewind, lock or the `createFinalDocuments` effect. `firestore.rules`, `storage.rules`, `functions/`, `src/types.ts` and the stored data model do not change. These isolation properties are hard requirements, enforced by a deterministic source-scan test with forbidden tokens, an import allowlist, positive and negative controls (see "Isolation by construction"). The risk becomes HIGH, and the implementer must stop and return to the human, if any of these happens:
- The implementation needs to touch any `DesignApprovalModal.tsx` logic beyond the single entry-point element and its import.
- The viewer needs a write, export or callable API, or any binding from `src/firebase.ts` other than `db`.
- A rules, `functions/` or stored-shape change turns out to be unavoidable.

### Objective

Feature 3 of 7 in the approval-usability series. Features 1 and 2 are committed as 72446be and 029acea. This flow covers only feature 3. Reminders, saved signature, in-app notifications, delegate signer and Admin bulk legacy lock are separate flows.

Today a user can only open the current approval's document. A resubmission after a rejection creates a new approval id and a new snapshot. The old snapshots stay in Firestore, but nobody can see them or see what changed.

**Scope decision from the owner.** The history feature is a separate read-only viewer, not a historical mode inside `DesignApprovalModal`. The viewer never renders the approval slides and never reuses the modal's state. It has three parts:

1. A timeline of the project's snapshots, newest first.
2. For a selected version, a compact read-only summary rendered by new components only: project name, route code, participating owners, saved or locked time, counts, and capped read-only tables of its routes, enclosures and loops.
3. A "what changed" summary between two selected versions, computed by a pure, unit-tested comparison util.

The modal gains only an entry-point button. The scope is unchanged by feedback rounds 3 and 4. Round 3 settled how closing the panel cancels pending loads, how the current snapshot is resolved when it is outside the loaded page, and how the zero-write browser evidence is attributed. Round 4 settles the scanner's `Timestamp` exception, states the exact limits of the browser evidence, and fixes where the controller and resident cache live so that close-and-reopen reuse is real.

#### What the stored data can and cannot tell us

The facts below were checked against `ApprovalSnapshotMetadata`, `DesignApproval` and `approvalSnapshotService.ts`. The UI states them honestly and invents nothing.

| Item | Derivable? | Rule |
|---|---|---|
| Approval id, snapshot id, `createdAt`, `createdByUid`, `backfill` flag | Yes, from snapshot metadata | Always available to the logic. The raw uid is never rendered. |
| Project name, route code, owners and participating owners at the time | Yes, from `metadata.project` and `participatingOwners` | Shown in the version summary and in the diff. |
| Document number | Only for the current approval (`designApproval.documentNumber`) | Metadata has no `documentNumber`. Other entries show a short approval id (`appr_xxxxxxxx`) and "ไม่ได้เก็บเลขที่เอกสารไว้". It is not reconstructed from the `APP-YYYYMM-…` pattern. |
| Time label | Depends on the entry (see wording below) | The same wording is used in the timeline and in the version summary header. |
| Who submitted | Current approval: `requestedBy`. Other entries: `createdByUid` only | A name is shown only when the uid equals the signed-in user ("คุณ", non-backfill snapshots only). Otherwise "ไม่ได้เก็บชื่อผู้ยื่นไว้". The uid is never rendered. `users/{uid}` is readable only by its owner or an Admin, so there is no profile lookup. For a backfill snapshot `createdByUid` is the Admin who locked it, not the submitter. |
| Outcome of the current round | Yes, from the plain-data summary of `designApproval` | Status, stage text and `rejectionReason` if `Rejected`. |
| Outcome of an earlier round | No | The old `designApproval` is overwritten on resubmission. The UI says "ผลของรอบนี้และเหตุผลที่ถูกปฏิเสธไม่ได้ถูกเก็บไว้ (ถูกแทนที่ด้วยคำขอรอบถัดไป)". It never claims "ปฏิเสธ" for an earlier round, because replacement also follows an Admin rewind to Draft. |
| Failed or abandoned submissions | Cannot be told apart from earlier rounds | The snapshot is written before the attach transaction, so a failed attempt leaves an orphan. Non-current entries say "คำขอรอบก่อน หรือการยื่นที่ไม่สำเร็จ (แยกไม่ได้จากข้อมูลที่เก็บ)". |
| Snapshot newer than the current approval, or no current approval | Derivable by comparing times | "ไม่ใช่คำขอปัจจุบัน (ยื่นไม่สำเร็จ หรือถอยกลับเป็นร่างแล้ว)". It does not claim a successful submission. |
| Approval-level content of any round | Not in snapshots | Sign-offs, signatures, contractor fields, notes, `routeEnclosureSelections` and distance inputs are not stored. The viewer never shows them. A one-line note says so. |
| Legacy current approval (no `snapshotId`) | Only as the current approval | A pinned entry "ข้อมูลสด ยังไม่ล็อก — ไม่ใช่เวอร์ชันที่ถูกแช่แข็ง". It is not openable and not comparable. No direct snapshot get is made for it. A legacy approval replaced before any lock left no snapshot and appears nowhere. A one-line note says so. |
| Retroactively locked approval | Yes (`snapshotId !== id`, `backfill: true`) | Contents are project data at lock time, not at submission time. |
| Current snapshot outside the loaded page | Resolved by one direct get, never inferred from the page | See "Discovery" and "Current-snapshot resolution". Absence from the page is not evidence that the snapshot is missing. |

**Time-label wording (applies to the timeline row and the version summary header):**
- Current approval with a normal snapshot: "ยื่นเมื่อ <requestedAt>".
- Backfill snapshot (current or not): "ล็อกเมื่อ <createdAt>". It is not called a submission time.
- Normal snapshot that is not current: "บันทึกเมื่อ <createdAt>". It does not claim the submission succeeded.
- Normal snapshot newer than the current approval, or with no current approval: "บันทึกเมื่อ <createdAt> (ไม่ยืนยันว่ายื่นสำเร็จ)".
- Unparseable or unknown time: "บันทึกเมื่อ ไม่ทราบเวลา".

**Discovery.** There is no existence probe. The "ประวัติคำขอ" button is always shown inside the modal to users with `viewApprovalDocs`, including when there is no current `designApproval`. No history read happens until the user opens the panel. The reads made on open are exactly: one page of snapshot metadata, and, only when the current approval has a `snapshotId`, one bounded direct get of `approvalSnapshots/{snapshotId}` (the current snapshot's metadata document). Both are issued together as the list slot. No child or `index` reads happen on open. An empty result shows "ไม่พบเวอร์ชันก่อนหน้า". Scenario 10 (Admin rewind to Draft) is reachable through the real UI: open the modal on a Draft project, click the button, and the orphan snapshots are listed.

**Current-snapshot resolution.**
- The direct get is the only authority on whether the current snapshot exists. A current entry that is simply not in the loaded page is shown as a normal, openable, comparable entry. This holds when newer orphan snapshots push it beyond the first page or beyond the 100-document cap.
- The direct get returns one of: `found` (id and raw data), `missing`, or `error` (permission or network failure). The raw data goes through `parseSnapshotMetadata` like any page document.
- `current-unavailable` is reserved for the case where the direct get returned `missing`, `error` or metadata that fails validation AND the page has no valid document for that snapshot id. Its text is "ไม่พบข้อมูลของเวอร์ชันนี้". It is not openable and not comparable, and the rest of the timeline still renders.
- **The message is generic by design.** The service tells the three outcomes apart internally, but the UI shows the same text for all of them. It does not distinguish a missing snapshot from a permission or network failure, and the plan does not claim that it does.
- **Page fallback.** If the page already contains a valid document for the current snapshot id, that page entry is used and stays a normal, openable, comparable current entry, even when the direct get failed or returned invalid data. A failed direct get is then irrelevant to the entry.
- The entry is de-duplicated against the page by snapshot id. It is placed by its `createdAt` like any other entry. Legacy and `current-unavailable` entries have no usable `createdAt`, so they are pinned at the top.
- The direct get happens once per list request. Pagination does not repeat it. A list retry re-issues both the page and the get.

### In scope

- **Entry point and host.** A new `ApprovalHistoryEntry` component holds the button, the open or closed state, and the overlay mount. It is also the modal-level host of the history session.
  - `DesignApprovalModal.tsx` gains one import line and one JSX element and nothing else. The only history module the modal references is `ApprovalHistoryEntry`. The element is `{permissions?.viewApprovalDocs && <ApprovalHistoryEntry project={project} uid={appUser?.id} />}`, and it may span several lines for formatting.
  - `ApprovalHistoryEntry` receives the read-only `project` object only as input data. Inside the entry, it calls `summarizeCurrentApproval(project)` (memoised) and hands the resulting plain data to the controller when the panel opens. The modal therefore never imports `summarizeCurrentApproval` or any other history module.
  - The element sits in the modal's header toolbar next to "สไลด์นำเสนอ", in a position that renders whether or not a `designApproval` exists. The challenger confirmed the toolbar at `DesignApprovalModal.tsx:2513-2524` is unconditional.
  - The existing conditions around that toolbar must not be altered. If no always-rendered position exists without changing existing conditional logic, the implementer stops and returns to the human.
  - The modal adds no state, handler or effect for history. The required line-by-line review of the complete modal diff remains in force, because the source test alone does not prove the whole diff is limited to the permitted lines.
  - `summarizeCurrentApproval` returns plain serialisable data, with no functions and no handles. It carries only: approval id, snapshot id, document number, status, stage text, requested time, requested-by name, rejection reason, a backfilled flag and the lock time as an ISO string. It is exported from `src/utils/approvalHistory.ts`.
- **History session lifetime (host-owned).**
  - The controller and its resident cache live in one session object (controller, reader and cache) created lazily by `ApprovalHistoryEntry` on the first open, keyed on `projectId` + `uid`. Creating it performs no I/O.
  - The session outlives the panel's mount. Closing the panel overlay calls `controller.close()` only: it detaches the view, cancels pending loads and clears UI state, but keeps resident snapshots. Reopening the panel in the same session reuses resident snapshots without a re-read.
  - The session is disposed (`controller.dispose()`, which calls `resetSession()` and clears the cache) when the `projectId` or `uid` changes, or when the entry unmounts (the modal closes). The host then creates a fresh session for the new key. A different user therefore never sees another user's resident snapshots, and no cache outlives the modal.
  - `dispose()` is idempotent, so a React strict-mode double effect cannot leave a disposed session in use. A disposed controller is inert: later calls do nothing and late settlements are counted as stale.
  - The lifetime is reviewed together with the controller tests (see scenarios 7 to 9).
- **Panel props (read-only).** The controller (the session handle exposing `getState`, `subscribe` and the action methods) and a locale formatter. The panel receives no `permissions`, no `appUser` object, no `project` object, no reader, no handlers and no modal state.
- **Pure util `src/utils/approvalHistory.ts`.**
  - It exports the single constant `HISTORY_ROW_CAP = 200`, which other viewer modules import.
  - `parseSnapshotMetadata(docId, data, projectId)` never throws. It returns `{ ok: true, meta }` or `{ ok: false, reason }`. It validates before any consumer reads a field:
    - `data` is a non-null plain object.
    - `id === docId`, `projectId` matches, `schemaVersion === 1`.
    - `approvalId`, `createdAt` and `createdByUid` are non-empty strings.
    - `project` is an object with a string `name`. `routeCode` and `owner` are strings if present. `owners` is an array of valid `CoreOwner` strings if present.
    - `participatingOwners` is an array of valid `CoreOwner` strings.
    - The backfill shape matches `resolveApprovalSnapshot`: `backfill` is absent or exactly `true`, and `id !== approvalId` exactly when `backfill === true`.
    - If `ids` is present it is an object. If `idIndex` is present it is `{ mode: 'chunked', chunkCount: positive integer }`.
  - The sanitised `meta` it returns keeps only the fields the viewer needs. It drops the large `ids` arrays so timeline memory stays small.
  - `buildApprovalTimeline(currentApproval, parsedDocs, uid, currentLookup)` returns entries sorted newest first, with invalid times last and ties broken by id. `currentLookup` is the settled result of the direct get (`found`, `missing`, `error`, or absent when there is no `snapshotId`). Each entry has: `kind` (`current-frozen`, `current-backfilled`, `current-legacy-live`, `current-unavailable`, `earlier`, `not-current`, `invalid`), document-number or short-id label, time label, submitter label, outcome text, and `openable` and `comparable` flags.
    - The current approval is matched on `snapshotId`, not on `approvalId`.
    - The current entry is built from the plain-data summary plus the metadata from the page or the direct get, with the page fallback and de-duplication described under "Current-snapshot resolution".
    - A current entry that is not in the page but whose direct get returned valid metadata is `current-frozen` or `current-backfilled`, openable and comparable.
    - `current-unavailable` is produced only when the direct get is `missing`, `error` or invalid and the page has no valid document for that id.
  - `pickDefaultComparison(timeline)` treats `current-frozen` and `current-backfilled` as the current frozen entry. Base = the nearest older comparable entry before the current frozen one among the loaded entries, and target = the current frozen one. With no current frozen entry it uses the two newest comparable entries. It returns `null` when fewer than two entries are comparable. It only preselects, and the user can pick any two comparable loaded versions. Nothing is loaded until the user clicks compare. If the current entry is outside the loaded page and no older comparable entry is loaded, the result is `null` and the user picks manually.
  - The Thai label constants and the time-label function are exported and shared with the components.
- **Pure util `src/utils/approvalSnapshotSummary.ts`.** `summarizeSnapshot(snapshot)` returns exact counts for routes, enclosures and loops, plus row models for three compact tables. Rows are not capped here. The component slices them to the render cap.
  - Routes: name, owner(s) (`owners`, else distinct core owners), capacity and the stored `totalLength` shown as "ความยาวที่บันทึกไว้". A route with no stored length shows "ไม่ได้บันทึกไว้". Length is never computed from `path`. The UI notes that this may differ from the modal's schedule total, which falls back to path-derived values and rounding.
  - Enclosures: name, enclosure type name (resolved from the snapshot's `enclosureTypes`, else "-"), and the distinct owners found in `trayAssignments` and `portAssignments`.
  - Loops: name and stored `length`.
  - It never throws on malformed items. Items that are not objects or have no string `id` are counted in a `skippedMalformed` figure.
- **Pure util `src/utils/approvalSnapshotDiff.ts`: `diffApprovalSnapshots(base, target, opts?)`.** It takes `{ metadata, collections }` for each side. It is deterministic, never throws and does no I/O.
  - Items in `routes`, `enclosures` and `loops` are matched by `id`. Collection order is irrelevant. For each category it returns `added`, `removed`, `changed` (each with the changed fields as label, before and after) and an exact `unchangedCount`.
  - Routes compare: `name`, `capacity`, `fiberType`, `tier`, `owners` and `tierSharingPartners` (set compare), `startEnclosureId`, `endEnclosureId`, stored `totalLength`, path geometry, and core owner assignments (count of cores whose owner changed).
    - Path geometry reports the point count before and after, whether the start or end moved, and whether any vertex moved beyond the tolerance. Vertex order matters, so a reversed path is a change.
    - It does not derive a length from `path`.
  - Enclosures compare: `name`, `position` (moved by N metres, via `getDistance`), `enclosureTypeId`, `locationType`, `locationName`, and tray and port owner assignments (count changed).
  - Loops compare: `name`, `position`, `routeId` and `length`.
  - **Ownership keys.** Ownership and assignment comparison keys on stable identifiers and never on array position: a route's cores by `Core.id`, an enclosure's tray assignments by their tray key and its port assignments by their port key (the `Record<number, …>` keys of `trayAssignments` and `portAssignments`). An identifier present on one side only counts as a change for that identifier. Reordering nested arrays or object keys produces no ownership-change counts.
  - **Coordinate tolerance.** A named constant, 1e-7° (about 1 cm). A smaller difference counts as unchanged, so float noise is not reported.
  - **Project level.** Changes to `name`, `routeCode`, `owner` and `owners`, plus `participatingOwners` added and removed, order-insensitive.
  - **Totals.** Counts of routes, enclosures and loops, each with before, after and delta. Also total stored route length in km (sum of stored `totalLength > 0`, divided by 1000) and the number of routes without a stored length on each side.
  - **Detail cap by early exit.** Counts always cover everything. Detail objects are collected only up to `opts.detailLimit` per category (default `HISTORY_ROW_CAP`, 200). The cap is implemented by early exit while counting: once a category's detail list holds the limit, the loop keeps incrementing exact counts and `truncated` but does not build further detail objects, and does not first build a full list and then slice it. The detail builders are reachable through an injectable factory seam (or an equivalent counting hook) so a test can count how many detail objects were created.
  - **Malformed input.** The following do not throw. They are counted in `warnings` (`skippedMalformed`, `duplicateIds`) and excluded from the diff: a collection that is missing, null or not an array; null or primitive items; items without a string `id`; non-finite coordinates; a route with no `path` array; duplicate ids (first wins).
  - It is O(n) using `Map`s. Deep equality for nested assignment fields has a depth cap.
- **Pure controller `src/utils/approvalHistoryController.ts`.** It imports no React and no Firebase. Two exports:
  - A reducer over the state described under "Isolation by construction".
  - `createHistoryController({ reader, onChange })`, a thin runner that dispatches actions and runs the injected reader's promises. It exposes `getState`, `subscribe` (so views attach and detach without affecting the session), `open(currentApproval)`, `close()`, `dispose()` and the other action methods.
  - Panel state transitions go through this controller. The panel component is only a shell over it.
  - The reader contract the controller depends on is: `listPage`, `getSnapshotMetadata`, `loadSnapshot`, `cancelPending()` and `resetSession()`. Tests inject a fake with deferred promises.
- **Pure util `src/utils/approvalSnapshotReader.ts`.** `assembleSnapshotFromDocs(...)` takes raw metadata data, index documents and per-collection documents, and applies the same identity checks as `readApprovalSnapshot`, then calls `resolveApprovalSnapshot` for the ID-set validation and contains no write-preparation code. It reproduces these checks: metadata `projectId`, `approvalId`, doc id and `id`; index chunk identity; child wrapper `projectId`, `approvalId` and `data.id === doc id`. It throws `IncompleteApprovalSnapshotError` on any mismatch. Because `approvalSnapshotService.ts` also exports write functions, the viewer must not import it. This pure function keeps the viewer's loading logic unit-testable and identical in strictness.
- **Pure cache `src/utils/approvalSnapshotCache.ts`.**
  - An LRU of at most 8 resident snapshots, keyed `uid/projectId/snapshotId`.
  - A resident snapshot is not re-read. An evicted snapshot is re-read when reopened.
  - **In-flight dedup key.** Concurrent requests share one in-flight promise only when they have the same snapshot key AND the same load generation. After `cancelPending()`, a request for the same key starts a fresh load and never reuses the pre-cancel promise.
  - A failed load is never cached.
  - **`cancelPending()`** bumps the load generation. Every load started before it is discarded when it settles: it populates neither controller state nor the cache. Resident entries are preserved, because they are immutable and tied to the same session key. A resident entry is still returned without a re-read after `cancelPending()`.
  - **`resetSession()`** does everything `cancelPending()` does and also clears all resident entries.
  - A load checks the load generation (captured at start) when it settles, before it writes into the cache.
  - `close` calls `cancelPending()`. `dispose` and a project or uid change call `resetSession()`.
- **Service `src/services/approvalHistoryService.ts`** (new). It is the only module in the viewer graph that touches Firestore, and it is read-only.
  - It imports only read APIs (`collection`, `doc`, `getDoc`, `getDocs`, `query`, `orderBy`, `limit`, `startAfter`, `where`) plus the `db` binding from `../firebase`. Type-only imports of Firestore types are allowed.
  - It exports a factory `createApprovalHistoryReader()` that returns a reader owning its own cache instance. The host calls it once per session.
  - `listPage(projectId, cursor, pageSize = 20)` runs one `getDocs` with `orderBy('createdAt','desc')` and `limit(pageSize)` (plus `startAfter(cursor)`) on `projects/{id}/approvalSnapshots`. It reads metadata documents only and returns `{ docs: {id, data}[], nextCursor, fetchedCount }`.
  - `getSnapshotMetadata(projectId, snapshotId)` runs one `getDoc` of `projects/{id}/approvalSnapshots/{snapshotId}` and returns `found`, `missing` or `error`. It never throws. It is called once per list request, only when the current approval has a `snapshotId`.
  - `loadSnapshot(projectId, snapshotId, approvalId)` fetches the metadata document, the `index` subcollection and the six child collections, and hands them to `assembleSnapshotFromDocs`. It goes through the cache. It is called only on an explicit open or compare.
  - It exposes `cancelPending()` and `resetSession()` on the reader.
  - `approvalSnapshotService.ts` is not edited.
  - Known cost, stated plainly: a listed metadata document carries its inline `ids` arrays (up to 256 KiB each) because the web SDK cannot project fields. Reads are still one per snapshot, and the page size bounds the bytes.
- **Page bound.** The cap counts fetched metadata documents before parsing or de-duplication:
  - Page size is 20, and total fetched documents from the page query are capped at 100 (`MAX_FETCHED_DOCS`). The single direct get of the current snapshot is separate from this budget and is bounded at one.
  - "โหลดเพิ่ม" appears only while the fetched count is below 100 and the last page was full.
  - Invalid or duplicate entries consume the budget, so they cannot cause extra reads.
  - At the cap the UI says the list is truncated. The current entry, resolved by the direct get, is still shown and openable.
- **Query limitation (documented).** `orderBy('createdAt')` excludes documents that lack a `createdAt` field. The "malformed metadata" guarantee covers only documents the query returns (and the one direct get). A snapshot document with no `createdAt` never appears in the page.
- **Components (new).**
  - `ApprovalHistoryEntry.tsx`: the button, the open or close state, the overlay mount, and the host of the history session described above. It takes the props `project` and `uid` (plus an optional reader-factory prop defaulting to the service, which the modal never passes). Closing the overlay calls `close()`. A key change or unmount calls `dispose()`.
  - `ApprovalHistoryPanel.tsx`: a thin stateful shell. It receives the controller from the host, subscribes on mount and unsubscribes on unmount (which does not dispose the session), handles Escape and the close button (both call `close()`), and renders `ApprovalHistoryView`.
  - `ApprovalHistoryView.tsx`: a pure state-to-markup component with these parts:
    - the timeline and its pager
    - the version selection
    - the loading, error and retry states
    - the compare pickers
    - the empty state "ไม่พบเวอร์ชันก่อนหน้า"
    - the notes about what is not stored
  - `ApprovalVersionSummary.tsx`: a pure component for one version, covering the header, counts and three capped tables.
  - `ApprovalDiffSummary.tsx`: a pure component for the diff, with counts first and details in collapsed `<details>`.
  - **Row caps.** One constant `HISTORY_ROW_CAP = 200`. Tables and diff detail lists initially render 50 rows. A "แสดงเพิ่ม" button adds 50 per click up to 200, and then "และอีก N รายการ" shows the exact remainder. Counts are always exact.
  - The diff note says a cable split shows as removed plus added, because items are matched by id.
- **WI screenshot contract.**
  - Each of the entry overlay's roots (the panel in every state) carries `data-wi-pii="approval-history"`, with no `aria-label` or `title` on the root.
  - `approval-history` is registered in `wiScreenshotMaskSpec.ts` as a non-required `hide` region for the `approval-request` and `approval-sign` figures.
  - Nothing new carries `data-wi-project-id`.
  - The panel renders only after an explicit click, so default captures never include it.
  - The entry button has a static label with no PII. The implementer checks that it does not collide with the exact labels the screenshot actions match.

### Isolation by construction

- The viewer module graph consists of: `ApprovalHistoryEntry`, `ApprovalHistoryPanel`, `ApprovalHistoryView`, `ApprovalVersionSummary`, `ApprovalDiffSummary`, `approvalHistory`, `approvalSnapshotSummary`, `approvalSnapshotDiff`, `approvalHistoryController`, `approvalSnapshotReader`, `approvalSnapshotCache` and `approvalHistoryService`, plus the trusted existing helpers it imports (`src/utils/approvalSnapshot.ts`, `src/utils/geo.ts` and `src/types.ts`).
- **Import allowlist (enforced by the scanner).** The scanner parses every import specifier in the graph and fails on anything not on the allowlist, in addition to the forbidden tokens below:
  - From `src/firebase.ts` (`../firebase`): only the `db` binding. Its other exports (authentication helpers, `functions`, `auth`, `secondaryApp`, `secondaryAuth`, `loginWithEmail`, `logout`, error helpers) are forbidden. This matters because `loginWithEmail` and `logout` call `logActivity`.
  - From `firebase/firestore`, runtime values: only `collection`, `doc`, `getDoc`, `getDocs`, `query`, `orderBy`, `limit`, `startAfter` and `where`, in every module of the graph.
  - **The single `Timestamp` exception.** The runtime value import `Timestamp` from `firebase/firestore` is permitted ONLY in the trusted, already-existing module `src/utils/approvalSnapshot.ts` (matched by its exact repository-relative path, not by file name), and nowhere else. In that module no other runtime name may be imported from `firebase/firestore`, so every write API (and `serverTimestamp`) stays forbidden there as well. The existing `type FieldValue` import is a type-only import and is allowed.
  - **Type-only imports.** Type-only imports from `firebase/firestore` (an `import type` statement or an inline `type` specifier) are permitted in any module, because they are erased at build time. They are never a runtime value.
  - Other external packages: `react` and the icon package already used by sibling components (`lucide-react`). The allowlist lives in the test and changes only with explicit review.
  - Relative imports: `src/types`, `src/utils/geo`, `src/utils/approvalSnapshot` (for `resolveApprovalSnapshot`, `snapshotCollections` and `IncompleteApprovalSnapshotError`), and the viewer's own modules. `approvalSnapshot.ts` and `geo.ts` were checked: they contain none of the forbidden identifiers, and their only Firestore runtime import is `Timestamp`.
  - The walk stops at `src/firebase.ts` and `node_modules`. The allowlist check still applies to the specifiers that import from them.
- **It must never import** `DesignApprovalModal`, `approvalSnapshotService`, `exportApprovalPdf`, `projectFileUpload`, `kmz`, `printProjectMap`, `logService` or anything under `functions/` (which also excludes `firebase/functions`).
- **It must never contain** the identifiers `updateDoc`, `setDoc`, `addDoc`, `deleteDoc`, `writeBatch`, `runTransaction`, `httpsCallable`, `logActivity`, `uploadProjectFile`, `createApprovalPdf` or `exportApprovalPdf`. It must also not contain `createObjectURL`, `fetch(`, `XMLHttpRequest`, `sendBeacon` or `window.open`. The token scan applies to every module in the graph, including the trusted `approvalSnapshot.ts`.
- **State ownership.** Every piece of panel state is owned by the controller held by the host session, keyed on `projectId` + `uid`. The modal passes plain data in (through the entry) and receives nothing back.
- **Controller state and request-generation token.**
  - State: `session { projectId, uid }`, `generation`, `open`, `list { status, entries, fetchedCount, cursor, error, requestId, currentLookup }`, `selection { viewId, baseId, targetId }`, `version { status, id, data|error, requestId }`, `compare { status, baseId, targetId, diff|error, requestId }`, and a `staleDropped` counter used by tests.
  - Every async load captures the current `generation` and its slot's `requestId`. A result is applied only if both still match. Otherwise it is discarded and `staleDropped` increments.
  - Actions: `open`, `close`, `sessionChange(projectId, uid)`, `listRequested`, `listResolved`, `listFailed`, `paginate`, `openVersion`, `versionResolved`, `versionFailed`, `compare`, `compareResolved`, `compareFailed`, `retry` (re-issues the failed slot), `showMoreRows`, and `selectBase` and `selectTarget`.
  - Starting a new open, compare, retry or paginate bumps that slot's `requestId`, so a superseded response is dropped.
  - `close` bumps `generation`, resets the selection, the timeline, the version and compare slots and the token, and calls the reader's `cancelPending()`. Resident cache entries are preserved.
  - `sessionChange` and `dispose` do the same and call the reader's `resetSession()`, which also clears the cache. `dispose` additionally makes the controller inert.
- **Cache vs close.** Closing the panel clears UI state, cancels pending loads and keeps resident snapshots, which are immutable and tied to the same session key. A session end (project or uid change, or the modal closing) clears them. Unmounting or detaching the view never disposes the session.

### Out of scope

- Any change to `firestore.rules`, `storage.rules`, `functions/`, `src/types.ts` or stored data. This includes writing history, outcomes or document numbers into snapshots.
- Any edit to `approvalSnapshotService.ts`, `src/App.tsx`, `src/utils/approvalSnapshot.ts` or the dashboard.
- Any modal logic beyond the entry point: no modal state, no historical mode, no reuse of the approval slides, no change to signing, rewind, lock, export or the `createFinalDocuments` effect.
- Reconstructing rejection reasons, sign-offs or approval-level content of earlier rounds, and per-entry profile lookups.
- Comparing a snapshot with live data.
- Detecting a split cable as a move.
- Deleting or repairing orphan or incomplete snapshots.
- Adding dependencies such as jsdom or a testing-library.
- Reminders (done), saved signature, in-app notifications, delegate signer, Admin bulk legacy lock.
- Any deployment.

### Rules confirmation (no rules change expected)

- `firestore.rules` has `match /approvalSnapshots/{snapshotId}` with `allow get, list: if isAuthenticated() && canAccessProject(get(projects/{projectId}).data)`. The child wildcard `match /{collectionName}/{childId}` has the same `get, list` rule. No new permission is needed, and the direct get of one snapshot document uses the same `get` rule.
- The timeline query is a single-field `orderBy('createdAt','desc')` on a subcollection, which is indexed by default. The list rule does not depend on the queried document's fields.
- `viewApprovalDocs` is not enforced by the rules. It is a UI-only gate and the modal's openers already use it. The entry element applies the same gate. The new UI does not widen what a project reader could already fetch.
- The implementer re-reads the rules and records the confirmation in the summary. If the query turns out to need an index file or a rules change, that is an escalation: Risk HIGH, back to the human.

### Acceptance criteria

- [ ] The modal diff is limited to one import line and one JSX element for `ApprovalHistoryEntry` (the element may span several lines), with no other added or removed lines. The review reads the complete modal diff line by line. A source test asserts the modal references `ApprovalHistoryEntry` only in that import and usage, and references no other history module.
- [ ] The "ประวัติคำขอ" button renders inside the modal for every user with `viewApprovalDocs`, including when there is no current `designApproval`. It does not render without `viewApprovalDocs`. No history read happens before the user opens the panel.
- [ ] The viewer module graph passes the source scan: no forbidden identifier, no forbidden import, and every import specifier is on the allowlist. Only `db` is imported from `src/firebase.ts`. Only the listed read APIs are imported as runtime values from `firebase/firestore`, with the single exception of `Timestamp` in `src/utils/approvalSnapshot.ts`. A deterministic unit test walks the relative-import graph from `ApprovalHistoryEntry.tsx` (stopping at `src/firebase.ts` and `node_modules`).
- [ ] The scanner has a positive control (the real dependency graph passes, and the test asserts the graph does include `approvalSnapshot.ts`, so the exception is actually exercised) and negative controls (each forbidden fixture fails, including `Timestamp` outside the trusted module).
- [ ] Opening the panel makes exactly one metadata page query, plus at most one direct get of the current snapshot's metadata document (only when the current approval has a `snapshotId`), and zero child or `index` reads. The first page has 20 documents. Total page-fetched documents never exceed 100, counted before parsing or de-duplication.
- [ ] The timeline is newest first and shows, per entry: a document number (current approval) or short id, the time label with the wording above, a submitter label, a "คำขอปัจจุบัน" marker on the current approval, and the outcome text from the derivability table. An empty result shows "ไม่พบเวอร์ชันก่อนหน้า".
- [ ] A valid current snapshot that is outside the loaded page, including beyond the 100-document cap, is shown as a normal current entry, is openable and comparable, and is never labelled missing. `current-unavailable` appears only when the direct get returns missing, unreadable or invalid metadata and the page has no valid document for it. When the direct get fails but the page contains valid current metadata, the page entry is used and stays openable. The unavailable text is generic and does not distinguish missing from permission or network failure.
- [ ] No earlier-round entry says "ปฏิเสธ". An orphan or no-current-approval entry never claims a successful submission. A backfill entry says "ล็อกเมื่อ". The raw uid and email are never rendered.
- [ ] Selecting an openable version loads it through the cached reader and shows `ApprovalVersionSummary`: project name, route code, participating owners, the time label, exact counts, and three compact tables capped at 200 rendered rows each with exact totals. Route length is shown only from the stored field, labelled "ความยาวที่บันทึกไว้". The panel never renders approval slides and never shows sign-off, contractor or selection data.
- [ ] An incomplete, missing or invalid snapshot shows an inline error with a retry button. Nothing partial is rendered.
- [ ] "What changed" preselects the previous round vs the current one where both are loaded and comparable. The user can pick any two comparable versions. Compare loads at most those two snapshots, only on click. Counts come first, and details sit in `<details>` closed by default. Each category renders 50 rows, and "แสดงเพิ่ม" grows to at most 200 with an exact "และอีก N รายการ".
- [ ] The diff reports added, removed and changed routes, enclosures and loops by id, with changed field names. It reports project name, route code, owner and participating-owner changes, and count and stored-length totals. Ownership changes are counted by stable core, tray and port identifiers, and reordering nested data produces zero ownership-change counts.
- [ ] The diff detail cap is implemented by early exit while counting. A focused test proves that the number of detail objects created is at most the limit per category while counts stay exact.
- [ ] Cache contract: while resident, a snapshot is not re-read. An evicted snapshot is re-read when reopened. At most 8 snapshots are resident. A failed load is not cached. Two simultaneous requests for one snapshot in the same load generation share a single load. `cancelPending()` (used by close) discards every load started before it without touching resident entries, and a reopen after it starts a fresh load. `resetSession()` (project or uid change, or dispose) also clears the cache, so a pending old request can never repopulate it.
- [ ] Session lifetime: the controller and cache live in the host-owned session, which outlives the panel's mount. Closing the panel and reopening it in the same session reuses resident snapshots without a re-read. Detaching the view does not dispose the session. A project or uid change, or the modal closing, disposes the session and clears the cache. Controller tests cover this lifetime.
- [ ] Stale protection covers open, compare, retry and pagination. A response is discarded if the project, uid, generation or the slot's request id changed, or the panel was closed or the session disposed.
- [ ] Metadata validation covers nested `project`, `participatingOwners` and the backfill shape. The parser never throws on any input.
- [ ] Legacy current approvals (no `snapshotId`) and retroactively locked ones are labelled as in the table.
- [ ] `git diff --name-only` shows no change to `firestore.rules`, `storage.rules`, `functions/`, `src/types.ts`, `src/utils/approvalSnapshot.ts` or `src/services/approvalSnapshotService.ts`, and no new dependency in `package.json`.
- [ ] WI contract: every panel state renders a root with `data-wi-pii="approval-history"`, no `aria-label` or `title` on the root, and no `data-wi-project-id` anywhere. `approval-history` is registered as an optional `hide` region for `approval-request` and `approval-sign`. The existing WI screenshot tests pass.
- [ ] `npm run verify` passes.
- [ ] Before any release, the owner runs the browser QA below and records a pass. It is a pre-release gate and is not part of `npm run verify`.

### Acceptance scenarios

**Pure util and parser**

1. **Metadata parser never throws.** It is fed `null`, strings, arrays, objects with missing fields, wrong types, a wrong `schemaVersion`, an `id` that differs from the doc id, a `projectId` mismatch, a non-array `participatingOwners`, an invalid owner string, a `project` that is not an object or has a non-string `name`, `backfill: false`, `backfill: true` with `id === approvalId`, `id !== approvalId` without `backfill`, and a malformed `idIndex`. It returns `{ ok: false }` with a reason and never throws. A valid normal and a valid backfill document both parse, and the sanitised meta drops `ids`.
2. **Timeline derivation.** Table-driven cases cover these, with the expected kind, labels and flags asserted:
   - two normal rounds with the second current and `Pending Approval`
   - a current `Rejected` entry showing the reason
   - a current `Completed` entry
   - a current backfilled entry
   - a legacy current approval (no direct get)
   - a current `snapshotId` whose direct get is `missing` and which is not in the page (`current-unavailable`)
   - a current `snapshotId` whose direct get is `error` and which is not in the page (`current-unavailable`)
   - a current `snapshotId` whose direct get returns invalid metadata and which is not in the page (`current-unavailable`)
   - a current snapshot not in the page but with a valid direct get (`current-frozen`, openable, comparable, not labelled missing)
   - **a current snapshot present and valid in the page while the direct get is `error`, `missing` or invalid: the page entry is used and the entry is `current-frozen`, openable and comparable**
   - orphan snapshots with no current approval
   - an orphan newer than the current approval
   - an invalid entry
   - an unparseable `createdAt` sorting last
   - de-duplication of the current entry against the fetched page
3. **Default comparison.** The cases are previous vs current, no current frozen entry (two newest), exactly one comparable entry (`null`), invalid or legacy entries excluded, and a current entry beyond the loaded page with no older loaded comparable entry (`null`, manual pick still possible).
4. **Diff cases.** The cases cover:
   - identical input
   - added, removed and changed items by id, with exact changed-field names
   - a moved enclosure (over tolerance reports metres; under 1e-7° is unchanged)
   - a route with an extra vertex, a reversed path, and a moved end
   - the same items in a different collection order giving zero changes
   - reordered nested data (route cores, tray and port assignments) giving zero ownership-change counts, and a genuine owner change on one core, tray or port giving exactly one count for that identifier
   - empty vs empty, and empty vs non-empty
   - project name, route code, owner and owners changes
   - participating owners ITEL+SYMC → SYMC+UIH
   - stored-length totals and routes without a stored length
5. **Diff malformed input, size and cap.** Each of these does not throw and produces `warnings`: missing, null and non-array collections, null and primitive items, items without an `id`, `NaN` and `Infinity` coordinates, a route with no `path`, and duplicate ids. A structural assertion on two 10,000-route snapshots (with 10% changed) checks that counts are exact, each detail list has at most 200 items, and `truncated` is correct. A focused detail-cap test feeds an iterator (or a counting factory) of many changed items with a small `detailLimit` and counts how many detail objects were created: at most the limit per category, while counts and `truncated` stay exact. The implementation review also confirms the early exit. A non-gating timing sanity check logs a note when the run exceeds the 2-second target (10,000 routes) and fails only above a generous 10-second bound, so it guards against accidental quadratic behaviour without making verify flaky.
6. **Summary util.** Counts are exact, route length comes only from the stored `totalLength` (never from `path`), a missing stored length is flagged, owners are resolved as specified, and malformed items are counted and skipped.

**Cache and controller (fake reader with deferred promises)**

7. **Cache contract.** Cases cover:
   - a resident snapshot opened twice causes one read
   - nine distinct snapshots evict the least recently used, and reopening the evicted one reads again
   - two simultaneous requests for one key in the same generation share one read
   - a rejected load is not cached, and the next request retries
   - a `resetSession()` while a load is pending, after which the pending load settles and the cache stays empty
   - a different uid or project never returns another session's snapshot
   - **`cancelPending()` with deferred promises.** Start load A, call `cancelPending()` (as close does), start load A again (as a reopen does), settle the OLD request: nothing is installed in state or cache and `staleDropped` increments. Then settle the NEW request: it is installed exactly once. The reopen did not reuse the old in-flight promise (two reader calls in total).
   - **Resident survives close.** A resident entry survives `cancelPending()`, close and reopen without a re-read (reader call count unchanged).
   - `cancelPending()` discards a pending cache fill but leaves other resident entries intact, while `resetSession()` clears them.
8. **Controller flows and session lifetime.** Using the real reducer and runner with the fake reader:
   - open → one page query and, when the current approval has a `snapshotId`, one direct get; no child reads
   - open with a legacy current approval → one page query and no direct get
   - paginate up to the 100-document cap, with invalid and duplicate entries counting toward the cap; pagination does not repeat the direct get
   - open a version → one snapshot read
   - compare → two snapshot reads, or one when one is already resident
   - retry after a failure; a list retry re-issues the page query and the direct get
   - close and reopen
   - **lifetime:** a subscriber attaches, the snapshot is opened, the subscriber detaches (simulating the panel unmounting), a new subscriber attaches and the controller reopens the same snapshot: no second snapshot read, and the controller was not disposed
   - **lifetime:** `dispose()` clears resident entries and the next open of the same snapshot on a new controller reads again; `dispose()` called twice is harmless; calls and late settlements after `dispose()` change nothing and count as stale
   - **lifetime:** a new controller for a different uid or project shares nothing with the old one
9. **Stale responses (in-flight).** Each case resolves the old request after the change and asserts the result is dropped (`staleDropped` increments) and no state or cache is repopulated:
   - close during an in-flight list, direct get, open, compare, retry and paginate
   - a project switch during an in-flight load
   - a uid switch during a pending load, including a pending cache fill
   - dispose (modal closed) during an in-flight load
   - a newer open superseding an older one, and a retry superseding a failed attempt
   - close clears the selection, the timeline and the token, and keeps resident entries; session change and dispose clear all of these and the cache

**Rendered panel, UI-level scenarios (real `ApprovalHistoryView` driven by the real controller and a fake reader, rendered with `react-dom/server`)**

10. **No current approval but orphan snapshots exist** (the Admin-rewind scenario, reachable through the entry button). The timeline renders, with no "คำขอปัจจุบัน" marker, "บันทึกเมื่อ … (ไม่ยืนยันว่ายื่นสำเร็จ)" labels, and a default comparison of the two newest.
11. **Legacy current approval.** The pinned "ข้อมูลสด ยังไม่ล็อก" entry has no open or compare actions. Older snapshots, if any, still render.
12. **Rejected current approval.** The current entry shows "ถูกปฏิเสธ" and the rejection reason. Earlier entries show the "not stored" text. The timeline renders.
13. **Current snapshot unavailable, and the page fallback.**
    - (a) The direct get fails (or returns missing or invalid metadata) and the page does not contain the current snapshot: the `current-unavailable` entry shows the generic text, with no open or compare actions, and the rest of the timeline renders and is not blocked. The text is identical for the missing, permission and network cases.
    - (b) The direct get fails but the page contains valid metadata for the current snapshot: the entry renders as a normal "คำขอปัจจุบัน" entry, is not labelled missing, and its open and compare actions are present and work.
14. **Current snapshot beyond the loaded range.** 120 newer orphan snapshots push a valid current snapshot beyond the first page and beyond the 100-document cap (the fake reader never returns it in any page). The direct get returns valid metadata. The current entry renders as a normal "คำขอปัจจุบัน" entry, is neither labelled missing nor excluded, and is openable and comparable. A compare of it with a loaded entry succeeds. The pager reports the list as truncated at 100 fetched documents.
15. **Empty result.** "ไม่พบเวอร์ชันก่อนหน้า" renders. A list failure renders an error with retry.
16. **Version summary and diff rendering.** The summary shows the counts and tables. With 500 rows, at most 50 render initially, then 100, 150 and 200 after show-more steps, never more than 200, with an exact "และอีก N รายการ". The diff renders counts before details with `<details>` closed by default. An empty diff renders "ไม่มีการเปลี่ยนแปลง". Warnings render as one line.
17. **Markup contract.** Populated, empty, loading and error states each have a root with `data-wi-pii="approval-history"`, no `aria-label` or `title` on it, and no `data-wi-project-id`. A fixture project name, document number and uid never appear in the root's attributes. The mask-spec test confirms the optional `hide` region for `approval-request` and `approval-sign`.

**Isolation, permissions and regressions**

18. **Source scan with controls.**
    - The scanner finds none of `updateDoc`, `setDoc`, `addDoc`, `deleteDoc`, `writeBatch`, `runTransaction`, `httpsCallable`, `logActivity`, `uploadProjectFile`, `createApprovalPdf`, `exportApprovalPdf`, `createObjectURL`, `fetch(`, `XMLHttpRequest`, `sendBeacon` or `window.open` in the viewer module graph. It finds no import of `DesignApprovalModal`, `approvalSnapshotService`, `exportApprovalPdf`, `projectFileUpload`, `kmz`, `printProjectMap` or `logService`.
    - **Positive control.** The scanner runs over the real dependency graph rooted at `ApprovalHistoryEntry.tsx` and passes. The test asserts that `src/utils/approvalSnapshot.ts` is in the visited set and that the only runtime `firebase/firestore` import outside the read-API allowlist anywhere in the graph is `Timestamp` in that file. The scanner is also run over the real `src/utils/approvalSnapshot.ts` on its own to confirm it passes only through the exception.
    - **Negative controls.** Each of these temporary fixture modules is scanned and must fail: one importing `updateDoc`, `setDoc`, `addDoc`, `deleteDoc`, `writeBatch` or `runTransaction` from `firebase/firestore` (one fixture per name); one importing `httpsCallable` from `firebase/functions`; one importing `uploadProjectFile`; one importing `createApprovalPdf`; one importing `exportApprovalPdf`; one importing `DesignApprovalModal`; one importing a non-`db` binding from `src/firebase.ts` (for example `auth`, `functions`, `loginWithEmail` or `logout`); one planting a forbidden token such as `fetch(`.
    - **Exception boundaries.** These fixtures must also fail: a runtime `Timestamp` import in any module other than `src/utils/approvalSnapshot.ts`, including a module whose file name is `approvalSnapshot.ts` in a different directory; and a fixture registered as the trusted module that imports `Timestamp` together with `setDoc` (or `serverTimestamp`). A type-only import of a Firestore type in a fixture passes.
19. **Modal diff contract.** The modal source contains `ApprovalHistoryEntry` exactly twice (import and usage), the usage is wrapped in `permissions?.viewApprovalDocs`, and no other history module (including `approvalHistory` and `summarizeCurrentApproval`) is referenced. The reviewer additionally reads the complete modal diff line by line.
20. **Permissions.** The entry is hidden without `viewApprovalDocs` and shown with it, for every role, including when there is no current approval. The panel takes no permission props and exposes no sign, edit, export, rewind or lock control for any role, including Admin.
21. **Regression.** The existing `approvalSnapshot`, `approvalQueue`, `SigningQueuePanel` and WI screenshot tests pass unchanged. The behaviour of signing, rejection, resubmission, rewind, lock and export is untouched, because no modal logic changes.

**Owner-run browser QA (pre-release gate, not part of `npm run verify`)**

After implementation, the owner runs this on the Firestore emulator with synthetic fixtures. It reuses the existing PR #91 browser QA harness setup where it applies. Codex stages cannot run Chromium, so this is run by Claude or the owner. It has two parts: guarded scenarios, which collect zero-write evidence, and session-transition scenarios, which check for stale content.

*Guarded scenarios: zero-write evidence, with its exact limits.*

- **(a) Attribution and timing.**
  - Authentication switching and any `logActivity`-producing action (login, logout, and other app actions that write to the `logs` collection) happen BEFORE the panel is opened. Each identity uses its own separate browser context, set up and signed in beforehand. The guard is never active during a sign-in or sign-out.
  - The guard window starts only after the project and the modal have settled and an idle baseline of 5 seconds shows zero Firestore Write-channel traffic. If the baseline is not clean, the run is invalid and is repeated. It is not counted as a pass.
  - The window ends when the panel is closed.
- **(b) Quiet fixtures.** Fixtures keep the modal's automatic effects quiet. Approvals are `Pending Approval`, `Rejected`, or `Completed` WITH `finalDocuments` already set. A `Completed` approval without `finalDocuments` is never used, because it would trigger the automatic `createFinalDocuments` effect.
- **(c) Primary evidence: Admin SDK before/after comparison.**
  - Immediately before the window and immediately after it, an Admin SDK client connected to the emulator reads every document under the viewed project, plus the whole `users` collection and the whole `logs` collection, including all of their subcollections.
  - **Enumeration.** The walk starts from the viewed project's document reference and calls `listCollections()` on every document reference. For every collection it calls `listDocuments()`, which returns references to documents that do not exist but have subcollections (missing parent documents), then recurses with `listCollections()` on each of those references. Missing parents are recorded in the path set with an `exists: false` flag. This ensures that incomplete snapshots, whose children survive without a metadata document, cannot escape the comparison.
  - **Comparison.** For every enumerated path it records `exists`, a canonical byte serialisation of the document data, and `updateTime`. The test asserts byte-identical content, unchanged `updateTime`, and an identical set of paths (nothing created, nothing deleted).
- **(d) Secondary evidence: conservative page-level counter.**
  - Playwright records every request whose URL contains the Firestore Write channel path (`google.firestore.v1.Firestore/Write/channel`) during the window. The Write stream is long-lived, so every POST on it is counted, not only newly created connections. If the transport is a WebSocket, sent frames are counted instead.
  - The test asserts zero Write-channel POSTs (or frames) carrying a non-empty write payload. A POST whose payload cannot be classified as an empty handshake or acknowledgement counts as a write for this assertion.
  - Cloud Function calls are stubbed with `page.route` and counted. The assertion is zero calls. The stub returns an error so nothing could run.
  - Zero `download` events and zero `filechooser` events.
  - Read-request counts are recorded as evidence but are not gating.
- **(e) Exactly what this evidence does and does not show.**
  - (c) shows only that nothing PERSISTED in the inspected paths during the window. A write that changes any existing document moves its `updateTime`, and a persisted create or delete changes the path set, so (c) detects any persisted write regardless of transport, including one sent over an already-open stream.
  - (c) cannot by itself rule out a write that was DENIED by the rules (nothing persists), or a create-then-delete pair that nets to no change in the inspected paths. It also does not inspect paths outside the enumerated set.
  - (d) is the conservative secondary check for those cases: it counts Write-channel traffic whether or not the write persisted. It is corroboration and a diagnostic for locating a write. It can still miss traffic it cannot observe at the page level.
  - Together with the source scan (which proves the viewer module graph contains no write API), these are evidence for the absence of writes, not a mathematical proof. The result is recorded with this limit stated.

Guarded scenarios:
- a project with two rounds: timeline order, labels, open a version, and compare
- orphan-only snapshots on a Draft project
- a legacy current approval
- a rejected current approval
- a current snapshot with missing children (inline error and retry), including the incomplete-snapshot case where children exist beneath a missing metadata document, to exercise the missing-parent enumeration
- a valid current snapshot beyond the first page and beyond the cap (more than 100 newer orphan snapshots)
- more than 20 snapshots (pagination)
- opening a version, then closing the panel, then confirming the modal's current-approval controls (sign, rewind, lock, export) look and behave exactly as before. These controls are only inspected for presence and state. They are not clicked during the guard window.
- a role without `viewApprovalDocs` sees no button (checked in a separate context)

*Session-transition scenarios: stale content and lifetime, outside the write guard.*

These scenarios check Escape handling, effect cleanup, session lifetime and stale content during real session transitions, which server rendering cannot establish:
- Escape closes the panel and cancels a delayed load, and reopening shows no stale content.
- Close the panel and reopen it while the modal stays open: a snapshot opened earlier is shown without new child or `index` reads (request counts recorded as evidence). Closing the modal and reopening it starts a fresh session with no resident snapshots.
- The strict-mode double effect (development build) does not leave a disposed session in use.
- A project switch while a load is delayed with request interception: no stale content from the old project appears.
- A uid switch (sign out and in as another user) while a load is delayed: no stale content appears. This scenario necessarily includes sign-out and sign-in, which write to `logs` through `logActivity`, so it is NOT part of the zero-write claim and the guard is not applied to it. The zero-write evidence rests on the guarded scenarios above and on the isolation scan.

### Proposed design

- **Data flow.**
  1. The user clicks the entry button. `ApprovalHistoryEntry` (the host) lazily creates the session for `projectId` + `uid` if none exists (no I/O), mounts `ApprovalHistoryPanel` with the controller, and dispatches `open` with the plain-data summary from `summarizeCurrentApproval(project)`.
  2. The controller issues the list slot: `reader.listPage` once, and, only if the current approval has a `snapshotId`, `reader.getSnapshotMetadata` once, in parallel. When both settle, the page documents are parsed with `parseSnapshotMetadata` and merged into the timeline with `buildApprovalTimeline`, including the direct-get result and the page fallback.
  3. "เปิดดู" dispatches `openVersion`, and the reader loads the snapshot through the cache. `ApprovalVersionSummary` renders `summarizeSnapshot(snapshot)`.
  4. "เปรียบเทียบ" dispatches `compare`. The controller loads the two snapshots and computes `diffApprovalSnapshots` once, and `ApprovalDiffSummary` renders it.
  5. Closing the panel calls `close()`: pending loads are cancelled and UI state is cleared, but the session and its resident snapshots stay with the host.
  6. A project or uid change, or the modal closing, disposes the session (`resetSession()`), and the host creates a new session on the next open.
- **Pure vs I/O.** Everything except `approvalHistoryService.ts` and the React shell is pure and has no Firebase import. The reader is injected, so tests use a fake with deferred promises.
- **Why the viewer does not reuse the modal's path.** The modal's document selection is entangled with the current approval's snapshot id, live preview, contractor state, handlers and automatic effects. A separate summary viewer removes the possibility of acting on the current approval while showing another version.
- **Error handling.** A list failure shows "โหลดประวัติคำขอไม่สำเร็จ" with retry. A failed direct get degrades only the current entry to `current-unavailable` when the page cannot supply it, with the generic text; it does not fail the list. An open or compare failure is shown inline with retry, and nothing is cached. The diff is never computed from partial data.
- **Security and privacy.**
  - There is no write path in the viewer.
  - Reads use the existing rules.
  - Names appear only where the current approval document already shows them (the current `requestedBy`). The raw uid and email are never rendered.
  - The new UI adds no data beyond what an approval document already contains.
- **Performance.** The page cap (100 fetched documents), the single direct get, the LRU of 8, the row caps (200), the diff detail limit with early exit (200) and lazy loading on click bound reads, memory and DOM size.
- **Test strategy.** There is no jsdom in the repo and none is added. Behaviour that needs React effects or real clicks (the thin shell, Escape, effect cleanup, button wiring, strict-mode effects, stale content during session transitions) is covered by the owner-run browser QA and by review. Everything stateful, including the session lifetime, is moved into the pure controller so `npm run verify` can exercise it deterministically.

### Expected files

- `src/utils/approvalHistory.ts` and `src/utils/approvalHistory.test.ts` (new)
- `src/utils/approvalSnapshotSummary.ts` and `src/utils/approvalSnapshotSummary.test.ts` (new)
- `src/utils/approvalSnapshotDiff.ts` and `src/utils/approvalSnapshotDiff.test.ts` (new)
- `src/utils/approvalHistoryController.ts` and `src/utils/approvalHistoryController.test.ts` (new)
- `src/utils/approvalSnapshotReader.ts` and `src/utils/approvalSnapshotReader.test.ts` (new; pure identity checks)
- `src/utils/approvalSnapshotCache.ts` and `src/utils/approvalSnapshotCache.test.ts` (new)
- `src/services/approvalHistoryService.ts` (new; read-only Firestore reader, no unit test beyond the source scan)
- `src/components/ApprovalHistoryEntry.tsx`, `ApprovalHistoryPanel.tsx`, `ApprovalHistoryView.tsx`, `ApprovalVersionSummary.tsx`, `ApprovalDiffSummary.tsx` (new)
- `src/components/ApprovalHistoryView.test.ts` (new; the UI-level scenarios and the markup contract)
- `src/utils/approvalHistoryIsolation.test.ts` (new; the source scan with allowlist, the `Timestamp` exception, positive and negative controls, and the modal diff contract)
- `src/components/DesignApprovalModal.tsx` (one import line and one JSX element only)
- `src/utils/wiScreenshotMaskSpec.ts` and its test (register `approval-history` as an optional `hide` region)
- `docs/specs/approval-version-history-and-diff.md` is archived by the flow after approval.

### Risks and rollback

- **Isolation drift.** A future edit could add a write import to the viewer. The source-scan test (forbidden tokens plus the import allowlist, with positive and negative controls) fails verify if it does. The modal reference test fails if history code leaks into the modal, and the review reads the complete modal diff line by line.
- **Trusted-module exception.** The `Timestamp` exception is tied to the exact path `src/utils/approvalSnapshot.ts`. If that module later imports any other Firestore runtime name, the scanner fails and the change needs explicit review. The exception must not be widened to other files.
- **Entry placement.** The always-visible placement may be impossible without changing conditional logic around the toolbar. In that case the implementer stops and returns to the human (HIGH). They do not edit existing conditions.
- **Loader duplication.** `approvalSnapshotReader.ts` mirrors the identity checks of `readApprovalSnapshot`, because the shipped reader lives in a module that also exports writes and must not enter the viewer graph. Drift is possible. The reviewer compares the two side by side, and the shared `resolveApprovalSnapshot` keeps the ID-set validation identical.
- **Orphan snapshots look like rounds.** This is unavoidable without changing the data model. The labels say so.
- **Metadata size per list read.** Up to about 256 KiB of inline `ids` per snapshot. The 20-per-page and 100-document caps bound it, and the direct get adds one more document.
- **Query coverage and index.** The page query returns only documents that have `createdAt`, so a malformed document missing it never appears in the page. A default single-field index is assumed to work on the configured database. If it does not, the implementer stops and escalates rather than adding an index file or a rules change.
- **Stored-length figures.** The viewer's route length is the stored `totalLength` only. It may differ from the modal's schedule total, which falls back to path-derived values and rounding. The UI says so.
- **Generic unavailable message.** The UI does not tell a missing snapshot from a permission or network failure for the current entry. This is conservative and is stated in the plan. Diagnosing it would need a separate UI decision.
- **Session lifetime in React.** The host-owned session depends on correct effect cleanup (dispose on key change or unmount, idempotent under strict mode). This cannot be exercised under `npm run verify` without a DOM, so it is covered by controller lifetime tests, review, and the browser QA session-transition scenarios.
- **Cache residue.** Resident snapshots survive closing the panel within the same uid, project and open modal. They are cleared when the project or uid changes or when the modal closes, so no cache outlives the modal or crosses users.
- **Large diffs.** Bounded by the detail limit with early exit and the row caps, and guarded by the structural, cap-instrumentation and timing tests.
- **Zero-write evidence limits.** The Admin SDK comparison proves only that nothing persisted in the inspected paths. It cannot show that no write was denied or created and deleted. The conservative Write-channel counter is kept as secondary evidence, and the result is described with exactly this limit. The guard result is not claimed for the uid-switch scenario, which legitimately writes `logs` entries.
- **WI screenshot drift.** The panel never renders during capture and is registered as an optional hide region.
- **Rollback.** The change is frontend-only and additive. Reverting the commit and redeploying the frontend restores the previous behaviour. No data migration or rules change is involved.

### Verification

- Focused tests, run with `node --import tsx --test`:
  - the six util test files (history, summary, diff, controller, reader, cache)
  - `src/components/ApprovalHistoryView.test.ts`
  - `src/utils/approvalHistoryIsolation.test.ts`
  - the WI mask-spec test
  - the existing `approvalSnapshot` and `SigningQueuePanel` tests, as regression
- Full gate: `npm run verify` (lint, tests, functions tests, build) must exit 0 before reporting done.
- Pre-release gate, separate from `npm run verify`: the owner-run browser QA on the Firestore emulator with synthetic fixtures. The guarded scenarios collect evidence of no persisted change (Admin SDK before/after comparison over the recursively enumerated paths, including missing parents) and of no Write-channel traffic, Cloud Function calls or downloads (conservative Playwright counter), and the result is recorded with the limits stated under (e). The session-transition scenarios assert Escape handling, effect cleanup, session lifetime and no stale content. Results are recorded separately. `npm run verify` is not offered as proof of browser behaviour or of Firestore permissions.

### Deployment

- Target: PRODUCTION (when and if the human decides to release; nothing is deployed in this flow)
- Surface: Cloudflare frontend only. No Firebase functions and no rules change, so no Firebase deployment is involved.
- Required authorization: a separate, explicit human instruction naming the target "Cloudflare frontend", given after the pre-release browser QA has passed. A review approval is not deployment authorization.

Status: APPROVED

### Diff reviewed

- Base: HEAD (029acea) plus the uncommitted worktree. `git status` shows the modified `DesignApprovalModal.tsx`, `wiScreenshotMaskSpec.ts` and `wiScreenshotMaskSpec.test.ts`, and the new history viewer files.
- Head: working tree, not committed.
- Verification evidence checked: `npm run verify` exit 0 on the current tree, as supplied to this stage. I did not re-run it. The implementation record gives 288/288 frontend and 114/114 Functions tests, with the focused suite at 91/91.
- Method: I read the full source of the history util, controller, snapshot reader, cache, diff and summary utils, the service, and the Entry, Panel, View, VersionSummary and DiffSummary components. I compared the reader line by line with `readApprovalSnapshot` and `resolveApprovalSnapshot`. I did not read the test files line by line.
- Limit of the diff check: Bash was denied partway through this stage, so I could not re-run `git diff`. I confirmed the modal's `ApprovalHistoryEntry` references by grep: one import at `DesignApprovalModal.tsx:3` and one gated element at `DesignApprovalModal.tsx:2516`, in the unconditional header toolbar. The implementer's "two added lines, zero removed" modal diff and the empty protected-path diff (rules, functions, types, `approvalSnapshot.ts`, `package.json`) are taken from the implementation record. The isolation test also asserts the modal references.

### Findings

- MEDIUM: `src/utils/approvalHistory.ts:82`. A `not-current` orphan outcome is built as the "not current" text plus `HISTORY_LABELS.replaced` ("ถูกแทนที่ด้วยคำขอรอบถัดไป"). That is wrong for orphans: a failed submission, or a snapshot left after an Admin rewind with no current approval at all, was never replaced by a next-round request. The plan's table gives only the "ไม่ใช่คำขอปัจจุบัน…" wording for these entries, and the plan says they must not imply a successful submission. Use the replaced wording only for `earlier` entries.
- MEDIUM: `src/utils/approvalHistoryController.ts:70,107`. If a "โหลดเพิ่ม" page fails, the list slot goes to `error` and keeps the old entries. The shared "ลองอีกครั้ง" button calls `retry('list')`, which restarts from page 1 instead of re-requesting the failed page. That drops the loaded pages and resets the default comparison selection. The plan only says retry re-issues the failed slot, so this is not blocking, but the retry should preserve the pages already loaded.
- LOW: `src/components/ApprovalDiffSummary.tsx:26`. Stored-length totals in km are printed raw, so float sums can show long tails such as 12.345000000000001. Round them for display. The `display()` fallback at line 20 can also print "[object Object]" for unrecognised object values.
- LOW: `src/components/ApprovalHistoryView.tsx:9`. `localTime` re-parses the Thai prefix and suffix text of `timeLabel` with a regex to localise the date. A wording change in `historyTimeLabel` would silently stop localisation. Return structured parts from the util instead.
- LOW: `src/components/ApprovalHistoryEntry.tsx:14,28`. `summarizeCurrentApproval(project)` is captured once, at open. If the live project document changes while the panel is open (a sign-off or rejection), the "current" entry stays stale until the panel is closed and reopened. This is acceptable for a read-only viewer; consider a note in the UI.
- LOW: `src/utils/approvalHistoryController.ts:77,89`. `openVersion` and `compare` both reset `rows: {}`. Opening a version therefore collapses the show-more state of an existing diff, and the reverse.
- LOW (process, not a code defect): zero-write browser evidence, the strict-mode, Escape, uid and project switch session scenarios, and the check that the emulator accepts the single-field `createdAt` query have not been run. The plan makes these an owner-run pre-release gate, not part of `npm run verify`. They remain open, and deployment is not authorized by this review.

### Acceptance-criteria result

- [x] Modal limited to one import and one permission-gated element. The element is in the unconditional toolbar, so the button also shows when there is no current approval. It renders only with `viewApprovalDocs`. No history read happens before the click. The isolation test covers this. The "two added lines" diff stat is from the implementation record, not re-run here.
- [x] The viewer's imports match the plan. The service imports only `collection`, `doc`, `getDoc`, `getDocs`, `query`, `orderBy`, `limit` and `startAfter` from Firestore, plus `db` from `../firebase`. I found no write API, callable, `fetch` or export path in the files I read.
- [x] Isolation scan with positive and negative controls and the `Timestamp` exception boundary: the tests exist and verify passed. Protected paths are unchanged per the implementation record.
- [x] On open: one page query of 20 documents plus at most one direct get, in parallel. There are no child or index reads on open. The 100-document cap counts fetched documents before parsing. Pagination skips the direct get.
- [x] Timeline wording, time labels, submitter privacy and current-snapshot resolution (direct get, page fallback, de-duplication, generic unavailable text, legacy pinned) follow the plan. The `not-current` outcome wording is the exception (first MEDIUM finding).
- [x] The snapshot reader mirrors `readApprovalSnapshot`: metadata, index and child identity checks, then the shared `resolveApprovalSnapshot` ID-set validation. `parseSnapshotMetadata` adds stricter shape checks. It passes the raw metadata, including `ids`, to the resolver, not the sanitised copy.
- [x] Cache: LRU of 8, generation-scoped in-flight deduplication, failed loads not cached, and `cancelPending` / `resetSession` semantics as specified.
- [x] Controller: request-id and generation guards, close preserves residents, dispose is idempotent and inert, and stale responses are counted and dropped. The host disposes on key change or unmount, and the effect does not leave a disposed controller in use under strict mode.
- [x] Diff: id-based matching, stable core, tray and port keys, 1e-7° tolerance, early-exit detail cap with exact counts, and warnings for malformed input.
- [x] Summary and diff rendering: stored length only, 50/100/150/200 row steps with an exact remainder, counts before closed `<details>`, and the WI marker `data-wi-pii="approval-history"` with the optional `hide` region registered for both approval figures.
- [x] `npm run verify` passed (exit 0, supplied to this stage).
- [ ] Owner-run browser QA and zero-write evidence is pending. It is a pre-release gate, not a review blocker.

### Verdict

No unresolved BLOCKER or HIGH findings. The MEDIUM and LOW items should be fixed in a follow-up, or in a fix round at the owner's discretion. The browser QA gate must pass before any release, and production deployment still needs separate explicit human authorization.

Verdict: APPROVED
