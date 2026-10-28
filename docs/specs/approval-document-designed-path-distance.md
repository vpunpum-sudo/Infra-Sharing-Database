# approval-document-designed-path-distance

Archived by `agent-flow` on 2026-10-28 after an approved review.

- Branch: `vpunpum-sudo/approval-document-design-distance`
- Base commit: `57c862c`
- Verification: `npm run verify`, Started: 2026-10-28T03:51:54Z, Exit code: 0

Status: APPROVED
Feature: approval-document-designed-path-distance
Risk: STANDARD. The change is client-side derived display arithmetic in the approval document generator, shared pure helpers, and one default-state rule for a form input. It touches no auth, permissions, Firestore or Storage rules, Functions, migrations, CI or deployment config. It changes no document shape, snapshot content, approval transition or signing logic. It does affect approval documents, so the tests must prove that stored data and signing paths are unchanged. Nothing is deployed.

### Objective

Every route distance in the generated design approval document must equal the length of the path the Designer drew. That covers the slides, the print and PDF HTML, and the map tooltips. The document must also agree with the approval history version summary from PR #97. Today the document trusts `route.totalLength` and then the ML marks. `totalLength` is often saved as 0 or an unrelated number, so the document shows wrong or fallback distances. After this change, the history summary and the document compute route distance and its text with the same two functions in `src/utils/geo.ts`. The editable operation-distance default follows the designed-path total without ever replacing a user edit.

### Decisions

1. **Where shared code lives (resolves the history isolation conflict).**
   - The functions both the history viewer graph and the modal need go in `src/utils/geo.ts`, which is already on the `approvalHistoryIsolation.test.ts` allowlist. `src/utils/approvalHistoryIsolation.test.ts` is not modified.
   - `geo.ts` keeps its single existing import (`../types`) and gains no new import.
   - `approvalSnapshotSummary.ts` imports only from `./geo`, as it already does.
   - Document-only logic goes in a new module, `src/utils/approvalDocumentDistance.ts`. That covers grouping by type, totals, unit formatting, the operation-distance default and submission value. It is imported only by `DesignApprovalModal.tsx`.
   - The new module is not added to the isolation allowlist, and no file in the history viewer graph may import it. A test checks this.
   - Core deduplication (`countedCables`) stays inside the modal, untouched.
2. **Shared functions in `geo.ts`.**
   - `routeDistanceMeters(route, enclosures)` returns unrounded metres, or `undefined` when unknown.
   - `distanceKmText(meters)` turns unrounded metres into km text with 2 decimals, or `-` for unknown.
3. **Formula for `routeDistanceMeters`.**
   - Drop path entries that are not objects with finite numeric `lat` and `lng`. This covers null or undefined entries, non-objects, strings and NaN or Infinity. A non-array `path` counts as no path.
   - With at least two valid points, the result is the haversine sum along them in order. A sum of 0 (coincident points) is a valid zero.
   - Otherwise, if the start and end enclosures are both found by `startEnclosureId` and `endEnclosureId` and both have valid positions, the result is their straight-line distance. Identical positions give a valid 0.
   - Otherwise the result is `undefined`.
   - `totalLength`, `markStart` and `markEnd` are never read.
   - There is no plausibility or range cap. Latitude and longitude are not bounded beyond being finite.
4. **Non-finite computed results.**
   - Finite coordinates can still produce a non-finite haversine, for example when `lat` is 1.7e308 and -1.7e308, where the difference overflows.
   - A non-finite path sum makes the path unusable, and the endpoint fallback is tried. A non-finite endpoint distance gives `undefined`. This adds no cap, and a huge but finite valid distance is returned as is.
   - This is an intentional correction of malformed data in the history summary. Today the summary prints `NaN` for such a path. After the change it prints the endpoint fallback or `-`. For every input whose path sum is finite, the history summary output is unchanged. The plan does not promise identical history output for every possible input.
5. **Rounding.**
   - Unrounded metres are summed, then divided by 1000 and rounded once with `toFixed(2)`. This applies to the project total and to each per-type group.
   - Row text is never parsed back (`parseFloat(r.distanceKm)` goes away).
   - The shown total can differ by 0.01 or more from the sum of the shown row values. This is intended and tested.
6. **Unknown versus zero.**
   - An unknown route shows `-` in the row. A valid zero shows `0.00`. The two are never conflated.
   - Unknown routes add 0 to totals and per-type groups. Total and group texts are always numeric (`0.00` when nothing is known).
   - Where a unit follows a row distance, the unit is omitted for `-`. A bare "- km" must not appear. Totals always keep their unit.
7. **Operation-distance default.** The default is computed from the live source, because a submission snapshots the live source, never from the snapshot being viewed. The pure resolver `resolveOperationKmInput` decides the input value:
   - If a stored value exists, the default never applies. A stored value means `designApproval.totalOperationDistanceKm` or `approvalDraft.totalOperationDistanceKm` is not null or undefined. An explicit stored `0` counts as stored. The existing reset effect (about lines 241-257) keeps showing it, and it is unchanged.
   - If the sources are not ready, the input is left unchanged. Ready means `readiness.ready`, with all six listeners loaded for the current project and no source error. Nothing is written into the input from `propRoutes` or from partial data.
   - If the user has edited the input (the `onChange` handler fired), the input is never replaced.
   - If `defaultKm` is not a finite non-negative number string, the input is left unchanged. The input never receives `-`, `NaN` or a negative.
   - Otherwise, when ready, untouched and nothing is stored, the input is set to the live designed-path total. It keeps following that total as routes change, because an untouched auto-filled value is not a user edit.
   - **Touched flag.**
     - It is a ref holding the id of the project the user edited, `operationKmTouchedFor` (`string | null`). `onChange` sets it to `project.id`.
     - The default effect reads `touched = operationKmTouchedFor.current === project.id`, so a flag set for another project is already false.
     - The existing project-change reset effect (the `reset` branch at about line 243) also sets the ref to `null`. That effect is declared before the default effect, so on a project switch the ref is cleared before the new project's default is resolved.
     - The default effect lists `project.id` among its dependencies.
     - Programmatic writes never set the flag.
   - The effect at about lines 1125-1129 is replaced by an effect that only calls `setOperationKmInput(current => resolveOperationKmInput({...}))`. The old `current || totalLengthKm` rule is removed. The default effect performs no Firestore write. A draft is still persisted only by the existing `onBlur` `saveDraftField`, which is unchanged.
   - Submission (about lines 1436-1437) uses `submittedOperationKm(operationKmInput, liveDistanceKm)`. This is the same semantics as today, with a defined result for a malformed default. The stored shape is unchanged, and the approval transition and signing code are not edited.
   - `liveDistanceKm` is `aggregateDistanceMeters(...).totalText` computed from `liveSource.routes` and `liveSource.enclosures`. It is always a finite non-negative numeric string. That is the precondition for the guarantee in scenario 19.
   - Pre-existing behaviour kept as is: blurring an empty input saves `0` (`parseFloat(x) || 0`). That explicit zero is then treated as stored.
8. **Already-submitted approvals.**
   - Nothing stored is rewritten: not snapshots, not `designApproval.totalOperationDistanceKm`, not attached `finalDocuments` PDF or KMZ files.
   - The modal derives distances from the snapshot at render time. A reopened or re-exported old approval therefore shows different derived distances (designed path) from before.
   - Already-attached final PDF and KMZ files keep their original numbers.
   - The implementation evidence and the review must state both facts.
9. **Out of scope code stays unchanged.** `App.tsx`, `FiberMap.tsx`, `kml.ts`, `sidebarList.ts`, `splitRoute.ts` and `approvalSnapshotDiff.ts` are not edited.

### In scope

- `routeDistanceMeters` and `distanceKmText` in `src/utils/geo.ts`.
- `src/utils/approvalDocumentDistance.ts` (new, modal-only), with the pure functions in "Interfaces".
- A refactor of `routeDistanceKm` in `src/utils/approvalSnapshotSummary.ts` to call `routeDistanceMeters` and `distanceKmText` from `./geo`. Output is unchanged for every input whose path sum is finite (Decision 4).
- In `src/components/DesignApprovalModal.tsx`:
  - The `fiberRouteSchedule` distance (about lines 702-721) uses `documentRouteDistances`. Each row keeps `distanceKm` (text) and gains `distanceMeters` (number or undefined).
  - `fiberRouteTotals.distanceKm` and `fiberOpticSummary` distances use `aggregateDistanceMeters`. The core-count loop and its `countedCables` deduplication are untouched. Split segments each add their own metres.
  - `printMapRoutes.distanceKm` (about line 1742) uses `routeSummary?.distanceKm ?? '-'`, with no `totalLength` fallback.
  - The map tooltip (about line 2974) shows the row's `distanceKm` through `distanceWithUnit`, with no `r.totalLength` branch. The `'0.00'` fallback stubs (about lines 2920 and 3112) become `'-'`.
  - Unit-appending sites use `distanceWithUnit` (about lines 2109, 2289, 2392, 3139, 3246, 3480, 3523 and 3799). Bare table cells (about lines 2064 and 2828) print the text as is.
  - The operation-distance default effect, touched ref and submission fallback follow Decision 7. No other state is changed.
  - The `L` import stays because `L.Icon` and `L.divIcon` are still used.
- Tests as listed under "Verification".

### Out of scope

- How `totalLength` and the ML marks are entered or saved.
- Firestore and Storage rules, Functions, permissions, document shapes, approval and signing logic, rewind and sign transitions.
- Rewriting snapshots, stored `totalOperationDistanceKm`, or regenerating `finalDocuments`.
- Map, KML, sidebar and diff calculations.
- Any change to `src/utils/approvalHistoryIsolation.test.ts` or its allowlist.
- Changing the `onBlur` draft-save behaviour.
- Any deployment.

### Interfaces

All functions are pure. They never throw on any input and never mutate their arguments.

- In `src/utils/geo.ts`:
  - `routeDistanceMeters(route: unknown, enclosures: unknown): number | undefined`.
    - `route` is read for `path`, `startEnclosureId` and `endEnclosureId`. A null, undefined or non-object route gives `undefined`.
    - `enclosures` is a `ReadonlyMap<string, {position?}>` or an array of `{id, position?}`. Anything else, or null entries, is treated as empty.
    - The return value is unrounded metres, finite and 0 or more, or `undefined`.
  - `distanceKmText(meters: number | undefined): string` returns `-` for `undefined`, a non-number, NaN, Infinity or a negative value. Otherwise it returns `(meters / 1000).toFixed(2)`. A valid 0 gives `0.00`.
- In `src/utils/approvalDocumentDistance.ts` (imports only `./geo` and types):
  - `distanceWithUnit(text: string, unit: string): string` returns `-` when `text === '-'`, otherwise `` `${text} ${unit}` ``.
  - `documentRouteDistances(routes: unknown, enclosures: unknown): Array<{ meters: number | undefined; text: string }>`.
    - It is index-aligned with `routes`. A non-array input gives `[]`.
    - A null route entry gives `{ meters: undefined, text: '-' }`.
    - It builds the id-to-enclosure lookup once and calls `routeDistanceMeters` and `distanceKmText`.
  - `aggregateDistanceMeters(entries: ReadonlyArray<{ meters: number | undefined; group?: string }>): { totalMeters: number; totalText: string; knownCount: number; unknownCount: number; groups: Array<{ group: string; meters: number; text: string }> }`.
    - **Known** means `typeof meters === 'number' && Number.isFinite(meters) && meters >= 0`. A valid 0 is known.
    - **Unknown** is everything else: `undefined`, NaN, +Infinity, -Infinity, negative numbers and non-numbers. Unknown entries add 0.
    - Groups appear in first-seen order, and an entry without `group` goes into no group.
    - `totalText` and each group `text` are `distanceKmText` of the unrounded known sum, so they are always numeric.
  - `resolveOperationKmInput(state: { current: string; touched: boolean; storedKm: number | null | undefined; ready: boolean; defaultKm: string }): string`.
    - It returns `current` when `storedKm != null`, when `!ready`, when `touched`, or when `defaultKm` is not a finite non-negative number string.
    - Otherwise it returns `defaultKm`.
  - `submittedOperationKm(input: string, defaultKm: string): number`.
    - It returns `Number.parseFloat(input)` when that is finite and 0 or more.
    - Otherwise it returns `Number.parseFloat(defaultKm)` when that is finite and 0 or more.
    - Otherwise it returns `0`.
    - The result is therefore always a finite number of 0 or more, for any string inputs.
    - A valid `defaultKm` is a precondition for the fallback to be the live total. For any other value the result is `0`.

### Acceptance criteria

- [ ] `routeDistanceMeters` and `distanceKmText` exist in `src/utils/geo.ts` with no new imports there.
- [ ] `src/utils/approvalHistoryIsolation.test.ts` is unmodified and passes. `approvalSnapshotSummary.ts` imports only `./geo` and its existing allowed modules. No file in the history viewer graph imports `approvalDocumentDistance.ts`, and that module is not added to the allowlist.
- [ ] `approvalSnapshotSummary.ts` and `DesignApprovalModal.tsx` use the same `routeDistanceMeters` and `distanceKmText`. History and document distances are equal for the same snapshot, including `-` rows.
- [ ] `DesignApprovalModal.tsx` contains no `totalLength`, `markStart` or `markEnd` identifier, no `distanceTo` or `latLng` distance code, no `/ 1000` and no `.toFixed(2)`.
- [ ] Unrounded metres are summed and rounded once, for both the total and the per-type groups. Negative, non-finite and undefined metres are unknown.
- [ ] Unknown routes render `-`, valid zeros render `0.00`, and no output shows "- km" or "NaN".
- [ ] The operation-distance default never locks in `0.00` or a partial total, never replaces a user edit, never overrides any stored value (including an explicit `0`), never writes `-` or `NaN`, and performs no write.
- [ ] Switching projects clears the touched flag before the new project's default is resolved.
- [ ] The core-count aggregation and its deduplication are unchanged.
- [ ] No stored snapshot or approval is rewritten. No signing or approval-transition code, rules, `functions/` or `src/services/` write path is modified.
- [ ] `git diff` touches none of `App.tsx`, `FiberMap.tsx`, `kml.ts`, `sidebarList.ts`, `splitRoute.ts`, `approvalSnapshotDiff.ts`, `approvalHistoryIsolation.test.ts`, `firestore.rules`, `storage.rules` or `functions/`.
- [ ] `npm run verify` passes.

### Acceptance scenarios

Coordinates are on the equator, where 0.01° of longitude is about 1111.95 m, which shows as 1.11 km.

**Route distance**

1. **Stored length 0.** `totalLength: 0` with a two-point 0.01° path gives `1.11`. `routeDistanceMeters` returns about 1111.95, not a rounded value.
2. **ML marks disagree.**
   - `markStart: 100`, `markEnd: 1600`, `totalLength: 1500` and a 0.03° path give `3.34`.
   - A route with only marks and no path or end enclosures gives `-`.
3. **No path, both end enclosures with positions.** The straight line is used: 0.02° gives `2.22`, even when `totalLength` is 900.
4. **No path and no usable end enclosures.** The result is `undefined` and the row shows `-`. The total is unchanged by that route, and no "NaN" or "- km" appears.
5. **Invalid points.**
   - A path with `lat: 'x'`, NaN or Infinity entries drops those entries.
   - If fewer than two valid points remain, the endpoint fallback applies.
   - `[ {lat:'x', lng:0}, {lat:0, lng:0} ]` with no enclosures gives `-`.
   - A bad point between valid points sums the valid points in order.
6. **Malformed inputs.**
   - A path containing `null`, `undefined`, `5` and `'a'` entries does not throw. The valid points are used, or the result falls back.
   - A non-array `path` (`'abc'`, `{}`, `5`) counts as no path.
   - A null or undefined route, a null `enclosures`, an array of enclosures with null entries, and an enclosure with `position: null` all return `undefined` or fall back without throwing.
7. **Coincident points.**
   - A path of two identical points returns 0 and shows `0.00`. It does not fall back to the endpoints and is not `-`.
   - A route with no path whose two end enclosures sit at the same position also shows `0.00`.
   - A `-` row and a `0.00` row sit side by side in the same table and stay distinct.
8. **Implausible stored length and no cap.** `totalLength: 250000` with a 0.01° path gives `1.11`. `totalLength: 5` with a long path gives the path length. A valid path of 250 km or more is shown in full.
9. **Non-finite result.**
   - A path `[ {lat:1.7e308, lng:0}, {lat:-1.7e308, lng:0} ]` has finite inputs but a NaN sum. With no enclosures the result is `undefined` and shows `-`.
   - With valid end enclosures, it falls back to their straight line.
   - If the endpoints are also non-finite, the result is `undefined`.
   - No range cap is applied anywhere.
   - For the history summary this is an intentional correction. It printed `NaN` for that path before. It now prints `-` or the endpoint fallback, and a test in `approvalSnapshotSummary.test.ts` pins it.

**Aggregation and rounding**

10. **Rounding-sensitive total.** Two routes of 1004 m each show `1.00` and `1.00` in rows. The total shows `2.01`, because 2008 m is rounded once. Summing the row texts would give `2.00`, so this fixture fails any implementation that sums rounded rows. A second fixture, three routes of 4 m each, shows `0.00`, `0.00`, `0.00` in rows and a total of `0.01`.
11. **Per-type groups.** Two routes in one type with 1004 m each show `2.01` for that type. A type whose routes are all unknown shows `0.00`. The total is unchanged by unknown routes. Group order follows first appearance.
12. **Unknown in aggregation.** A mix of 1111.95 m, unknown and a valid 0 gives the total `1.11`, `knownCount` 2 and `unknownCount` 1. `NaN`, `Infinity`, `-Infinity`, `-5`, `-0.001` and `'12'` (a non-number) each count as unknown and add 0. A negative entry never reduces a total. `distanceKmText` of each of those returns `-`.
13. **Split segments and cores.**
    - Two segments of one cable each add their own path length to the distance totals.
    - The core totals still count that cable's cores once, through the unchanged `countedCables` logic.

**Rendering at every output**

14. **Unit omission.** `distanceWithUnit('-', 'km')` is `-`, `distanceWithUnit('1.11', 'km')` is `1.11 km`, and `distanceWithUnit('0.00', 'กม.')` is `0.00 กม.`. The source test confirms that every output that appends a unit uses it. Those outputs are the slide cards, tooltip, print HTML, cover and summary and enclosure tables. The tooltip fallback stub is `-`, not `0.00`.

**Operation-distance default and submission**

15. **Routes arrive after the modal opens.**
    - Start with `ready: false`, an empty input and a partial default (for example `'1.11'` from `propRoutes`, or `'0.00'`). The input stays `''`.
    - After `ready: true`, with the live total `4.45`, the input becomes `4.45`. It never held `0.00` or the partial total.
    - If a later route update changes the total to `5.56` while the user has not touched the input, the input follows to `5.56`.
16. **Explicit user edit.** The user types `7`, so `touched` is true. After a later total change or a `ready` transition, the input stays `7`. Clearing the input to `''` also sets `touched`, and it stays `''`.
17. **Stored explicit zero.** `storedKm: 0`, from `approvalDraft` or `designApproval`, means the default never applies. The input stays `'0'` and submission stores `0`, not the live total.
18. **Stored non-zero value.** Any stored value, for example `12.34`, is preserved. A later total change does not replace it.
19. **Submission fallback and malformed default.**
    - **Precondition:** `defaultKm` is the live `aggregateDistanceMeters(...).totalText`, a finite non-negative numeric string.
    - With that precondition: `submittedOperationKm('', '4.45')` is `4.45`. `'abc'` and `'-1'` also give `4.45`. `'0'` gives `0`. `'2.5'` gives `2.5`. The result is always a finite number of 0 or more.
    - Malformed default: `submittedOperationKm('', '')`, `('abc', '-')`, `('', '-1')`, `('', 'NaN')` and `('', 'Infinity')` each return `0`.
    - `resolveOperationKmInput` with a malformed `defaultKm` (`''`, `'-'`, `'NaN'`, `'-1'`) returns `current` unchanged.
20. **Project switch, pure level.** The touched marker is `operationKmTouchedFor`. When it holds another project's id, `touched` evaluates false for the current project. Test the pure comparison used by the default effect, and the resolver sequence A edited, switch to B, B ready and unstored, which gives B's total and never `7`.
21. **No writes from the default.** The effect that calls `resolveOperationKmInput` contains no call to `saveDraftField`, `updateDoc`, `setDoc`, `attachApprovalSnapshot` or `writeApprovalSnapshot`. Only `onBlur` persists a draft.

**Reopen and regression**

22. **History and document agree.** For one fixture snapshot, the history summary's distance cells equal `documentRouteDistances(...).map(d => d.text)`. This covers `1.11`, `3.34`, `2.22`, `-` and `0.00` rows.
23. **Submitted approval reopened.**
    - With deep-frozen snapshot collections and approval objects, `documentRouteDistances` and `aggregateDistanceMeters` run without throwing, so nothing is mutated.
    - A JSON clone taken before equals the objects after.
    - The new module has no Firebase, React or write tokens.
    - A reopened old approval shows the designed-path distance instead of the old stored-length figure.
    - An attached `finalDocuments` file keeps its original numbers, and nothing regenerates it.
24. **Isolation and permissions regression.** `approvalHistoryIsolation.test.ts` passes unchanged and is byte-identical in `git diff`. `ApprovalHistoryEntry` stays permission-gated in the modal. No approval or signing transition code is changed.
25. **Summary regression.** All existing `approvalSnapshotSummary.test.ts` expectations hold, including `['1.11', '3.34', '1.11', '2.22', '-', '-']` and the stored-length column. Output for every input with a finite path sum is unchanged. The only deliberate difference is the malformed-data case in scenario 9.
26. **History graph stays isolated.** A test reads the viewer files (`ApprovalHistoryEntry.tsx`, `ApprovalHistoryPanel.tsx`, `ApprovalHistoryView.tsx`, `ApprovalVersionSummary.tsx`, `ApprovalDiffSummary.tsx`, `approvalHistory.ts`, `approvalSnapshotSummary.ts`, `approvalSnapshotDiff.ts`, `approvalHistoryController.ts`, `approvalSnapshotReader.ts`, `approvalSnapshotCache.ts`, `approvalHistoryService.ts`, `approvalSnapshot.ts`, `geo.ts`) and asserts that none contains `approvalDocumentDistance`. `geo.ts` imports only `../types`.

### What changes visibly in the generated document

- Route distances change wherever the stored length was 0, missing or different from the drawn path, or where ML marks were used. They now equal the designed-path length.
- The project total and the per-fibre-type totals change with them. These appear in the slide 6 totals row, the cover badge, "รวม … km", "ระยะดำเนินการ … km" and the summary table. The total is the sum of metres rounded once, so it may differ by 0.01 or more from adding the shown rows.
- A route with no path and no usable end enclosures shows `-` instead of `0.00`. A route whose path or end enclosures coincide shows `0.00`.
- Where a unit used to follow, an unknown route shows `-` alone.
- The "ระยะดำเนินการ" input is empty until the data is fully loaded, then defaults to the designed-path total. A stored value or a user edit always wins.
- Layout, wording, owners, cores, tiers and signatures are unchanged.
- Reopening or re-exporting an old approval shows the new derived distances. Already-attached final PDF and KMZ files keep their original numbers.
- In the approval history summary, only malformed non-finite paths change: `NaN` becomes `-` or the endpoint fallback.

### Proposed design

**Data flow.** `snapshot or live collections.routes/enclosures` → `documentRouteDistances` (calls `routeDistanceMeters` and `distanceKmText` from `geo.ts`) → `fiberRouteSchedule[i].{distanceMeters, distanceKm}` → `aggregateDistanceMeters` → `fiberRouteTotals.distanceKm` and `fiberOpticSummary` → slides, tooltips, print HTML and PDF. In parallel, `liveSource` → `documentRouteDistances` → `aggregateDistanceMeters(...).totalText` = `liveDistanceKm` → `resolveOperationKmInput` (when ready, untouched and nothing stored) and `submittedOperationKm`. The history summary reads `routeDistanceMeters` and `distanceKmText` from `geo.ts` directly and never touches the document module.

**Dependency direction.** `approvalDocumentDistance.ts` → `geo.ts` → `types.ts`. The history viewer graph → `geo.ts`. Nothing in the history graph imports the document module.

**Enclosure lookup.** The helper uses only `startEnclosureId` and `endEnclosureId`. The modal's current fallback to the first and last SLD enclosure does not feed distance. A missing end enclosure gives `-`, which matches the history summary.

**Error handling.** All helpers are total functions: malformed input gives `undefined`, `-` or `0`, never an exception.

**Security.** No new reads or writes. No Firebase imports are added anywhere. The history viewer graph stays isolated and read-only.

### Expected files

- `src/utils/geo.ts`
- `src/utils/approvalDocumentDistance.ts` (new, modal-only)
- `src/utils/approvalSnapshotSummary.ts`
- `src/components/DesignApprovalModal.tsx`
- `src/utils/geo.test.ts` (new)
- `src/utils/approvalDocumentDistance.test.ts` (new)
- `src/utils/approvalDocumentDistanceModal.test.ts` (new)
- `src/utils/approvalSnapshotSummary.test.ts` (extend)
- `docs/specs/approval-document-designed-path-distance.md` (archived by the flow after approval)

### Risks and rollback

- **Reopened and re-exported old approvals show different distances.** This is intended and matches the history viewer. Attached PDFs and KMZs are unchanged. A single revert restores the old behaviour, because nothing stored changes.
- **Totals that bad stored lengths inflated will drop to the real drawn lengths.** Planning should be told.
- **Rows that read `0.00` for unknown routes now read `-`.** This is deliberate and matches the history view.
- **The history summary output changes for non-finite path sums.** This only affects malformed data that printed `NaN`, and is pinned by a test.
- **The modal is too large to render in `node:test`.** Executable evidence therefore comes from the extracted pure functions, plus an AST and regex scan of the modal that proves it uses them at every site. A browser check covers actual rendering and effect ordering, in the manual procedure below.
- **Touched flag across project switches.** React effect ordering cannot be proved by the pure tests. The flag is derived by comparing a project id, and it is also cleared in the earlier reset effect. The browser check includes a project switch.
- **The default now uses the live source, not the viewed source.** For a new request they are identical. For a rejected approval with a snapshot being viewed, only the live total feeds the new submission, which is what the new snapshot will contain.
- **Browser fixtures must never come from production data.** See the procedure below.

### Verification

- Focused tests: `node --import tsx --test src/utils/geo.test.ts src/utils/approvalDocumentDistance.test.ts src/utils/approvalDocumentDistanceModal.test.ts src/utils/approvalSnapshotSummary.test.ts src/utils/approvalHistoryIsolation.test.ts`
- Coverage of `geo.test.ts`: scenarios 1-9 and the `distanceKmText` cases of scenario 12, through the two geo functions.
- Coverage of `approvalDocumentDistance.test.ts`: scenarios 10-12, 14-20, 22 and 23. Fixtures use the equator coordinates above, the 1004 m and 4 m rounding fixtures, and the overflow fixture. Scenario 23 deep-freezes its fixtures.
- Coverage of `approvalSnapshotSummary.test.ts`: the existing expectations (scenario 25) plus the overflow-path case from scenario 9.
- Coverage of `approvalDocumentDistanceModal.test.ts`:
  - A TypeScript AST and regex scan of `DesignApprovalModal.tsx`.
  - It asserts no `totalLength`, `markStart`, `markEnd`, `distanceTo` or `latLng` identifier.
  - It asserts no `/ 1000` binary expression and no `.toFixed(2)` call.
  - It asserts no `distanceKm` expression directly followed by a literal `km` or `กม`. Those sites must use `distanceWithUnit`.
  - It asserts the modal imports and calls `documentRouteDistances`, `aggregateDistanceMeters`, `distanceWithUnit`, `resolveOperationKmInput` and `submittedOperationKm`.
  - It asserts the old `current || totalLengthKm` pattern is gone, and that `countedCables` is still present.
  - It asserts the effect calling `resolveOperationKmInput` has no write calls (scenario 21).
  - It asserts the touched ref is cleared in the project-change reset effect and compared against `project.id` in the default effect (scenario 20).
  - It asserts `approvalDocumentDistance.ts` passes the same forbidden-token check as the isolation test.
  - It carries the graph check of scenario 26.
- Full gate: `npm run verify`
- Manual browser procedure, run in the review stage by Claude, because Codex stages cannot launch Chromium. It supplements the automated tests and confirms rendered output, effect ordering and absence of writes.
  - **Data safety.**
    - Use only a disposable test project on the Firestore and Auth emulators, with a `demo-` project id.
    - Never use production data or the production Firebase config.
    - Fixtures are supplied by a throwaway seed script under `.context/qa-fixtures/`, which is not committed and not under `src/`.
    - The script refuses to run unless `FIRESTORE_EMULATOR_HOST` points at `localhost` or `127.0.0.1` and the project id starts with `demo-`.
    - The emulator loads the repo's `firestore.rules`. The script seeds a QA user with the needed approval permissions.
    - The app has no emulator hook today. Wire it only through a QA-only Vite config and a shim for `src/firebase.ts` under `.context/qa-fixtures/`, which points at the emulators with a `demo-` config. No tracked file is edited. This follows the earlier emulator QA work.
    - If the emulator wiring cannot be done without editing tracked files or reaching a real project, report the check as NOT RUN with the reason. Do not substitute production data.
  - **Fixtures.**
    - Project A has four routes. Route A1 has `totalLength: 0` and a 0.01° path, so it shows `1.11`. Route B1 has marks `100` to `1600` and a 0.03° path, so it shows `3.34`. Route C1 has no path and no enclosures, so it shows `-`. Route D1 has two coincident points, so it shows `0.00`.
    - The expected total is `4.45`.
    - Project B is a second disposable project with one 0.02° route and nothing stored, so its total is `2.22`.
    - One submitted approval on Project A has a snapshot with `totalLength: 0` routes.
  - **Checks.**
    - Check the slide 6 table and totals row, slides 4 and 5 route cards, the map tooltip, the print HTML preview and the cover badge for the exact strings above. Confirm there is no "- km" and no "NaN".
    - Operation-distance input: it is empty while loading, then fills with `4.45`. Edit it to `7` and confirm a route update does not replace it. Confirm a stored `0` stays `0`.
    - **Project switching.** Open Project A and edit the input to `7`. Switch to Project B (unstored) and confirm its input is empty while loading and then `2.22`, never `7`. Switch back to Project A and confirm it shows A's stored draft (the blur on switching saved `7` in the emulator) and not B's value.
    - Reopen the submitted approval and confirm the designed-path distances are shown. Compare the `updateTime` of the project document and snapshot documents (read through the emulator REST API) before and after reopening, and confirm they are equal.
    - Record the observed text and the before and after `updateTime` values in `.context/review.md`.

### Deployment

- Target: NONE
- Surface: not applicable
- Required authorization: none for this change. Any later production deployment needs explicit human authorization naming Cloudflare frontend, Firebase functions, or both. A review approval is not deployment authorization.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: main (57c862c), working tree on branch vpunpum-sudo/approval-document-design-distance
- Head: uncommitted working tree. Modified: `DesignApprovalModal.tsx`, `approvalSnapshotSummary.ts`, `approvalSnapshotSummary.test.ts`, `geo.ts`. New: `approvalDocumentDistance.ts` and the tests `approvalDocumentDistance.test.ts`, `approvalDocumentDistanceModal.test.ts`, `geo.test.ts`.
- Verification evidence checked: `npm run verify` passed with exit 0 on the current tree, as stated in the stage prompt. I did not re-run it or read `verify.log`. I read the modal diff, `approvalDocumentDistance.ts`, and the `geo.ts` and `approvalSnapshotSummary.ts` call sites. I did not read the test files or the `geo.ts` diff body.
- Not covered: the manual browser procedure (rendering, effect ordering, project switch) was not run in this stage. A bash permission denial also stopped me re-reading parts of the plan, so I checked against the plan sections I could see.

### Findings

- LOW: `src/utils/approvalDocumentDistance.ts:35-37`. `resolveOperationKmInput` accepts a default of `0.00` when every route is unknown. The operation-distance input can then prefill `0.00` instead of staying empty. This is consistent with the plan's "totals always numeric" rule, and a user edit is never overwritten. Worth confirming in the browser check.
- LOW: `src/components/DesignApprovalModal.tsx:703-705`. `startEnc` and `endEnc` still fall back to the first and last SLD enclosure, but they no longer feed distance. This matches the plan ("A missing end enclosure gives `-`"). They remain used elsewhere in the row, so they are not dead code.
- LOW: `src/components/DesignApprovalModal.tsx:3111,3136`. The placeholder rows use `'-'` instead of `'0.00'`, and every unit-bearing site goes through `distanceWithUnit`. This is consistent with the plan, and I saw no remaining bare "- km" site in the diff.
- LOW: `src/components/DesignApprovalModal.tsx:1098`. `liveDistanceKm` is recomputed on every render outside a `useMemo`. It is cheap, and the effect depends only on the resulting string, so there is no loop risk.

### Acceptance-criteria result

- [x] Route distance everywhere in the document (slides, print and PDF HTML, tooltips, tables, summaries) now comes from `documentRouteDistances`. It uses the same `geo.ts` functions as the history summary. No `totalLength`, `markStart`, `markEnd`, `distanceTo` or `/1000` arithmetic remains in the modal diff.
- [x] Totals and per-type groups are summed from unrounded metres and rounded once. `parseFloat(r.distanceKm)` is gone. Unknown routes contribute 0 and show `-` in rows.
- [x] `geo.ts` is shared and `approvalSnapshotSummary.ts` imports only from `./geo`. The document-only logic is in the new `approvalDocumentDistance.ts`, imported only by the modal, so the history isolation holds.
- [x] The operation-distance default uses the live source and is gated by `ready`, a stored value, and a per-project touched ref. The ref is cleared in the project-reset effect and set on `onChange`. The old `current || totalLengthKm` pattern is removed.
- [x] Submission uses `submittedOperationKm(operationKmInput, liveDistanceKm)`. It keeps a valid user input and otherwise falls back to the live total or 0.
- [x] No Firebase, rules, or Functions changes, and no stored document shape change. Nothing is deployed.
- [ ] The manual browser procedure from the plan is still pending, because it needs a browser stage.

### Verdict

Verdict: APPROVED
