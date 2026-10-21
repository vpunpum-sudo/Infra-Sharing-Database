# complete-wi-real-screenshots

Archived by `agent-flow` on 2026-10-22 after an approved review.

- Branch: `vpunpum-sudo/chat-continuation`
- Base commit: `ec55614`
- Verification: `npm run verify`, Started: 2026-10-21T22:25:36Z, Exit code: 0

## Delivery plan

Status: APPROVED
Feature: complete-wi-real-screenshots  
Risk: HIGH — Capture reads live production Firestore data while the AI Studio shared quota is exhausted, and a published PNG could expose sensitive information permanently.

### Objective

Complete the seven WI figures still using drawings—`schedule`, `approval-sign`, `files`, `approval-request`, `profile`, `core-manager`, and `splice`—so all 19 distinct figures have real-system PNGs, matching measured marks, and human visual approval of privacy and callout accuracy.

PR #85 has merged as `ec55614`. Work starts from its 12 committed screenshots on clean branch `vpunpum-sudo/wi-map-fix-v6` off `origin/main`. The merged LogViewer pagination change is part of the base.

### In scope

- Establish and record each remaining figure’s prerequisite scene, account permission, publishability decision, and human reviewer before capturing it.
- Use only the existing dedicated sample account and sample project configured locally in ignored `.env.local`. Capture bounded selections after production reads recover.
- Correct capture selectors, crops, masks, measured marks, and WI callouts where the current real UI requires it.
- Strengthen the runner so safety, privacy, quota, and other capture failures abort the selected run before any output replacement; an ordinary missing-state skip may retain other validated captures.
- Check approval and splice state before and after relevant captures, in addition to route, enclosure, and loop counts.
- Keep the 12 committed screenshots intact and make partial results and blockers reviewable on the current branch.

### Out of scope

- Creating, editing, approving, signing, uploading, or splicing production data to stage a scene.
- Firestore billing changes, deployment, migrations, auth or permission changes, backend functions, data rules, CI, and unrelated LogViewer work.
- Fabricated screenshots or presenting a drawing as a completed real screenshot.

### Acceptance criteria

- [ ] Completion is reported only when all 19 distinct figures have real PNGs, matching measured marks, and recorded human visual approval of privacy and callout accuracy. The 12 committed images remain the base; only demonstrated defects justify changing them.
- [ ] Before capturing each of the seven remaining figures, the implementation records the observed prerequisite, confirmation that all visible sample data may be published, and the human reviewer. An absent prerequisite or unconfirmed publishability leaves the drawing in place and records the exact pre-existing state needed from the human.
- [ ] Every new PNG is inspected by a human before Git commit for names, contact details, photos, signatures, file names, locations, network information, other projects, and marks ①… against the WI callouts.
- [ ] Capture sends no Firestore, Storage, or Cloud Functions write requests. Authentication exchanges may occur; an attempted application write or a sign-in flow that depends on one aborts capture. No save, submit, confirm, approval, rejection, splice, upload, delete, export, or logout action stages a scene.
- [ ] A safety, privacy, quota, stale-data, or capture failure aborts the selected run without replacing any existing PNG or mark output. A verified missing-state or permission skip may coexist with other validated captures.
- [ ] Before-and-after checks confirm unchanged route, enclosure, loop, approval, and splice state for relevant captures. Evidence is recorded without exposing production data or credentials.
- [ ] `/manual`, print preview, and drawing fallback work for new images and for any blocked figure.
- [ ] `npm run verify` passes on the final implementation tree. Partial progress is labelled `PARTIAL` or blocked, never READY complete.

### Acceptance scenarios

1. **Profile:** The dedicated approved account exposes the dashboard header and `/profile`. After publishability confirmation, the real composite has five measured marks and masked identity fields and avatar. The runner does not click logout or save.
2. **Core Manager:** The sample route and account permit viewing cores. An unsaved, discardable local selection may expose the real save control; the WI callout names the control shown. The draft is reset, no write request occurs, and state is unchanged. If this cannot be done safely, record the specific blocker.
3. **Splice:** A sample enclosure already has a publishable splice visible between real cores. Capture both sides, connection, and controls without invoking Splice or Unsplice. Compare the splice state before and after. If no such connection exists, retain the drawing and request a publishable pre-existing splice state.
4. **Files:** A publishable folder and file already exist, and the account can view the needed controls. Capture the breadcrumb, folder, file, and action icons without creating, uploading, downloading, renaming, or deleting content. Empty or unpublishable content blocks this figure.
5. **Schedule:** An existing, publishable non-linked task exposes its detail and progress controls. Capture without creating a plan or saving progress. No suitable task blocks this figure.
6. **Approval request:** The sample project is already in a state that exposes the request form and document preview. Any composite uses only real captured views with marks measured in the final layout. No request is submitted; an inaccessible or unpublishable form blocks this figure.
7. **Approval sign:** A document already awaits this account’s Planning or O&M signature. Open only the document and empty signing form; leave name and position empty, mask the signature area, and measure both decision buttons without clicking them. Compare approval stage and sign-offs before and after. No eligible sign button is an ordinary missing-state skip.
8. **Permission or missing state:** An inaccessible control is recorded as `skipped: permission`; an absent task, file, splice, or approval state is recorded as `skipped: data-state`. Neither result produces a replacement for that figure. Other validated captures in the selected run may be retained.
9. **Safety, privacy, or quota failure:** An attempted write, denied action, native dialog, mask failure, unpublishable content, quota error, or unavailable server-fresh state aborts the selected run. No staged PNG or mark replaces an existing output, including outputs captured earlier in that run.
10. **Regression:** A selected seven-figure run leaves the 12 base PNGs and unrelated marks unchanged. WI paths and callout counts remain correct; print and image-load fallback still work.

### Proposed design

Use a two-gate capture workflow. First, after quota recovery, inspect only selected scenes through the existing account and sample project. For each figure, record a non-sensitive prerequisite observation, permission result, publishability confirmation, and human reviewer in the implementation handoff. Do not capture a figure while its publishability is uncertain. Second, run the selected capture and require human inspection of its generated PNG before Git commit. Keep credentials, raw production records, and unmasked diagnostic images out of tracked files.

The repository alone establishes the 12-image base, but cannot prove the current live sample states. `profile` needs the approved account. `core-manager` needs an accessible route and a safe unsaved local UI state. `files` needs an existing folder and file; `schedule` an existing task; `approval-request` an eligible form; `approval-sign` a pending signature for this account; and `splice` an existing connection. Record which are actually available after a bounded, server-fresh check. For each unavailable figure, ask the human for a publishable pre-existing state in the same approved sample account/project; do not make production data to satisfy it.

Keep the action allowlist narrow. Replace the sign-in observe-phase write allowance with explicit authentication requests and a write-blocking guard; if sign-in requires an application write, abort and report that blocker. Enforce the guard throughout scene inspection and capture. Derive marks from visible elements in the final crop, run whole-page privacy checks before and after capture, and stage every selected output until run-level checks pass. Classify only confirmed missing prerequisites as skippable; all safety, privacy, quota, stale-data, and unexpected capture errors discard the entire selected run’s staged outputs.

Use already loaded server-fresh project state where possible to compare route, enclosure, loop, approval stage/sign-offs, and splice connections before and after. If a trustworthy comparison cannot be made without excessive reads, abort that selected run. Do not log raw signatures, personal information, or project content.

Maintain a reviewable coverage table for all 19 figure IDs: prior reviewed base image, newly captured pending human review, reviewed new image, or blocked drawing, with a non-sensitive reason and next prerequisite. Detailed run evidence belongs in `.context/implementation.md`; durable instructions and current non-sensitive blockers belong in `docs/wi-screenshots.md`. A partial branch can be reviewed, but remains explicitly incomplete until the 19-figure gate is met.

### Expected files

- `scripts/wi-screenshot-figures.ts`, `scripts/wi-screenshots.ts`
- `src/utils/wiScreenshotRun.ts`, `src/utils/wiScreenshotGuard.ts`, and related focused tests where required for run-level aborts and state comparisons
- `src/utils/wiScreenshotMaskSpec.ts` and `src/utils/wiScreenshotActions.ts` only for verified, narrowly scoped UI gaps
- `src/content/wiScreenshotMarks.ts`, `src/content/workInstruction.ts`, associated tests, and up to seven new `public/wi/*.png` files as figures pass both gates
- `docs/wi-screenshots.md` and `.context/implementation.md`

### Risks and rollback

Production reads may exhaust the shared quota again. Wait for server-fresh availability, select only relevant figures, avoid full-run retries, and debug selectors locally or against an emulator. Stop immediately on quota or readiness failure; do not upgrade billing.

Automated masks cannot recognize every sensitive name or visual detail. A human must confirm publishability before capture and visually approve each resulting PNG before Git commit. Once committed, an image remains in Git history. Staged replacement is all-or-nothing for safety, privacy, quota, and capture failures; failed review discards the affected new output and leaves its drawing. Approval and splice comparisons supplement the existing count check and network guard.

### Verification

- Focused tests: prerequisite and skip classification; run-level abort and unchanged outputs; request/action guard; privacy-mask failure; measured mark counts and composite geometry; approval/splice state comparison; WI image paths and fallback.
- Manual: bounded selected-figure capture after quota recovery; per-figure prerequisite and reviewer record; human PNG privacy and callout inspection; `/manual`, print preview, and image-load fallback; confirmation that approval and splice state is unchanged.
- Full gate: `npm run verify`.
- Live capture and human visual approval are separate acceptance gates; `npm run verify` alone cannot establish them.

### Deployment

- Target: NONE
- Surface: not applicable
- Required authorization: Human approval of this plan before implementation. No billing upgrade or deployment is authorized. Any later deployment requires separate explicit authorization naming its target.

## Independent review

Status: APPROVED

### Diff reviewed

I read `.context/plan.md` (acceptance scenarios 1–10), `.context/implementation.md` including the 2026-10-22 review-fix log, and the previous `.context/review.md`. I also checked the working-tree changes, focusing on the review-fix delta. That delta covers `src/utils/wiScreenshotPrerequisites.ts`, its untracked test `src/utils/wiScreenshotPrerequisites.test.ts`, the preflight in `scripts/wi-screenshots.ts:67-90`, and the gate documentation in `docs/wi-screenshots.md:62`. The 12 base PNGs are unchanged. The untracked `public/wi/*.png` files are the five owner-approved captures plus `profile.png`, which is still waiting for owner review. The supplied verification result was `npm run verify` with exit 0.

### Findings

- Resolved (previous HIGH): Capture gates are now tied to the selected project. `src/utils/wiScreenshotPrerequisites.ts:9,24-26` requires the recorded `projectId` to equal the selected project for `core-manager`, `splice`, `files`, `schedule`, `approval-request` and `approval-sign`. A missing ID or a different ID fails closed. `scripts/wi-screenshots.ts:84-86` re-checks the gates against `config.projectId` after the config is resolved. If any selected figure doesn't match, the whole selection aborts before the guard, the browser, sign-in, or any production read. `splice` keeps its separate project-and-enclosure check (`scripts/wi-screenshots.ts:87-90`). `profile` correctly stays account-scoped. `src/utils/wiScreenshotPrerequisites.test.ts:39-51` covers a matching ID, a different ID and a missing ID for all six project figures, plus the `profile` exemption.
- MEDIUM: `public/wi/profile.png` and its `profile` marks entry are still waiting for the owner's visual approval of privacy and the five callouts. Do not commit them until the owner approves. `files` is still a drawing because no publishable root folder with a file exists yet, so the 19-figure completion criterion is still unmet. The handoff correctly labels coverage as PARTIAL.
- MEDIUM: The ignored local gate manifest still has ready `core-manager`, `schedule` and `approval-sign` entries with no `projectId`. They now fail closed, which is correct. Before any recapture of those figures, someone must re-record the exact project the scene was observed in, not guess it. A selection that includes them will abort as a safety failure rather than skip. That is acceptable, but the operator should expect it.
- LOW: When the project doesn't match, the result reuses the status `failed: unpublishable content` (`src/utils/wiScreenshotPrerequisites.ts:25`). The run still aborts correctly, but the operator-facing output can't tell a project mismatch apart from content that is truly unpublishable. The CLI message at `scripts/wi-screenshots.ts:86` names both cases, which partly makes up for this. A separate status such as `failed: project mismatch` would make the cause clear.
- LOW (carried over): `scripts/wi-screenshot-figures.ts:390-403` still treats viewport-relative element boxes as page coordinates for full-page clips. This is only correct while the page is scrolled to the top. Assert that scroll position, or account for scroll, before the next profile recapture.
- LOW (carried over): `public/wi/profile.png` shows a small clipped link fragment at the seam between the header and body. It doesn't hide a callout or expose private data.

### Acceptance-criteria result

The HIGH finding from the previous review is fixed with a regression test. The check runs before authentication and production reads, which satisfies the plan's requirement to confirm publishability before capture (scenario 9 and the per-figure gate criterion). No scenario regressed. Scenarios 2, 3, 5, 6 and 7 stay owner-approved and untouched. Scenario 1 (profile) is captured with masked identity fields and five measured marks, and is waiting on the owner's PNG review. Scenario 4 (files) is still blocked on a missing pre-existing scene. Scenarios 8–10 are covered by the focused tests and the passing verify run. The feature is still PARTIAL, not complete, and the handoff states that correctly.

### Verdict

No BLOCKER or HIGH findings remain. The remaining open items are human visual approval and a missing sample scene, both correctly gated and labelled PARTIAL.

Verdict: APPROVED

Independence: SELF_REVIEW (Claude reviewed code it wrote; Codex was unavailable)
