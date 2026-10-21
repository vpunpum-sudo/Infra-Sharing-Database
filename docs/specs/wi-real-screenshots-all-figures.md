# wi-real-screenshots-all-figures

Archived by `agent-flow` on 2026-10-20 after an approved review.

- Branch: `vpunpum-sudo/wi-map-fix-v3`
- Base commit: `8860428`
- Verification: `npm run verify`, Started: 2026-10-20T15:37:29Z, Exit code: 0

Status: APPROVED
Feature: wi-real-screenshots-all-figures
Risk: HIGH. The script signs in to production Firebase with a real account and reads production data, including other users' personal data. The images go into a PUBLIC repository. Safety rests on three layers: a read-only action allowlist, a network write guard that blocks by default, and declarative per-figure masking of personal data with checks before each capture. This revision only adds exact, action-bound exceptions to the click-label check so the script can open the approval document and the signing form. Neither opener writes data. The change touches no auth code, data rules, backend functions, deployment config, or CI.

### Revision note (this draft)

The implementation stage stopped on a blocker (`.context/implementation.md`, "Blocking issue"): `approval-sign` cannot be reached because the buttons that open it start with `ลงนาม`, and the label rule denies every label containing `ลงนาม`. Code check:

- `ลงนาม Planning (<owner>)` and `ลงนาม O&M (<owner>)` in `src/components/DesignApprovalModal.tsx` (~3794–3799, ~3884–3889) call `handleOpenSignModal` (~1201–1211). That function only sets UI state: `signingTarget`, empty signer name and position (no `previousSignOff`), a fixed comment text, and `setSigningModalOpen(true)`. It makes no Firestore, Storage, or Functions call.
- `ลงนาม 2 ระดับ` / `เอกสารอนุมัติ` in `src/components/ProjectsDashboard.tsx` (~655–667) only calls `setApprovalModalProject(project)`.
- The re-sign button `แก้ไขข้อมูล / ลงนามใหม่` passes `previousSignOff`, which pre-fills a real signer's name. It stays denied.

What changes: exact, anchored, action-bound label exceptions for the open-only buttons (criterion **Click safety: open-only exceptions** and scenarios 12, 26–28), plus a clearer rule on when a label check can abort the run. Every other requirement is unchanged. The network guard is still the primary protection and does not change.

### Objective

Every figure in the Work Instruction (WI) should be a real screenshot instead of a drawing from `src/components/WiFigures.tsx`, with the numbers ①… over the same elements the callouts describe. This extends the map system from PR #82/#83.

The screenshots come from the local script `npm run wi:screenshots`, which is not part of CI or `npm run verify`. The script:

- is strictly read-only;
- masks personal data in the DOM with a declarative spec per figure and checks the result before each capture;
- can capture a subset with `--only`;
- skips any figure it cannot reach (permission or data state), reports why, and keeps the drawing as the fallback.

A human must look at every image before commit. This is a required gate, because the script cannot detect names outside the declared regions.

### In scope

- A registry of all 19 figures: login, dashboard, card-actions, project-form, profile, enclosure-form, route-draw, core-manager, splice, files, schedule, approval-request, approval-sign, users, permissions, settings, logs, plus the existing map and context-menu.
- A declarative mask spec per figure (`src/utils/wiScreenshotMaskSpec.ts`) listing the regions to mask (required or optional) and their placeholders.
- **Placeholders contain no `@` and no run of digits that looks like a phone number.** `findPii` has no exception list.
- `data-wi-pii="<kind>"` attributes on components that show personal data. They are display-only and do not change behaviour.
- Pre-capture checks:
  - every required region matches at least one element;
  - `findPii` and `findKnownValues` run over the whole page;
  - every image or signature region has been replaced.
- A network guard that blocks non-GET requests by default. The pure classifier returns one of three results: `'allow' | 'block' | 'deny-quiet'`. The guard only records requests during sign-in (observe phase).
- The exception `deny-quiet` applies only to an exact POST to the `getProjectCreatedDates` callable. It is accepted with this plan, and there is no alternative configuration.
- Orchestration logic as a pure, testable function (`src/utils/wiScreenshotRun.ts`).
- The orchestrator `scripts/wi-screenshots.ts` and per-figure capture functions in `scripts/wi-screenshot-figures.ts`.
- `--only=<id,id>`.
- Clip and composite captures, with marks computed against the final image.
- A larger action allowlist plus a label check on every click.
- **New in this draft:** exact, action-bound label exceptions for the open-only approval buttons (`openApprovalDocument`, `openSignForm`), and a close action for the signing form (`closeSignForm`).
- A route, enclosure, and loop count before and after the run. This is a limited secondary signal.
- A marks module keyed by figure id, and a `screenshot(figure)` helper in `workInstruction.ts`.
- The pure function `wiFigureView` in `WiFigures.tsx`.
- WI revision 04.
- Unit and content tests.
- `docs/wi-screenshots.md`.

### Out of scope

- Creating, editing, or deleting data to set up a screenshot. A figure without the right data is skipped and keeps its drawing.
- Signing, approving, rejecting, or requesting changes on any document. The script never types a signer name or position, never draws on the signature pad, never uploads a signature image, and never presses a submit button in the signing form.
- Loosening the general deny rule. The only new allowances are exact full-string labels tied to a specific action.
- Deleting the drawings in `WiFigures.tsx`.
- Changing the meaning or order of callouts. Wording fixes are allowed only where the text no longer matches the real UI, and must be listed in the summary.
- CI, adding the script to `npm run verify`, and deployment (Cloudflare and Firebase functions).
- New image libraries. Composites are built inside Playwright's browser.
- A browser or component test runner. Wiring `onError` to `wiFigureView` is a manual check.
- Real captures in the Codex sandbox (no network or credentials). The coordinator or a human runs them.
- Automatically removing an old key when a figure is skipped. The removal steps go in the docs.
- Automatically detecting people's names outside the declared regions. Human review is the gate.
- Any exception in the guard other than `getProjectCreatedDates`.
- Changes to any React component other than `data-wi-pii` attributes. The approval buttons and `handleOpenSignModal` are not modified.

### Acceptance criteria

- [ ] **Registry** (`src/utils/wiScreenshotFigures.ts`, pure data). Each of the 19 entries has:
  - `id`;
  - `file`: map → `map-overview.png`, context-menu → `route-context-menu.png`, every other figure → `<id>.png`;
  - screen or route;
  - `needs` (`any` | `admin` | `permission:<key>` | `data:<state>`);
  - clip (`viewport` | `element` | `composite`);
  - `markCount`, equal to the callout count of every procedure that uses the figure.
- [ ] **Marks and content.**
  - `WI_SCREENSHOT_MARKS: Partial<Record<FigureId, Mark[]>>`.
  - A procedure shows a screenshot only when its figure has a key. It gets `image`, `marks`, and the `figure` fallback through `screenshot(figure)`.
  - The content test checks that:
    - every key is in the registry and has its PNG in `public/wi/`;
    - every procedure with a key has image, marks, and figure, and its mark count equals its callout count;
    - every mark is within 0–100;
    - every figure id used in the WI is in the registry;
    - no procedure has an `image` without a key;
    - every registry figure has a mask spec;
    - `WI_META.revision === '04'` and a revision-04 row exists.
- [ ] **`--only`.**
  - With no argument, every figure is captured.
  - `--only=a,b` captures only those figures, in registry order.
  - An unknown id, an empty list, or a duplicate id stops the run before the browser opens and lists the valid ids.
- [ ] **Per-figure result.** A figure is `captured` only when all of these hold:
  - every mark was measured; for a new figure no default position is substituted;
  - mask checks (a), (b), and (c) passed;
  - the PNG was written to staging;
  - the guard has not tripped.

  Otherwise it is one of:
  - `skipped: permission`;
  - `skipped: data-state`;
  - `failed: mask-required:<region>`;
  - `failed: pii:<kind>` (the matched value is never printed);
  - `failed: known-value`;
  - `failed: image-region:<region>`;
  - `failed: <reason>`.

  In every non-captured case the old PNG and key stay as they were.
- [ ] **Run-level, all-or-nothing.** In each of these cases `commitOutputs` is not called, nothing is written, and the exit code is 1:
  - sign-in fails, or the account is sent to `/change-password` or `/pending-approval`;
  - the sample project cannot be opened;
  - a native dialog appears;
  - **the guard classifies any request as `block` while enforcing**;
  - a disallowed action, or a click on a target whose label fails `assertSafeClickLabel(label, action)` (see **Click safety**);
  - the counts change.

  If the final `commitOutputs` fails, it rolls back as before.
- [ ] **Partial run.** When no run-level case happens:
  - a single `commitOutputs` writes the PNGs of every captured figure plus the merged marks module (old keys kept);
  - the script prints:
    - the results table;
    - the list of files a human must check;
    - the observe-phase log;
    - the `deny-quiet` count;
  - exit code is 0 when no figure is `failed`, and 1 otherwise. Captured figures are still written in both cases.
- [ ] **`classifyRequest({ method, url }, { functionsOrigin })`.** A pure function that returns `'allow' | 'block' | 'deny-quiet'`. `functionsOrigin` comes from the project's Firebase config: `https://asia-southeast1-<projectId>.cloudfunctions.net`, matching `getFunctions(app, 'asia-southeast1')` in `src/firebase.ts`. Rules are checked in this order:
  1. **Cloud Functions** (any host ending in `cloudfunctions.net` or `.run.app`, any method):
     - `deny-quiet` **only** when the method is `POST`, the origin equals `functionsOrigin` exactly, and `pathname === '/getProjectCreatedDates'` exactly (not a prefix or substring; a query string is not used in the match);
     - everything else is `block`, including GET or OPTIONS to the same URL, paths such as `/getProjectCreatedDatesX` or `/x/getProjectCreatedDates/extra`, other origins and regions, and every other callable (`createManagedUser`, `deleteManagedUser`, `manageProjectFile`, …).
  2. GET, HEAD, and OPTIONS to any other host → `allow`.
  3. Non-GET requests on the allowlist → `allow`:
     - Firestore `/google.firestore.v1.Firestore/Listen/channel` (WebChannel and long-polling);
     - Firestore REST `:runQuery`, `:batchGet`, `:runAggregationQuery`;
     - identitytoolkit `accounts:signInWithPassword` and `accounts:lookup`;
     - `securetoken.googleapis.com/v1/token`.
  4. Every other non-GET request → `block`. This includes Firestore `/Write/channel`, `:commit`, `:batchWrite`, PATCH and DELETE; POST, PUT and DELETE to Firebase Storage; other identitytoolkit endpoints; and unknown hosts.

  `describeRequest` reports `METHOD host path` without query string or body.
- [ ] **Guard phases and behaviour** (unchanged by this draft).
  - The browser context uses `serviceWorkers: 'block'`.
  - **Observe phase:** from opening the browser until sign-in succeeds and `/` has loaded and settled. Requests classified `block` or `deny-quiet` are only recorded (method, host, path) and are not aborted. Writes the app makes itself during sign-in (activity log, user document) are an accepted effect.
  - **Enforce phase:**
    - `allow` → `route.continue()`.
    - `deny-quiet` → `route.abort()`. The request never reaches the server, the `quietDenied` counter goes up, and the guard **does not trip**.
    - `block` → `route.abort()`, then `tripped = true` and a `SafetyViolation`. No figure in the run is committed.
- [ ] **Masking.** Before every capture after sign-in, the script applies the figure's spec plus the header spec, then checks:
  - (a) every `required` region matches at least one element; `optional` regions are listed explicitly;
  - (b) `findPii` (emails and phone numbers) and `findKnownValues` (the account's email and display name) over `document.body.innerText`, every `input`/`textarea` value and placeholder, and `title`/`alt`/`aria-label` across the whole page;
  - (c) every `img`, `canvas`, or signature `svg` in a photo or signature region carries `data-wi-masked="1"` and is hidden or replaced.

  If any check fails, the figure fails and its image is not saved.
- [ ] **Placeholders** (fixed constants in `wiScreenshotMaskSpec.ts`; no `@` and no run of 4 or more digits):

  | Data | Placeholder |
  |---|---|
  | name | `ผู้ใช้ตัวอย่าง N` (N is the row number, at most 3 digits) |
  | the account's own name | `ผู้ใช้ตัวอย่าง` |
  | email | `อีเมลผู้ใช้ N (ปิดบัง)` |
  | phone number | `เบอร์โทร (ปิดบัง)` |
  | profile image link | `ลิงก์รูปโปรไฟล์ (ปิดบัง)` |
  | supervisor or person in charge | `ผู้รับผิดชอบตัวอย่าง` |
  | company | `บริษัทตัวอย่าง จำกัด` |
  | contract or PO number | `เลขที่สัญญา (ปิดบัง)` |
  | Description in logs | `รายละเอียดการกระทำ (ปิดบังข้อมูล)` |

  A unit test checks that every placeholder, for N = 1…999, produces no `findPii` result.
- [ ] **How masking runs.** Masking is display-only:
  - it changes text nodes and attributes;
  - it changes input values through the DOM property **without dispatching input or change events**;
  - it hides images and canvases with CSS and places a placeholder `div` over them;
  - it never draws on a canvas.
- [ ] **Permissions.** A figure that needs a permission the account lacks is `skipped: permission` when the app redirects to `/` or the element that permission enables is missing.
- [ ] **Capture settings.** 1440×900, deviceScaleFactor 1, light theme, th-TH. A modal figure is clipped to the modal. Marks are computed against the final image. Each anchor is placed so it does not cover the callout's text.
- [ ] **Click safety: general rule.** The script never clicks or presses save, submit, confirm, delete, upload, sign, approve, reject, request changes, send, splice or unsplice, export, or logout. It never presses Enter in a form, never draws a signature, and never selects a file.
- [ ] **Click safety: label check, `assertSafeClickLabel(label, action)`** in `src/utils/wiScreenshotActions.ts`.
  - **Normalization:** trim, then collapse internal whitespace to single spaces. The label is the clicked element's visible text, or its `aria-label` when it has no text. An empty label throws.
  - **Order:**
    1. If `action` has an entry in `ACTION_EXACT_LABELS` and the normalized label fully matches one of that action's patterns, the label is allowed.
    2. If the label is in the general `EXACT_SAFE_LABELS` set (`Cancel`, `Finish Drawing`, `Back to Projects`, `สร้างโครงการ`, `Splice Manager`, `ปิด`, `ยกเลิก`), it is allowed.
    3. If the label matches `DENIED_LABEL`, it throws.
    4. Otherwise it is allowed.
  - **`DENIED_LABEL`** keeps every existing term (`บันทึก|save|ยืนยัน|confirm|ลบ|delete|ส่งคำขออนุมัติ|ลงนาม|ไม่อนุมัติ|upload|export|splice|unsplice|ออกจากระบบ|logout`, case-insensitive) and adds `อนุมัติ`, `ขอแก้ไข`, `ส่ง`, `submit`, `approve`, `reject`, `sign`. The rule only gets stricter.
  - **`ACTION_EXACT_LABELS`** has only these entries. Each pattern is anchored (`^…$`) and is the only way a label containing a denied term can pass:

    | action | allowed label patterns | what the button does |
    |---|---|---|
    | `openApprovalDocument` | `^ลงนาม 2 ระดับ$`, `^เอกสารอนุมัติ$` | `setApprovalModalProject(project)` (ProjectsDashboard ~655–667) |
    | `openSignForm` | `^ลงนาม Planning \([^()]+\)$`, `^ลงนาม O&M \([^()]+\)$` | `handleOpenSignModal(owner, level)` with no `previousSignOff` (DesignApprovalModal ~3794–3799, ~3884–3889) |

  - A pattern belonging to one action does not apply to another. For example, `assertSafeClickLabel('ลงนาม Planning (ITEL)', 'openApprovalDocument')` throws, and a call with no action or another action falls through to the deny rule.
  - `openSignForm` and `closeSignForm` are added to `WI_ALLOWED_ACTIONS`; `openApprovalDocument` already exists.
- [ ] **Click safety: approval-sign flow** (`scripts/wi-screenshot-figures.ts`).
  1. Open the sample card on `/`. Find the approval button on that card, then `clickSafe(button, 'openApprovalDocument')`.
  2. Inside the approval modal, find `button` elements whose normalized text fully matches an `openSignForm` pattern. Do not search the whole page.
  3. If there are none (the account cannot sign this document, or nothing is waiting for a signature), close the modal and return `skipped: data-state`. This is not a run-level abort.
  4. Otherwise click the **first** match with `clickSafe(button, 'openSignForm')`. Then wait until `[data-wi-pii="signer-name"]` is visible. If it does not appear within the figure's time cap, return `failed: sign-form-not-opened`.
  5. Do not type into the name, position, or comment fields. Do not touch the signature pad, the clear button, or the signature upload button. Apply the mask (the signer name and position inputs are set to empty through the DOM property), check it, measure the marks, and capture. The submit buttons (`✓ ลงนามอนุมัติ`, `ไม่อนุมัติ / ขอแก้ไข`) may be **measured** as mark targets. They are never clicked.
  6. Close the signing form with Escape. If it is still open, use `clickSafe(<button aria-label="ปิด">, 'closeSignForm')`. Then close the approval modal with Escape, or with its close or cancel button through `clickSafe`. Confirm the signing form is gone.
- [ ] **Click safety: when a label check aborts.** A label check runs **only** on the element the script is about to click, immediately before the click. Denied labels elsewhere on the page do not affect the result: submit buttons in the signing form, `แก้ไขข้อมูล / ลงนามใหม่`, other projects' buttons, and labels used only to measure marks. The run aborts only when the script tries to click a target whose label fails the check. In that case the click does not happen, `SafetyViolation` is raised, `commitOutputs` is not called, and the exit code is 1. This is the existing run-level rule. Catching the error and turning it into a per-figure skip or fail is not allowed.
- [ ] **Docs.** `docs/wi-screenshots.md` covers:
  - the figure table and the permission and data state each figure needs;
  - the mask spec and placeholders, and the limits of automatic checks;
  - **the human review gate before commit**;
  - the guard: its phases, the three results, and the single `getProjectCreatedDates` exception with its reason (a read-only callable the dashboard calls on every mount and whose errors the app swallows silently; an old project with no `createdAt` may show no created date);
  - **the open-only label exceptions:** the exact labels, the action each is bound to, why they are safe (UI state only; the network guard still blocks any write), and the statement that approval-sign never signs, types, draws, or uploads;
  - `--only`, skip and exit behaviour, including `approval-sign` → `skipped: data-state` when this account has nothing to sign;
  - how to remove a key;
  - a warning that anything committed stays in Git history.
- [ ] `npm run verify` passes without Playwright, network, or credentials.

### Acceptance scenarios

1. **Right after implementation:** the marks module has only `map` and `context-menu`. The content test passes. The other 17 figures show drawings, and map-overview, loop-add, and route-cut still show screenshots (regression).
2. **Key without a PNG:** a `login` key with no `public/wi/login.png` makes the content test fail, naming the figure.
3. **Wrong mark count:** a `dashboard` key with 5 marks against 6 callouts makes the content test fail.
4. **Fallback when the image fails to load:**
   - Unit test of `wiFigureView({ image, failed })`: no image gives `drawing`; image with `failed=false` gives `image`; image with `failed=true` gives `drawing`.
   - Manual check of the `onError` wiring: rename a PNG temporarily, open `/manual`, and confirm the drawing appears.
5. **`--only`:**
   - `login,dashboard` returns `['login','dashboard']`;
   - `dashboard,login` returns registry order;
   - `foo`, an empty list, and `login,login` fail with the list of valid ids;
   - no argument returns every id.
6. **Merge:** `--only=dashboard` while a `login` key exists. The `login`, `map`, and `context-menu` keys keep their values, and only `public/wi/dashboard.png` is replaced.
7. **Non-Admin account:** users, permissions, settings, and logs are `skipped: permission`. Exit code is 0 when nothing else failed.
8. **approval-sign with nothing awaiting this account's signature:** the approval modal opens, it contains no button matching an `openSignForm` pattern, the modal is closed, and the result is `skipped: data-state`. No data is created. The run is not aborted, even though the modal contains denied labels such as `แก้ไขข้อมูล / ลงนามใหม่` or `รอลงนามระดับ Planning`. Exit code is 0 when nothing else failed.
9. **Classifier (pure unit test, with `functionsOrigin = https://asia-southeast1-demo.cloudfunctions.net`):**

   | Request | Result |
   |---|---|
   | POST and GET `firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?…` | allow |
   | POST `…/google.firestore.v1.Firestore/Write/channel?…` | block |
   | POST `…/documents:runQuery`, `:batchGet`, `:runAggregationQuery` | allow |
   | POST `…/documents:commit`, `:batchWrite`; PATCH and DELETE `…/documents/projects/x` | block |
   | GET Storage `…/o/…?alt=media` | allow |
   | POST, PUT, DELETE Storage | block |
   | **POST `https://asia-southeast1-demo.cloudfunctions.net/getProjectCreatedDates`** | **deny-quiet** |
   | GET and OPTIONS to the same URL | block |
   | POST `…/getProjectCreatedDatesX`, `…/x/getProjectCreatedDates/extra`, `…/getProjectCreatedDates/` | block |
   | POST `/getProjectCreatedDates` on a different origin (other region, other project, `*.run.app`) | block |
   | POST `…/createManagedUser`, `…/deleteManagedUser`, `…/manageProjectFile` | block |
   | identitytoolkit `accounts:signInWithPassword`, `accounts:lookup` | allow |
   | identitytoolkit `accounts:update`, `accounts:delete`, `accounts:sendOobCode` | block |
   | POST `securetoken.googleapis.com/v1/token` | allow |
   | POST to an unknown host | block |
   | GET map tiles; GET Vite dev server | allow |

   `describeRequest` returns `POST firestore.googleapis.com /google.firestore.v1.Firestore/Write/channel` (no query string).
10. **Orchestration (unit test with fake dependencies):**
    - A `block` during figure 3 of 5: `commitOutputs` is called **0 times**, the result is `aborted: guard`, and the exit code is 1.
    - A `block` after the last figure but before commit gives the same result.
    - A `deny-quiet` (one or more times) during the dashboard and card-actions figures: the guard does not trip, `commitOutputs` is called once with both figures, `quietDenied` equals the number of times, and the exit code is 0.
    - A `deny-quiet` followed by a `block` in the same run: `commitOutputs` is called 0 times.
    - No trip, with both skipped and failed figures: `commitOutputs` is called once with captured figures only, and the exit code is 1.
    - Everything captured or skipped: exit code 0.
    - A capture function that throws `SafetyViolation` (unsafe click label) during figure 2 of 4: `commitOutputs` is called 0 times and the exit code is 1.
    - A capture function that returns `skipped: data-state` for approval-sign while the others are captured: `commitOutputs` is called once without approval-sign, and the exit code is 0.
11. **Observe phase:** a request classified `block` or `deny-quiet` during sign-in is recorded and not aborted, and the guard does not trip. After `enforce()`, a `block` trips the guard and a `deny-quiet` is aborted without tripping it.
12. **Click allowlist (general):**
    - `assertAllowedAction('submitApproval')` throws. `assertAllowedAction('openSignForm')`, `('closeSignForm')`, and `('openApprovalDocument')` do not throw.
    - With no action argument, `assertSafeClickLabel` throws for: "บันทึก", "Save", "ยืนยัน", "Confirm Changes?", "ลบ", "Delete User", "ส่งคำขออนุมัติแบบ…", "ลงนาม…", "ไม่อนุมัติ", "Upload", "Export Diagram as PDF", "Splice", "Unsplice", "ออกจากระบบ", "Logout", "ขอแก้ไข", "อนุมัติ", "ส่ง".
    - Exact matches on `EXACT_SAFE_LABELS` are allowed; substrings are not.
    - `goto` accepts only paths on its list.
13. **Pure masking functions:**
    - `findPii` finds emails and phone numbers (`0x-xxx-xxxx`, `0xxxxxxxxx`, `+66…`) and returns kinds, not values.
    - `findKnownValues` finds the account's email and display name, case-insensitively, after trimming.
    - Text with no personal data is unchanged.
14. **Mask-then-check (pure test, `maskThenCheck(pageSnapshot, spec, knownValues)`)**, using a snapshot of page text, input values, attributes, and region matches. It applies the spec's placeholders, then calls `checkMaskResult`:
    - (a) all personal data sits in the declared regions: after masking, the result passes, and every placeholder (`ผู้ใช้ตัวอย่าง 12`, `อีเมลผู้ใช้ 12 (ปิดบัง)`, `เบอร์โทร (ปิดบัง)`, `ลิงก์รูปโปรไฟล์ (ปิดบัง)`, `เลขที่สัญญา (ปิดบัง)`) is **not** flagged;
    - (b) an email left outside every selector (for example in the background, outside the crop) gives `pii:email`;
    - (c) a phone number left in an input value outside the regions gives `pii:phone`;
    - (d) the account's display name left in the background gives `known-value`;
    - (e) a required region with no match gives `mask-required:<region>`;
    - (f) an `img` in a signature region without `data-wi-masked` gives `image-region:<region>`;
    - (g) a missing optional region does not cause a failure;
    - (h) a loop over N = 1…999 confirms that no placeholder in the constants triggers `findPii`.
15. **Mask spec completeness:**
    - Every registry figure has a spec.
    - Every `data-wi-pii` kind used in a spec appears in the named component's source (a static test, which is not proof of runtime coverage).
    - Users, logs, profile, approval-request, approval-sign, and schedule each have at least one required region.
16. **Marks against a crop:** clip `{x:100,y:50,width:400,height:300}` with box `{x:300,y:200}` and anchor `top-left` gives `{x:50,y:50}`. A box outside the clip is clamped and produces a warning. A full-viewport clip gives the same values as the old function.
17. **Composite:** a 1440×64 part above a 1440×836 part. A mark at y=10 in part 2 maps to y=(64+10)/900.
18. **A new figure with a mark that cannot be measured:** `failed: <mark> not measurable`.
19. **Counts change** (pure comparison): run-level abort. The docs state that this signal cannot catch an edit that leaves counts unchanged.
20. **login:** captured from `/login` signed out, before sign-in, with empty fields.
21. **project-form:** the script types fixed values only in "ชื่อโครงการ" and "รหัสเส้นทาง" of the empty create form. It does not press Enter, does not tick an Operator, and closes with Cancel or Escape. Without the permission, the result is `skipped: permission`.
22. **Dashboard in a real run:** `getProjectCreatedDates` is aborted while enforcing. The summary shows `quiet-denied: N`, and the dashboard and card figures are captured as normal.
23. **route-draw:**
    - The script clicks no more than 3 points on an empty part of the map.
    - It measures ①② and crops part 1.
    - It presses "Finish Drawing", measures ③–⑥, and crops part 2.
    - It builds the composite, closes with Cancel, and confirms the draft is gone.
    - Without editMap, the result is `skipped: permission`.
24. **Secrets:** errors, the results table, and the request logs pass through the existing redaction of `WI_SCREENSHOT_*` values and contain no email, password, or query string.
25. **Regression for the map flow:** `--only=map,context-menu` produces the same file names and keys. `samplePoint`, `checkedPoint`, and readiness are unchanged. The map header is now masked as well.
26. **Open-only label exceptions (pure unit test of `assertSafeClickLabel(label, action)`):**
    - Allowed:
      - `('ลงนาม 2 ระดับ', 'openApprovalDocument')` and `('เอกสารอนุมัติ', 'openApprovalDocument')`;
      - `('ลงนาม Planning (ITEL)', 'openSignForm')` and `('ลงนาม O&M (ITEL)', 'openSignForm')`;
      - `('  ลงนาม   Planning (ITEL) ', 'openSignForm')`, after whitespace normalization.
    - Denied (throws):
      - `('ลงนาม Planning (ITEL) ยืนยัน', 'openSignForm')`;
      - `('ลงนาม Planning ()', 'openSignForm')`;
      - `('ลงนาม Planning (A) (B)', 'openSignForm')`;
      - `('ลงนาม Planning ITEL', 'openSignForm')`;
      - `('xลงนาม 2 ระดับ', 'openApprovalDocument')` and `('ลงนาม 2 ระดับ ', …)`, which normalizes to an exact match and is allowed, so the denied case uses `('ลงนาม 2 ระดับ ยืนยัน', 'openApprovalDocument')`;
      - `('ลงนามอนุมัติ', 'openSignForm')`, `('✓ ลงนามอนุมัติ', 'openSignForm')`, `('ลงนาม', 'openSignForm')`;
      - `('ไม่อนุมัติ / ขอแก้ไข', 'openSignForm')`;
      - `('แก้ไขข้อมูล / ลงนามใหม่', 'openSignForm')`;
      - `('ส่งคำขออนุมัติแบบ', 'openApprovalDocument')`.
    - Cross-action and no-action calls are denied:
      - `('ลงนาม Planning (ITEL)', 'openApprovalDocument')`;
      - `('ลงนาม 2 ระดับ', 'openSignForm')`;
      - `('ลงนาม 2 ระดับ')` with no action;
      - `('ลงนาม O&M (ITEL)', 'leftClickPoint')`.
    - `ACTION_EXACT_LABELS` has exactly the two keys `openApprovalDocument` and `openSignForm`, and every pattern starts with `^` and ends with `$` (a static test).
27. **approval-sign with a document awaiting this account's signature (manual run, checked from the log and the PNG):**
    - The clicks, in order, are `openApprovalDocument` on the sample card, then `openSignForm` on one `ลงนาม Planning (…)` or `ลงนาม O&M (…)` button.
    - No click, keyboard input, or file chooser happens inside the signing form, apart from Escape and the `ปิด` button.
    - The guard reports no `block` during the figure.
    - The image shows empty name and position fields and a masked signature pad, and the figure is `captured`.
    - After the run, the document's sign-off state in the app is unchanged (manual check 5).
28. **Unsafe click attempt aborts; denied labels in view do not (unit test with fake page/capture):**
    - A capture function that attempts `clickSafe` on `✓ ลงนามอนุมัติ` with action `openSignForm`: `SafetyViolation`, no click, `commitOutputs` called 0 times, exit code 1.
    - A capture function that only reads or measures elements whose labels are denied, then returns `captured`: the result is `captured`, with no abort.

### Proposed design

**Common header spec.** These regions show the logged-in account's name, role, or photo:

- the dashboard header user button and user menu (`ProjectsDashboard.tsx` ~359 and ~396);
- the map header user button (`App.tsx` ~1549);
- the UserManagement and SettingsManager headers, if a name is shown.

They get `data-wi-pii="account-name"` and `"account-avatar"`. The name becomes `ผู้ใช้ตัวอย่าง` and the avatar is hidden.

**Mask spec per figure.** R = required, O = optional. Every figure also gets the whole-page `findPii` and `findKnownValues` checks.

| figure | regions (R/O) → placeholder |
|---|---|
| login | none (signed out, fields empty); whole-page check |
| dashboard | header account-name R, avatar O; cards of other projects R (hidden); creator or owner name on the card O → `ผู้ใช้ตัวอย่าง N` |
| card-actions | same as dashboard |
| project-form | header R; inputs carry only the fixed sample values |
| profile | header account-name R (part 1); Display Name input R → `ผู้ใช้ตัวอย่าง`; email text R → `อีเมลผู้ใช้ 1 (ปิดบัง)`; Profile Image URL input R → `ลิงก์รูปโปรไฟล์ (ปิดบัง)`; avatar or preview O (image region) |
| enclosure-form, route-draw, core-manager, splice, map, context-menu | map header account-name R; "created or edited by" O → `ผู้ใช้ตัวอย่าง N`; avatar O |
| files | header R; uploader or editor column O → `ผู้ใช้ตัวอย่าง N` |
| schedule | header R; task owner R → `ผู้รับผิดชอบตัวอย่าง`; names in history O → `ผู้ใช้ตัวอย่าง N` |
| approval-request | header R; supervisor name R → `ผู้รับผิดชอบตัวอย่าง`; phone R → `เบอร์โทร (ปิดบัง)`; company O → `บริษัทตัวอย่าง จำกัด`; contract or PO number O → `เลขที่สัญญา (ปิดบัง)`; signatures and signer names in the preview O (image region / `ผู้ใช้ตัวอย่าง N`) |
| approval-sign | header R; signer name and position inputs R (shown empty); signature pad canvas R (image region); earlier signers O (image region / `ผู้ใช้ตัวอย่าง N`) |
| users | header O; email column R → `อีเมลผู้ใช้ N (ปิดบัง)`; name column R → `ผู้ใช้ตัวอย่าง N`; add-user email input O (empty); avatar O |
| permissions | header O |
| settings | header O; uploader O |
| logs | User column R → `ผู้ใช้ตัวอย่าง N`; Description column R → `รายละเอียดการกระทำ (ปิดบังข้อมูล)` (the whole column) |

**What each figure opens.** "Requires" means skip when unmet.

| id | screen | crop | requires |
|---|---|---|---|
| login | `/login` before sign-in | element: login card | — |
| dashboard | `/`, type the project name into search, hide other cards | viewport | — |
| card-actions | `/`, sample card | element: card | edit and delete buttons visible |
| project-form | "สร้างโครงการ" → empty create form | element: modal | createProject |
| profile | dashboard header strip + `/profile` | composite | — |
| enclosure-form | map → Enclosure tool → click near the route → form → Cancel | element: modal | editMap |
| route-draw | scenario 23 | composite | editMap |
| core-manager | Core Manager of the selected route, click one core | panel | if ⑥ appears only after a value changes → `skipped: data-state` |
| splice | Splice Manager of an enclosure on the route, choose A/B | panel | at least one splice |
| files | "ไฟล์โครงการ" → root folder | element: modal | at least one folder and one file |
| schedule | "แผนงาน" → click one task | element: modal | at least one task |
| approval-request | `openApprovalDocument` (`ลงนาม 2 ระดับ` / `เอกสารอนุมัติ`) → modal | element: modal | the request form is shown |
| approval-sign | `openApprovalDocument` → modal → `openSignForm` (`ลงนาม Planning (…)` / `ลงนาม O&M (…)`) → signing form → Escape / `ปิด` | element: modal | an `openSignForm` button exists in the modal (the document awaits this account's signature) |
| users | `/user-management` | viewport | viewUsers |
| permissions | `/permission-management` | viewport | Admin |
| settings | `/settings` first tab | viewport | viewSettings |
| logs | `/logs` | viewport | Admin |
| map, context-menu | existing flow | viewport | — |

**Modules:**

- `wiScreenshotFigures.ts`: registry, `parseOnlyArg`, `figureImagePath`.
- `wiScreenshotMaskSpec.ts`:
  - `WI_MASK_PLACEHOLDERS` (the constants above);
  - `MaskSpec = { regions: { name, selector, kind: 'text'|'input'|'image'|'hide', placeholder?, required }[] }` per figure, plus `HEADER_SPEC`;
  - `maskThenCheck(snapshot, spec, knownValues)` and `checkMaskResult(snapshot, spec, knownValues)`, both pure;
  - the in-page function only applies the spec and collects the snapshot (self-contained, works with the `__name` shim).
- `wiScreenshotRedact.ts`: `findPii` (no exception list; the phone pattern needs at least 9 digits or a `+66` prefix) and `findKnownValues`.
- `wiScreenshotGuard.ts`:
  - `classifyRequest(req, { functionsOrigin })` returning `'allow' | 'block' | 'deny-quiet'`;
  - `describeRequest`;
  - `functionsOriginFor(projectId, region)`;
  - `createGuard()` with `observe` and `enforce` phases, the `observed`, `blocked`, and `quietDenied` logs and counters, and `tripped`;
  - `compareCounts`.
  - **Unchanged in this draft.**
- `wiScreenshotRun.ts`: `runFigures({ figures, capture, guard, commit, … })`, pure with injected dependencies. `SafetyViolation` or `guard.tripped` aborts the run without calling `commit`. `deny-quiet` has no effect on control flow. It returns a summary and an exit code.
- `wiScreenshotMarks.ts`: `toPercentMarks(boxes, clip)`, `stackParts`, `formatMarksModule(record)`.
- `wiScreenshotActions.ts`:
  - `WI_ALLOWED_ACTIONS` plus `openSignForm` and `closeSignForm`;
  - `normalizeLabel(label)` (trim, collapse whitespace);
  - `EXACT_SAFE_LABELS` (general, plus `ปิด`, `ยกเลิก`);
  - `ACTION_EXACT_LABELS: Partial<Record<WiAllowedAction, readonly RegExp[]>>`, holding only the two entries in the table above;
  - a stricter `DENIED_LABEL`;
  - `assertSafeClickLabel(label, action?)`, checked in the order in the criterion;
  - the path allowlist.
- `scripts/wi-screenshots.ts`, in this order:
  1. `parseOnlyArg`;
  2. load config, and get the Firebase projectId from the app config to build `functionsOrigin`;
  3. start Vite;
  4. create the context with `serviceWorkers: 'block'`;
  5. call `page.route('**/*')` with the guard;
  6. capture login;
  7. sign in, wait for `/` to settle, then `guard.enforce()`;
  8. record baseline counts;
  9. `runFigures`;
  10. check counts;
  11. commit or abort;
  12. print the table, the files to check, the request logs, and `quiet-denied`.
- `scripts/wi-screenshot-figures.ts`:
  - capture functions. Each starts with a fresh `goto` and has a 45-second cap. Before each capture it applies the mask and checks it.
  - `clickSafe(locator, action)` calls `assertAllowedAction(action)`, reads the normalized label of that one element (text, or `aria-label` when there is no text), calls `assertSafeClickLabel(label, action)`, and only then clicks. A failure raises `SafetyViolation`, which is not caught inside the capture.
  - The approval-sign flow follows the criterion **Click safety: approval-sign flow**. The existing `approval-sign` mark selectors that target the submit buttons are measured only.
- `WiFigures.tsx`: `wiFigureView`, used in `WiScreenshot`. The drawings stay.
- Components get only `data-wi-pii` attributes (no logic change).
- `workInstruction.ts`:
  - `screenshot(figure)`;
  - every procedure that has a figure uses it;
  - revision `04`: "ขยายภาพหน้าจอจริงให้ครอบคลุมทุกหน้าใน WI (ถ่ายด้วยสคริปต์ ปิดบังข้อมูลส่วนบุคคล) พร้อมภาพวาดสำรอง".

**Security summary.**

1. The primary protection is the network guard, unchanged: deny-by-default for non-GET, block for every Cloud Functions request except one exact `deny-quiet`, which is still aborted. Even if a wrong button were clicked, a signature write (Firestore `Write/channel`/`:commit`, Storage upload) would be blocked and the run would abort without commit.
2. Second, the action allowlist plus the label check. The new exceptions are exact, anchored, and bound to one action each. They cover only buttons whose handlers set UI state. The deny rule is stricter than before.
3. Third, the count check, which is a limited secondary signal.

Personal data is handled by the declarative mask, the automatic checks, and the human review gate. Credentials are never printed or written.

### Expected files

- `scripts/wi-screenshots.ts`, `scripts/wi-screenshot-figures.ts` (new)
- `src/utils/wiScreenshotFigures.ts`, `wiScreenshotMaskSpec.ts`, `wiScreenshotRedact.ts`, `wiScreenshotGuard.ts`, `wiScreenshotRun.ts` (new) + `.test.ts` for each
- `src/utils/wiScreenshotActions.ts` (+ test, including scenarios 12 and 26), `wiScreenshotMarks.ts` (+ tests), and `wiScreenshotOutput.ts` if needed
- `src/content/wiScreenshotMarks.ts`, `src/content/workInstruction.ts`, `src/content/workInstruction.test.ts`
- `src/components/WiFigures.tsx` + `wiFigureView` test
- `data-wi-pii` in `src/App.tsx`, `ProjectsDashboard.tsx`, `ProfileSettings.tsx`, `UserManagement.tsx`, `LogViewer.tsx`, `ProjectFilesModal.tsx`, `ProjectScheduleModal.tsx`, `DesignApprovalModal.tsx`, and others as needed
- `docs/wi-screenshots.md`
- `public/wi/*.png`: **the implementer does not write these.** They are added after the coordinator runs the script and a human checks them.

### Risks and rollback

- **Writes to production:** the primary protection is the guard. Residual risk: writes during sign-in are recorded but not blocked, which is accepted. A missed write shape is blocked by default (fails safe). The count check catches only add or delete operations.
- **Open-only label exceptions:** the risk is that a future UI change makes a matching label do something else (for example, signing directly). Mitigations:
  - patterns are exact full-string matches tied to one action;
  - the search is limited to `button` elements inside the approval modal;
  - the script verifies the signing form opened;
  - the network guard aborts any write and blocks commit.
  
  Owner names in the label are operator or company codes, not personal names. They are still covered by the whole-page `findPii`/`findKnownValues` checks and the human review.
- **Signing form state:** opening the form only changes React state. Closing with Escape or `ปิด` calls `closeSigningModal`, which resets it. Nothing is persisted. Manual check 5 confirms the document's sign-off state is unchanged.
- **`getProjectCreatedDates`:** an exact match on method, origin, and path, so other callables cannot slip through. The request is still aborted, so it never reaches the server. The only effect is that an old project may show no created date in the image.
- **CORS preflight (OPTIONS) to Cloud Functions:** if the route handler sees one, it is classified `block` and the run fails safe. Playwright handles preflights of routed requests itself, so this is not expected. If it happens, it appears in the request log for review.
- **Firestore request shapes the classifier does not know:** they are blocked and the run fails safe. The log shows method, host, and path so the allowlist can be extended after review.
- **Stricter deny rule (`อนุมัติ`, `ขอแก้ไข`, `ส่ง`, …):** a label the script clicks today could now be denied. That aborts the run safely. The fix is an exact entry in `EXACT_SAFE_LABELS` or `ACTION_EXACT_LABELS` after review, never a looser regex.
- **Personal data in a public repo:** the mask, the checks, and the human review gate. Placeholders cannot trigger `findPii`, so the check stays strict without exceptions. Names outside the declared regions are not detected automatically. A committed image stays in Git history.
- **`data-wi-pii` attributes:** display-only. `npm run verify` checks typing and build.
- **Wrong selectors or missing data states:** the figure fails or is skipped and keeps its drawing.
- **Rollback:** `git checkout -- public/wi src/content/wiScreenshotMarks.ts`. Removing a single key brings back that figure's drawing. Nothing is deployed.

### Verification

- Focused tests:
  - `wiScreenshotFigures`;
  - `wiScreenshotMaskSpec` (mask-then-check, scenario 14);
  - `wiScreenshotRedact`;
  - `wiScreenshotGuard` (the classifier table in scenario 9, phases in scenario 11);
  - `wiScreenshotRun` (scenario 10: deny-quiet does not fail the run, block or `SafetyViolation` means `commitOutputs` is not called; scenario 28);
  - `wiScreenshotActions` (scenarios 12 and 26), `wiScreenshotMarks`, `wiScreenshotOutput`;
  - `wiFigureView`;
  - `workInstruction.test.ts`.
- Full gate: `npm run verify` (no browser, no network).
- Manual checks (the coordinator runs them; a human approves):
  1. Run `npm run wi:screenshots` for real, then `--only=<some figures>` including `--only=approval-request,approval-sign`. Check the results table against the account's permissions, the observe-phase log, `quiet-denied`, and that there were no guard trips. For approval-sign, confirm `captured` (scenario 27) or `skipped: data-state` (scenario 8).
  2. **Open every PNG** and check for names, emails, phone numbers, signatures, photos, and other projects' data, and that marks are placed correctly without covering text. This is a required gate.
  3. Check the `onError` wiring: rename a PNG temporarily, open `/manual`, confirm the drawing appears, then restore the name.
  4. Check print preview of `/manual`.
  5. Open the sample project and confirm nothing changed, including the approval document's sign-off state and status.
  6. A human approves the images before commit.

### Deployment

- Target: NONE
- Surface: not applicable (deploying to Cloudflare frontend and Firebase functions is forbidden)
- Required authorization: none for this change. Any later deployment needs explicit human authorization naming the target.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: `8860428` (HEAD, `vpunpum-sudo/wi-map-fix-v3`)
- Head: uncommitted working tree. 19 modified files and 13 untracked files, including `scripts/wi-screenshot-figures.ts`, `src/utils/wiScreenshot{Figures,MaskSpec,Redact,Guard,Run}.ts`, and their tests, `src/utils/wiScreenshotCaptureContract.test.ts`, and `src/components/WiFigures.test.ts`.
- Verification evidence checked: the coordinator reported a fresh `npm run verify` with exit 0. `public/wi/` still contains only `map-overview.png` and `route-context-menu.png`. `src/content/wiScreenshotMarks.ts` has only the `map` and `context-menu` keys, which matches scenario 1. I read the actual diff and the new files, not only the implementer summary. I also checked the relevant component handlers in `DesignApprovalModal.tsx` (~1193–1211, ~3794–3809, ~4046, ~4142–4159) and `ProjectsDashboard.tsx` (~654–667).

### Findings

- MEDIUM: Masking is checked before capture, but the screenshot is taken later, so a React re-render in between can put real data back. `maskPage` (`scripts/wi-screenshot-figures.ts:193-241`) changes DOM text and input values and checks the snapshot. `measuredMarks` and `page.screenshot` run afterward (`scripts/wi-screenshot-figures.ts:258-262`, `:326-336`). Controlled inputs (`profile-display-name` in `ProfileSettings.tsx:168-170`, `task-owner`) and header names come from React state or Firestore snapshots. Any re-render in that window restores the real value after the check has passed, and the image would contain it. The human review gate covers this, but the automatic check gives false confidence. Suggested fix: run the snapshot check again right after `page.screenshot`, and drop the staged PNG if it fails.
- MEDIUM: The per-figure 45 s timeout (`scripts/wi-screenshots.ts:92-95`) uses `Promise.race` and never cancels the losing `captureFigure`. The losing capture keeps clicking on the shared page after the race settles. The thrown timeout reaches the generic catch in `runFigures` (`src/utils/wiScreenshotRun.ts:26-28`), so one slow figure aborts the whole run instead of failing that figure. This contradicts "skips any figure it cannot reach … keeps the drawing". The 45 s timer is also never cleared, which keeps the process alive after a fast run. The behaviour fails safe (nothing is committed), so it is not blocking.
- MEDIUM: `approval-request` can never be captured with the current mark targets. `text=บันทึกประกอบ` and `text=ตัวอย่างเอกสาร` (`scripts/wi-screenshot-figures.ts:277`) do not exist in the live UI. Neither string appears in `src/components`; they only exist in `workInstruction.ts:419` and the drawing in `WiFigures.tsx:321`. Every full run will therefore report `failed: … not measurable` for this figure and exit 1. It is safe (the drawing is kept), but the selectors or callouts need updating against the real modal.
- MEDIUM: The stricter `DENIED_LABEL` (`src/utils/wiScreenshotActions.ts:17`) is applied to labels that come from data. These include sidebar route entries clicked with `openCoreManager` (`scripts/wi-screenshot-figures.ts:419`), schedule rows clicked with `selectTask` (`:555`), and core buttons. The terms `sign` (which matches "Design" and "Assign") and `ส่ง` (which matches "ส่งมอบ" and "ขนส่ง") are common in route and task names. Any such name aborts the whole run with `SafetyViolation`. The plan accepts this as fail-safe, but operators should know about it. Consider documenting it in `docs/wi-screenshots.md`, or choosing data-derived click targets by a structural selector.
- LOW: The run status names are swapped. A label or action `SafetyViolation` is reported as `aborted: guard`, and other errors as `aborted: safety` (`src/utils/wiScreenshotRun.ts:27-28`). This misleads anyone reading the log.
- LOW: Text-masking a wrapper element replaces all of its children. `map-account-name` is on the profile `<button>` in `App.tsx:1549`, which contains only an avatar or icon. Masking puts the text `ผู้ใช้ตัวอย่าง` into that small icon button and removes the `map-account-avatar` img, so the optional region silently matches 0. `user-name` on the initial-letter tile (`UserManagement.tsx:341`) has the same effect. Both are cosmetic layout changes in the images.
- LOW: The same signer-name element has inconsistent `data-wi-pii` names: `approval-signer-name` in the Planning tile and `previous-signer` in the O&M tile (`DesignApprovalModal.tsx:3782` vs `:3872`). Both are in the `approval-sign` spec, but only `approval-signer-name` is in the `approval-request` spec, so O&M signer names in the approval-request figure are not masked. The human review gate covers this.
- LOW: `UID: <8 chars>` (`UserManagement.tsx:346`) and signer `ตำแหน่ง` (position) lines are left unmasked. They are not in the plan's placeholder table, but reviewers should look at them during the human gate.

### Acceptance-criteria result

- [x] Registry has 19 entries with ids, files, screen, needs, clip, and markCount (`src/utils/wiScreenshotFigures.ts`). `--only` validates before the browser opens, keeps registry order, and rejects unknown, empty, or duplicate ids.
- [x] Marks and content: `screenshot(figure)` returns image and marks only when a key exists. Revision 04 and its row are present. Only the map and context-menu keys exist, which matches scenario 1.
- [x] Classifier matches the scenario 9 rules. `deny-quiet` requires POST, the exact `functionsOrigin`, and the exact path `/getProjectCreatedDates`. Every other Cloud Functions request is blocked, and non-GET requests are deny-by-default. `describeRequest` strips the query string. The guard has observe and enforce phases; `deny-quiet` aborts without tripping, and `block` aborts and trips.
- [x] Run-level all-or-nothing: `runFigures` never calls `commitOutputs` when the guard trips, a `SafetyViolation` occurs, a dialog appears, or the counts change (`beforeCommit`). `captureFigure` rethrows `SafetyViolation` rather than turning it into a skip (`scripts/wi-screenshot-figures.ts:583`). Sign-in failure, a gating redirect, or a project that cannot be opened exits 1 before any output.
- [x] Click safety: `assertSafeClickLabel` follows the specified order. `ACTION_EXACT_LABELS` has exactly the two anchored entries and is bound to its action. `DENIED_LABEL` is strictly a superset of the old rule. `clickSafe` checks the action and label of the one target element right before clicking.
- [x] approval-sign flow: the script searches only `button` elements inside the approval modal, clicks the first exact `openSignForm` match, waits for `signer-name`, and skips with `data-state` when there is no match. It never types into the signing form or touches the pad or upload. Submit buttons are only measured. It closes with Escape, then `ปิด`/`closeSignForm`, and closes the modal through `clickSafe`. The re-sign button `แก้ไขข้อมูล / ลงนามใหม่` cannot match.
- [x] Masking: declarative spec per figure, required, optional, and image checks, and whole-page `findPii`/`findKnownValues`. Placeholders contain no `@` and no run of 4+ digits. Inputs are changed through the DOM property with no events dispatched. Images are hidden behind a cover and canvases are never drawn on. (See the MEDIUM finding on the gap between check and capture.)
- [x] Components received only `data-wi-pii` and `data-wi-project-id` attributes. No logic changed. `wiFigureView` is added and `WiScreenshot` uses it.
- [x] Docs cover the human review gate, the guard phases and single exception, `--only`, skip behaviour, and the warning about Git history.
- [x] `npm run verify` passed (reported by the coordinator).
- [ ] Manual checks 1–6 (real capture, PNG privacy inspection, `onError` fallback, print preview, sample project unchanged, human image approval) are still pending for the coordinator or a human, as the plan specifies.

### Verdict

There are no BLOCKER or HIGH findings. The safety layers (network guard, action and label checks, run-level abort) match the approved plan, and the approval-sign exceptions are exact and action-bound. The MEDIUM items are about the gap between the mask check and capture, the timeout, one figure's selectors, and data-label aborts. All of them fail safe or are covered by the required human review gate, and they should be addressed before or during the first real capture run. No deployment is authorized by this review.

Verdict: APPROVED
