# enclosure-label-collision-layout

Archived by `agent-flow` on 2026-10-20 after an approved review.

- Branch: `vpunpum-sudo/fix-enclosure-label-overlap`
- Base commit: `74acf2f`
- Verification: `npm run verify`, Started: 2026-10-20T02:25:16Z, Exit code: 0

## Delivery plan

Status: APPROVED
Feature: enclosure-label-collision-layout
Risk: STANDARD — the change only affects how the frontend lays out labels on the map (`FiberMap.tsx`, `enclosureLabels.ts`, `index.css`). It does not touch auth, permissions, Firestore data or rules, backend functions, deployment config, or CI.

### Objective

When Enclosures are close together on the map, each name label that is shown must be readable. A label must not cover another label or another Enclosure's marker. The "Enclosure Names" layer toggle and the existing marker behaviour (click, right-click, drag while editing, icon size, `alt`, marker key) must stay the same as in PR #78.

#### What the screenshot shows (`.context/attachments/t5wxPI/image.png`)

- Three Enclosures are a few dozen screen pixels apart: `BJ#14 RISER NT ขึ้น Tray`, `B#PB#003 (BJ#12)` and `…#PB-(BJ#13) ครอบหัว`.
- The `B#PB#003 (BJ#12)` label covers the start of the `BJ#13` label, so that name is cut off at the front.
- The `BJ#13` marker cannot be seen because the `B#PB#003` label is drawn over it.

#### Root cause (commit 74acf2f, `src/components/FiberMap.tsx` and `src/utils/enclosureLabels.ts`)

1. Every Enclosure renders `<Tooltip permanent direction="right" offset={[radius+2, 0]}>`. Each label is always placed to the right of its marker at a fixed distance, and there is no collision check between labels or between labels and markers.
2. Labels are rendered in `tooltipPane`, which sits above `markerPane` and the custom pane used for Enclosures. A label that extends over a neighbour therefore hides the neighbour's marker, not just its label.
3. A label can be up to 160px wide and about 21px tall. Enclosures that are close together are only about 20–80px apart, so overlap is certain.
4. Labels are never repositioned on zoom or pan.
5. Leaflet's default CSS also adds `margin-left: 6px` to `.leaflet-tooltip-right`. The real gap is therefore 2px from the offset plus 6px from the CSS, and a calculation based only on the offset would not match what is drawn.

The label styling (colour, font, max-width) is not the cause. The cause is the lack of placement and collision logic.

### In scope

- Add a pure screen-space placement function to `src/utils/enclosureLabels.ts`. It picks one of four directions for each label (`right`, `left`, `top`, `bottom`), or hides the label at the current zoom level when no direction fits.
- Collision checks: label vs. labels already placed, and label vs. every Enclosure marker that is in view (all markers, except the label's own marker). Markers act as fixed obstacles, and a label must not add any new covering of a marker.
- Placement order: the Enclosure being edited (`editingEnclosureId` when `drawingMode === 'edit-enclosure'`) first, then the selected one (`selectedEnclosureId`), then the original `enclosures` array order. Results must be deterministic.
- Placement order only gives the selected or edited label first claim on space. If all four directions of that label collide with markers or the viewport limits, it may still be hidden.
- The offset, CSS margin and collision rectangle are defined together (see "Geometry contract") so the calculation matches what is actually drawn.
- Measure label width with a cached canvas `measureText`, using the same font and size constants as the CSS. Width is capped at max-width, and the label height is a constant.
- Recalculate on `zoomend`, `moveend`, `resize`, on `document.fonts.ready`, and whenever the relevant data or state changes.
- Pass the chosen direction and offset to `<Tooltip>`, and change the Tooltip `key` when the direction changes. Do not render a Tooltip for a hidden label.

### Out of scope

- Changing how markers render or how markers overlap each other. This includes Enclosures at the same coordinates, clustering, and spreading markers apart.
- Leader lines, or moving a label away from its marker.
- Avoiding Routes, Fiber Loops, Points, or the search pin.
- Changing the label's colours or theme.
- Data model, Firestore, backend functions, deployment.
- Other map tooltips and popups.

### Acceptance criteria

- [ ] No two shown Enclosure labels overlap. Their collision rectangles, which follow the geometry contract, do not intersect.
- [ ] No shown label covers any marker that is not its own, whether an icon marker or a CircleMarker. Markers at the same coordinates keep their existing behaviour (the existing marker-over-marker overlap is accepted), and labels must not cover any of them.
- [ ] Each label tries the four directions in this order: `right`, `left`, `top`, `bottom`. If none fits, the label is hidden at the current zoom level, and its marker is still shown and works as before.
- [ ] The edited or selected label is placed before all other labels, so a lower-priority label can never cause it to be hidden. It may still be hidden if all four directions collide with markers.
- [ ] A hidden label comes back after zooming in until there is room, without a page reload.
- [ ] The "Enclosure Names" toggle works as before: it is on by default, turning it off removes every label, and turning it on shows the labels again in their calculated positions.
- [ ] Marker behaviour is the same as in PR #78: click and right-click handlers, `draggable` only in edit mode, the enlarged icon size when selected or edited, `alt` synced through `syncMarkerAlt`, and the marker `key` from `getEnclosureMarkerKey`.
- [ ] Labels still have `interactive={false}` and `pointer-events: none`.
- [ ] A name that is empty or only whitespace produces no label (`getEnclosureLabel`), and that marker is still treated as an obstacle.
- [ ] For `.enclosure-name-label`, Leaflet's margin is set to `0` for all four directions, and the offsets and rectangles follow the geometry contract. Unit tests verify the rectangles and offsets for every direction.
- [ ] Layout is recalculated after `document.fonts.ready` resolves.
- [ ] The new unit tests pass, and `npm run verify` passes.

### Acceptance scenarios

Unit tests (`src/utils/enclosureLabels.test.ts`, deterministic, input coordinates in px):

1. **Screenshot case:** three markers at roughly (0,0), (40,−10), (55,15) with long labels. Labels that are shown do not overlap each other or the other markers. Labels that cannot fit are hidden.
2. **Two horizontal neighbours:** A at (0,0) and B at (40,0), r=10, label 100×21. A cannot use `right`, so it gets `left`. B gets `right`.
3. **Same coordinates:** three markers at the same point. Every label that is shown passes the collision checks. Because each label's rectangle would collide with the other markers at that point, every label in this case is expected to be hidden. Marker data and output are unaffected.
4. **Priority:** a low-order selected Enclosure is in a crowded area. Its label gets the position it would have if it were alone. A neighbour that would take that space is moved or hidden instead.
5. **Priority but no safe position:** a selected Enclosure is surrounded by markers in all four directions. Its label is hidden and the function does not throw.
6. **Geometry:** for each direction, `getEnclosureLabelOffset` and the rectangle function return the values in the contract, for both icon and circle markers and for normal and enlarged sizes.
7. **Determinism and edge cases:** the same input gives the same output, empty input gives an empty result, a single item gets `right`, and an item with `label: null` is only an obstacle and has no entry in the placement result.
8. **Edge touching:** rectangles that only share an edge are not counted as overlapping, and the 1px safety padding is applied.

Manual browser checks (`npm run dev`):

9. Recreate the screenshot case. The labels do not overlap and the `BJ#13` marker can be seen.
10. Zoom out and some labels are hidden. Zoom in and the labels come back after `zoomend`.
11. Pan the map. After `moveend`, Enclosures that come into view get labels that do not overlap.
12. Edit mode: the marker gets larger, the offset follows the new radius, dragging works, and after the drop the layout is recalculated.
13. Toggle "Enclosure Names" off and on, and toggle the "Enclosures" layer off and on. No leftover tooltips remain.
14. Rename an Enclosure to a longer name. The layout is recalculated with the new width, and `alt` updates.
15. A narrow screen (≤640px) uses the compact constants, and labels do not overlap.
16. Light and dark themes: the colours are unchanged. Labels in the `top` and `bottom` directions sit exactly 2px from the marker edge, so the Leaflet margin is not being added.
17. On a hard reload where fonts arrive late, labels are repositioned after the fonts finish loading, and their width matches the text.
18. **Performance (manual, non-blocking observation):** in a project with many Enclosures, zoom and pan, then record in the review whether there is noticeable stutter. This is not a pass/fail gate. The design requirement is that the layout runs only on `*end` events and only for Enclosures in view.

### Proposed design

#### Geometry contract (offset ↔ CSS ↔ collision rectangle)

Leaflet 1.9 `Tooltip._setPosition` (`node_modules/leaflet/src/layer/Tooltip.js`) positions a tooltip as `pos − sub + offset + anchor`, where:

- `pos` is the marker's latlng in layer pixels.
- `anchor` is `[0,0]`. `L.Icon` has a default `tooltipAnchor` of `[0,0]`, `CircleMarker` has no anchor, and `getEnclosureIcon` has `iconAnchor` at the centre.
- `sub` depends on the direction: right `(0, h/2)`, left `(w, h/2)`, top `(w/2, h)`, bottom `(w/2, 0)`.
- Leaflet does not mirror the offset for `left` or `top`, so those offsets must be negative.
- Leaflet's CSS adds margins: right `margin-left: 6px`, left `margin-left: -6px`, top `margin-top: -6px`, bottom `margin-top: 6px`.

Contract:

- **CSS:** `.leaflet-tooltip.enclosure-name-label.leaflet-tooltip-{right,left,top,bottom} { margin: 0; }`. Keep `::before { display: none }`.
- `d = r + GAP`, where `GAP = 2`. `r` is half the marker size: icon 10, or 12 when enlarged; circle 7, or 9 when enlarged. Circles have `stroke: false`, so `r` is the actual radius.
- **Offsets:** right `[d, 0]`, left `[−d, 0]`, top `[0, −d]`, bottom `[0, d]`.
- **Label rectangle** for centre `(cx, cy)` and label size `w×h`:
  - right: `x ∈ [cx+d, cx+d+w]`, `y ∈ [cy−h/2, cy+h/2]`
  - left: `x ∈ [cx−d−w, cx−d]`, `y ∈ [cy−h/2, cy+h/2]`
  - top: `x ∈ [cx−w/2, cx+w/2]`, `y ∈ [cy−d−h, cy−d]`
  - bottom: `x ∈ [cx−w/2, cx+w/2]`, `y ∈ [cy+d, cy+d+h]`
- **Marker rectangle:** `[cx−r, cx+r] × [cy−r, cy+r]`. Use the actual size of each marker, including enlarged markers.
- **Intersection test:** strict inequality, after inflating each label rectangle by `SAFETY = 1`px to absorb pixel rounding and small measurement errors.
- **Label size:** width = `min(ceil(textWidth) + 2*PADDING_X(5) + 2*BORDER(1), MAX_WIDTH)`. Height = `ceil(fontSize * 1.3) + 2*PADDING_Y(2) + 2*BORDER(1)`, which is 21px normally and 19px in compact mode.
- **Constants:** normal is font 11px / weight 600 / max-width 160. Compact (viewport ≤640px) is font 10px / max-width 120. Export these values from `enclosureLabels.ts` together with a comment saying they must match `.enclosure-name-label` in `index.css`.

#### Pure API (`src/utils/enclosureLabels.ts`)

```ts
export type LabelDirection = 'right' | 'left' | 'top' | 'bottom';
export const LABEL_DIRECTIONS: LabelDirection[] = ['right', 'left', 'top', 'bottom'];
export interface LabelLayoutItem {
  id: string; x: number; y: number;   // container px, marker centre
  markerRadius: number;
  label: string | null;               // null → obstacle only
  labelWidth: number; labelHeight: number;
  priority: number;                   // 0 edit, 1 selected, 2 others
}
export type LabelPlacement = { direction: LabelDirection } | { hidden: true };
export function getLabelRect(item, direction): Rect;
export function getEnclosureLabelOffset(kind: 'icon'|'circle', enlarged: boolean, direction: LabelDirection): [number, number];
export function layoutEnclosureLabels(items: LabelLayoutItem[]): Map<string, LabelPlacement>;
```

- Algorithm: collect all marker rectangles. Sort the labels by `(priority, input index)`. For each label, try the directions in order. A direction fits if its rectangle does not intersect any marker other than the label's own or any label already placed. If no direction fits, mark the label hidden.
- O(n²) over Enclosures in view is acceptable.
- Keep `getEnclosureLabel`, `getEnclosureMarkerKey`, `getEnclosureLabelKey` and `syncMarkerAlt` as they are. Change `getEnclosureLabelOffset` to take a direction and update its existing tests.

#### Width measurement

`measureEnclosureLabelWidth(text, compact)` uses a module-level canvas set to the `--font-sans` font (read with `getComputedStyle` from the map container, or the same font stack). Results are cached in a `Map` keyed by `compact|text`. If the canvas is unavailable, fall back to `text.length * fontSize * 0.6`. Clear the cache when `document.fonts.ready` resolves.

#### Wiring (`FiberMap.tsx`)

- Add a child component inside `MapContainer`, for example `EnclosureLabelLayoutTrigger`, that uses `useMapEvents({ zoomend, moveend, resize })`. Each event calls `onLayoutChange()`, which increments `layoutVersion` in `FiberMap`. This follows the `EnclosureLabelVisibility` pattern.
- In a `useEffect`, run `document.fonts?.ready.then(() => { clearCache(); bump(); })`, with a cancelled flag on unmount.
- Get the map instance with `MapContainer ref` or `useMap` inside the child, and store it in a ref.
- `useMemo([enclosures, enclosureTypes, namesEnabled, selectedEnclosureId, editingEnclosureId, drawingMode, layoutVersion])`:
  - If `!namesEnabled` or the map is not ready (`getSize()` is 0), return an empty map, so no labels are shown.
  - Otherwise filter to Enclosures inside `map.getBounds().pad(0.2)`.
  - Work out `kind` and `enlarged` with the same logic as the render code. Reuse the same expressions, and do not duplicate the rules.
  - Call `latLngToContainerPoint`, measure the widths, and call `layoutEnclosureLabels`.
- Render: render a `<Tooltip>` only when the placement is `{ direction }`, with props `direction={dir}`, `offset={getEnclosureLabelOffset(kind, isEditingThis, dir)}` and `key={`${getEnclosureLabelKey(isEditingThis)}-${dir}`}`. Keep the other props as they are. Do not change the marker `key`.
- Editing: after a drag, the position update flows through `enclosures` and the memo runs again. No extra handling is needed.

#### Errors and security

No network calls and no data changes. Any layout failure, for example the map not being ready, must end with no labels shown. It must not throw or break the markers.

### Expected files

- `src/utils/enclosureLabels.ts`: types, constants, `getLabelRect`, `layoutEnclosureLabels`, the four-direction `getEnclosureLabelOffset`, and a measurement helper (or a separate `src/utils/enclosureLabelMeasure.ts` for the DOM-dependent part).
- `src/utils/enclosureLabels.test.ts`: tests for scenarios 1–8, with the existing tests updated to the new offset signature.
- `src/components/FiberMap.tsx`: layout trigger component, `fonts.ready` handling, memo, and Tooltip props.
- `src/index.css`: `margin: 0` for the four direction classes of `.enclosure-name-label`.
- `docs/specs/enclosure-label-collision-layout.md`: spec created by the flow.

### Risks and rollback

- **Measured width does not match the DOM width**, for example with Thai fonts. Mitigation: shared constants, recalculating after `fonts.ready`, 1px safety padding, and the manual check in scenario 17.
- **Tooltips remounting when their direction changes** could cause a brief flicker after zoom. This is acceptable, because the key changes only when the direction changes and the layout runs only on `*end` events.
- **More labels hidden at low zoom** is intended behaviour. Markers are still clickable and the name is still shown in the popup and the `alt`.
- **Rollback:** revert this PR. Behaviour returns to PR #78, where labels can overlap but nothing else breaks.

### Verification

- Focused tests: `node --import tsx --test src/utils/enclosureLabels.test.ts`
- Full gate: `npm run verify`
- Manual checks: scenarios 9–18 in `npm run dev`, with before and after screenshots of the screenshot case for the review. Scenario 18 (performance) is an observation only and does not block approval.

### Deployment

- Target: NONE
- Surface: not applicable for this change. If it is deployed later, the surface is the Cloudflare frontend.
- Required authorization: a human must separately authorize a deployment that names the Cloudflare frontend. Approval of this plan or of the review is not deployment authorization.

I'm finishing the review. The diff checks out against the plan, so I'm writing the verdict now.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: 74acf2f (Add toggleable enclosure name labels (#78))
- Head: working tree on `vpunpum-sudo/fix-enclosure-label-overlap` (not committed). Modified: `src/components/FiberMap.tsx`, `src/index.css`, `src/utils/enclosureLabels.ts`, `src/utils/enclosureLabels.test.ts`. Untracked: `docs/specs/enclosure-label-collision-layout.md`.
- Verification evidence checked: the orchestrator reports that `npm run verify` exited 0 on the current tree. `.context/implementation.md` records 24/24 focused tests, 66/66 root tests, 17/17 functions tests, and a successful Vite build. I reviewed the actual `git diff` and the untracked spec, not only the handoff summary. I checked these against `src/index.css`, the Leaflet tooltip geometry described in the plan, and the marker render code in `FiberMap.tsx`.

### Findings

- LOW: `src/utils/enclosureLabels.ts:715`: The coincident-marker rule uses exact float equality on container pixels (`other.x === item.x && other.y === item.y`). It is needed for scenario 3: with equal radii, padded label rectangles at `d = r + 2` with 1px safety only touch a co-located marker's rectangle and do not intersect it, so the plain collision test would not hide them. Markers that are nearly but not exactly on the same spot (for example 0.5px apart) can still each get a label (right and left). Those labels do not cover another marker, so every acceptance criterion holds, but which marker owns which label may be unclear. A small tolerance (for example `Math.abs(dx) < 1`) could be added later. This does not block.
- LOW: `src/utils/enclosureLabels.test.ts:507-515`: The S1 screenshot-case test checks safety and that there are 3 result entries. It does not check which labels are shown or hidden, so a change that hides every label would still pass. Asserting the expected placements would make this regression test stronger. This does not block.
- LOW: `src/components/FiberMap.tsx:1556`: `EnclosureLabelLayoutTrigger` receives a new inline `onLayoutChange` arrow on every render. As a result, react-leaflet `useMapEvents` unbinds and rebinds the `zoomend`/`moveend`/`resize` handlers on every FiberMap render. This is functionally correct and cheap, but a `useCallback` would avoid the churn. This does not block.
- LOW (process): Manual browser scenarios 9–18 are recorded as pending human QA in `docs/specs/enclosure-label-collision-layout.md`. They need human sign-off before merge, especially scenario 17 (canvas vs. rendered Thai text width) and scenario 16 (2px gap for top/bottom). Scenario 18 is observation-only, as the plan states.

Checked with no issue found:
- Geometry contract. Offsets are `[±d,0]` and `[0,±d]` (`enclosureLabels.ts:650-658`), and `getLabelRect` matches the plan's rectangles exactly (`:680-689`). The CSS zeroes all four directional margins (`index.css:620-625`). The height formula gives 21/19px. Width is capped at 160/120, which is consistent with Tailwind v4's border-box preflight and the existing `max-width`, `padding: 2px 5px`, `border: 1px`, `font-size 11px/10px`, `weight 600`, and `line-height 1.3`.
- Marker radii match the render code: icon size 20 or 24 only when editing (selection only adds a brightness filter), and CircleMarker `radius={isEditingThis ? 9 : 7}` with `stroke: false`.
- Algorithm. All in-view markers are obstacles, including those with `label: null` or a hidden label. The sort is `(priority, index)` and stable. The direction order is right, left, top, bottom. The intersection test is strict and uses the 1px padded rectangle. When no direction fits, the label is hidden. The function does not mutate its input (tested).
- Wiring. Layout reruns on `zoomend`/`moveend`/`resize`, on `document.fonts.ready` (with a cancelled flag and a cache clear), and on the memo deps (enclosures, types, names toggle, selection, editing, drawing mode, map, version). It filters to `getBounds().pad(0.2)`. A zero-size map or any thrown error produces an empty map, so no labels are shown and markers are unaffected. The width font comes from the `.leaflet-container` computed font family, which matches the font the tooltips inherit. The compact breakpoint uses `window.innerWidth <= 640`, which matches the media query.
- Render. A Tooltip is rendered only when a direction was chosen. Its key includes the direction, its offset is direction-aware, and `interactive={false}`, `pane="tooltipPane"` and the class name are unchanged. The marker `key`, `alt` with `syncMarkerAlt`, `draggable={isEditingThis}`, click, context-menu and dragend handlers, and icon sizing are unchanged. `getEnclosureVisual` is shared between the memo and the render, so the size rules are not duplicated.
- Scope. No changes to backend, Firestore, auth, deployment, CI or package files. No secrets in the diff or the spec.

### Acceptance-criteria result

- [x] Every criterion checked against the implementation.
  - [x] No two shown labels overlap: padded rectangles are checked against already-placed labels (`enclosureLabels.ts:728`). Tested in S1, S2, S15 and the label-vs-label test.
  - [x] No label covers another marker, icon or circle: `enclosureLabels.ts:727`. Coincident markers keep their behaviour and all their labels are hidden (S3).
  - [x] Directions are tried right, left, top, bottom; if none fits the label is hidden and the marker is unchanged (S5 and the render guard `label && direction`).
  - [x] Edited/selected labels are placed first and can still be hidden when surrounded (S4, S5).
  - [x] Hidden labels come back after zooming in: the `zoomend` bump triggers the memo, and S10–S11 test this at the unit level.
  - [x] The names toggle behaves as before: `namesEnabled` false gives an empty placement map and no Tooltips, and marker keys are unchanged.
  - [x] Marker behaviour is identical to PR #78.
  - [x] `interactive={false}` and `pointer-events: none` are kept.
  - [x] An empty name gives no label and the marker is still an obstacle (S7 and the existing trim test).
  - [x] Margin is 0 in all four directions, and offsets and rectangles are unit-tested for all directions, both kinds and both sizes.
  - [x] Layout reruns after `document.fonts.ready`.
  - [x] New tests pass and `npm run verify` passes (reported exit 0).
  - Manual scenarios 9–18: pending human browser QA, as noted under Findings. This is not a code defect.

### Verdict

APPROVED. There are no BLOCKER or HIGH findings. The LOW items can be done as optional follow-ups. Human browser QA (scenarios 9–18) is still needed before merge. This approval does not authorize any deployment.

Verdict: APPROVED
