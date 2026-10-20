# wi-map-real-screenshots

Archived by `agent-flow` on 2026-10-20 after an approved review.

- Branch: `vpunpum-sudo/wi-map-fix`
- Base commit: `a718aa9`
- Verification: `npm run verify`, Started: 2026-10-20T08:55:09Z, Exit code: 0

Status: APPROVED
Feature: wi-map-real-screenshots
Risk: HIGH. The script signs in to production Firebase with a real account, reads production project data, and produces images meant to be committed to the repository. A wrong sample project or a careless commit could put customer names, locations or network layout into git history. Auth, Firestore/Storage rules, Firebase functions, deployment config and CI do not change. The only app-code change is static class names on the route polylines in `FiberMap.tsx`, with no behaviour change. The script is local-only, and the only UI actions it performs are listed in a fixed allowlist.

### Objective

Replace the hand-drawn map figures in the Work Instruction (WI) with real screenshots of the system. Those figures are `MapScreen` (`'map'`) and `ContextMenu` (`'context-menu'`) in `src/components/WiFigures.tsx`.

- A Playwright script that developers run locally captures the screenshots on demand, so they can be refreshed whenever the UI changes.
- The screenshots carry numbered markers ①–⑥ that match the existing callouts.
- They must look the same on screen, in print and in PDF export.
- The three outputs (two PNGs and the marks module) are replaced as one set:
  - If the script catches an error during the replacement, it rolls back automatically.
  - If the process is killed partway through, the human recovers with git, as the docs describe.
- Until the first successful capture, the page keeps showing the current drawings.

**Amendment history:**

- **Amendment 2** dropped two steps: clicking a sidebar route entry and closing Core Manager. The sidebar handler does not pan the map, and it opens Core Manager. The script now expands the ROUTES list only to read route names and IDs, and finds route paths through static class names.
- **Amendment 3** answers the latest challenge:
  - **No reliance on the initial fit.** The `focusAll` effect in `FiberMap.tsx` (around lines 666–672) runs once as soon as *any* object exists. If enclosures or loops arrive before routes, the fit may not cover the routes.
  - **Focus all.** Once the route data is ready, the script clicks the map's existing **"Focus all objects"** control (`FiberMap.tsx` around lines 693–700), which calls `focusAll` → `map.fitBounds`. This changes the view only and writes no data.
  - **Readiness.** A bounded, stable-count readiness check tells "no routes" apart from "routes still loading". A pure, unit-tested function makes that decision.

All work already completed and verified stays as it is. The only rework is the adjustments listed under "Changes to work already done".

### In scope

**Already implemented. Keep it, and adjust only where this section says so:**

- The pure helpers and their tests in `src/utils/wiScreenshot*.ts`:
  - config
  - route
  - point
  - marks
  - output
  - actions and the menu-item check
- `src/content/wiScreenshotMarks.ts`, with initial estimates.
- In `workInstruction.ts`: the `marks` type, `image` and `marks` on the three procedures, the reworded `loop-add` ⑤, and revision 03.
- `WiScreenshot` with its image-error fallback, its use in `WorkInstruction.tsx`, and the marker and print CSS.
- `src/content/workInstruction.test.ts`.

**Changes to work already done:**

- `src/utils/wiScreenshotActions.ts`:
  - `WI_ALLOWED_ACTIONS` becomes exactly `fillLogin`, `submitLogin`, `goto`, `expandRoutesList`, `focusAllObjects`, `leftClickPoint`, `rightClickPoint`, `pressEscape`, `closePopup`.
  - `clickSidebarRoute` and `closeCoreManager` are removed.
  - The test asserts this exact set, and asserts that `clickSidebarRoute`, `closeCoreManager`, zoom, pan and drag are rejected.
- `src/utils/wiScreenshotPoint.ts`: keep it. Add a helper for the new failure message only if one is needed, and test it.

**New pure helper:**

- `src/utils/wiScreenshotReadiness.ts`, which holds the route-list readiness decision. It has a unit test, `src/utils/wiScreenshotReadiness.test.ts`.

**Remaining work:**

- **Dependency.** The coordinator (Claude, on the user's side) runs `npm install --save-dev playwright` before this implementation round. `package.json` and `package-lock.json` will then already contain `playwright`.
  - The implementer must not run `npm install` and must not edit the lockfile by hand.
  - If `playwright` is missing from `package.json`, the implementer stops and reports BLOCKED.
  - The implementer adds only the `"wi:screenshots": "tsx scripts/wi-screenshots.ts"` script entry.
  - Installing the browser binary (`npx playwright install chromium`) stays a human step.
- **App-code exception (the only accepted app change).** In `src/components/FiberMap.tsx`, add static class names to the two route `Polyline`s through `pathOptions.className`:
  - Invisible hit stroke: `'wi-route-hit wi-route-<id>'`.
  - Visible stroke: `'wi-route-line wi-route-<id>'`.

  Nothing else about the polylines changes: colour, weight, opacity, event handlers, `bubblingMouseEvents`, order, and selection or hover styling all stay the same. No other app file changes. The Focus all button, `focusAll`, the initial-fit effect, `App.tsx` and `CoreManager.tsx` are unchanged.
- **The capture script, `scripts/wi-screenshots.ts`.** It works in this order:
  1. Remove any temp or backup directories left behind by an earlier run, and warn about each one.
  2. Read config from env, with `.env.local` as a fallback.
  3. Sign in through the real `/login` form.
  4. Open `/project/<id>`.
  5. If the Routes list is collapsed, click the sidebar **ROUTES header** once to expand it.
  6. **Readiness.** Poll the number of `li[id^="sidebar-route-"]` entries and whether "No routes drawn yet." is visible. Continue until the readiness function returns `ready`, or fail at the 20 s timeout.
  7. Read the route names and IDs, then select the target route. Never click a route entry.
  8. Wait (bounded) until the target route's path (`.wi-route-line.wi-route-<id>`) is on the map.
  9. Click **Focus all objects**, wait for the map to settle, then wait for the tiles.
  10. Compute and validate a click point on the visible path.
  11. Left-click the point, capture the detail popup, then close the popup.
  12. Wait for the map to settle. Recompute the same geographic point, validate it again, then right-click it, capture the context menu and close the menu.
  13. Measure the marks.
  14. Stage all outputs in a temp directory, then commit them into the tree with backup and rollback.
- **The action allowlist.** The only page interactions allowed are:
  - fill and submit the login form
  - navigate
  - click the sidebar ROUTES header to expand the list. This changes only the `routesExpanded` UI state.
  - click the map's **Focus all objects** control. This changes only the map view, through `fitBounds`.
  - left-click on the validated route point
  - press Escape, or click the popup's close button
  - right-click on the validated route point
- **Other files:**
  - `docs/wi-screenshots.md`
  - empty placeholder keys in `.env.example`
  - the `.gitignore` temp-dir pattern
  - `public/wi/.gitkeep`

### Out of scope

- Real screenshots for any other WI figure (login, dashboard, core manager, …).
- Clicking sidebar route entries, opening or closing Core Manager, using the zoom buttons, dragging, or otherwise panning or zooming the map. The Focus all control is the only view change the script makes.
- Changing the initial-fit behaviour or the Focus all logic in the app.
- Any app-code change other than the static polyline `className`s listed above.
- Running the script in CI or from `npm run verify`.
- Committing real screenshots captured by an agent. Agents have no credentials, so the human runs the script, reviews the images and commits them.
- A separate Loop-popup capture for `loop-add`. It reuses the map screenshot.
- Automated verification against Firestore that no data was written. The read-only guarantee covers only the actions the script controls (see scenario 13).
- Automatic recovery at startup from a commit that was interrupted because the process was killed. Recovery is manual, through git.
- Installing npm packages or browser binaries from the agent sandbox.
- Any change to map behaviour, permissions, auth, rules, functions or deployment. No Cloudflare or Firebase deploy.

### Acceptance criteria

**Package and config**

- [ ] `package.json` has the devDependency `playwright` (installed by the coordinator) and the `"wi:screenshots"` script. The `verify` script is unchanged, and `npm run verify` neither runs nor needs Playwright browsers.
- [ ] Config comes only from env, with `.env.local` as the fallback and real env winning.
  - Required: `WI_SCREENSHOT_EMAIL`, `WI_SCREENSHOT_PASSWORD`, `WI_SCREENSHOT_PROJECT_ID`.
  - Optional: `WI_SCREENSHOT_BASE_URL`, `WI_SCREENSHOT_ROUTE_NAME`.
  - If a required variable is missing or empty, the script exits non-zero before starting a browser or dev server. It lists every missing variable by name and points to `docs/wi-screenshots.md`.
- [ ] Credentials never appear in stdout/stderr, error messages, generated files, or the temp directory. No Playwright trace, video or storage state is saved.
- [ ] If `WI_SCREENSHOT_BASE_URL` is not set, the script starts a Vite dev server in-process on a free port. It shuts the server down on both success and failure.
- [ ] The viewport is fixed at 1440×900 with `deviceScaleFactor` 1, and the light theme is forced.

**Routes list expansion**

- [ ] After `.leaflet-container` appears, the script finds the sidebar ROUTES header button, the one whose `onClick` toggles `routesExpanded` in `App.tsx`. The selector is scoped so it cannot match the Enclosures or Loops headers.
  - If the header is not visible within 10 s (for example, the sidebar is collapsed or the selector broke), the run fails with a clear message.
- [ ] The script calls `act.expandRoutesList()` **at most once**, and only when the list is collapsed. "Collapsed" means there is no expanded list container: no `li[id^="sidebar-route-"]` and no "No routes drawn yet." text in the Routes section. If the list is already expanded, it does not click, because a second click would collapse it.

**Route data readiness**

- [ ] After expansion, the script samples the Routes section every ~200 ms. Each sample records:
  - `t`: ms since readiness began
  - `count`: the number of `li[id^="sidebar-route-"]` entries
  - `emptyState`: whether "No routes drawn yet." is visible
- [ ] **The decision** is made by a pure function, `evaluateRouteReadiness(samples, { timeoutMs = 20_000, stableMs = 1_000 })` in `src/utils/wiScreenshotReadiness.ts`. It returns one of:
  - `{ state: 'ready', count }`: the latest count is ≥ 1, and every sample in the trailing window of at least `stableMs` has the same count. The window must span ≥ `stableMs` of observed time.
  - `{ state: 'waiting' }`: not ready, and the latest `t` is below `timeoutMs`. This holds even while `emptyState` is visible; **the first empty state is never a failure.**
  - `{ state: 'timeout-empty' }`: the latest `t` is ≥ `timeoutMs` and the latest count is 0.
  - `{ state: 'timeout-unstable', count }`: the latest `t` is ≥ `timeoutMs`, and the count is ≥ 1 but was still changing within the last `stableMs`.
- [ ] **On `timeout-empty`,** the run fails with: "No routes found in project <id>, or route data did not load within 20s ('No routes drawn yet.' still shown). Check the project has at least one Fiber route and that the network or Firestore is reachable." The targets are untouched.
- [ ] **On `timeout-unstable`,** the run fails with "route list was still changing after 20s (last count N)". The targets are untouched.
- [ ] **On `ready`,** the script reads `{ id, name }` from each `li` (the ID comes from the `sidebar-route-` prefix) and runs `selectRoute`, with unchanged rules:
  - If `WI_SCREENSHOT_ROUTE_NAME` matches exactly one entry (exact match after trimming), that route is used.
  - If it matches none, the script fails and lists the route names it found.
  - If it matches more than one, the script fails as ambiguous and lists the matching names with a count.
  - If it is not set, the first entry is used.

  The script never clicks, hovers or focuses an `li`.
- [ ] **Path readiness.** After selection, the script waits up to 20 s for `.wi-route-line.wi-route-<id>` in `.leaflet-overlay-pane`. The ID class token is escaped with `CSS.escape`. On timeout, the run fails with "route <name> is not rendered on the map within 20s (check the Routes layer is on and the route has a path)".
- [ ] The expanded Routes list is expected to appear in the map screenshot. This matches callout ③ (the lists).

**Focus all and settle**

- [ ] Only after route readiness and path readiness have both passed, the script calls `act.focusAllObjects()`. It clicks the existing map control `button[aria-label="Focus all objects"]` (`title="Focus all objects"` in `FiberMap.tsx`), once.
  - If the button is not visible within 10 s, the run fails with "Focus all objects control not found".
- [ ] The initial-fit effect is not relied on. The view used for the click point always comes from this Focus all click, which fits every enclosure, route and loop loaded at the time of the click.
- [ ] **Settle after Focus all:**
  - the map container has no `leaflet-zoom-anim` class
  - the `.leaflet-map-pane` transform and the bounding box of the target path are unchanged across consecutive samples spanning at least 500 ms
  - the wait is capped at 15 s
  - if `fitBounds` causes no movement because the view is already fitted, the stability condition is met immediately

  On timeout, the run fails with "map did not settle after Focus all within 15s".
- [ ] After the settle, `waitForTiles(20_000)` runs (see Capture). Only then is the click point computed.

**Path lookup and the app-code exception**

- [ ] In `FiberMap.tsx`, the hit-stroke `Polyline` gets `pathOptions.className = \`wi-route-hit wi-route-${route.id}\``, and the visible `Polyline` gets `pathOptions.className = \`wi-route-line wi-route-${route.id}\``.
  - All other `pathOptions` values and all `eventHandlers` stay identical.
  - The rendered appearance and the hover and selection styling are unchanged.
  - Code review confirms the `FiberMap.tsx` diff is limited to these two `className` additions.
- [ ] The script uses `.wi-route-line.wi-route-<id>` to compute the point, and accepts either `.wi-route-line.wi-route-<id>` or `.wi-route-hit.wi-route-<id>` as the `elementFromPoint` target. Any other element, including another route's path, fails the check.

**Click point (same geographic point)**

- [ ] The click point is defined by the visible path and a **length fraction** `f`. "Same point" means the same geographic point on the route, not the same screen coordinates.
- [ ] Before each left or right click, the script waits for the map to settle: 15 s cap after Focus all, 5 s cap after the popup closes. It then recomputes the point with `getPointAtLength(f * getTotalLength())`, mapped through `getScreenCTM()`.
- [ ] The point must pass the existing `validateClickPoint`:
  - inside the map container and the viewport, with a 4 px margin
  - not inside the sidebar, the sidebar toggle, `.leaflet-control-container` controls, the top-left zoom/focus button group, or the header or toolbar

  `document.elementFromPoint` must also return that route's path, as defined above.
- [ ] **Initial choice of `f`:** try 0.5, then 1/3, then 2/3. The first fraction that passes both checks is used for **both** clicks.
  - If none passes, the run fails with "route <name> has no clickable point in the map view after Focus all", the reason for each candidate, and this hint: "use a smaller sample project so every route is clearly visible when all objects are in view, or set WI_SCREENSHOT_ROUTE_NAME to a different route".
- [ ] **Before the right click,** the script recomputes the point at the **same** `f` and validates it again. If that fails, it stops with "route point moved out of usable map area after popup closed" and the reason. The targets are untouched.
- [ ] The existing point-helper unit tests stay and still pass.

**Capture**

- [ ] The same validated geographic point must open both the detail popup (left click) and the context menu (right click). If either one does not appear within 10 s, the run fails and says which one.
- [ ] Before each screenshot, the script asserts that Core Manager and Splice Manager panels are **not** visible. If one is visible, the run fails without trying to close it.
- [ ] **Tile wait:** after the Focus-all settle, and again before each screenshot, the script waits until every `.leaflet-tile` in view has `leaflet-tile-loaded` and none has `leaflet-tile-error`.
  - The wait is capped at 20 s.
  - On timeout or tile error, the script fails with "map tiles did not finish loading within 20s" and the number of unloaded tiles.
  - It never saves a screenshot with grey tiles.
- [ ] **Context menu check:** the menu must show "Cut Fiber Here", "Split at Enclosure" and "Edit". If any is missing, the run fails, names the missing items, and points to the docs section on permissions and sample projects.
- [ ] **Action discipline.** The script interacts with the page only through `act`. It never:
  - clicks a menu item
  - clicks a sidebar route entry
  - clicks the zoom buttons
  - presses save or confirm
  - accepts a dialog
  - drags, scrolls the map or wheel-zooms
  - types into any field except the login form

  Native dialogs are dismissed, never accepted, and any dialog aborts the run. The allowlist is an exported constant with a unit test, and any other action throws.

**Output replacement** (unchanged)

- [ ] **Stale cleanup at start.** Before reading config, the script looks in the repo root for directories matching `.wi-screenshots-tmp-*`, which earlier runs may have left behind. It prints a warning naming each path and its `.bak` files, then deletes it. It does not restore anything automatically. The pure planner `planStaleCleanup` is unit-tested.
- [ ] The script writes all outputs into a fresh `fs.mkdtemp` directory at the repo root (`.wi-screenshots-tmp-XXXX/`, git-ignored). The outputs are:
  - `map-overview.png`
  - `route-context-menu.png`
  - `wiScreenshotMarks.ts`
- [ ] The final files are replaced only after both captures and the marks generation have succeeded. When the commit step starts, every staged file exists and is non-empty.
- [ ] The commit step follows this order:
  1. **Backup.** Rename each existing target into the temp dir as `<name>.bak`.
  2. **Install.** Rename each staged file to its target, in the fixed order: map PNG, context-menu PNG, marks module.
  3. **Success.** Delete the temp dir.
  4. **Rollback.** On an error the script catches:
     - Remove any target already installed in this run.
     - Restore every `.bak`.
     - Report the original error and the rollback result.
     - Exit non-zero.
  5. **Rollback failure.** Keep the temp dir. Print its absolute path, the `.bak` list and the git recovery command.
- [ ] **Scope of the guarantee:** automatic rollback covers only errors the script catches. If the process is killed, the tree may hold a mix of old and new files, and recovery is manual:
  - `git checkout -- public/wi src/content/wiScreenshotMarks.ts`
  - on a first run, delete the untracked `public/wi/*.png`
- [ ] If a run fails before the commit step, none of the three target files is touched and the temp dir is removed in `finally`. This covers failures in:
  - config
  - sign-in
  - project
  - route list, readiness or selection
  - path readiness
  - Focus all or settle
  - click point
  - popup or menu
  - tiles
  - capture
  - marks
- [ ] `commitOutputs(entries, fsOps)` keeps its existing fake-fs unit tests.
- [ ] If a single mark can't be measured, that is not a failure. The script warns with the mark's name and keeps the previous value, and the run still commits all outputs.
- [ ] The marks module is regenerated with values rounded to 0.1 and a stable key order.

**Failure messages**

- [ ] Each of these fails with a clear message and a non-zero exit, and leaves the target files untouched:
  - sign-in failed or stayed on `/login`
  - the account was sent to `/change-password` or `/pending-approval`
  - the project could not be opened
  - the ROUTES header was not found
  - readiness timed out with an empty list (the message names both possibilities)
  - readiness timed out with an unstable count
  - the route name is unknown or ambiguous
  - the route is not rendered on the map within 20 s
  - the Focus all control was not found
  - the map did not settle after Focus all
  - there is no clickable point after Focus all (the message includes the hint)
  - the point moved out of the usable area after the popup closed
  - a Core Manager or Splice Manager panel is unexpectedly visible
  - the popup or menu timed out
  - menu items are missing
  - tiles did not load or showed an error
  - a dialog appeared
  - the Playwright browser is not installed (the message gives `npx playwright install chromium`)

**End-of-run summary**

- [ ] On success, the script prints:
  - any stale temp dirs that were removed
  - the files written, with their sizes
  - marks measured, and marks kept from before
  - a **mandatory review reminder**: "Before committing, open both PNGs and check them by eye for customer names, addresses, locations or any other sensitive data. Also check the sample project in the app is unchanged."

**WI rendering** (already implemented; keep it)

- [ ] `WiProcedure.marks?: { x: number; y: number }[]`. Values are % from 0 to 100, and index i maps to callout i+1.
- [ ] When `image` is set, the WI page renders the image at full width with markers ①…⑥ in fixed colours, the same in light and dark themes and in print.
- [ ] If the image fails to load, the page shows the drawn `WiFigure` with the same figcaption. This covers a 404, and SPA HTML returned with status 200.
- [ ] In print and PDF export, each figure and its markers stay together (`break-inside: avoid`), and `print-color-adjust: exact` keeps the marker colours where possible.

**WI content** (already implemented; keep it)

- [ ] The content test checks that every procedure with `image` has:
  - a `figure` fallback
  - `marks.length === callouts.length`
  - every mark within [0, 100]
  - an image path that starts with `/wi/`
- [ ] The `loop-add` callout ⑤ is reworded. `WI_META.revision` is `03`, and `WI_REVISIONS` has a row describing the move to real screenshots.

**Documentation**

- [ ] `docs/wi-screenshots.md` covers:
  - each variable, with an example `.env.local` that uses placeholders only
  - **Setup:**
    - `npm install`; `playwright` is already a devDependency
    - `npx playwright install chromium` (about 150 MB, once per machine), which is a human step
  - **Account requirements:**
    - a dedicated low-privilege test account that is approved and needs no password change
    - permissions that show "Cut Fiber Here", "Split at Enclosure" and "Edit"
  - **Sample project requirements:**
    - no real customer data
    - at least one Fiber route that has an Enclosure on it
    - **small enough that every route is clearly visible when the map shows all objects (Focus all)**, with the selected route not hidden behind the sidebar or the controls
    - an unambiguous route name, if `WI_SCREENSHOT_ROUTE_NAME` is used
    - the Routes layer turned on (the default)
  - **Readiness:**
    - the script waits up to 20 s for the route list to load and stay stable for about 1 s
    - an empty list at first is normal while data loads
    - the timeout message means either the project has no routes or the data did not load in time
  - the fact that sign-ins appear in production activity logs
  - **Script actions:**
    - the exact list: login, navigation, expanding the ROUTES header, clicking **Focus all objects**, a left click on the route, Escape or popup close, a right click on the route, Escape
    - that the script never clicks route entries, menu items, zoom buttons, save or confirm, never accepts dialogs, and never drags or scroll-zooms
  - how the click point works:
    - the view comes from Focus all, not from the initial fit
    - the same geographic point is recomputed and validated before each click
    - when it fails, use a smaller project or a different route
  - the static `wi-route-*` class names on route polylines exist for this script, and changing them breaks it
  - **Output behaviour and recovery:**
    - rollback on errors the script catches
    - no guarantee if the process is killed
    - `git checkout -- public/wi src/content/wiScreenshotMarks.ts`, or on the first run, deleting the untracked PNGs
    - stale temp dirs are deleted, with a warning, at the next start
  - **Mandatory human checks:**
    - after the first run (and any later run with a new account or project), open the sample project and confirm its routes, enclosures and cuts are unchanged
    - before every commit, review both PNGs by eye for sensitive data
  - how to adjust marks by hand if one measurement fails
  - that print colours with background graphics turned off are kept where possible but cannot be guaranteed on every browser or printer
- [ ] `.env.example` has empty `WI_SCREENSHOT_*` keys. `.gitignore` covers `.wi-screenshots-tmp-*/`. No real values appear in tracked files or `.context`.
- [ ] `npm run verify` passes.

### Acceptance scenarios

**Rendering**

1. **Fresh clone, no screenshots (404):** `public/wi/*.png` is missing. The WI page shows the drawn MapScreen and ContextMenu figures with their built-in markers. There are no broken-image icons, the legends are unchanged, and print preview looks as it did before.
1b. **Image URL returns SPA HTML:** the image URL returns `index.html` with status 200 (Cloudflare SPA fallback or `vite preview`). The WI page shows the drawn figures, not a broken image. Manual check.
2. **Screenshots present:** the WI page shows the real map image for `map-overview` and `loop-add`, and the real context-menu image for `route-cut`.
   - Map markers ①–⑥ sit on the header, the tools, the lists (with the Routes list expanded), the layer control, the popup and the sidebar toggle.
   - Context-menu markers ①–④ sit on the click point and the three menu items.
3. **Theme switch:** in dark theme, the screenshots and markers look the same as in light theme.
4. **Print/PDF:** each screenshot and all its markers stay on one page. Marker colours are kept where possible when "background graphics" is off.

**Config and environment**

5. **Missing env:** with no env and no `.env.local`, the script exits ≠0 and lists all three missing names. No browser or dev server starts.
6. **Partial env:** with only `WI_SCREENSHOT_EMAIL` set, the script lists exactly PASSWORD and PROJECT_ID as missing and never prints the email value.
7. **Env precedence:** a shell variable overrides the same key in `.env.local`. Covered by a unit test.

**Failures before capture**

8. **Wrong password:** the run fails with "sign-in failed" and does not echo the password. All three target files keep their mtime and content, and no temp dir is left behind.
9. **Password change or approval required:** the run fails with a message naming `/change-password` or `/pending-approval`, and the targets are untouched.
10. **Bad project ID:** the run fails with a clear message, and the targets are untouched.
11. **Route name:**
    - unknown: fails and lists the route names it found
    - matches two routes: fails as ambiguous and lists both
    - not set: the first route in the list is used

    Covered by a unit test, plus a human run.
12. **Browser not installed:** the run fails with the `npx playwright install chromium` hint.

**Routes list expansion**

12a. **List collapsed on load (default):** the script clicks the ROUTES header once, and the entries render. The script reads the names and IDs without clicking any entry, and no Core Manager panel opens. Human run, plus code review.
12b. **List already expanded:** the script does not click the header, and the list stays expanded. Code review.
12c. **Header missing:** the sidebar is collapsed, or the header selector broke. The run fails within 10 s with a clear message, and the targets are untouched.

**Route data readiness** (unit-tested with `evaluateRouteReadiness`)

R1. **Data arrives late:** the samples are `count 0, emptyState true` for the first 3 s, then `count 2` from t = 3.0 s onward. The result is `waiting` throughout the empty period, with no failure on the first empty state, then `waiting` until t ≥ 4.0 s, then `ready` with count 2.
R2. **Count still growing:** the count goes 1 → 2 → 3 at 300 ms intervals. The result stays `waiting` until the count has held for ≥ 1 s, then `ready` with the final count.
R3. **Genuinely empty project:** the samples are `count 0, emptyState true` from t = 0 to t = 20 s. The result is `waiting` before 20 s and `timeout-empty` at t ≥ 20 s. In the script, this maps to the two-possibility message, and the targets are untouched. Human run on an empty project, plus unit test.
R4. **Never stable:** the count keeps changing until t = 20 s. The result is `timeout-unstable`, with the last count.
R5. **Edge cases:**
    - A single sample with count ≥ 1 is `waiting`, because no stability window has been observed yet.
    - The stability window uses observed time, not the number of samples.
    - A count that drops from 2 to 1 resets the stability window.
R6. **Path not rendered:** readiness is `ready`, but the target route's `.wi-route-line` never appears within 20 s, for example because the Routes layer is off. The run fails with the "not rendered on the map within 20s" message, and the targets are untouched.

**Focus all and load order**

F1. **Enclosures load before routes:** enclosures (or loops) arrive first, so the one-time initial fit covers only them. Routes arrive later and may lie partly or fully outside the view. After readiness, the script clicks **Focus all objects**, the map fits every object including the routes, and the click point on the target route passes `validateClickPoint` and `elementFromPoint`. The run then proceeds normally.
   - Human run: simulate this by throttling or delaying the routes request, or observe it on a project where it happens naturally.
   - Code review: the click-point computation always happens after `act.focusAllObjects()` and the settle, and never relies on the initial fit.
F2. **View already fitted:** Focus all causes no movement. The settle check passes immediately and the run proceeds.
F3. **Focus all control missing:** the button is not found within 10 s. The run fails with "Focus all objects control not found", and the targets are untouched.
F4. **Map never settles:** the map keeps moving for more than 15 s after Focus all. The run fails with the settle message, and the targets are untouched.

**Read-only behaviour**

13. **Read-only (actions the script controls):**
    - Code review confirms that every page interaction goes through `act`. The only actions are: login fill and submit, navigation, the ROUTES header expansion, a Focus all click, a left click on the validated point, Escape or popup close, a right click on the validated point, and Escape.
    - The allowlist unit test asserts the exact set: `fillLogin`, `submitLogin`, `goto`, `expandRoutesList`, `focusAllObjects`, `leftClickPoint`, `rightClickPoint`, `pressEscape`, `closePopup`.
    - The test also confirms the allowlist rejects anything else, including `clickSidebarRoute`, `closeCoreManager`, a zoom-in or zoom-out click, a drag, a wheel event, a menu-item click, and a dialog accept.
    - No code path clicks "Cut Fiber Here", "Split at Enclosure", "Edit", a sidebar route entry, or any save or confirm button. No code calls `dialog.accept()`.
    - `focusAll` calls only `map.fitBounds`. The implementer confirms this and states it in the review notes.
    - The docs require the human to check the sample project by eye after the first run.
13d. **Unexpected panel:** if a Core Manager or Splice Manager panel is visible before a screenshot, the run fails without closing it. Code review.

**Click point**

19. **Route not usable after Focus all:** in a large project, the points at 1/2, 1/3 and 2/3 are all under the sidebar or a control, or outside the map. The run fails with "no clickable point in the map view after Focus all", the reason for each candidate, and the hint. Unit tests on `validateClickPoint` and `candidateFractions`, plus code review.
19b. **Point moves after the popup pans the map:** the point is recomputed at the same `f`. It has new coordinates but is still valid, so the right click lands on the new coordinates. Unit test.
19c. **Point moves out of the usable area:** after the pan, the recomputed point is invalid, or `elementFromPoint` returns another route or element. The run fails with "route point moved out of usable map area after popup closed", no right click happens, and the targets are untouched.
19d. **Usable-area exclusions:** unit tests cover the sidebar, the toggle, controls, the margin, and an accepted clear point.

**Map and capture failures**

14. **Mark measurement partly fails:** the script warns about that one mark, keeps its previous value, still writes both PNGs and the marks module, and exits 0.
15. **Repeat run:** a second run on unchanged UI and data produces a byte-identical marks module.
16. **Second capture fails:** the context menu does not appear, or a menu item is missing. The run exits ≠0 and names the problem. The existing PNGs and the marks module are unchanged, and the temp dir is removed.
17. **Missing menu item:** an account without permission, or a route where "Split at Enclosure" is hidden. The run fails, and the message names the missing item(s) and points to the docs.
18. **Tiles stall:** within about 20 s the run fails with the tile message and the number of unloaded tiles. It saves no image and leaves the targets untouched.

**Commit, rollback and recovery**

20. **Rename fails mid-commit:** fake-fs unit test. Installing the second PNG throws. The first PNG is removed and all `.bak` files are restored. The exit is ≠0 and the temp dir is removed.
21. **Rollback fails:** unit test. The temp dir is kept, and the output names its path, the `.bak` files and the git recovery command.
22. **First run with no existing PNGs:** a failed install removes any partly installed PNG, and the marks-module backup is restored.
22b. **Stale temp dir from an earlier run:** the run warns, deletes it and continues, without restoring from it. Unit test of `planStaleCleanup`.
22c. **Process killed mid-rename (documented, not automated):** the docs describe the mixed state and the git recovery command.

**Gates, regressions and hygiene**

23. **Verify gate:** `npm run verify` passes on a machine without Playwright browsers and without `.env.local`, with `playwright` present in `package.json`.
24. **Regression:**
    - Every other WI figure renders as before. Callout legends are unchanged except the reworded `loop-add` ⑤.
    - Map behaviour is unchanged: route styling, hover and selection, click and context-menu handlers, the initial-fit effect, and the Focus all, zoom-in and zoom-out controls.
    - The sidebar and Core Manager are unchanged.
    - The `FiberMap.tsx` diff contains only the two `className` additions. `App.tsx` and `CoreManager.tsx` are unchanged.
24b. **Class names render:** route SVG paths carry the `wi-route-line` / `wi-route-hit` classes with `wi-route-<id>`, and they look and behave as before. Manual check.
25. **Secret hygiene:**
    - **Precondition:** the implementation files are committed, and `git status --porcelain` is empty before the run.
    - After a successful run, `git status` shows only the two PNGs and `src/content/wiScreenshotMarks.ts` as changed or untracked.
    - The temp dir pattern and `.env.local` stay ignored, no temp dir is left behind, and nothing is written to `.context`.
26. **Human review reminder:** the success summary always ends with the reminder to review both images for sensitive data and to check that the sample project is unchanged.

### Proposed design

**Content model and rendering:** already implemented. `WiMark`, `marks?`, the `figure` fallback, the generated marks module, `WiScreenshot` with `onError`, `clampMark`, and the CSS.

**Pure helpers:**

- Unchanged: `wiScreenshotConfig.ts`, `wiScreenshotRoute.ts`, `wiScreenshotPoint.ts`, `wiScreenshotMarks.ts`, `wiScreenshotOutput.ts`.
- `wiScreenshotActions.ts`: the allowlist update described above. `REQUIRED_MENU_ITEMS` and `missingMenuItems` are unchanged.
- **New `wiScreenshotReadiness.ts`:**

  ```ts
  type ReadinessSample = { t: number; count: number; emptyState: boolean };
  type Readiness =
    | { state: 'ready'; count: number }
    | { state: 'waiting' }
    | { state: 'timeout-empty' }
    | { state: 'timeout-unstable'; count: number };
  export const ROUTE_READY_TIMEOUT_MS = 20_000;
  export const ROUTE_READY_STABLE_MS = 1_000;
  export function evaluateRouteReadiness(samples: ReadinessSample[], opts?: { timeoutMs?: number; stableMs?: number }): Readiness;
  export function routeReadinessMessage(result: Readiness, projectId: string): string | undefined; // failure text for timeouts
  ```

  The logic:
  - Take the latest sample `L`.
  - Find the earliest index `i` such that every sample from `i` to the end has `count === L.count`.
  - The state is stable when `L.count ≥ 1` and `L.t − samples[i].t ≥ stableMs`.
  - If the state is stable, return `ready`.
  - Otherwise, if `L.t ≥ timeoutMs`, return `timeout-empty` when `L.count === 0` and `timeout-unstable` when it is ≥ 1.
  - Otherwise, return `waiting`.
  - `emptyState` is recorded for diagnostics and the message only. It never causes an early failure.

**App change** (`src/components/FiberMap.tsx`, the only one):

- Add `className: \`wi-route-hit wi-route-${route.id}\`` to the hit `Polyline`'s `pathOptions`, and `className: \`wi-route-line wi-route-${route.id}\`` to the visible one.
- Leaflet applies `className` when it creates the path, and later `setStyle` calls do not touch it.
- Nothing else changes.

**Script** (`scripts/wi-screenshots.ts`):

0. **Stale cleanup.** Run `planStaleCleanup`, then warn about and remove each leftover dir.
1. **Config.** Load Vite's `loadEnv('development', cwd, 'WI_SCREENSHOT_')` merged under `process.env`. If keys are missing, print their names and exit 1.
2. **Server.** If there is no base URL, start Vite with `createServer` on a free port.
3. **Browser.**
   - Launch headless Chromium. If the executable is missing, print the install hint.
   - The context uses 1440×900, scale 1, `locale th-TH`, and forces the light theme. No tracing, video or `storageState`.
   - Dialogs are dismissed and recorded as fatal.
   - `act` is the only interaction surface.
4. **Sign in.** Go to `/login`, fill the inputs and submit. Wait up to about 30 s to leave `/login`.
   - If it lands on `/change-password` or `/pending-approval`, fail with the matching message.
   - Errors never include input values.
5. **Project.** Go to `/project/<id>` and wait for `.leaflet-container`.
6. **Expand.** Locate the ROUTES header (10 s). If the list is collapsed, call `act.expandRoutesList()` once.
7. **Readiness.**
   - Every 200 ms, record `{ t, count, emptyState }` and call `evaluateRouteReadiness`.
   - Loop while the state is `waiting`. On a timeout state, throw `routeReadinessMessage(...)`.
   - On `ready`, read `{ id, name }` from each entry and run `selectRoute`.
8. **Path readiness.** Wait up to 20 s for `.wi-route-line.wi-route-${CSS.escape(id)}`.
9. **Focus all.**
   - `act.focusAllObjects()` clicks `button[aria-label="Focus all objects"]`.
   - Settle: no `leaflet-zoom-anim`, and the pane transform and the target path's bounding box stable for at least 500 ms, capped at 15 s.
   - Then `waitForTiles(20_000)`.
10. **Choose the point.** For each candidate `f`:
    - Compute the screen point from the visible path.
    - Collect the map rect, the viewport and the excluded rects.
    - Run `validateClickPoint`, then check `elementFromPoint` against the `.wi-route-line` and `.wi-route-hit` paths for this ID.

    Use the first `f` that passes, or fail with the hint.
11. **Shot 1.**
    - `act.leftClickPoint(pt)`, then wait for `.leaflet-popup` (10 s) and let autopan settle.
    - `waitForTiles`.
    - Assert no Core Manager or Splice Manager panel is visible.
    - Measure marks ①–⑥.
    - Screenshot to `<tmp>/map-overview.png`.
12. **Close the popup.** `act.pressEscape`, or `act.closePopup` if the popup is still there. Confirm the popup is gone.
13. **Re-locate.** Settle (5 s cap), recompute at the same `f`, and validate again, or fail.
14. **Shot 2.**
    - `act.rightClickPoint(pt2)`, then wait for the menu (10 s).
    - Run `missingMenuItems`.
    - `waitForTiles`.
    - Assert no panel is visible.
    - Measure ① `pt2` and ②–④ the three items.
    - Screenshot to `<tmp>/route-context-menu.png`.
    - `act.pressEscape`.
15. **Marks.** `toPercentMarks` with the previous values as fallback, then `formatMarksModule`.
16. **Commit.** `commitOutputs`. On rollback failure, print the path, the `.bak` list and `GIT_RECOVERY_COMMAND`.
17. **Finally.** Close the browser and the server. Remove the temp dir unless rollback failed. On success, print the summary and the reminder.

**Security:**

- Credentials exist only in process memory and the ignored `.env.local`, and are never logged.
- The allowlist bounds the UI actions:
  - Expanding the ROUTES header changes local React state only.
  - Focus all changes only the Leaflet view (`fitBounds`).
  - Dialogs are never accepted.
- Production sign-ins appear in the activity logs, and the docs say so.
- A dedicated test account limited to the sample project is required. It needs edit-level permission so the menu shows all three items, which is acceptable because no menu item is ever clicked.
- A human reviews the images before committing and checks the project after the first run.

### Expected files

- `package.json`: the `wi:screenshots` script. The `playwright` devDependency and `package-lock.json` changes come from the coordinator's install and are not hand-edited.
- `scripts/wi-screenshots.ts` (new)
- `src/utils/wiScreenshotReadiness.ts` and `src/utils/wiScreenshotReadiness.test.ts` (new)
- `src/utils/wiScreenshotActions.ts` and `.test.ts`: allowlist update
- `src/components/FiberMap.tsx`: two `className` additions only
- `docs/wi-screenshots.md` (new)
- `.env.example`: placeholder keys
- `.gitignore`: `.wi-screenshots-tmp-*/`
- `public/wi/.gitkeep` (new)
- Already changed and kept:
  - `src/components/WiFigures.tsx`
  - `src/components/WorkInstruction.tsx`
  - `src/content/workInstruction.ts`
  - `src/content/wiScreenshotMarks.ts`
  - `src/content/workInstruction.test.ts`
  - `src/index.css`
  - the other `src/utils/wiScreenshot*.ts` helpers and their tests
- Not changed: `src/App.tsx`, `src/components/CoreManager.tsx`

### Risks and rollback

- **Sensitive data in images.** The docs require a sample project, the end-of-run summary always shows the review reminder, and the human reviews by eye before committing.
- **Accidental mutation.**
  - The allowlist is narrow: header expansion and Focus all are UI or view only. The implementer confirms `focusAll` only calls `fitBounds`.
  - The docs require a human check after the first run.
  - Firestore writes are not verified automatically; this is accepted and documented.
- **Load-order races.**
  - The readiness check (stable count, 20 s) separates "loading" from "empty".
  - Path readiness ensures the route is drawn before Focus all.
  - Focus all re-fits the view after the routes have loaded, so the initial-fit race is irrelevant.
  - Residual risk: enclosures or loops that load *after* the Focus all click are not in the fit. This is harmless, because the target route is already in the fitted bounds and the point is validated.
- **Focus all behaviour changes in the future.** The script validates whatever view results and fails cleanly with a hint.
- **App regression from the class names.** The change is static `className` only. Code review limits the diff, and scenario 24b is a manual check. Rollback: remove the two `className` entries. The script then fails at path readiness, and the WI page is unaffected.
- **Large projects.** The run fails cleanly with a hint. The docs require a small sample project.
- **Mixed output versions.**
  - On errors the script catches, backup and restore prevent a mix.
  - On a double failure, the temp dir is kept.
  - On process kill, recovery is through git.
- **Selector fragility** (ROUTES header, Focus all, menu, panels). Bounded waits give named failures. The script is local-only and never blocks `verify`.
- **Tile provider issues.** A bounded 20 s wait, and no grey captures.
- **Permission or data preconditions.** Named failures, with the requirements in the docs.
- **Dependency availability.** The coordinator installs `playwright` first, and the implementer stops if it is absent. Browsers are a human step.
- **Audit-log noise** from test sign-ins. Documented.
- **Rollback of this change.** Revert the commit. Removing `image`/`marks` from the three procedures alone restores the drawn figures, and no backend state is involved.

### Verification

- Focused tests:

  ```
  node --import tsx --test src/utils/wiScreenshotConfig.test.ts src/utils/wiScreenshotRoute.test.ts src/utils/wiScreenshotPoint.test.ts src/utils/wiScreenshotMarks.test.ts src/utils/wiScreenshotOutput.test.ts src/utils/wiScreenshotActions.test.ts src/utils/wiScreenshotReadiness.test.ts src/content/workInstruction.test.ts
  ```

  These cover:
  - readiness scenarios R1–R5, plus the failure messages for `timeout-empty` (both possibilities named) and `timeout-unstable`
  - the exact allowlist set, including `focusAllObjects`, and the rejected actions
  - all existing helper tests
- Manual checks by the implementer (`npm run dev`, no credentials needed):
  - **No PNGs (404):** the WI page shows the drawings (scenario 1).
  - **SPA HTML fallback:** confirm the drawn figure appears, then revert any temporary change (scenario 1b).
  - **Placeholder PNG:** with a temporary placeholder PNG (not committed), check light theme, dark theme and print preview (scenarios 2–4).
  - **No env:** `npm run wi:screenshots` prints the missing-variable error and starts no browser (scenarios 5–6).
  - **Stale temp dir:** a dummy temp dir is warned about and removed (scenario 22b).
  - **Class names:** inspect the route paths if a project view is available; otherwise this is done in the human run (scenario 24b).
- Code-review checks:
  - Every page interaction goes through `act`.
  - There is no `li` click, no zoom-button, menu-item, save or confirm click, no `dialog.accept`, and no drag or wheel event.
  - `expandRoutesList` is called at most once, and only when the list is collapsed.
  - The readiness loop uses `evaluateRouteReadiness` and never fails on the first empty state.
  - `focusAllObjects` is called after readiness and path readiness, and the point is computed only after the Focus-all settle and the tiles.
  - The point is revalidated before the right click.
  - The `FiberMap.tsx` diff is only the two `className`s.

  These cover scenarios 12a–b, 13, 13d, R6, F1–F4, 19–19c and 24.
- Human only:
  - a real run with credentials, from a clean, committed tree, on a small sample project (scenarios 2, 8–12c, R3 on an empty project, R6, F1 with the routes request throttled where feasible, F2, 14–19 and 25)
  - a visual review of both PNGs for sensitive data
  - after the first run, a check that the sample project is unchanged
- Full gate: `npm run verify`

### Deployment

- Target: NONE
- Surface: not applicable. No Cloudflare frontend deploy and no Firebase functions deploy.
- Required authorization: none for this change. Any later deploy needs separate, explicit human authorization naming the target.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: `a718aa9` (main, "Prevent overlapping enclosure labels (#79)")
- Head: uncommitted working tree on `vpunpum-sudo/wi-map-fix`. This covers the tracked changes in `.gitignore`, `package.json`, `package-lock.json`, `src/components/FiberMap.tsx`, `src/components/WiFigures.tsx`, `src/components/WorkInstruction.tsx`, `src/content/workInstruction.ts` and `src/index.css`. It also covers the untracked `.env.example`, `docs/wi-screenshots.md`, `public/wi/.gitkeep`, `scripts/wi-screenshots.ts`, `src/content/wiScreenshotMarks.ts`, `src/content/workInstruction.test.ts`, and all `src/utils/wiScreenshot*.ts` helpers and their tests.
- Verification evidence checked:
  - The coordinator reports that `npm run verify` exited 0 on the current tree.
  - I read the actual diff and the untracked files in full. That includes the script, the readiness and actions helpers and their tests, the output helper, the docs and the env example.
  - I checked the script's selectors against `src/App.tsx` (lines 1762–1830, 307–317), `src/components/FiberMap.tsx` (lines 651–672, 1490–1502, 1724–1745, 1941–2010) and `src/components/CoreManager.tsx:208`.

### Findings

- LOW: `scripts/wi-screenshots.ts:297` redacts every `WI_SCREENSHOT_*` value from `.env.local` out of error messages. That includes `ROUTE_NAME`, `PROJECT_ID` and `BASE_URL`, not just the credentials. With a short or common route name (for example "A" or "Route"), the `replaceAll` will mangle unrelated words in failure messages. It is safe, because it over-redacts, but it can make diagnostics confusing. A possible fix is to limit redaction to EMAIL and PASSWORD, from both sources.
- LOW: `scripts/wi-screenshots.ts:189-199`. Readiness counts `li[id^="sidebar-route-"]` from the filtered `listedRoutes` (`App.tsx:1793-1797`). If a sidebar filter ever hid every route, the run would end with the "No routes found…" message. The "ไม่พบเส้นทางที่ตรงกับตัวกรอง" state would never be named. The filter is not persisted today (`App.tsx:128`), so this can't happen in a fresh browser context. Note only.
- LOW: `scripts/wi-screenshots.ts:228`. The left click on the route runs `handleRouteMapSelection` (`App.tsx:307-316`), which:
  - sets `selectedRouteId`, so the route is drawn highlighted in blue
  - sets `setDetailPanel(null)`
  - scrolls the sidebar to the route entry

  None of this is persisted, and the plan already accepts it under the left-click action. But the map screenshot will show the route highlighted, and the Routes list may be scrolled, which can move mark ③. The human visual review should confirm that is acceptable.
- LOW: `scripts/wi-screenshots.ts:135`. Stale temp directories are only warned about at start-up. They are not repeated in the success summary, so the summary covers sizes, measured and kept marks, and the reminder, but not the removed directories. This is a minor gap against the "End-of-run summary" criterion. The warning still goes to stderr earlier in the same run.
- LOW: Scenario 15 (a byte-identical marks module on a repeat run) and the live selector assumptions can only be confirmed by the credentialed human run. Those assumptions are:
  - `.glass-panel > div:first-child` for mark ①
  - `div.fixed.top-0.right-0.h-screen` for Core Manager
  - the `Enclosure:` heading for Splice Manager
  - Escape closing the Leaflet popup

  The fallbacks I could check are in place: `closePopup` exists, and a failed mark measurement keeps the previous value. The plan assigns these checks to the human run.

### Acceptance-criteria result

- [x] Every criterion checked against the implementation.

**Package and config**

- `wi:screenshots` was added, `verify` is unchanged, and the `playwright` devDependency came from the coordinator.
- Env loading uses `loadEnv` under `process.env` (`scripts/wi-screenshots.ts:142`).
- Missing keys fail before any server or browser starts (`:143-144`), after the stale cleanup (`:141`), as the plan specifies.
- The context is 1440×900 at scale 1, with the light theme forced through `fiber_theme`, and there is no trace, video or `storageState` (`:161-162`).

**App change**

- The `FiberMap.tsx` diff is exactly the two static `className` additions (`:1727`, `:1740`). Colour, weight, opacity, handlers and `bubblingMouseEvents` are unchanged.
- `App.tsx` and `CoreManager.tsx` are untouched.
- `focusAll` (`FiberMap.tsx:651-664`) calls only `map.fitBounds`.

**Allowlist**

- `WI_ALLOWED_ACTIONS` is exactly the nine approved actions.
- The test asserts the exact set and rejects `clickSidebarRoute`, `closeCoreManager`, zoom, drag, wheel, menu-item click, dialog accept and save.
- Every page interaction in the script goes through `act`, and every `act` method calls `assertAllowedAction`.
- There is no `li` click, menu-item click, zoom click, `dialog.accept`, drag or wheel anywhere. Dialogs are dismissed and abort the run (`:165-166`).

**Routes list expansion**

- The header selector is scoped to the button whose `span.uppercase` text is exactly "Routes". That cannot match Enclosures or Loops.
- The header has a 10 s bounded wait.
- `expandRoutesList` is called at most once, and only when there are no entries and no empty-state text (`:190`). This covers scenarios 12a, 12b and 12c.

**Readiness**

- `evaluateRouteReadiness` follows the specified algorithm:
  - observed-time stability window
  - an empty state never fails early
  - `timeout-empty` and `timeout-unstable`
- The tests cover R1, R2, R5 (single sample, time not sample count, a drop resets the window), R3 and R4, plus both messages.
- The script loop samples every 200 ms and fails only through `routeReadinessMessage` (`:191-201`).

**Selection and path readiness**

- `selectRoute` runs on the names read from the `li` elements, with unchanged not-found and ambiguous messages.
- The path wait uses a 20 s cap on a `CSS.escape`d selector inside `.leaflet-overlay-pane`, with the specified message (`:211-213`). This covers R6.

**Focus all and settle**

- The button is checked with a 10 s visibility wait, then clicked once, and only after readiness and path readiness (`:214-216`).
- The settle condition is no `leaflet-zoom-anim`, plus the pane transform and the path's bounding box stable for at least 500 ms, with a 15 s cap. An unmoved view passes after 500 ms (F2).
- Tiles are then checked (`:217-218`), and only after that is the point computed. This covers F1, F3 and F4.

**Click point**

- The candidates come from `candidateFractions` (0.5, 1/3, 2/3).
- Each candidate is checked with `validateClickPoint` and with `elementFromPoint` against either `.wi-route-line` or `.wi-route-hit` for that ID.
- If none passes, the failure message includes the reason for each candidate and the hint (`:220-227`).
- Before the right click, the point is recomputed at the same `f` after a 5 s settle, and invalid points fail with the specified message (`:248-250`). This covers scenarios 19, 19b and 19c.

**Capture**

- The popup and menu each have a 10 s wait (`.fiber-detail-popup.leaflet-popup` and `.fiber-context-menu.leaflet-popup`, which match `FiberMap.tsx:1941`).
- Menu items are checked with `missingMenuItems` against the visible spans, so hidden buttons are excluded.
- Before each screenshot, the script waits for tiles and asserts the panels are absent.
- Measuring `getByRole('button', { name: 'Edit' })` matches only "Edit": the other buttons are "Cut Fiber Here", "Split at Enclosure" and "Core details".

**Output**

- The temp dir is a `mkdtemp` at the repo root.
- Staged files are checked to be non-empty before the commit step.
- `commitOutputs` handles backup, install in the fixed order, and rollback.
- On rollback failure, the temp dir is kept and the script prints its path, the `.bak` list and the git command.
- In every other case, `finally` removes the temp dir and closes the browser and server.
- Failures before the commit step leave the targets untouched, because the temp dir is created only after the popup capture and nothing is renamed until `commitOutputs`.

**Success summary**

- The summary prints the files written with sizes, the measured marks, the kept marks and the mandatory reminder (`:284-287`).

**WI rendering and content**

- `WiScreenshot` shows the drawn-figure fallback on `onError`. That covers both the 404 and the SPA-HTML case.
- Markers use fixed colours, with `print-color-adjust: exact` and `break-inside: avoid`.
- Revision 03, the revision row and the reworded `loop-add` ⑤ are present.

**Documentation and hygiene**

- `docs/wi-screenshots.md` covers every required topic:
  - variables, with a placeholder example `.env.local`
  - setup and the human browser install
  - account and sample-project requirements, including a small project for Focus all
  - readiness behaviour
  - the activity-log note
  - the exact list of script actions and the actions it never takes
  - how the click point works
  - the `wi-route-*` dependency
  - rollback, process-kill recovery and stale-directory cleanup
  - the mandatory human checks
  - how to edit marks by hand
  - the print-colour caveat
- `.env.example` has empty keys only.
- `.gitignore` covers `.wi-screenshots-tmp-*/`.
- `public/wi/` contains only `.gitkeep`.
- No credentials appear in tracked files or `.context`.

**Human-only (not verifiable here, as the plan assigns)**

- the real credentialed run: scenarios 2–4, 8–12c, R3 live, R6 live, F1 with throttling, 14–19, 24b and 25
- the visual review of both PNGs for sensitive data
- the post-run check that the sample project is unchanged

### Verdict

Verdict: APPROVED
