# signature-image-auto-cleanup

Archived by `agent-flow` on 2026-10-20 after an approved review.

- Branch: `vpunpum-sudo/signature-image-automation`
- Base commit: `a718aa9`
- Verification: `npm run verify`, Started: 2026-10-20T03:33:32Z, Exit code: 0

Status: APPROVED
Feature: signature-image-auto-cleanup
Risk: STANDARD. This is a client-only change inside `src/`. It touches no auth, permissions, Firestore/Storage rules, migrations, Cloud Functions, deployment config or CI. The stored `signatureDataUrl` keeps its existing format, a PNG data URL, so every reader of that field (approval cards, print HTML, PDF export) works without changes. The signer always sees the processed preview before confirming, and can clear it and draw a signature instead. That means a wrong processing result cannot reach a persisted approval without the signer seeing it first. The human confirmed this STANDARD rationale in answer to the challenge's blocking question 1.

### Objective

When a Planning or O&M signer inserts a photo or scan of their signature in `DesignApprovalModal`, the system cleans it up automatically:
- it removes the background so only the ink stroke is left on transparency, keeping the ink colour
- it crops to the ink and scales it down to a bounded size
- it outputs a PNG with alpha, whatever the input format

This removes the grey or white "paper box" that uploaded signatures show today on approval cards and in the printed and final approval document. The user sees a preview of the processed result before approving or rejecting. Drawn signatures keep working exactly as today.

### In scope

- New pure, DOM-free module `src/utils/signatureImage.ts`. It works on RGBA buffers (`Uint8ClampedArray` plus width and height):
  - `validateSignatureFile({ name, type, size })` checks file type and size before any decoding.
  - `validateDecodedDimensions(width, height)` checks the pixel count and edge length after decoding.
  - `hasMeaningfulTransparency(pixels)` returns true when at least 5% of pixels have alpha < 16. Images like this skip background removal.
  - `removeSignatureBackground(pixels, w, h)` estimates the local background (handling uneven lighting), turns darkness relative to that background into alpha, and keeps the ink colour while correcting the paper colour cast.
  - `findInkBounds(pixels, w, h, opts)` returns the ink bounding box, or null. It ignores tiny isolated specks and clears them to alpha 0.
  - `computeOutputSize(cropW, cropH, maxW = 600, maxH = 200, padding = 8)` returns the final canvas size including padding. It never scales up.
  - `dataUrlWithinLimit(dataUrl, maxChars = 153600)` measures the full data URL string.
  - `createLatestRequestGuard()` is a pure stale-result guard that returns `{ begin(): number; isCurrent(token: number): boolean; invalidate(): void }`:
    - `begin()` increments an internal counter and returns the new token. Any earlier token stops being current.
    - `isCurrent(token)` returns true only for the token from the most recent `begin()`, and only if `invalidate()` has not run since then.
    - `invalidate()` increments the counter without issuing a token, so every outstanding token stops being current.
  - `SignatureImageError` has `code` ∈ `unsupported_type | too_large | decode_failed | image_too_large_pixels | no_ink | too_big_output`.
- Browser wrapper `processSignatureFile(file): Promise<{ dataUrl, width, height }>`, in the same module or a sibling `signatureImageBrowser.ts`. It:
  1. Runs `validateSignatureFile`.
  2. Decodes with `createImageBitmap(file, { imageOrientation: 'from-image' })`, falling back to `HTMLImageElement` with an object URL.
  3. Runs `validateDecodedDimensions` before allocating any canvas. On failure it throws `image_too_large_pixels`.
  4. Draws straight to a working canvas whose long edge is at most 1600 px. It never allocates a full-size canvas.
  5. Calls `getImageData`, then runs the pure pipeline: background removal (skipped for transparent PNGs), ink bounds, crop, resize to `computeOutputSize`, and 8 px padding.
  6. Calls `toDataURL('image/png')`, then applies the size guard with a re-encode loop.
  7. Always closes the `ImageBitmap` and revokes any object URL in a `finally` block, on success and on every error path.
- `src/components/DesignApprovalModal.tsx`:
  - File input `accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"`. The size limit goes from 2 MB to 15 MB. The button label becomes "แทรกรูปลายเซ็น (PNG/JPG/WebP/HEIC)".
  - New state `uploadedSignature: { dataUrl, width, height } | null` and `isProcessingSignature: boolean`, plus `signatureUploadGuardRef = useRef(createLatestRequestGuard())`.
  - **Concurrency rules** (from human answer 2):
    - Selecting a file calls `guard.begin()` and captures the token. When the processing result arrives, it is applied only if `guard.isCurrent(token)` is true. Otherwise it is discarded: no state update and no error shown.
    - `guard.invalidate()` runs when the signing modal opens, when it closes, and when "ล้างลายเซ็น" is pressed. Each of these also sets `isProcessingSignature = false`.
    - Selecting a new file supersedes earlier tokens through `begin()`.
    - While `isProcessingSignature` is true:
      - The approve/confirm, reject and insert buttons are all disabled.
      - The insert button cannot trigger the file input, so a second file cannot be picked through the UI during processing.
      - Drawing on the canvas is ignored.
      - "กำลังประมวลผลลายเซ็น…" is shown.
    - `handleConfirmSignature` also returns early if processing, as a defensive guard.
  - When processing succeeds:
    - The box shows the processed PNG as a preview over a light checkerboard, so the transparency is visible.
    - A Thai helper line says the background was removed automatically.
    - `hasSignature` is set to true.
    - Drawing is disabled while an upload is active. "ล้างลายเซ็น" clears the upload, the canvas and the error, and re-enables drawing.
  - `handleConfirmSignature` saves `uploadedSignature.dataUrl` when one is present. Otherwise it uses `getTrimmedSignatureDataUrl(canvas)` exactly as today.
  - Every `SignatureImageError` code maps to a Thai message. A failed upload never replaces a valid signature or drawing that is already in the box.
- Unit tests in `src/utils/signatureImage.test.ts`. `npm test` picks them up through the `src/**/*.test.ts` glob.

### Out of scope

- Server-side processing, and any change to `functions/` (including `finalDocuments.js`), `firestore.rules` or `storage.rules`.
- Moving signatures to Firebase Storage.
- Reprocessing or migrating signatures that are already stored.
- A manual threshold or eraser UI, ML segmentation, and new npm dependencies.
- Changes to how drawn signatures are captured or trimmed.
- HEIC decoding beyond what the browser supports natively (mainly Safari).
- Picking a replacement file while one is still processing. The insert button stays disabled until processing finishes.

### Acceptance criteria

- [ ] Inserting a PNG, JPG or WebP (and HEIC/HEIF where the browser can decode it) produces a `data:image/png;base64,…` URL with alpha. Background pixels have alpha 0 and ink pixels are opaque or nearly so.
- [ ] The background is removed for white, off-white, grey/tinted and unevenly lit paper. With a brightness gradient of about 30% across the image, no visible box or tint remains.
- [ ] Ink colour is kept: blue stays blue, and black stays dark without a paper-coloured halo.
- [ ] The output is cropped to the ink with 8 px padding on each side, and padding counts inside the limit. The final PNG canvas, padding included, is at most 600×200 px. Aspect ratio is kept, and the ink region is never scaled above its cropped source size.
- [ ] The size guard measures the full data URL string length, `data:image/png;base64,` prefix included. It is at most 153,600 characters (150 KB). If over, the inner size is re-encoded at 0.75× repeatedly. If the final long edge would drop below 200 px, a `too_big_output` Thai error is shown and nothing is set.
- [ ] Files up to 15 MB of type png, jpeg, webp, heic or heif are accepted. Files with an empty MIME type and a `.heic`/`.heif` extension are also accepted. Other types and files over 15 MB are rejected with a Thai message before decoding.
- [ ] After decoding, images with `width × height > 40,000,000` or either edge over 16,384 are rejected with the Thai `image_too_large_pixels` error. No full-size canvas is allocated, and the bitmap is closed and any object URL revoked.
- [ ] A PNG that is already transparent is cropped and resized only, with no background removal.
- [ ] An image with no detectable ink shows "ไม่พบลายเส้นลายเซ็นในภาพ" and leaves the signature box unchanged.
- [ ] The processed preview is shown before approve or reject. Clearing it allows drawing.
- [ ] While an upload is processing, the approve/confirm, reject and insert buttons are disabled and the processing message is visible. A second file cannot be selected through the UI, and confirmation cannot save an earlier drawing during this time.
- [ ] Stale results are discarded through `createLatestRequestGuard`, covered by an automated unit test. A processing result that arrives after the modal was closed or reopened, or after "ล้างลายเซ็น", shows no stale preview or error.
- [ ] Drawn signatures still save through `getTrimmedSignatureDataUrl` with the same output as before.
- [ ] Approval cards, print HTML and the exported or final document show uploaded signatures with no background box, and their `<img>` markup is unchanged.
- [ ] `npm run verify` passes.

### Acceptance scenarios

1. **White scan.** Background (255,255,255) with a stroke at (20,20,20). Every background pixel has alpha 0, stroke pixels have alpha ≥ 230, and the bounds hug the stroke.
2. **Uneven lighting.** Horizontal background gradient from luminance 170 to 235, with a stroke at luminance 40 across the full width. More than 99% of background pixels have alpha 0 on both sides, and the stroke stays at alpha ≥ 230 on both sides.
3. **Tinted paper.** Background (200,195,185) with neutral dark ink. The background has alpha 0, and ink pixel channel spread is at most 15 after white-balance correction.
4. **Blue ink.** Stroke (30,60,180) on off-white. Output ink pixels satisfy B > R + 60 and B > G + 40.
5. **Faint, thin ink.** A 1–2 px stroke at luminance 120 on 240. Stroke alpha is ≥ 128 with no gaps.
6. **Specks.** Isolated 1–3 px dots far from the signature. Bounds are unchanged by the dots, and the dots end up at alpha 0.
7. **Transparent PNG.** At least 5% of pixels have alpha < 16. `hasMeaningfulTransparency` is true, ink RGBA is kept, and the image is only cropped and resized.
8. **Blank page or specks only.** `findInkBounds` returns null and the UI shows the no-ink error. An earlier drawing or upload stays.
9. **Large photo.** A 4032×3024 JPG of about 6 MB (12.2 MP, under the guard). Accepted, working canvas long edge at most 1600, final PNG at most 600×200, data URL at most 153,600 characters.
10. **Small input, exact sizes.** Ink crop 120×40 gives a final canvas of 136×56 (120+16 by 40+16), with no upscaling.
11. **Size bounds, padding inside the limit.** The inner area is at most 584×184, scaled with `Math.round`, and at least 1 px:
    - `computeOutputSize(3000, 500)` → 600×113 (inner 584×97)
    - `computeOutputSize(400, 400)` → 200×200 (inner 184×184)
    - `computeOutputSize(100, 50)` → 116×66 (no scaling)
    - `computeOutputSize(584, 184)` → 600×200
    - `computeOutputSize(1, 1)` → 17×17
12. **File validation.**
    - OK: png, jpeg, webp, heic, heif; empty type with `sig.HEIC`; size exactly 15 × 1024 × 1024.
    - `unsupported_type`: `application/pdf`, `image/gif`, `image/svg+xml` (SVG is excluded because of script/XSS risk).
    - `too_large`: 15 × 1024 × 1024 + 1.
13. **Decoded-dimension guard.**
    - OK: `validateDecodedDimensions(8000, 5000)` (exactly 40,000,000) and 16384×100.
    - `image_too_large_pixels`: 8001×5000, 16385×10, and 0×0 or non-finite values (the last group may map to `decode_failed`, but must be rejected).
14. **Data URL limit.** `dataUrlWithinLimit` counts the full string. A string of exactly 153,600 characters passes, and 153,601 fails.
15. **Decode failure.** A corrupt file, or HEIC on Chrome, shows a Thai error suggesting JPG/PNG. No uncaught exception, processing resets, and any bitmap or object URL is released.
16. **Confirm during processing (manual).** Draw something, then insert a large photo and immediately try approve or reject. All three buttons (approve, reject, insert) stay disabled until processing finishes, so no second file can be picked. After it finishes, the preview shows the upload and confirming saves the upload, not the drawing.
17. **Result after close (manual).** Insert a large photo, then close the modal before processing finishes, and reopen it for another owner or level. No preview, no error, no processing message, and the buttons are enabled.
18. **Stale-result guard.**
    - **(a) Automated unit test of `createLatestRequestGuard`:**
      - `const g = createLatestRequestGuard(); const a = g.begin();` → `g.isCurrent(a)` is true.
      - `g.invalidate(); const b = g.begin();` → `isCurrent(a)` is false and `isCurrent(b)` is true.
      - Simulate the async flow with two deferred promises: A starts, then invalidate and B starts, then B resolves, then A resolves late. An `apply(result)` callback, run only when `isCurrent(token)` is true, is called once, with B's result only, and A's late result is ignored. The same holds with the opposite resolution order (A before B).
      - `begin()` alone, without `invalidate()`, also makes the previous token stale.
      - After `invalidate()` with no new `begin()`, no earlier token is current.
      - Tokens increase strictly.
    - **(b) Manual: "ล้างลายเซ็น" during processing.** Insert a large photo and press "ล้างลายเซ็น" before it finishes. The late result is discarded, the box stays empty, no error appears, processing ends, and drawing works.
    - **(c) Manual: close and reopen during processing** (see scenario 17).
19. **Drawn regression.** Draw, then confirm with no upload. The saved `signatureDataUrl` comes from `getTrimmedSignatureDataUrl` as before.
20. **Upload, clear, draw.** After an upload, "ล้างลายเซ็น" clears the preview and re-enables drawing. Confirming saves the drawn signature.
21. **Permissions unchanged.** A non-Admin cannot re-sign an Approved sign-off, and name (two or more words) and position are still required. This behaves the same with an uploaded signature.
22. **Rendering (manual).** An uploaded signature shows without a background box on the Planning/O&M approval cards, in the print HTML `.sig-img`, and in the exported PDF (alpha over a white page).

### Proposed design

**Data flow**
1. The file input calls `guard.begin()` to get a token, sets processing to true and calls `processSignatureFile`.
2. Inside it:
   - `validateSignatureFile` runs.
   - The file is decoded and passed to `validateDecodedDimensions`.
   - It is drawn to the working canvas (at most 1600 px), and `getImageData` reads the pixels.
   - The pure pipeline runs.
   - The result goes to the crop/resize canvas, is encoded to PNG, and the size guard loop runs.
3. `guard.isCurrent(token)` is checked. If it is true, the code sets `uploadedSignature`, sets `hasSignature`, clears the error and sets processing to false (on error, it sets the Thai error and sets processing to false). If it is false, the result is discarded.
4. Confirm saves `uploadedSignature.dataUrl` if present, otherwise the canvas trim.
5. The existing Firestore update path is unchanged.

**Background removal** (pure and deterministic, O(pixels)):
1. Luminance `L = 0.299R + 0.587G + 0.114B`.
2. The image is split into tiles of about long edge / 16 (at least 16 px). For each tile:
   - local paper brightness is the 90th percentile of L
   - local paper colour is the per-channel mean of pixels within 5% of that brightness
3. The background map is a bilinear interpolation of the tile values.
4. Darkness `d = 1 − L / Lbg` is mapped to alpha with a smoothstep: d ≤ 0.10 gives 0, and d ≥ 0.35 gives 255. These thresholds are named constants.
5. Colour: each channel becomes `c' = clamp(c × 255 / bgChannel)` to remove the paper cast. Semi-transparent edge pixels are pushed toward the ink colour to avoid a light fringe.
6. Bounds:
   - The mask is alpha ≥ 64.
   - An iterative (non-recursive) 8-neighbour connected-component pass drops components smaller than `max(4, 0.00005 × w × h)` pixels from the bounds and sets them to alpha 0.
   - The function returns null when no component remains.

**Sizing:**
- `inner = fit(crop, maxW − 2·padding, maxH − 2·padding)`. The scale is `min(1, …)`, rounded, with each side at least 1.
- `final = inner + 2·padding`.
- The re-encode loop multiplies the inner size by 0.75 each pass. It throws `too_big_output` if the final long edge would drop below 200.

**Concurrency:**
- The stale-result logic lives in the pure `createLatestRequestGuard()`, which is a closure over a counter, so it can be unit-tested without React.
- The modal keeps one guard in `useRef` and wraps it in `invalidateSignatureUpload()`, which calls `guard.invalidate()` and sets processing to false. That wrapper is called by the signing-modal open/close effect and by `clearSignature`.
- `handleSignatureFile` calls `guard.begin()`, which also supersedes any earlier token.
- Every async continuation checks `guard.isCurrent(token)` before touching state.
- The UI also disables the insert, approve and reject buttons during processing.

**Errors:** `SignatureImageError` codes map to Thai messages in the modal. Unknown errors map to a generic Thai "ประมวลผลลายเซ็นไม่สำเร็จ" message. Resources are released in `finally`.

**Security:** processing is client-only. Stored output is always a `data:image/png;base64,…` string produced by our canvas. SVG is rejected and raw user bytes are never stored. Print HTML interpolation of `signatureDataUrl` into `src` gets no new injection surface. No secrets are involved.

**Performance and limits:**
- The guards (15 MB file, 40 MP decoded, 1600 px working canvas) bound memory use and CPU time. The CPU target is under about 1 s on a mid-range phone.
- Each signature is at most 150 KB, which keeps several signatures well under the 1 MiB Firestore document limit.

### Expected files

- `src/utils/signatureImage.ts` (new): pure pipeline, validation, sizing, `createLatestRequestGuard`, `SignatureImageError`, and the browser wrapper (the wrapper may move to `src/utils/signatureImageBrowser.ts`).
- `src/utils/signatureImage.test.ts` (new): scenarios 1–14 and 18(a) on synthetic RGBA buffers, pure functions and deferred promises.
- `src/components/DesignApprovalModal.tsx`: upload handler, state, guard ref, preview, disabled states, confirm-time source choice, `accept`, labels and Thai messages.

### Risks and rollback

- **Threshold tuning.** Faint pencil or dark paper may lose ink or keep some background. The constants are named and tested, the user sees the preview, and they can retry or draw instead.
- **Browser-dependent HEIC.** Failure is graceful, with a Thai message suggesting JPG/PNG.
- **Decode memory.** The browser decodes the file before our dimension check, which cannot be avoided. The 15 MB file cap limits this, the 40 MP guard prevents further canvas allocation, and resources are released in `finally`.
- **EXIF orientation.** Handled by `imageOrientation: 'from-image'`. The `<img>` fallback follows EXIF by default in modern browsers.
- **Race conditions.** Handled by `createLatestRequestGuard` (unit-tested in scenario 18a) and the disabled buttons. Manual scenarios 16, 17 and 18b check the modal wiring.
- **Rollback.** Revert the commit. Stored signatures stay valid PNG data URLs, so no migration is needed.

### Verification

- Focused tests: `node --import tsx --test src/utils/signatureImage.test.ts`, covering scenarios 1–14 and 18(a).
- Full gate: `npm run verify` (tsc lint, unit tests, functions tests, Vite build)
- Manual QA in `npm run dev`, for both Planning and O&M signing:
  - white scan
  - shadowed phone photo
  - blue ink
  - transparent PNG
  - large JPG (about 12 MP)
  - WebP
  - HEIC on Safari, and HEIC on Chrome (expect an error)
  - blank page
  - corrupt file
  - an oversized-pixel image (over 40 MP, if available)
  - scenario 16 (confirm, reject and insert disabled during processing)
  - scenario 17 (close and reopen during processing)
  - scenario 18(b) ("ล้างลายเซ็น" during processing)
  - scenarios 19–20 (drawn regression, upload then clear then draw)
  - scenario 22 (approval cards, print preview and exported PDF show no background box)

### Deployment

- Target: NONE. This plan does not deploy.
- Surface: Cloudflare frontend, when it is eventually released. Firebase functions are not affected.
- Required authorization: explicit human authorization naming the Cloudflare frontend before any production deploy. Approving this plan or a review is not deployment authorization.

Status: APPROVED

## Independent review

### Diff reviewed

- Base: `a718aa90a39358e6de8d8bc3f74e061468e3ff52` (HEAD, `main` lineage)
- Head: working tree on `vpunpum-sudo/signature-image-automation`. One file is modified: `src/components/DesignApprovalModal.tsx` (+79/−46). Three files are untracked: `src/utils/signatureImage.ts`, `src/utils/signatureImageBrowser.ts` and `src/utils/signatureImage.test.ts`.
- Verification evidence checked: the stage prompt says `npm run verify` passed on the current tree (exit 0). Codex's handoff reports 22/22 focused tests, 88/88 app tests, 17/17 functions tests and a passing Vite build. I read the full diff and all three new files, not just the summary.

### Findings

- MEDIUM: `src/components/DesignApprovalModal.tsx:1087-1099`. The new open/close invalidation `useEffect` was placed under the existing `// Canvas drawing listeners` comment, and it now also resets `signingModalOpen`, `signingTarget`, `hasSignature` and `isDrawing` when the parent `isOpen` turns false. This is a reasonable change for scenario 17 (closing the parent modal during processing). But it is a small behaviour change beyond the plan: closing the parent now closes the signing popup. It also leaves the comment describing the wrong effect. No correctness defect. Suggest moving the comment and saying in the handoff that closing the parent modal resets the signing state.
- MEDIUM: `src/utils/signatureImage.ts:89-103`. The per-pixel loop allocates a new `PaperTile` object in `interpolate()` and a new tuple array for `for…of` on every pixel. On the largest working canvas (1600×1200 ≈ 1.9 M pixels) that is millions of short-lived allocations, which puts the plan's target of about 1 s on a mid-range phone at risk. The plan treats this as a target, not a hard criterion, and the result is correct. A follow-up could inline the channel loop or interpolate per row.
- LOW: `src/utils/signatureImage.ts:100`. The fringe correction divides by `max(alpha, 0.01)` to remove the paper contribution from semi-transparent edges. At very low alpha this can push edge RGB to 0 or 255, but those pixels are almost fully transparent, so the visible effect is negligible. A `.95` paper tolerance and a 0.10 darkness floor already zero out most paper noise.
- LOW: `src/utils/signatureImage.ts:134-137`. Speck removal only clears components with alpha ≥ `minAlpha` (64). Faint pixels with alpha between 1 and 63 inside the crop box are kept. This is acceptable because they sit below the visible threshold over white, but very noisy photos may keep a faint haze. The manual QA "shadowed phone photo" case should check for it.
- LOW: `src/utils/signatureImageBrowser.ts:35-37`. If the `<img>` fallback decodes to `naturalWidth`/`naturalHeight` 0, the error is `image_too_large_pixels` (the "resolution too high" message) rather than `decode_failed`. Scenario 13 explicitly allows this, but the Thai message would be misleading in that rare case.
- LOW: `src/components/DesignApprovalModal.tsx:4115-4117`. With an upload active, two green helper lines appear: "ลบพื้นหลัง…อัตโนมัติแล้ว" and "ตัวอย่างลายเซ็นที่จะบันทึก…". This is cosmetic only.

Checked and found correct:
- **Stale results.** `createLatestRequestGuard` follows the specified semantics: `begin` supersedes earlier tokens, `invalidate` clears the current token, and tokens increase strictly. Every async continuation in `handleSignatureFile` checks `isCurrent(token)` before setting state, including the `finally` that resets processing. `invalidate` runs when the modal opens (`handleOpenSignModal`), when it closes (`closeSigningModal` and the effect) and on `clearSignature`.
- **Controls during processing.** Approve, reject, the insert button and the file input are disabled. `handleConfirmSignature` returns early while processing. `startDrawing` and `draw` ignore input while processing or while an upload is active.
- **Saved signature source.** Confirm uses `uploadedSignature.dataUrl` when present. Otherwise it uses `getTrimmedSignatureDataUrl(canvas)` as before, so drawn signatures are unchanged.
- **Failed uploads.** A failed upload leaves `uploadedSignature`, the canvas and `hasSignature` untouched. Only the error text is set.
- **Validation order.** File validation runs before decoding. Decoded dimensions are validated before any canvas is allocated. The working canvas long edge is ≤ 1600. The bitmap is closed and the object URL revoked in `finally`. Unknown errors map to `decode_failed`.
- **Sizing.** `computeOutputSize` and the re-encode loop match the plan: inner size ≤ 584×184 with `Math.round`, 8 px padding, ×0.75 per pass, and `too_big_output` when the final long edge would drop below 200. A no-progress guard prevents infinite loops.
- **Security.** SVG and GIF are rejected. The stored value is always a canvas-generated PNG data URL. There are no changes to `functions/`, rules, permissions, the Firestore write shape, or approval card, print or PDF markup. No new dependencies.

### Acceptance-criteria result

- [x] Every criterion was checked against the implementation.
  - Automated coverage exists for scenarios 1–15 and 18(a), on synthetic RGBA buffers and with mocked browser decode/canvas.
  - The modal code paths for 16, 17, 18(b–c), 19–21 are correct on code reading. Scenario 22 holds because the rendering markup is unchanged.
  - Still to run in the QA stage: the manual browser checks listed in `.context/implementation.md`. These are real HEIC on Safari and Chrome, phone-photo visual quality, PDF alpha rendering, and the interactive scenarios 16, 17, 18(b), 19–22.

### Verdict

APPROVED. There are no BLOCKER or HIGH findings. The MEDIUM and LOW items are non-blocking follow-ups.

Verdict: APPROVED
