# Work Instruction screenshots

`npm run wi:screenshots` captures Work Instruction (WI) figures from a local browser connected to the approved production Firebase project. Run it only with a dedicated account and a sample project whose visible data may be published. The script reads production data. Sign-in may create an activity log or update a user record. The script is not part of CI or `npm run verify`.

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

Figures with unavailable permissions or data states are skipped and retain their existing drawing or screenshot. The runner never creates or edits data to prepare a scene. It never clicks Save, Submit, Confirm, Delete, Upload, approval or rejection submission, Splice, Unsplice, Export, or Logout, and never presses Enter in a form or selects a file. Route drawing is an unsaved draft that is cancelled after capture. The route, enclosure, and loop totals are compared before and after the run. This comparison cannot detect an edit that leaves totals unchanged.

For `approval-sign`, two narrowly scoped click exceptions open UI only. `openApprovalDocument` accepts exactly `ลงนาม 2 ระดับ` or `เอกสารอนุมัติ` on the sample card. Inside that approval modal, `openSignForm` accepts exactly `ลงนาม Planning (<owner>)` or `ลงนาม O&M (<owner>)`, with one nonempty owner and no extra parentheses. The script chooses the first visible exact match. These buttons only open the approval document and empty signing form in the current UI; they do not submit a signature. A missing sign button closes the modal and skips the figure. The form's approval, rejection, re-sign, clear-signature, and upload controls are never clicked. The script measures the approval and rejection buttons as callout targets, captures the masked form, then closes the form with Escape or its `ปิด` button. The general deny rule still applies to every other label. After a live run, confirm that the document's sign-off state is unchanged.

## Privacy masks and review

`src/utils/wiScreenshotMaskSpec.ts` declares required and optional regions for every figure. `data-wi-pii` identifies personal data in the application. The runner replaces text and input values only in the browser DOM, without input or change events. It hides images, canvases, and signature SVGs and places a placeholder over them. It checks that required regions exist, every declared image is masked, and no email, phone number, or known account name remains in page text, input values or placeholders, titles, alt text, or ARIA labels. This is a whole-page check, including areas outside the image crop.

Placeholders include `ผู้ใช้ตัวอย่าง N`, `อีเมลผู้ใช้ N (ปิดบัง)`, `เบอร์โทร (ปิดบัง)`, `ลิงก์รูปโปรไฟล์ (ปิดบัง)`, `ผู้รับผิดชอบตัวอย่าง`, `บริษัทตัวอย่าง จำกัด`, `เลขที่สัญญา (ปิดบัง)`, and `รายละเอียดการกระทำ (ปิดบังข้อมูล)`. None contains an email address or phone-number-like digit run. Automatic checks cannot recognize every person's name or visually verify a mask.

**A human must open and inspect every generated PNG before commit.** Check names, emails, phone numbers, photos, signatures, other projects' data, and marks ①… against their callouts. Check `/manual`, its print preview, and a temporarily renamed PNG to confirm the drawing appears on image load failure. Restore the PNG name afterward. A committed image remains in Git history even if later removed.

For `approval-sign.png`, also confirm that the signer name and position fields are empty, the signature pad is masked, and the current signing level and both action buttons align with marks ①…⑥. Compare the app's sign-off state before and after capture; the screenshot script must not change it.

## Network guard and results

The browser blocks service workers. Until sign-in succeeds and `/` settles, the guard is in **observe** mode: it logs request method, host, and path for requests it would block, but allows them so sign-in can complete. It then switches to **enforce** mode:

- `allow`: GET, HEAD, OPTIONS outside Cloud Functions, plus narrowly listed Firebase read and authentication requests.
- `block`: every other request, including all writes and other Cloud Functions. The request is aborted and the whole run exits 1 without committing any output.
- `deny-quiet`: only POST to the exact `getProjectCreatedDates` callable at this project's `asia-southeast1` Cloud Functions origin. It is aborted and counted without failing the run. The dashboard calls this read-only function on every mount and silently ignores its error; an old project without `createdAt` may show no created date.

Native dialogs, sign-in failure or account gating, an inaccessible sample project, disallowed actions or labels, a guard trip, and changed counts also abort the whole run before output commit. Otherwise, captured figures are committed in one replacement operation, even if another figure failed. Skipped figures do not make the exit code nonzero; failed figures do. The results table identifies each figure as captured, skipped for permission or data state, or failed with a reason. The summary prints files to inspect, the observe-phase request log, and `quiet-denied: N`. It omits query strings and request bodies and redacts configured credential values.

The script stages images and merged marks before replacement. A caught replacement error rolls back existing outputs. A killed process may leave partial replacement; recover tracked outputs with `git checkout -- public/wi src/content/wiScreenshotMarks.ts`, then inspect untracked files. To remove one screenshot deliberately, delete its key from `WI_SCREENSHOT_MARKS`, delete its PNG, and verify the WI shows the drawing. Skipping a figure never removes an old key or PNG automatically.
