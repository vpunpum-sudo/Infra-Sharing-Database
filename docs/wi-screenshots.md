# Work Instruction screenshots

`npm run wi:screenshots` captures Work Instruction (WI) figures from a local browser connected to the approved production Firebase project. Run it only with a dedicated account and a sample project whose visible data may be published. The script reads production data. Application writes are blocked from the first request, including during sign-in; if sign-in depends on one, the run aborts. The script is not part of CI or `npm run verify`.

## Setup and selection

Install dependencies with `npm install`, then install Chromium locally with `npx playwright install chromium`. Put these values in an ignored `.env.local` file, or set them in the shell:

```dotenv
WI_SCREENSHOT_EMAIL=sample-account@example.invalid
WI_SCREENSHOT_PASSWORD=replace-locally
WI_SCREENSHOT_PROJECT_ID=sample-project-id
WI_SCREENSHOT_BASE_URL=
WI_SCREENSHOT_ROUTE_NAME=
```

Email, password, and project ID are required. A blank base URL starts a local Vite server. A blank route name selects the first listed route; a supplied name must match exactly one route after trimming. Credentials are never printed or written into the image output.

Run `npm run wi:screenshots` for all 19 figures, or `npm run wi:screenshots -- --only=dashboard,card-actions` for a subset. IDs are validated before the browser opens. An unknown ID, empty list, or duplicate ID exits 1 and prints the valid IDs. Subsets run in registry order.

## Figures and prerequisites

| Figure | Screen and data needed |
| --- | --- |
| login | `/login`, signed out, empty fields |
| dashboard | `/`, sample project card |
| card-actions | `/`, sample card with edit and delete buttons |
| project-form | Create Projects permission, empty form |
| profile | Dashboard header and `/profile` |
| map | Sample project with a route |
| enclosure-form | Edit Map permission and route |
| route-draw | Edit Map permission and clear map area |
| context-menu | Route with Cut, Split, and Edit commands visible |
| core-manager | Route and an existing state showing all six callouts |
| splice | Enclosure with a splice |
| files | Sample project with at least one folder and one file |
| schedule | Sample project with at least one task |
| approval-request | Project with approval request form available |
| approval-sign | Approval awaiting this account's signature |
| users | View Users permission |
| permissions | Admin |
| settings | View Settings permission |
| logs | Admin |

Figures with unavailable permissions or data states are skipped and retain their existing drawing or screenshot. The runner never creates or edits data to prepare a scene. It never clicks Save, Submit, Confirm, Delete, Upload, approval or rejection submission, Splice, Unsplice, Export, or Logout, and never presses Enter in a form or selects a file. Route drawing is an unsaved draft that is cancelled after capture. The route, enclosure, and loop totals and opaque fingerprints of approval stage/sign-offs and splice connections are compared before and after the run. This comparison requires server-fresh project and route listeners. Files and schedule captures require fresh data from their own listeners. These checks do not replace human image review.

Before selecting any of the seven remaining figures, record its observed state in ignored `.context/wi-capture-gates.json`. Each entry needs a non-sensitive prerequisite description, the human reviewer, confirmation that **all visible data** may be published, and the permission and data-state result. For example:

```json
{
  "profile": {
    "prerequisite": "Dedicated sample account exposes dashboard header and profile",
    "reviewer": "Human reviewer name",
    "sceneObserved": true,
    "publishable": true,
    "permission": "available",
    "state": "available"
  }
}
```

Set `"sceneObserved": true` only after viewing the exact UI scene; a backend record or role assignment alone does not establish the visible controls. For `core-manager`, `splice`, `files`, `schedule`, `approval-request`, and `approval-sign`, record the observed `"projectId"` in that figure's gate. It must exactly match `WI_SCREENSHOT_PROJECT_ID` when captured; a missing or different ID aborts the selection before sign-in. `profile` is account scoped and needs no project ID. Use `"permission": "missing"` or `"state": "missing"` for a confirmed blocker, with the exact **non-sensitive** pre-existing state needed in `prerequisite`. An absent record, missing reviewer, or unconfirmed publishability skips that figure. An explicit `"publishable": false` aborts the entire selection before sign-in. If all selected figures lack a ready record, the command exits before signing in. The manifest is local and must never contain credentials, raw records, signatures, or private data.

| Remaining figure | Pre-existing scene required before capture |
| --- | --- |
| profile | Dedicated account shows dashboard header and `/profile`; identity and avatar can be masked |
| core-manager | Accessible sample route has cores and the account can open a discardable local Edit view |
| splice | Sample enclosure has a real connection visible in Diagram with both routes, endpoints, and controls |
| files | Publishable root folder and root file with visible action icons |
| schedule | Publishable non-linked task exposes its detail and progress controls |
| approval-request | Current project state exposes the request form and document preview |
| approval-sign | Document awaits this account's Planning or O&M signature; signing fields are empty |

Capture a bounded subset, for example `npm run wi:screenshots -- --only=profile,core-manager`. For `splice`, record the observed project's ID and the opaque ID of its connected enclosure in the local gate. The runner will not select the first enclosure as a substitute. Splice links are often straight lines with a zero-width box, so the runner waits for them to attach and measures the link's group. It collapses the enclosure info card, which shows coordinates, and stops if the card stays open; a hide mask on the coordinates is a backstop. ② marks the rightmost tube in the side-B row because the toolbar covers that route's label. For every captured PNG, inspect privacy and each measured mark before commit. Do not record a figure as reviewed until that human inspection is complete. Missing-state skips leave the drawing in place. A failure of masking, freshness, quota, state comparison, or any capture aborts the selected run before replacement.

For `approval-sign`, two narrowly scoped click exceptions open UI only. `openApprovalDocument` accepts exactly `ลงนาม 2 ระดับ` or `เอกสารอนุมัติ` on the sample card. Inside that approval modal, `openSignForm` accepts exactly `ลงนาม Planning (<owner>)` or `ลงนาม O&M (<owner>)`, with one nonempty owner and no extra parentheses. The script chooses the first visible exact match. These buttons only open the approval document and empty signing form in the current UI; they do not submit a signature. A missing sign button closes the modal and skips the figure. The form's approval, rejection, re-sign, clear-signature, and upload controls are never clicked. The script measures the approval and rejection buttons as callout targets, captures the masked form, then closes the form with Escape or its `ปิด` button. The general deny rule still applies to every other label. After a live run, confirm that the document's sign-off state is unchanged.

For `approval-request`, the runner opens slide 6, shows the contractor fields without changing them, captures the preview, and closes that local editor. It then opens the existing `ยื่นขออนุมัติใหม่` request form and captures its unsent fields and submit control as the second part of a real UI composite. The three added open and close actions require exact visible labels. If the preview or form is not currently available, the figure is skipped; the runner never submits or saves either view.

## Privacy masks and review

`src/utils/wiScreenshotMaskSpec.ts` declares required and optional regions for every figure. `data-wi-pii` identifies personal data in the application. The runner replaces text and input values only in the browser DOM, without input or change events. It hides images, canvases, and signature SVGs and places a placeholder over them. It checks that required regions exist, every declared image is masked, and no email, phone number, or known account name remains in page text, input values or placeholders, titles, alt text, or ARIA labels. This is a whole-page check, including areas outside the image crop.

Placeholders include `ผู้ใช้ตัวอย่าง N`, `อีเมลผู้ใช้ N (ปิดบัง)`, `เบอร์โทร (ปิดบัง)`, `ลิงก์รูปโปรไฟล์ (ปิดบัง)`, `ผู้รับผิดชอบตัวอย่าง`, `บริษัทตัวอย่าง จำกัด`, `เลขที่สัญญา (ปิดบัง)`, and `รายละเอียดการกระทำ (ปิดบังข้อมูล)`. None contains an email address or phone-number-like digit run. Automatic checks cannot recognize every person's name or visually verify a mask.

**A human must open and inspect every generated PNG before commit.** Check names, emails, phone numbers, photos, signatures, other projects' data, and marks ①… against their callouts. Check `/manual`, its print preview, and a temporarily renamed PNG to confirm the drawing appears on image load failure. Restore the PNG name afterward. A committed image remains in Git history even if later removed.

For `approval-sign.png`, also confirm that the signer name and position fields are empty, the signature pad is masked, and the current signing level and both action buttons align with marks ①…⑥. The runner rejects prefilled name or position fields and compares the app's sign-off state before and after capture.

## Network guard and results

The browser blocks service workers. The guard is active before the login page opens and remains active throughout capture. The runner uses Firebase Auth directly for sign-in because the application's login helper also writes an activity record, which the guard rejects:

- `allow`: GET, HEAD, OPTIONS outside Cloud Functions, plus narrowly listed Firebase read and authentication requests. Firestore listener reads use POST and are explicitly allowed; Firestore commit, batch write, and write channels are blocked.
- `block`: every other request, including all writes and other Cloud Functions. The request is aborted and the whole run exits 1 without committing any output.
- `deny-quiet`: only POST to the exact `getProjectCreatedDates` callable at this project's `asia-southeast1` Cloud Functions origin. It is aborted and counted without failing the run. The dashboard calls this read-only function on every mount and silently ignores its error; an old project without `createdAt` may show no created date.

Native dialogs, sign-in failure or account gating, an inaccessible sample project, disallowed actions or labels, a guard trip, failed figure, stale state, or changed counts/fingerprints abort the whole selected run before output replacement. Confirmed permission and missing-state skips may coexist with other valid captures. The results table identifies each figure as captured, skipped for permission or data state, or failed with a reason. The summary prints files to inspect, blocked request descriptions, and `quiet-denied: N`. It omits query strings and request bodies and redacts configured credential values.

The script stages images and merged marks before replacement. A caught replacement error rolls back existing outputs. A killed process may leave partial replacement; recover tracked outputs with `git checkout -- public/wi src/content/wiScreenshotMarks.ts`, then inspect untracked files. To remove one screenshot deliberately, delete its key from `WI_SCREENSHOT_MARKS`, delete its PNG, and verify the WI shows the drawing. Skipping a figure never removes an old key or PNG automatically.

## Coverage on this branch

| Figures | Status | Next gate |
| --- | --- | --- |
| login, dashboard, card-actions, project-form, map, enclosure-form, route-draw, context-menu, users, permissions, settings, logs | 12 base PNGs retained | Prior human review remains the baseline; inspect again only if a demonstrated defect requires changes |
| profile | Real PNG, owner-approved 2026-10-22 | The owner's publishable password-only sample account. A guarded inspection saw the dashboard header and `/profile` with `Security & Password` (no Google-linked notice). Three-part composite: dashboard header, Personal Information, and the security section (Appearance omitted), with identity fields and avatar masked; nothing saved and no logout. The owner reviewed the PNG and its five marks and approved it |
| core-manager | Real PNG, owner-approved 2026-10-21 | Two-part composite from the configured sample project: route panel with the first tube expanded (`Expand tube N`, a local toggle) and Core Details in a discarded Edit view; the owner reviewed the PNG and its six marks and approved it |
| splice | Real PNG, owner-approved 2026-10-21 | Captured from the observed connected enclosure; the info card (with coordinates) is collapsed before capture. ⑤ and ⑥ are centred on the Splice Summary tab and the zoom group. The owner reviewed the PNG and its six marks and approved it |
| files | Real PNG, owner-approved 2026-10-22 | Second approved sample project (run with `WI_SCREENSHOT_PROJECT_ID` set to it) with the owner's DESIGN-role account: files dialog root showing the owner-created folder and four files with sizes, dates and action icons. The real folder and file names are visible; nothing was created, uploaded, downloaded, renamed, replaced or deleted. The owner reviewed the PNG and its six marks, including the visible file names, and approved it |
| schedule | Real PNG, owner-approved 2026-10-21 | Configured sample project, first non-linked task selected locally; nothing saved. The owner reviewed the PNG and its six marks and approved it |
| approval-request | Real PNG, owner-approved 2026-10-21 | Two-part composite from the second approved sample project (run with `WI_SCREENSHOT_PROJECT_ID` set to it): slide 6 with the unsaved contractor editor, then the unsent request form. ④ marks the slide's `SLIDE x / y` header, because the page buttons are below the slide. The owner reviewed it and approved it |
| approval-sign | Real PNG, owner-approved 2026-10-21 | Configured sample project, pending O&M signature: empty name and position fields, masked signature pad, form closed without a decision. The owner reviewed it and approved it |

Both sample projects are confirmed publishable. Guarded read-only UI inspections recorded the exact scene and reviewer for each captured figure. Bounded `--only=` runs produced `splice`, `core-manager`, `schedule`, `approval-sign`, and `approval-request` with no blocked request observations and matching before/after state. On 2026-10-21 the owner reviewed all five new PNGs with their measured marks overlaid and approved every one ("ทุกรูป"), which also covers the real route names, owner shares, and company logos visible in `approval-request`. On 2026-10-22 a bounded `--only=profile` run captured `profile` with no blocked request observations and matching before/after state. On 2026-10-22 the owner reviewed `profile` with its measured marks overlaid and approved it. On 2026-10-22 the owner created a root folder in the second sample project, and a bounded `--only=files` run captured `files` with no blocked request observations and matching before/after state. On 2026-10-22 the owner reviewed `files` with its measured marks overlaid and approved it, including the real file names visible in it. Coverage is now 19 of 19 reviewed real PNGs, so every WI figure is a real screenshot and no drawing remains. A future recapture still needs its figure gate recorded and a fresh owner review; `npm run verify` cannot complete those gates.

## Firebase quota and troubleshooting

A run with a ready figure signs in to production and reloads the selected screens, consuming Firestore reads. The configured AI Studio database is subject to a shared daily quota despite project-level Blaze billing. Exhaustion previously made the app unavailable. An all-skipped seven-figure selection exits before sign-in and consumes no production reads.

- Do not use the production run to debug selectors. Capture only what changed with `--only=<id,…>`, and run it once.
- Debug against a separate Firebase project or the emulator when a figure keeps failing.
- Capture failures return a generic status so raw page content and unmasked diagnostics do not enter logs or `.context`. Reproduce selector problems against an emulator or separate sample environment.
