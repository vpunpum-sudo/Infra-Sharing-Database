# enclosure-name-labels-followups

Archived by `agent-flow` on 2026-10-20 after an approved review.

- Branch: `vpunpum-sudo/continue-development`
- Base commit: `adc27e5`
- Verification: `npm run verify`, Started: 2026-10-20T01:09:46Z, Exit code: 0

Status: APPROVED
Feature: enclosure-name-labels-followups
Risk: STANDARD. This is frontend-only polish on uncommitted work. It adds one `alt` sync on the icon `Marker` in `FiberMap.tsx`, one pure helper, the helper's tests and spec text. It also keeps the existing uncommitted test-runner line in `package.json`. It touches no auth, permissions, data rules, migrations, backend functions, deployment config or CI files. The repo has no CI workflows (`.github/` is absent).

### Objective

Close the four follow-ups that the APPROVED review of `enclosure-name-labels` left open. Keep all of that feature's uncommitted implementation, so the work can be committed later with nothing left undecided:

1. Make a reasoned keep-or-revert decision on the `package.json` test script change. `npm run verify` must still pass.
2. Make the icon `Marker` `alt` text follow a rename without a reload. This must also hold when Leaflet recreates the icon after **Enclosures off → on**, including a rename made while Enclosures is off.
3. Document the marker and tooltip remount keys, the `alt` sync and the toggle-order regression coverage in `docs/specs/enclosure-name-labels.md`.
4. Define safe browser verification that does not need agents to use credentials and does not add large new infrastructure. Keep a visible "pending human sign-off" merge gate.

This revision only resolves the previous challenge's findings and checks the plan for consistency. It adds no new scope.

### Challenge resolution (previous verdict: BLOCKED)

- **Blocking question 1: `alt` must survive Enclosures off → on, including a rename made while Enclosures is off.**
  - Resolution: the helper now updates both `marker.options.alt` and the live element.
  - These sequences were added: AC5, AC6, S4, S11 and S12.
- **Blocking question 2: where the missing name is converted.**
  - Resolution: `syncMarkerAlt` accepts `string | null | undefined` and normalizes the name to `''` internally.
  - AC2, S6 and the proposed design all agree on this.
- **Risk: the root test command's Node requirement.**
  - The plan states it directly: Node ≥ 20.6 (or ≥ 18.19 on the 18 line).
  - It also records the Node version that was verified locally.
  - It does not rely on `functions/package.json`.
- **Risk: browser QA must stay a visible merge gate.**
  - The spec status line is `Manual QA: pending human sign-off (merge gate)`.
- **Risk: the claim about AC4 coverage was too broad.**
  - A new **Coverage boundary** section separates what the unit tests prove (helper behaviour only) from manual Leaflet lifecycle QA (ref wiring, icon recreation, visible `alt`).

### Background (verified in code)

- `FiberMap.tsx:1598–1617`: icon enclosures render as `<Marker key={getEnclosureMarkerKey(enclosure.id, namesEnabled)} icon={customIcon} alt={enclosure.name} draggable={isEditingThis} …>`. This sits inside `LayersControl.Overlay "Enclosures" → Pane → LayerGroup`. `CircleMarker` enclosures (`FiberMap.tsx:~1629`) have no `alt`.
- react-leaflet v5 passes `alt` only when it creates the `L.Marker`. A later prop change updates neither `marker.options.alt` nor the DOM.
- Turning the Enclosures overlay off removes the `LayerGroup` from the map, but the React children stay mounted. Leaflet's `_removeIcon` drops the icon element, so `marker.getElement()` returns `undefined` while the overlay is off.
- When the overlay is turned back on, Leaflet's `_initIcon` creates a new `img` and sets `icon.alt = options.alt || ''` for `IMG` icons (`node_modules/leaflet/src/layer/marker/Marker.js:230`).
- So a DOM-only sync is not enough, because the stale `options.alt` comes back every time the icon is recreated. Both `options.alt` and the current element must be kept in sync.
- Stack: React ^19, react-leaflet ^5, TypeScript ~5.8. The local Node version was `v22.23.3` at planning time. The implementer re-records it.

### In scope

- **Decision (1): keep `"test": "node --import tsx --test src/**/*.test.ts"`.** Reasons:
  - It uses the same `tsx` loader, the same `node:test` runner and the same shell-expanded glob as before. The previous verify run showed the same 47/47 root tests.
  - It avoids the `tsx` CLI's IPC socket (`listen EPERM`), which breaks `npm run verify` in sandboxed agent runs. The repo rule requires that gate to pass.
  - **The root test command's Node requirement, stated on its own terms:**
    - `node --import <loader>` together with `tsx`'s ESM loader registration needs Node **≥ 20.6** (or ≥ 18.19 on the 18 line).
    - The root `package.json` declares no `engines` field, and this plan does not add one.
    - The spec states the requirement directly, together with the Node version the implementer actually ran. That version comes from `node --version` and is recorded in `.context/implementation.md`.
    - The spec does **not** cite `functions/package.json` engines as the frontend's supported Node version.
  - It is a separate tooling concern. The spec records it under its own heading, including the one-line revert path. Committing is not part of this flow.
- **Fix (2): `alt` sync for the marker object and its element.**
  - Change the helper so it takes a Leaflet-marker-like object and an optional or null name, instead of only a DOM element.
  - The helper normalizes the name to `''` internally.
  - When a value differs, it updates both:
    - `marker.options.alt`, so an icon that Leaflet recreates after Enclosures off → on gets the latest name;
    - the `alt` of the current element from `marker.getElement()`, so the icon that is already visible updates immediately.
  - The element may be absent, for example while the overlay is off or before the icon is created. The helper then updates only the options.
  - It is called from a callback `ref` on the icon `Marker`, as `syncMarkerAlt(marker, enclosure.name)`.
  - The initial `alt={enclosure.name}` prop stays. Marker keys are not changed, because remounting on every keystroke of a rename would add churn.
- **Docs (3):** additions to `docs/specs/enclosure-name-labels.md`. The existing approved content is kept, not rewritten.
  - An **Implementation notes** section covering:
    - the marker key `getEnclosureMarkerKey(id, namesEnabled)`, and why it exists: react-leaflet's Tooltip removal skips `unbindTooltip()` when the marker is off the map, so a stale tooltip could reopen after Enclosures off → Names off → Enclosures on;
    - the tooltip key `getEnclosureLabelKey(enlarged)`, and why it exists: Tooltip options such as offset are immutable after creation;
    - the explicit `pane="tooltipPane"`;
    - the accepted side effect: a Names toggle remounts the enclosure markers (possible brief flicker; a drag in progress would be interrupted);
    - the `alt` sync: why it updates both `options.alt` and the element, with a reference to Leaflet's `_initIcon` recreating the icon.
  - **Verification additions:**
    - the toggle-order regression test and its limit (it pins key behaviour, not Leaflet binding);
    - the new `syncMarkerAlt` tests and their limit (see "Coverage boundary" below);
    - the test-script decision, the direct Node ≥ 20.6 requirement, the locally verified version and the revert path.
  - A **Manual QA** checklist (S10–S16) with the status line `Manual QA: pending human sign-off (merge gate)`.
- **Verification approach (4):**
  - No agent logs in, and no credentials are created, requested or stored.
  - Browser QA is a short, explicit **human-run** checklist in the spec. The human runs it in their own logged-in `npm run dev` session before merge.
  - Automated coverage stays limited to pure helpers plus `npm run verify`.

#### Coverage boundary (explicit)

- **Unit tests cover only `syncMarkerAlt`:**
  - its null-safety;
  - name normalization;
  - writes to `options.alt`;
  - writes to the element's `alt`;
  - no-redundant-write behaviour;
  - handling of a missing element or of an element that has no `alt`.

  They use plain fake objects, not the DOM and not Leaflet.
- **Not covered by automated tests, so manual QA is pending human sign-off:**
  - the callback `ref` wiring in `FiberMap`;
  - react-leaflet's ref lifecycle;
  - Leaflet's icon removal and recreation on an overlay toggle;
  - the visible `alt` in the browser.

  Code inspection plus `tsc` (inside `npm run verify`) confirm only that the wiring compiles and has the stated shape.
- **The spec must not claim that unit tests prove AC4–AC6 end to end.** The unit tests prove only the helper half of each criterion.

### Out of scope

- Firebase emulators, auth bypasses, test accounts, Playwright/jsdom/React test harnesses, or any dev-only route that skips login.
- Changing label behaviour, styling, overlay order, marker keys or the toggle mechanism.
- Updating `alt` on `CircleMarker`. It renders an SVG path with no `alt`.
- Adding an `engines` field, or any other `package.json` change beyond the kept `scripts.test` line. No dependency changes.
- Any change under `functions/`, `firestore.rules`, `storage.rules` or `src/types.ts`.
- `skill-observations/`. Do not read, edit, stage or delete it.
- Commit, push, PR, merge or deploy.

### Acceptance criteria

- [ ] **AC1: test script.**
  - `package.json` `scripts.test` is exactly `node --import tsx --test src/**/*.test.ts`.
  - Compared with HEAD, no other `package.json` field changes.
  - `package-lock.json` is unchanged.
- [ ] **AC2: helper contract.** `src/utils/enclosureLabels.ts` exports `syncMarkerAlt(marker, name)` and an exported structural type `AltSyncableMarker` for a marker-like object: `options: { alt?: string }` and `getElement(): object | null | undefined`. These are compatible with `L.Marker` without a cast, and need no DOM or Leaflet import. The helper behaves as follows:
  - A `null` or `undefined` marker returns without throwing.
  - A `null`, `undefined` or missing name is normalized to `''` **inside the helper**. It never becomes `"undefined"` or `"null"`.
  - `marker.options.alt` is written only when it differs from the normalized name.
  - The element from `getElement()` is written only when it is present, has an `alt` property, and that `alt` differs. An absent element (`undefined` or `null`) is not an error.
  - When both values already match, nothing is written at all, to the options or to the DOM.
- [ ] **AC3: wiring.**
  - The icon `Marker` in `FiberMap.tsx` has a callback `ref` equivalent to `(marker) => syncMarkerAlt(marker, enclosure.name)`, with no cast needed.
  - The `alt={enclosure.name}` prop is still present.
  - The marker `key`, `position`, `icon`, `draggable`, `bubblingMouseEvents`, `eventHandlers` and Tooltip children are unchanged.
  - `CircleMarker` is untouched.
- [ ] **AC4: rename while visible.** After a rename re-renders `FiberMap`, the visible icon `img` `alt` equals the new name without a reload or a toggle.
  - Unit tests prove the helper part (S1).
  - The browser behaviour is manual QA S10, pending human sign-off.
- [ ] **AC5: rename, then Enclosures off → on.** After a rename followed by Enclosures off → on, the recreated icon `img` `alt` equals the new name.
  - Unit tests prove that `options.alt` is updated (S1, S4).
  - The browser behaviour is manual QA S11, pending human sign-off.
- [ ] **AC6: rename while Enclosures is off, then on.** If a rename happens while Enclosures is off, the icon `alt` equals the new name once Enclosures is turned back on.
  - Unit tests prove that `options.alt` is updated when no element exists (S4).
  - The browser behaviour is manual QA S12, pending human sign-off.
- [ ] **AC7: spec content.** `docs/specs/enclosure-name-labels.md` contains:
  - the Implementation notes: both keys and the reason for each, the pane, the remount side effect, and the dual `alt` sync and why it is needed;
  - the Verification additions:
    - the toggle-order test and its limit;
    - the `alt` tests and the explicit coverage boundary;
    - the test-script decision with its own Node ≥ 20.6 requirement and the locally verified version, with no reference to functions engines;
    - the revert path;
  - the human QA checklist S10–S16, including the AC5 and AC6 sequences, marked `pending human sign-off (merge gate)`.
  - The existing approved content is preserved.
- [ ] **AC8: no regressions.**
  - The existing 5 `enclosureLabels` tests pass unmodified.
  - The new tests pass.
  - `npm run verify` exits 0.
- [ ] **AC9: boundaries.**
  - `git status` shows no changes under `skill-observations/`, `functions/`, the rules files or `src/types.ts`.
  - No new dependencies.
  - No credentials in any file or in `.context`.
  - No commit, push, PR or deploy.

### Acceptance scenarios

Unit-testable, using plain fake objects. No DOM and no Leaflet.

- **S1: rename updates both.**
  - Setup: marker `{ options: { alt: 'Cab A' }, getElement: () => el }` with `el = { alt: 'Cab A' }`.
  - Call: `syncMarkerAlt(marker, 'Cab B')`.
  - Expected: `marker.options.alt === 'Cab B'` and `el.alt === 'Cab B'`.
- **S2: no redundant writes.**
  - Setup: both `options.alt` and `el.alt` are `'Cab A'`, and both use setters that count writes.
  - Call: `syncMarkerAlt(marker, 'Cab A')`.
  - Expected: 0 writes to the options and 0 writes to the element.
- **S3: partial difference.**
  - Setup: `options.alt` is `'Cab B'` and `el.alt` is `'Cab A'`.
  - Call: sync to `'Cab B'`.
  - Expected: only the element is written (1 write), and the options get 0 writes. The reverse case is also covered: only the options are written.
- **S4: element absent (overlay off, or icon not created yet).**
  - Setup: `getElement` returns `undefined`, and in a second case `null`.
  - Call: `syncMarkerAlt(marker, 'Cab B')`.
  - Expected: no throw, and `options.alt === 'Cab B'`. This is the helper basis for AC5 and AC6.
- **S5: null or undefined marker.** `syncMarkerAlt(null, 'x')` and `syncMarkerAlt(undefined, 'x')` do not throw. This matches the callback ref being called with `null` on unmount and on ref identity change.
- **S6: missing or null name.**
  - With `undefined` or `null` as the name, `options.alt === ''` and `el.alt === ''`. Neither is ever `'undefined'` or `'null'`.
  - When both values are already `''`, nothing is written.
- **S7: element without `alt`.** If `getElement` returns an object with no `alt` property (for example a `divIcon` `div`), the helper does not add one. It still updates `options.alt`.
- **S8: toggle-order regression kept.** The three existing toggle-order sequences in `enclosureLabels.test.ts` pass unchanged.

Gate:

- **S9: gate in a sandbox.** `npm run verify` exits 0 in the agent sandbox, with no `listen EPERM`. The root and functions test counts and `node --version` are recorded.

Manual QA, run by the human with their own login, pending sign-off (merge gate). These scenarios cover the ref wiring and Leaflet lifecycle that the unit tests do not:

- **S10: rename while visible.** Rename an icon enclosure, then inspect the `img` `alt` in devtools. It shows the new name without a reload.
- **S11: rename → Enclosures off → on.** After the S10 rename, turn Enclosures off and then on. Inspect the recreated `img`: its `alt` is the new name, and the label still shows when Names is on.
- **S12: rename while Enclosures is off → on.** Turn Enclosures off, rename the enclosure (for example from the list or edit panel), then turn Enclosures on. The `img` `alt` is the new name.
- **S13: Names toggle plus rename.** Rename while Names is off, then turn Names on. The remounted marker has the new `alt`, and the label shows the new name.
- **S14: edit-mode drag unaffected.**
  - By code inspection, the ref only touches `alt` (on the options and the element), so it does not remount or move the marker.
  - Human check: drag an icon enclosure in `edit-enclosure` mode. The label follows, and dragend saves the position as before.
- **S15: existing checklist.** Also confirm:
  - startup labels;
  - the three toggle orders;
  - click-through and drawing;
  - dark and light themes on Roadmap and Satellite;
  - a viewport of 640 px or less.
- **S16: permissions.** Nothing about access changes. A viewer-role user sees the same labels and `alt`. The change is read-only rendering, with no new Firestore reads or writes.

Rollback:

- **S17: tooling revert path.** Reverting only the `scripts.test` line restores `tsx --test`. The spec documents this and notes that `npm run verify` then needs a non-sandboxed shell.

### Proposed design

**`src/utils/enclosureLabels.ts`**

```ts
export interface AltSyncableMarker {
  options: { alt?: string };
  getElement(): object | null | undefined;
}

// react-leaflet sets Marker alt only on creation, and Leaflet recreates the icon from
// options.alt when the overlay is re-added, so keep both the options and the live element in sync.
export function syncMarkerAlt(marker: AltSyncableMarker | null | undefined, name: string | null | undefined): void {
  if (!marker) return;
  const alt = name ?? '';
  if (marker.options.alt !== alt) marker.options.alt = alt;
  const element = marker.getElement();
  if (element && 'alt' in element && (element as { alt: string }).alt !== alt) {
    (element as { alt: string }).alt = alt;
  }
}
```

- `L.Marker` (`options: MarkerOptions` with `alt?: string`; `getElement(): HTMLElement | undefined`) is structurally assignable to this interface.
- An `HTMLImageElement` has `alt` on its prototype, so `'alt' in element` is true for it. A `div` has no `alt`, so it is skipped (S7).
- `options.alt` holding `undefined` while the name is `''` counts as a difference, which gives one write. That is acceptable, and it normalizes the option.

**`FiberMap.tsx` (icon `Marker` only, `~1599`)**

- Add `ref={(marker) => syncMarkerAlt(marker, enclosure.name)}`.
- The inline callback ref has a new identity on every render, so React calls it on every commit: first with `null`, which is a no-op (S5), then with the instance. That keeps both values current at the cost of two string compares per icon enclosure per render.
- The ref returns `void`, so React 19 does not treat it as a cleanup function.

**`enclosureLabels.test.ts`**

- Append tests for S1–S7 using fake marker and element objects. Counting setters are defined with `Object.defineProperty`.
- The existing tests stay unchanged.

**Spec:** add sections as described in AC7.

**Security**

- The name is assigned to a DOM property, so it is not parsed as HTML and creates no XSS surface.
- No data flow or permission changes.

### Expected files

- `src/utils/enclosureLabels.ts`: add `AltSyncableMarker` and `syncMarkerAlt`.
- `src/utils/enclosureLabels.test.ts`: append the S1–S7 tests.
- `src/components/FiberMap.tsx`: add the callback `ref` on the icon `Marker` only.
- `docs/specs/enclosure-name-labels.md`: implementation notes, verification additions, coverage boundary, Node requirement and the human QA checklist.
- `package.json`: no new edit. The existing uncommitted `scripts.test` line is kept.
- `.context/implementation.md`: the handoff, including `node --version` and the verify results.

### Risks and rollback

- **The ref fires before the icon exists, or while the overlay is off.** `getElement()` is `undefined`. The helper updates only `options.alt`, which `_initIcon` uses later (S4).
- **Weak-type or assignability error between `L.Marker` and the interface.** `getElement(): object | null | undefined` avoids the weak-type check, and `tsc` in verify catches a mismatch. If it fails anyway, the fallback is a narrow cast at the call site, documented in the handoff.
- **The `options` object is mutated directly.** This is the standard Leaflet pattern, and only `alt` is touched. Leaflet reads `alt` only in `_initIcon`.
- **Contributors on Node older than 20.6 cannot run `npm test`.** The spec states the requirement directly, and a one-line revert is available.
- **Ref wiring and the Leaflet lifecycle have no automated test.** This is mitigated by the explicit coverage boundary and by the S10–S16 human checklist, which is marked as a pending merge gate.
- **Rollback:**
  - Remove the ref, the helper, its type and its tests.
  - Restoring `"test": "tsx --test src/**/*.test.ts"` is a one-line revert. After it, `npm run verify` must be run outside the sandbox.

### Verification

- Focused tests: `node --import tsx --test src/utils/enclosureLabels.test.ts`. The existing 5 tests plus the S1–S7 tests pass.
- Full gate: `npm run verify`. Record the exit code, the root and functions test counts, and `node --version` in `.context/implementation.md`.
- Boundary check: `git status --porcelain`. Only the expected files have changed, and nothing has changed under `skill-observations/`, `functions/`, the rules files or `src/types.ts`.
- Code inspection:
  - the ref is on the icon `Marker` only;
  - the `alt` prop is kept;
  - the key, draggable, handlers and tooltip are unchanged;
  - `CircleMarker` is untouched.
- Spec inspection:
  - the coverage boundary is stated;
  - there is no claim that unit tests prove browser behaviour;
  - the Node requirement is stated without reference to functions engines;
  - the merge-gate status line is present.
- Manual (human, own login, before merge): run S10–S16 from the spec checklist. The status stays `pending human sign-off` until the human reports results. Agents do not attempt it.

### Deployment

- Target: NONE
- Surface: not applicable. If deployed later, this would be the Cloudflare frontend only.
- Required authorization: explicit human authorization that names the Cloudflare frontend. Plan or review approval does not count. This flow makes no commit, push, PR or deploy.

Status: APPROVED
Feature: enclosure-name-labels-followups

### Diff reviewed

- **Base:** `adc27e5` (HEAD). Everything is still uncommitted: tracked edits plus untracked files.
- **Head (working tree):**
  - Modified: `package.json`, `src/components/FiberMap.tsx`, `src/index.css`.
  - Untracked: `src/utils/enclosureLabels.ts`, `src/utils/enclosureLabels.test.ts`, `docs/specs/enclosure-name-labels.md`.
  - `skill-observations/` was already untracked. It was not reviewed and was not changed.
- **Changes in this follow-up:**
  - `syncMarkerAlt` and `AltSyncableMarker` (`src/utils/enclosureLabels.ts:24-41`).
  - Tests S1–S7 (`src/utils/enclosureLabels.test.ts:66-147`).
  - The callback `ref` on the icon `Marker` (`src/components/FiberMap.tsx:1460`, inside the hunk at about lines 1599–1605).
  - The spec additions (`docs/specs/enclosure-name-labels.md:316-343`).
  - The kept `scripts.test` line (`package.json:12`).
- **Verification evidence checked:** `.context/verify.log` shows exit code 0 and fingerprint `00f2565b…`:
  - `tsc --noEmit` passed.
  - Root tests 54/54. That is 47 before this follow-up plus the 7 new `syncMarkerAlt` tests. There was no `listen EPERM`.
  - Functions tests 17/17.
  - `vite build` passed. The large-chunk warning was already there before this change.
- **Library source checked:**
  - `node_modules/@react-leaflet/core/lib/component.js:7,19,39` calls `useImperativeHandle(forwardedRef, () => instance)` with no deps array. It runs on every commit, so the inline callback ref is called on every render, as the plan assumes.
  - `node_modules/leaflet/src/layer/marker/Marker.js:230` (`icon.alt = options.alt || ''` in `_initIcon`) confirms that syncing `options.alt` is what fixes the alt on an icon Leaflet recreates.
  - `getEnclosureIcon` (`src/components/FiberMap.tsx:91-104`) builds an `L.Icon`, so the live element is an `IMG` and the `'alt' in element` branch applies.

### Findings

- **LOW: spec heading levels don't match.** `docs/specs/enclosure-name-labels.md:316,323,331`
  - The new `## Follow-up implementation notes`, `## Follow-up verification` and `## Manual QA` sections are level 2. The archived body above them uses level 3 (`###`).
  - This is cosmetic only, and the content meets AC7.
- **LOW: the archived Verification section still names the old test command.** `docs/specs/enclosure-name-labels.md:185,191`
  - It still says `npx tsx --test` and "root `tsx` tests". The new Test-script decision section (`:328`) is now the authoritative one.
  - The approved content was kept on purpose, as the plan required, so this is informational only.
- **LOW: the callback ref runs on every render.** `src/components/FiberMap.tsx` (icon `Marker`, `ref={(marker) => syncMarkerAlt(marker, enclosure.name)}`)
  - Each `FiberMap` render detaches the ref with `null`, which does nothing, then reattaches it, which costs two string compares per icon enclosure.
  - The plan accepted this. It is negligible at this repo's scale, and nothing is written unless a value differs (shown by S2).

Checked with no issue found:

- **AC1:** `package.json:12` is exactly `node --import tsx --test src/**/*.test.ts`.
  - That is the only `package.json` change against HEAD.
  - `package-lock.json` is unchanged, and no dependencies were added.
- **AC2:** the helper matches the contract.
  - It returns early on a `null` or `undefined` marker.
  - It normalizes a missing name to `''` inside the helper, using `name ?? ''`.
  - It writes `options.alt` only when the value differs.
  - It writes the element's `alt` only when the element exists, has `alt`, and the value differs.
  - `getElement(): object | null | undefined` lets `L.Marker` be assigned without a cast; `tsc` passes.
  - Neither file imports the DOM or Leaflet.
- **AC3:** the ref is on the icon `Marker` only.
  - `alt={enclosure.name}` is kept.
  - The key, position, icon, draggable, bubblingMouseEvents, eventHandlers and Tooltip children are unchanged.
  - The ref is not on `CircleMarker`.
  - The arrow function returns `undefined`, so React 19 does not treat it as a cleanup function.
- **Tests:**
  - S1–S7 match the scenarios. S2, S3 and S6 use counting setters to prove there are no extra writes. S4 covers both `undefined` and `null` elements. S7 checks that no `alt` is added to an element that lacks one.
  - The 5 existing tests, including the 3 toggle-order sequences (S8), are unchanged.
- **AC7:** the spec includes everything the criterion lists.
  - Both keys, with the reason for each, plus the explicit `tooltipPane`.
  - The remount side effect.
  - Why `alt` must be synced in two places, with a reference to `_initIcon`.
  - The limits of the toggle-order test, and an explicit Coverage boundary that does not claim browser proof.
  - The Node ≥ 20.6 / ≥ 18.19 requirement, the version verified locally (`v22.23.3`), and no reference to the functions engines.
  - The S17 revert path.
  - S10–S16 under `Manual QA: pending human sign-off (merge gate)`.
  - The earlier approved content is kept.
- **Security:** the name is written to a DOM property, not parsed as HTML, so there is no XSS surface. No credentials appear in the spec or in `.context`, and the QA text tells the human not to record login details.
- **AC9 boundaries:** nothing changed under `functions/`, `firestore.rules`, `storage.rules` or `src/types.ts`. `skill-observations/` was not touched. Nothing was committed, pushed or deployed.

### Acceptance-criteria result

- [x] Every criterion checked against the implementation.
  - **Met by code inspection and fresh verification:** AC1, AC2, AC3, AC7, AC8 and AC9.
  - **Helper half met by unit tests:** AC4 (S1), AC5 (S1, S4) and AC6 (S4). The browser half is human QA S10–S12, which is still pending sign-off before merge, as planned.
  - Manual QA S10–S16 has not been run. The spec keeps it as a visible merge gate.

### Verdict

No BLOCKER or HIGH findings. Three LOW findings are informational.

Verdict: APPROVED
