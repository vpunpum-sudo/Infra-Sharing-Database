# freeze-approval-document-snapshot

Archived by `agent-flow` on 2026-10-22 after an approved review.

- Branch: `vpunpum-sudo/u7j70`
- Base commit: `ec55614`
- Verification: `npm run verify`, Started: 2026-10-21T22:54:21Z, Exit code: 0

## Delivery plan

Status: APPROVED
Feature: freeze-approval-document-snapshot  
Risk: HIGH — this changes Firestore permissions and persisted approval data, and affects signed PDF and KMZ documents.

### Objective

When a user confirms “ยื่นขออนุมัติ”, save the approval document as a snapshot of the project data the client has already loaded. Later changes to routes, enclosures, loops, settings, project details or approval drafts must not change that request’s slides, map, tables, PDF, KMZ or final signed documents. Signing, rejection, resubmission and Admin rewind must keep working.

“ขณะยื่น” means the in-memory view of all six successfully loaded collections at the moment the user confirms. It is not an atomic Firestore read across collections. An edit made while the snapshot writes are in progress does not enter that document.

### In scope

- Write an immutable snapshot under `projects/{projectId}/approvalSnapshots/{approvalId}`. Then attach it to the project in a single `runTransaction` write that creates the new `designApproval` together with its `snapshotId`.
- Track readiness and errors separately for the six live listeners: routes, enclosures, loops, enclosureTypes, fiberTypes and fiberColorConfigs.
- Keep two data paths, `documentSource` and `liveSource`, so a rejected request stays historical while its resubmission form shows current data.
- Resolve project name, route code, owner and owners from snapshot metadata for every document and export path.
- Add a whitelist Firestore rule. While `designApproval.id` is unchanged, only workflow fields may change, for every role including Admin.
- Stop Map cut/split operations from rewriting a submitted approval.
- If the ID lists are too large for the metadata document, split them into chunked index documents.
- Write a Rules Playground procedure that tests the proposed rules before publication, and record its results separately.

### Out of scope

- Snapshotting owner logos or branding from `ownerConfigs` / `getEffectiveOwnerLogo`. These stay live and are listed as a limitation.
- Backfilling snapshots for older approvals, deleting old or orphaned snapshots, changing approval stages or notification emails, changing Cloud Functions storage and download behaviour, and deployment.
- Changing who may sign, edit or rewind. `canSignApproval`, `canEditProject`, `isApprovalRewind` and `hasAdminRole` keep their current meaning.
- Schedule data, which the approval document does not render.
- Adding Firestore emulator tests to the current verification gate.

### Acceptance criteria

- [ ] Submission is disabled, with a loading status, until each of the six listeners has delivered at least one snapshot without error. An error in any listener blocks submission and shows a message naming the failed source.
- [ ] At confirmation, the client copies the six ready data sets and the relevant project and approval fields into a fixed submission payload. **Every submit attempt generates a new `approvalId`**, including a retry after a failure. Snapshot metadata and child documents are create-only, so reusing an ID whose documents partly exist would turn into a denied update and block retries for good. A unit test proves that a retry uses a different ID.
- [ ] All snapshot writes (metadata, index chunks, children) must succeed before the attach step. The attach runs in `runTransaction`. It reads the project and checks that `designApproval` is still in the state captured when submission began: either absent, or the same rejected ID with `status == 'Rejected'`. Only then does it write, in one update, the new `designApproval` (new `id`, `snapshotId == id`, `snapshotCreatedAt`, workflow start values) and the existing project status change. If the state does not match, the transaction writes nothing and the user is told to reload the page. Another user’s `designApproval` is never overwritten.
- [ ] A failed submission (snapshot write failure or a transaction abort) leaves the project document exactly as it was:
  - **Submission from Draft, or after a rewind to Draft:** `project.status` stays `Draft`, there is no `designApproval`, and `approvalDraft` is unchanged.
  - **Resubmission after rejection:** the previous `designApproval` keeps every field (`id`, `status: 'Rejected'`, `rejectionReason`, `snapshotId`, `snapshotCreatedAt`, all sign-offs, all content), `project.status` stays `Rejected`, and `approvalDraft` keeps all of the user’s edits.
  - In both cases the user sees an error and can submit again.
- [ ] Snapshot metadata records the actual document IDs for each child collection. Loading checks exact set equality between expected and loaded IDs and detects duplicates. Counts alone are not enough.
- [ ] **ID list size threshold:** the client measures the UTF-8 size of all six ID lists together.
  - If the total is ≤ 256 KiB, the lists are stored inline in metadata.
  - Otherwise every list moves to `approvalSnapshots/{approvalId}/index/{n}` (n = 0…k−1). Each chunk is ≤ 256 KiB and holds `{ collection, ids }` segments. Metadata stores `idIndex: { mode: 'chunked', chunkCount: k }`.
  - The resolver loads exactly `chunkCount` chunks, rejects missing or extra chunks, rebuilds the lists, and applies the same exact set-equality and duplicate checks.
  - Both modes have unit tests.
- [ ] A snapshotted approval’s `documentSource` supplies slides 1–6, map markers, tables and allocation, distances, participating owners, the project header, PDF, KMZ and final documents. A rejected approval keeps this source, while its resubmission form and form preview use `liveSource`.
- [ ] Every output path receives a resolved `documentProject` `{ name, routeCode, owner, owners }` taken from snapshot metadata: `buildPrintDocument` and print markup, the PDF and KMZ `exportFileName`, `buildProjectKmz`, and `finalDocuments` naming. When a snapshot exists, none of these read the values from the live project.
- [ ] A missing or incomplete snapshot (including a bad index) shows an error, without rendering partial or live content in the historical document. Export and signing are disabled. Admin rewind to Draft stays available.
- [ ] **Whitelist rule:** when `designApproval` exists before and after the write and `resource.data.designApproval.id == request.resource.data.designApproval.id`:
  - The update must satisfy `request.resource.data.designApproval.diff(resource.data.designApproval).affectedKeys().hasOnly(['status','approvalStage','planningSignOffs','omSignOffs','ownerSignOffs','rejectionReason','finalApprovedAt','finalApprovedBy','finalDocuments'])`.
  - Every other key is document content and is frozen for every role, including Admin. That covers documentNumber, requestedAt, requestedBy, requestedByEmail, requestedByUid, snapshotId, snapshotCreatedAt, designNotes, the contractor fields, estimatedInstallationDate, the distance fields, routeEnclosureSelections, and any key not yet known. Adding or removing such a key is also denied.
  - Who may write the workflow fields does not change: Management/Planning through `canSignApproval`, editors and Admin through `canEditProject`. Rewinds still require `isApprovalRewind` together with `hasAdminRole`.
  - This rule does not block a change of ID (resubmission) or removal of the whole `designApproval` (rewind to Draft).
- [ ] Snapshot metadata creation requires `projectId` and `approvalId` to match the path, and `canEditProject` on the parent project. Child creation is limited to the six named collections plus `index`, beneath that approval ID, and requires matching metadata. Reads follow project access. No role can update or delete any snapshot document.
- [ ] Older approvals without `snapshotId` still use live data and show a notice that their document is not locked. Draft behaviour stays live.
- [ ] `npm run verify` passes. Manual browser scenarios and Rules Playground results are recorded separately. `npm run verify` is not presented as proof of Firestore permissions.

### Acceptance scenarios

1. **Freeze after Map edits.** Submit a project with three routes and ten enclosures. Move an enclosure, rename a route, delete an enclosure and add a route. The original approval’s slides, map, tables, totals, PDF and KMZ still show the submitted data.
2. **Freeze after settings edits.** After submission, change an enclosure type, a fiber colour configuration and the project owners. The document and its sign-off slots keep their submitted values.
3. **Contractor locked.** While Pending, the contractor editing and enclosure selection controls are unavailable. A Design user’s direct update to `designApproval.contractorName` with the same approval ID is denied.
4. **Signing and final documents.** Planning and O&M sign a snapshotted request. The workflow fields update, and after live edits in between, the final PDF and KMZ still use the snapshot.
5. **Rejected document and resubmission form side by side.** Reject a request, then change live Map and form data. The rejected slides, map, tables, PDF and KMZ keep the original snapshot and rejection reason. At the same time, the resubmission form and its preview show the latest live data. Resubmission gets a new approval ID and snapshot, and the old snapshot stays unchanged.
6. **Admin rewind.** Rewind a Completed request to Planning: its ID, snapshot and content stay the same and the sign-offs reset. Rewind to Draft: `designApproval` is removed. The next submission creates a new ID and snapshot.
7. **Older approval.** An approval without `snapshotId` renders and exports from live data, shows the unlocked notice, and signs the same way as before.
8. **Incomplete snapshot.** Simulate each of these:
   - missing metadata
   - a missing child
   - an unexpected child with the count unchanged
   - duplicate expected IDs
   - in chunked mode, a missing index chunk
   - in chunked mode, an extra chunk beyond `chunkCount`

   Each case shows an error, with no live fallback, no export and no signing.
9. **Source readiness and submit failure.**
   - (a) Before each of the six listeners has delivered once, submission is disabled with a loading status.
   - (b) An error from any one listener blocks submission and shows a clear message.
   - (c) **Failure from Draft:** make a snapshot child write fail. Afterwards `project.status == 'Draft'`, there is no `designApproval`, `approvalDraft` equals its value before the attempt, an error is shown and the submit button works again.
   - (d) **Failure on resubmission after rejection:** make a snapshot write fail. Afterwards `designApproval` is unchanged field for field (same `id`, `status: 'Rejected'`, `rejectionReason`, `snapshotId`, sign-offs), `project.status == 'Rejected'`, `approvalDraft` still holds every edit the user made, an error is shown and the submit button works again.
   - (e) **Retry:** after (c) or (d), submit again. The attempt uses a new `approvalId` (different from the failed one) and succeeds. The orphaned partial snapshot from the failed attempt is never referenced or loaded.
   - Unit tests cover the new-ID-per-attempt behaviour and the state that stays unchanged.
10. **Large project.** More than 500 child records are written in batches of at most 450 operations, and the snapshot loads with exact ID set equality. With enough IDs to pass the 256 KiB threshold, the snapshot uses chunked index mode and loads correctly.
11. **Permissions (Rules Playground on the proposed rules).** Use these identities: Admin, Design/project editor, Planning signer, Management, and a viewer without project access. Use real `projects/{pid}`, `.../approvalSnapshots/{approvalId}`, child paths and `index/{n}` paths.
    - **Allowed**, same approval ID, on a Pending project:
      - a Planning signer writes `planningSignOffs.<owner>` = Approved
      - Management writes `omSignOffs.<owner>`
      - a signer rejects with `status: 'Rejected'` and `rejectionReason`
      - `approvalStage` advances from Planning to OM
      - an editor writes `finalDocuments`, `finalApprovedAt` and `finalApprovedBy` when the request completes
      - an Admin rewinds OM to Planning (`isApprovalRewind`)
      - an Admin removes `designApproval` (rewind to Draft)
      - an editor’s resubmission with a new `id` and `snapshotId`
    - **Denied**, same approval ID, for Design, Planning, Management **and Admin**:
      - changing `contractorName`
      - changing `designNotes`
      - changing `routeEnclosureSelections`
      - changing `snapshotId`
      - adding an unknown key `designApproval.extraField`
      - a non-Admin rewind
    - **Snapshot paths:**
      - all project-access roles may `get` and `list`; the viewer without access is denied
      - only an editor of that project may `create` metadata, children and index documents with matching `projectId` and `approvalId`
      - creation is denied for signers and for an editor of another project
      - creation is denied for mismatched path IDs and for child collections outside the allowed set
      - `update` and `delete` are denied for everyone, including Admin
12. **Map cut/split regression.** Cut or split a route while the approval is Pending or Approved. The operation succeeds without writing `designApproval`, and the document stays fixed. On Draft or Rejected projects, the remapped selections go to `approvalDraft.routeEnclosureSelections`.
13. **Draft and rejected views.** With no approval, the form and preview follow live changes and save to `approvalDraft`. With a Rejected approval, the historical document stays on `documentSource` while the form and preview follow `liveSource`. Form edits never change the rejected `designApproval`.
14. **Admin content freeze and recovery.** A direct Admin update to `contractorName` on an unchanged approval ID is denied. An Admin rewind to Draft, followed by a new submission with the edited value, succeeds with a new approval ID and snapshot.
15. **Project header and file names.** After submission, change both the live project `name` and `routeCode`. Print markup, PDF and KMZ content, their export file names, `buildProjectKmz` and the final document names keep the submitted values.
16. **Attach race.** Open the same Rejected project in two sessions. Session A resubmits successfully. Session B then submits. B’s transaction sees a different `designApproval.id`/status, aborts without writing the project, and tells the user to reload. A’s approval is unchanged. B’s snapshot stays unreferenced (an accepted orphan). The same applies to Draft: if another session has created `designApproval` in the meantime, B aborts.

### Proposed design

**Data model** (`src/types.ts`)

- Add `snapshotId?: string` and `snapshotCreatedAt?: string` to `DesignApproval`.
- Add snapshot metadata containing:
  - `id`, `approvalId`, `projectId`, `createdAt`, `createdByUid`, `schemaVersion: 1`
  - `project: { name, routeCode?, owner?, owners? }` and `participatingOwners`
  - either inline sorted ID lists for the six collections, or `idIndex: { mode: 'chunked', chunkCount }`
- Counts may be kept for diagnostics but do not prove completeness.

**Storage and validation** (`src/utils/approvalSnapshot.ts`, `src/services/approvalSnapshotService.ts`)

- Generate a new `approvalId` for each submit attempt, inside the submit handler and never cached across attempts.
- Write order:
  1. metadata
  2. index chunks, if chunked
  3. child batches of at most 450 operations (`chunkSnapshotWrites`)
  4. the attach transaction
- `buildApprovalSnapshot` clones the ready client view at confirmation. `planIdIndex` applies the 256 KiB threshold and builds the chunks.
- The resolver rebuilds the ID lists from inline data or from exactly `chunkCount` chunks, then checks exact set equality and duplicates for each collection. A referenced snapshot never silently falls back to live data.
- `attachApprovalSnapshot(projectId, expected, newApproval)` uses `runTransaction`. `expected` is `{ kind: 'none' }` or `{ kind: 'rejected', id }`. If the project no longer matches, it throws a typed `ApprovalStateChangedError`, which the UI shows as “please reload”. `approvalDraft` is never cleared on failure. Success-path handling of `approvalDraft` stays as it is today.

**Two data sources** (`DesignApprovalModal`)

- `documentSource` uses the snapshot whenever the viewed approval has `snapshotId`. Legacy approvals use live data with a notice. It feeds every historical view and output.
- `liveSource` always represents current Firestore data. It feeds Draft preparation and, after rejection, the resubmission form and preview.
- Keep a loaded flag and an error state for each of the six listeners. Submission stays disabled until all six are ready and error-free.
- Resolve `documentProject` from snapshot metadata and pass it explicitly to print markup, export naming, `buildProjectKmz` and `finalDocuments` creation.

**Editing and Map operations**

- Disable submitted-content controls while the approval is Pending or Approved. Rejected-form changes write to `approvalDraft`.
- In `src/App.tsx`, route cut/split remaps `approvalDraft.routeEnclosureSelections` for Draft or Rejected projects. It leaves `designApproval` untouched for Pending or Approved projects.

**Firestore rules** (`firestore.rules`)

- Add `approvalContentUnchanged()`. It returns true when:
  - `designApproval` is absent before or after the write, or
  - the IDs differ, or
  - `diff().affectedKeys().hasOnly([...workflow fields])`
- Append the function to the project `allow update` with `&&`, leaving `canEditProject || canSignApproval`, `uidNotModified` and `(!isApprovalRewind() || hasAdminRole())` unchanged.
- An approval without `id` compares as `'' == ''`, so its content is locked too. Rewind to Draft still works for it.
- Add `match /approvalSnapshots/{approvalId}`:
  - `get` and `list` require `canAccessProject(parent)`
  - `create` requires `canEditProject(parent)`, `projectId == projectId` and `approvalId == approvalId`
  - `update` and `delete` are always false
- Add a nested `match /{collection}/{docId}` with `create` only when `collection` is one of the six names or `index`, the metadata exists and matches, and `canEditProject(parent)`. Read follows project access. `update` and `delete` are false.

**Limits and errors**

- The snapshot is the complete client view at confirmation, not an atomic read across collections.
- Orphan snapshots come from failed attempts or aborted transactions. They are accepted, never referenced, and cannot be deleted by any role. Cleanup is out of scope.
- A failed or incomplete read blocks historical rendering, export and signing, but Admin rewind to Draft stays available.
- Branding and owner logos remain live.

### Expected files

- `src/types.ts`
- `src/utils/approvalSnapshot.ts` (new)
- `src/utils/approvalSnapshot.test.ts` (new)
- `src/services/approvalSnapshotService.ts` (new)
- `src/components/DesignApprovalModal.tsx`
- `src/App.tsx`
- `firestore.rules`
- `docs/specs/freeze-approval-document-snapshot.md` (new)
- `.context/qa-checklist.md`

### Risks and rollback

- **Permissions and workflow writes.** A workflow field missing from the whitelist would block signing or finalization. Before finalizing the list, check every `designApproval` write in `DesignApprovalModal`, `App.tsx` and its services against these nine keys. If an existing write touches another key on an unchanged ID, raise it with the human rather than widening the list silently. Run the Playground matrix on the proposed rules before release.
- **Partial writes and orphans.** These are harmless because the project does not reference them. A new ID per attempt prevents retry deadlock.
- **Attach race.** The transaction prevents overwriting. The losing session gets an orphan snapshot and a reload prompt.
- **Concurrent edits** during snapshot writes are not captured. This is recorded in the spec.
- **Document size and write cost.** Chunked index mode keeps metadata well under 1 MiB, and large submissions use multiple batches.
- **Rollback.** Revert the frontend change and, separately, the rules if needed. Older code ignores the snapshot fields. Note that once the whitelist rule is reverted, content becomes editable again. No migration or deletion is needed.

### Verification

- Unit-test:
  - snapshot construction
  - exact ID set validation (missing, unexpected and duplicate IDs)
  - inline vs. chunked index at the 256 KiB threshold, including missing or extra chunks
  - source selection for Draft, legacy, historical and rejected-form views
  - batching at 0, 450 and more than 500 writes
  - a new `approvalId` on every attempt, including a retry after failure
  - attach-transaction decisions for each expected/actual state combination, with no write on mismatch
  - project and `approvalDraft` unchanged after a failure in both the Draft and Rejected cases
  - resolved `documentProject` through every output path
- Test listener readiness and errors, and Map cut/split behaviour where practical.
- Run `npm run verify`.
- Record browser results for scenarios 1–10 and 12–16.
- **Rules Playground:**
  1. Before publication, paste the proposed `firestore.rules` into the Firebase Console Rules Playground editor and run the simulations without publishing.
  2. For each row of scenario 11, record in a separate table in `.context/qa-checklist.md`: date/time, reviewer, the identity used (role and test UID, no tokens or secrets), path, operation, payload summary, expected result and the actual allow/deny.
  3. Write the same procedure in `docs/specs/freeze-approval-document-snapshot.md`.
  4. Keep this table separate from, and never counted as, `npm run verify` evidence.
- Follow-up only: when a JRE is available, add `@firebase/rules-unit-testing` through `firebase emulators:exec` as a separate npm script outside `npm run verify`.

### Deployment

- Target: NONE. This plan does not deploy.
- A later release needs explicit human authorization naming its target.
- Publish the Firestore rules before or with the frontend. If the frontend ships first, snapshot writes fail, and the submission fails safely with the project unchanged.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: `main` @ `ec55614` (working tree on branch `vpunpum-sudo/u7j70`)
- Head: uncommitted working tree. Modified: `firestore.rules`, `src/App.tsx`, `src/components/DesignApprovalModal.tsx`, `src/types.ts`. Untracked: `src/utils/approvalSnapshot.ts`, `src/utils/approvalSnapshot.test.ts`, `src/services/approvalSnapshotService.ts`, `docs/specs/freeze-approval-document-snapshot.md`.
- In round 1 I reviewed the full diff with `git diff` and `git status`. In this round Bash was not permitted, so I checked the fix by reading the changed code directly: `src/components/DesignApprovalModal.tsx:180-307`, `src/utils/approvalSnapshot.ts:66-80`, `src/utils/approvalSnapshot.test.ts:140-171`, and the review-fix log in `.context/implementation.md`.
- Verification evidence checked: the stage prompt reports that `npm run verify` exits 0 on the current tree. The implementer reports 11/11 focused tests passing and 199 root tests plus 39 Functions tests passing at 05:54 ICT. No Rules Playground results or authenticated browser QA exist yet. As the plan says, `npm run verify` is not evidence of Firestore permissions.

### Findings

- RESOLVED (was HIGH): Prefilled values in the rejected-resubmission form were being lost. The new `resolveApprovalFormValues` (`src/utils/approvalSnapshot.ts:66-80`) resolves each field on its own: it takes the `approvalDraft` value when it is defined and otherwise the rejected `designApproval` value. It uses the draft only when there is no approval or the approval is Rejected, and it uses `??`, so an explicit `''`, `0` or `{}` still counts as an intentional override. The modal seeds every input and the route enclosure selections from that resolver (`src/components/DesignApprovalModal.tsx:185-199, 256`). The sync effect now updates only the fields whose resolved value changed, so saving one field no longer resets the others (`src/components/DesignApprovalModal.tsx:226-244`). The selection effect resolves through the same function (`src/components/DesignApprovalModal.tsx:261-264`). This now matches the fallback in `remapApprovalDraftSelections`. Regression tests cover a one-field draft that keeps all other submitted values and custom selections, explicit clears, and Pending/Approved forms ignoring stale drafts (`src/utils/approvalSnapshot.test.ts:149-171`).
- MEDIUM: Nothing verifies how the snapshot child-create rule behaves inside a 450-write batch. Each child create evaluates `get(project)` and `canEditProject`, plus `exists` and `get` on the metadata (`firestore.rules:410-421`). Batched writes share one limit on document-access calls. That should be fine if repeated reads of the same document are deduplicated, but neither the Rules Playground nor `npm run verify` tests it. If it fails, submission fails safely and leaves the project unchanged. Before publishing, confirm with an emulator or staging run that a ≥450-child batch is allowed (scenario 10). This is pre-release QA work, not a code defect.
- MEDIUM: The scenario 11 Rules Playground matrix and browser scenarios 1–10 and 12–16 are still not run (`.context/implementation.md`, Known risks). They must be recorded in `.context/qa-checklist.md` before the rules are published. This review approval does not authorise a release or a deployment.
- RESOLVED (was LOW): Snapshot metadata creation now checks `createdByUid` against the auth uid. See [approval identity and legacy attach fixes](approval-identity-and-legacy-attach-fixes.md).
- RESOLVED (was LOW): `planApprovalAttach` now accepts a missing approval regardless of legacy project status while retaining the race guard. See [approval identity and legacy attach fixes](approval-identity-and-legacy-attach-fixes.md).
- RESOLVED (was LOW): Signing now writes `rejectionReason` only for a rejection or to clear a non-empty old reason. See [approval identity and legacy attach fixes](approval-identity-and-legacy-attach-fixes.md).

### Acceptance-criteria result

- [x] Submission is gated on readiness of all six listeners, and the message names the failed source.
- [x] Every submit attempt gets a new `approvalId`, and a unit test covers the retry.
- [x] Snapshot writes complete before a transactional attach that checks the expected state, and a mismatch writes nothing.
- [x] A failed submission leaves the project, `designApproval` and `approvalDraft` unchanged in both the Draft and Rejected cases.
- [x] Exact ID-set and duplicate checks for inline and chunked indexes, the 256 KiB threshold, and rejection of missing or extra chunks.
- [x] `documentSource`/`liveSource` are separated, and `documentProject` is used for print, PDF and KMZ naming, `buildProjectKmz` and final-document naming.
- [x] A missing or incomplete snapshot blocks rendering, export, final documents and signing, while Admin rewind stays available.
- [x] The whitelist rule and the create-only rules for snapshot paths match the plan. Every same-ID `designApproval` write I checked touches only whitelisted keys.
- [x] Map cut/split no longer writes `designApproval`, and the remap fallback matches the form.
- [x] The resubmission form after rejection inherits the rejected values field by field and keeps the user's edits (scenarios 5 and 13).
- [x] Legacy approvals keep live data and show the unlocked notice.
- [ ] The Rules Playground matrix, the batch rule check, and browser scenarios 1–10 and 12–16 are recorded. Still pending as manual QA outside `npm run verify`, and required before publication.

### Verdict

APPROVED. The round-1 HIGH finding is resolved and no BLOCKER or HIGH findings remain. The MEDIUM items are QA evidence that must be gathered before release. Deployment still needs explicit human authorization naming the target.

Verdict: APPROVED
