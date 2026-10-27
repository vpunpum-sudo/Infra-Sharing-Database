# signing-authority-firestore-rules

Status: IMPLEMENTED (not deployed)
Feature: signing-authority-firestore-rules
Risk: HIGH — changes `firestore.rules` on a production database shared by real signers. Nothing in this change is deployed. The rules ship only through a separate, explicitly authorized deploy that names "Firestore rules, project gen-lang-client-0942355314".

## Objective

Before this change the `projects/{id}` update rule let any writer admitted by the older outer gate (`canEditProject` or `canSignApproval`) change every approval field. The client predicate `canSignAsOwner` (`src/utils/approvalQueue.ts`, used by `DesignApprovalModal.canUserSign`) was the only real gate: a Management user of owner A could write a direct Firestore update that signed for owner B, signed the Planning level, forged `signedByUid`, or jumped the approval to Completed. A project creator could also create a project that already carried an Approved `designApproval`.

The rules now enforce, for every update that changes `designApproval` or the top-level `status`, that the write is exactly one of: a new approval (submit, resubmit, legacy attach), a legacy snapshot backfill, an Admin rewind, a single sign-off, the final-documents record, or an Admin status-only change. Each class re-implements the older clauses more strictly. **The governing principle is that the rules only narrow.** They never widen what the older rules allowed and are not meant to block a faithful client payload.

## What changed in `firestore.rules`

- `projectUpdateGate(p, u)` replaces `(canEditProject || canSignApproval)` for the project update rule. It reads the users document once and is equivalent to the older pair for these rules: an Admin (users document or the two Admin emails), the project creator, a Design/Sub-contract editor of a member company, or an approved Management/Planning member who changes only `status`/`designApproval`. It exists because the older pair called `isAdmin()` and `getUserData()` repeatedly and spent the evaluation budget the classifier needs. `canEditProject` and `canAccessProject` are unchanged and still used by the snapshot rules.
- `approvalWriteAllowed(projectId, u)` replaces `isApprovalRewind()` + `approvalContentUnchanged()`. These three helpers (`canSignApproval`, `isApprovalRewind`, `approvalContentUnchanged`) were removed from the file; the previous file is kept byte for byte in `tests/rules/fixtures/firestore.rules.before` for comparison.
- Sign-off writes (`signAllowed`): exactly one entry of `planningSignOffs`/`omSignOffs` changes (an absent untouched map may become `{}`), the entry carries `owner` and `level` matching its slot, a status of Approved or Rejected, keys limited to the `OwnerSignOff` fields and `signedByUid == request.auth.uid`; only `status`, `approvalStage`, the two maps, `rejectionReason` and `finalApprovedAt/By` move. The signer needs the level permission (`rolePermissions/{role}` merged over built-in defaults that are pinned to `src/constants.ts` by `src/utils/rulesPermissionDefaults.test.ts`), a users document (or the Admin emails) and, unless Admin or owner-less, their own Owner. A non-Admin signs only a Pending approval at Planning or OM, only an entry that is not already Approved, and an O&M entry needs Planning complete; nothing may lower the approval.
- Stage and status: the claimed stage must be the one the sign-offs support. `Planning` needs Planning not complete, `OM` needs Planning complete and O&M not, `Completed` needs both, and a target or required owner's Rejected entry takes precedence for every signer. A claim above or below the data is refused, and a non-Admin can never lower the stage. A stored OM stage alone never proves Planning completeness.
- Required owners R: with a `snapshotId`, the snapshot's `participatingOwners` (the snapshot must exist and match both the enclosing project ID and this approval ID, for signing and stage rewinds); otherwise the project's `owners`/`owner`; otherwise (legacy, no owners) the keys of the two sign-off maps plus the target. A malformed set (missing, wrong type, empty, unsupported value) fails closed for advancement and completion only; a non-advancing signature or a rejection is still allowed.
- Rewind (Admin with a users document only): exactly the shapes `handleRewindApproval` writes, for the permitted source/target pairs.
- New approval: allowed over no approval, a Rejected approval, or a legacy approval without `snapshotId`, never over a Pending or Approved approval that has a snapshot (for any role, including Admin), and a non-Admin may replace only an approval with no Approved entry and not past Planning (as `isApprovalRewind` required).
- Project create: a `designApproval` on create is allowed only for a users-document Admin.

## Deviations from the approved plan (read these)

1. **Who wrote the code.** The plan assigned the implementation to Codex. Its sandbox forbids opening and connecting to local sockets, so it could not run the Firestore emulator and stopped with `BLOCKED` and no source change (as the plan requires). With the owner's agreement, Claude wrote the rules and the test suite and ran every check, and Codex is the independent reviewer.
2. **The outer gate and two helpers were replaced, not only extended.** The plan kept `(canEditProject || canSignApproval)`, `isApprovalRewind()` and `approvalContentUnchanged()` and added a classifier on top. That did not fit: the emulator enforces the 1,000-expression limit, and the older gate plus any classifier that covers the plan exceeded it. The older logic is therefore replaced by `projectUpdateGate` and the classifier, with the same meaning but cheaper. The proof that nothing was widened is the declared old/new table below and the seeded mutation sweep, not an argument by construction.
3. **Stage claims are exact.** The earlier implementation used the stored OM stage as a shortcut for non-Admin O&M signing. Review found that an allowed project-owner edit could invalidate that shortcut. It has been removed: Planning completeness is always recomputed over the current required set. For an O&M signature the classifier proves the Planning map is unchanged, so the computation also proves completeness in the before state. Required-owner rejection precedence applies to all signers. Completed claims prove both maps all Approved directly, which also proves no required rejection without rescanning them.
4. **Legacy fallback owner set.** With neither snapshot nor project owners, R is the keys of both sign-off maps plus the target. An unsupported key there makes the set malformed (fail closed) instead of being silently dropped.
5. **No `@firebase/rules-unit-testing` dependency.** The suite uses the Firebase client SDK with `mockUserToken` against the emulator, the harness already proven on PR #91, so no new dependency was added. `firebase-tools` is not a devDependency either; `npm run test:rules` expects the `firebase` CLI and a JRE to be installed.
6. **Changes made after the first independent review (Codex, CHANGES_REQUESTED, 5 high findings, all accepted):** `canDeleteProject` had been removed by mistake and is restored (the emulator compiles a call to a missing function and the suite had no delete fixture; delete fixtures `DEL.*` were added); an Admin may resubmit after a rejection that followed an approval (`S2b.ADM`); the claimed stage is exact (above) with fixtures `G18`, `D23.*`; the gate treats a user without an `owner` field as a non-member (`GATE1`-`GATE4`) because the previous gate read the field directly; the denial classifier works per operation and rejects unrecognised diagnostics (below).
7. **Fixture corrections found while running** (no declared expectation was edited to fit an observation):
   - `WX1` (rewind-shaped Planning→Planning) needed an Approved entry in its starting state; with none the write is a no-op, not a rewind.
   - `S2` (resubmit after rejection) was split: `S2` rejects with no Approved entry, `S2b` rejects after an approval.
   - Fixtures now deep-copy their data for every run (the old-rules run used to mutate the objects the new-rules run reused).

## Findings

- **Review-fix round 3 (2026-10-25), validated 2026-10-27:** recompute Planning completeness; enforce required-owner rejection precedence for non-Admins; preserve Completed-to-OM rewind when retained legacy Planning keys differ from the reset O&M keys; validate both snapshot identities during signing and stage rewind. Added regressions replay actual owner edits and O1/O2 signing followed by rewind. All 242 declared fixtures, denial diagnostics, narrowing sweep, four-unit expression margin, batches/transactions and 15 real-UI scenarios passed in the normal workspace shell outside the restricted stage sandbox. See current-tree evidence below; the historical tables remain labelled as pre-fix results.
- **Pre-existing, kept as is:** with the previous rules a non-Admin editor cannot resubmit after a rejection that followed any approval: the write is refused by the older rewind detection and, in the emulator, also overruns the expression limit (`S2b`, old DENY). The new rules refuse it the same way. An Admin can resubmit. Allowing the editor would widen the older rules, which this change does not do.
- **Pre-existing, kept as is:** a user who has signing permission but is neither a project editor nor its creator (for example Planning/Management without being a member through `canEditProject`) is refused by the outer gate even though the UI shows the sign button (`D14`, `D15`). Documented client/rules discrepancy.
- The emulator lists one "<outcome> for '<operation>' @ L<line>" segment per evaluated statement and often adds an auxiliary error or "expression limit" segment next to the real "false" one, including for the previous rules and for denials that stop at the very first condition (`denial.rules.test.mjs` calibrates this). The suite classifies a denial by the segments of the operation the fixture attempted: a false segment is decisive, a denial with no false segment for that operation (a real evaluation error, a real limit overrun, or an unrecognised message) fails the fixture. This check found four forged writes that were first refused only by overrunning the budget; the rules were restructured until they are refused by a false condition.
- Fixture data that is mutated between the old-rules and new-rules runs produced a misleading mismatch once (WR5a); fixtures now deep-copy their data.

## Accepted exceptions and residuals (confirmed by the owner at plan approval)

1. A malformed, missing or empty owner set fails closed for advancement and completion only; non-advancing signatures and rejections stay allowed (M-series).
2. **Project-create exception.** A non-Admin (or an email-only Admin with no users document) can no longer create or migrate a project whose document already carries a `designApproval` (C2-C4b, C8). Admin migration works (C7). **Release prerequisite, not covered by fixtures:** confirm that no pre-structure project under `users/*/projects` that holds a `designApproval` is waiting to be migrated by a non-Admin user.
3. **Stale-key limitation (RT1-RT3).** With neither snapshot nor project owners the required set includes stale sign-off keys, so the rules can be stricter than a route-derived client owner set (RT1); extra route owners without keys are not required (RT2). The Admin recovery is a rewind to Planning with a corrected key set (RT3).
4. A users-document Admin may create a project that carries any approval, including an Approved one; this is intentionally unvalidated.
5. Owner enforcement covers the recorded, rules-visible owner set only; owners derived from routes cannot be evaluated in rules.
6. An owner-less project creator can still sign for any owner (G8, known-permissive and pinned).
7. Top-level `status` on project create is unconstrained when no `designApproval` is present.
8. `signedBy`, `signedByEmail`, `role` and `position` are client-supplied; only `signedByUid` is bound to the caller.
9. The Admin status-only write and a users-document Admin's latitude to sign any owner and correct entries are unchanged (an email-only Admin keeps the older limits: no lowering).

## Budgets

Per request Firestore allows 1,000 expression evaluations and 10 distinct document reads.

| Operation | Distinct documents read by the rules |
|---|---|
| Sign (`updateDoc`) | users, `rolePermissions/{role}` (not for an email-only Admin), the approval snapshot (3 at most) |
| Rewind | users, snapshot |
| New approval / attach transaction update | users |
| Legacy backfill transaction update | users, snapshot |
| Snapshot metadata create / child create in the 450-document batches | unchanged (users, project, snapshot metadata shared across the batch) |
| Project create | users and `rolePermissions` (for a non-Admin) |

The control ruleset in `limits.rules.test.mjs` confirms the emulator enforces the 10-document limit (10 distinct reads ALLOW, 11 DENY).

Expression headroom is tested by padding the update rule with cheap units (one unit is about 10 expressions). The current-tree run passed the unchanged four-unit margin for all 15 selected fixture sequences in `limits.rules.test.mjs`, including L1, G19 and the legacy completion-to-rewind regressions. Earlier per-fixture spare-unit measurements below are historical; the current run establishes the four-unit minimum rather than a new maximum-headroom measurement.


## Evidence

### Current-tree validation (2026-10-27)

The supplied normal-workspace-shell evidence in `.context/signing-authority-current-validation.md` records validation outside the Codex sandbox against `firestore.rules` SHA-256 `b0d63f29b6ff3f5a1b32d995daf9fa26d0020e19cfe0291f11c5a49c30c76ab8`. The review-fix owner confirmed that this hash matches the working tree and that the previous-rules fixture still matches `origin/main`.

- `npm run test:rules`: exit 0, 15/15 tests; all 242 declared fixture outcomes matched under previous/current rules, with operation-specific denial diagnostics passing.
- L1 legitimate worst-case signature and L2 unchanged four-unit padding passed; L3 450+70 child batches and attach/backfill transactions passed; L4 observed 10 distinct reads ALLOW and 11 DENY.
- Seeded 500-case narrowing sweep: 287 DENY/DENY, 181 ALLOW/DENY, 32 ALLOW/ALLOW; zero previous-DENY/current-ALLOW cases.
- `.context/pr91-emulator/browser-qa5.mjs`: exit 0, 15/15 real-UI scenarios against the same ruleset, covering submission/attach, signing through completion, forgery denials, rejection and Admin rewinds. Final-document uploads were stubbed locally.
- Fresh review-fix checks: predicate tests 5/5, denial-classifier unit test 1/1, permission-default tests 3/3, catalog consistency for 242 fixtures, and `npm run verify` (299 root tests, 114 Functions tests, TypeScript and production build) passed. No rules, test logic or declared expectations changed during this evidence-only fix round.

The external emulator/browser results are supplied evidence, not a new sandbox execution. Independent review and the production-data, live-ruleset comparison and deployment-authorization gates remain separate. Nothing was deployed.

### Historical evidence setup (before review-fix round 3)

All of it was produced on the Firestore emulator in Enterprise edition against the named database `ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece`, with the previous rules (`tests/rules/fixtures/firestore.rules.before`, byte-identical to `origin/main`'s file, SHA-256 `ceeb7b3c...33c2f`) and the new rules, from the same fixtures. Payloads are ports of the real client writes (`handleConfirmSignature`, `handleRewindApproval`, `planApprovalAttach`, `planSnapshotBackfill`, `createFinalDocuments`, the dashboard create and migration writes). They were not adjusted to satisfy the rules in either direction.

### Historical declared and observed outcomes (226 fixtures, before review-fix round 3)

Declared before any run in `tests/rules/expectations.mjs`; the suite fails on any difference. Categories observed: CLOSED-HOLE: 90, UNCHANGED-ALLOW: 86, UNCHANGED-DENY: 50. **INTENTIONALLY-CHANGED is empty**: no write the previous rules denied is allowed by the new rules, and every refusal by the new rules is a false condition for the operation attempted (not an evaluation error, an expression-limit overrun or an unrecognised diagnostic).

| ID | Fixture | Declared (old / new) | Observed old | Observed new | Category |
|---|---|---|---|---|---|
| G1 | PLN signs Planning for ITEL | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G2 | MGT with saved approvePlanning signs the last Planning entry for SYMC | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G3 | MGT signs O&M for SYMC after Planning is complete | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G4 | Last O&M signature (two owners): Completed with final fields | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G4b | Last O&M signature (three owners) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G5 | PLN rejects at Planning with a reason | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G6 | MGT rejects at O&M | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G7 | DSG (default approvePlanning) signs Planning for ITEL via the editor path | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G7b | SUB with saved approvePlanning signs Planning for ITEL | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G7c | DSG-M (isApproved missing) signs Planning for ITEL | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G8 | CRT-N (creator, owner None) signs Planning for SYMC (known-permissive) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G8b | CRT-V (Viewer creator with saved approvePlanning, Owner ITEL) signs ITEL | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G9 | ADM completes a populated three-owner approval at O&M | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G9a | ADM signs Planning for UIH (three owners) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G9b | ADM signs an O&M entry while Planning is not complete (pinned Admin latitude) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G10 | ADM-E signs a Pending entry with built-in Admin defaults | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G11 | ADM corrects an Approved entry to Approved at Completed (three owners) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G12 | ADM corrects Approved to Rejected | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G13 | ADM-E corrects Approved to Approved | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G14 | ADM-E corrects Approved to Rejected (hasAdminRole gate) | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| G15 | Saved role document missing the key falls back to the default | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G16 | Legacy approval without snapshot: full sign flow to completion | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| G17 | Snapshot lists only ITEL while project owners are [ITEL, SYMC]; ITEL alone completes | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| L1 | Worst case: snapshot-backed three-owner O&M completion by MGT with a saved Management role document | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| LS1 | Pending legacy approval with no approvalStage: PLN signs Planning | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| LS1b | Same with the top-level status field absent | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| LS1c | Legacy no-stage: the last Planning entry moves the client to OM | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| LS2 | Legacy no-stage approval whose project status is Approved: PLN signs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| LS2b | Legacy Approved, no stage, project Approved: PLN rewrites an Approved entry | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| LS3 | Same completed legacy state: ADM corrects an Approved entry | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| N1 | Missing O&M map: PLN signs Planning; client writes omSignOffs {} | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| N2 | Missing Planning map: ADM signs an O&M entry; client writes planningSignOffs {} | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| N3 | Both maps absent: PLN signs Planning | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| N4 | Untouched map absent to non-empty (omSignOffs gains Pending entries) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| N5 | Untouched map present to {} (wiped) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| N6 | ownerSignOffs absent stays absent | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| O1 | Owners [ITEL], stale Pending SYMC key, no snapshot: ITEL signs Planning then O&M to Completed | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| O2 | Same with a stale Rejected SYMC entry (does not reject, as in the client) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| O3 | Owners [ITEL, SYMC], only ITEL entries, no snapshot: ITEL signs Planning, stage Planning | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| O4 | Same state: the write sets OM (a missing owner entry cannot reduce the set) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| O5 | No project owners, entries {ITEL, SYMC}: ITEL signs Planning, faithful stage Planning | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| O6 | No project owners: ITEL-only completion with SYMC Pending | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| O7 | No project owners, target creates its own entry (R includes the target) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| O8 | Owners [ITEL], SYMC signs (target not a project owner) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| RT1 | No owners/snapshot, client owners [ITEL] but keys {ITEL, SYMC}: ITEL signs both levels (stricter-than-client) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| RT2 | No owners/snapshot, route owners [ITEL, SYMC] but keys {ITEL}: ITEL completes (looser-than-client) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| RT3 | RT1 state after the documented Admin recovery (rewind to Planning with keys {ITEL}) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M1 | Snapshot participatingOwners []: PLN non-completing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M2 | Same snapshot: the vacuous-every write sets Completed | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| M3 | Snapshot ['ITEL','XYZ']: PLN signs ITEL Planning, stage Planning | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M4 | Snapshot ['ITEL','XYZ']: the write advances to OM | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| M5a | Snapshot participatingOwners malformed (a): non-advancing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M5d | Snapshot participatingOwners malformed (a): advancing write | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| M5b | Snapshot participatingOwners malformed (b): non-advancing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M5e | Snapshot participatingOwners malformed (b): advancing write | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| M5c | Snapshot participatingOwners malformed (c): non-advancing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M5f | Snapshot participatingOwners malformed (c): advancing write | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| M6 | Malformed snapshot owners: PLN rejects | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M7 | Malformed snapshot owners: non-Admin signs an O&M-level entry | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| M8 | Snapshot ['ITEL','XYZ'] and target SYMC: non-advancing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M9 | No snapshot, project owners ['XYZ']: PLN non-advancing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M10a | No snapshot, project owners is a string: non-advancing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M10b | No snapshot, project owners is a map: non-advancing sign | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| M10c | No snapshot, project owners is a string: advancing write | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| M10d | No snapshot, project owners is a map: advancing write | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D1 | MGT signs the ITEL entry (wrong owner) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D2 | PLN without approveOM signs O&M | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D3 | MGT without approvePlanning signs Planning | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D4 | PLN with saved approvePlanning false signs Planning (revoked) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D4b | ADM with saved Admin approveOM false signs O&M | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D5 | Forged signedByUid (another uid) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D5b | Forged signedByUid (missing) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D6 | PLN writes the ITEL and SYMC entries in one write | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D7 | MGT signs an O&M entry while a Planning entry is Pending | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D8 | Jump to Completed with partial entries | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D8m | Approval status and project status mismatch | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D8c1 | Snapshot [ITEL, SYMC] with only ITEL entries and ITEL-only completion | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D8c2 | Snapshot [ITEL] and the target owner is SYMC | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D8c3 | Snapshot document missing though snapshotId is set | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D8c4 | Snapshot approvalId does not match the approval id | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D9.documentNumber | Sign write that also changes documentNumber | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D9.contractorName | Sign write that also changes contractorName | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D9.designNotes | Sign write that also changes designNotes | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D9.requestedBy | Sign write that also changes requestedBy | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D9.snapshotId | Sign write that also changes snapshotId | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D9.routeEnclosureSelections | Sign write that also changes routeEnclosureSelections | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| G18 | ADM approves ITEL while SYMC is Rejected: the client keeps the approval Rejected | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| D23.unreject | ADM approves ITEL while SYMC is Rejected but claims Pending/Planning (un-rejects) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D23.completeClaimOM | The last signer completes both levels but claims Pending/OM | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D23.claimPlanning | The last Planning signer completes Planning but claims Planning | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D9b | Sign write that adds an unknown key | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D10.ownerSignOffs | Non-Admin sign that changes ownerSignOffs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D10.gainKey | Non-Admin sign that gains a sign-off key | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D10.loseKey | Non-Admin sign that loses a sign-off key | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D11.om | DSG signs O&M | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D11.symc | DSG signs SYMC | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D11.revoked | DSG with saved approvePlanning false | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D12 | SUB with default permissions signs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D13 | DSG-U (isApproved false) signs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D13b | MGT-U (unapproved, not an editor) signs | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D13c | PLN-M (isApproved missing, not an editor) signs | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D14 | PLN-N (owner None, non-creator, non-editor) signs | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D15 | VWR-G (permission-granted Viewer, not creator) signs | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D15b | CRT-V (Viewer creator) without the permission signs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D16 | DSG-X (not a member) writes an approval field | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D17.reopen | PLN signs a Rejected-stage entry to reopen | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D17.rewrite | PLN rewrites an Approved entry in Completed as Approved | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D17b | PLN changes an Approved entry to Rejected in Completed | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S1 | DSG submits a new approval on a project with no designApproval | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S2 | DSG resubmits after rejection | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S1.ADM | ADM submits a new approval on a project with no designApproval | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S2.ADM | ADM resubmits after rejection | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S2.ADM-E | ADM-E (email-only Admin) resubmits after rejection | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S2b | DSG resubmits after a rejection that followed an approval (needs an Admin today, and still does) | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S3 | Attach in a transaction after the snapshot documents are written | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S4 | DSG replaces a legacy Pending approval without snapshotId with a valid Pending shape | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S5.B1 | Valid Admin backfill | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S5.B2 | snapshotBackfilledAt as a string | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B3 | snapshotBackfilledByEmail not the token email | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B4 | snapshotBackfilledByUid not the caller | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B5 | Backfill that also changes contractorName | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B6 | Backfill that also changes top-level status | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B7 | Backfill missing the email key | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B8 | Backfill with an extra key | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B9 | Snapshot id equal to the approval id | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B10 | Metadata backfill flag false | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B11 | Metadata approvalId other | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B12 | Metadata missing | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B13 | Approval already has a snapshotId | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B14 | PLN (not an editor) backfills | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S5.B15 | DSG-X (not a member) backfills | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S6.DSG | DSG renames the project and merges owners | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S6.CRT-N | Creator CRT-N renames the project | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S6.ADM | ADM renames the project | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S6b | DSG setDoc({approvalDraft}, {merge}) on an existing project | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S6c.CRT-N | Creator CRT-N merges approvalDraft | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S6c.ADM | ADM merges approvalDraft | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| S6d | PLN (member, neither creator nor editor) merges approvalDraft | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| S2b.ADM | ADM resubmits after a rejection that followed an approval | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| DEL.creator | The creator deletes the project | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| DEL.ADM | ADM deletes the project | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| DEL.PLN | A member who is neither creator nor Admin cannot delete | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| DEL.DSG-X | A non-member cannot delete | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| GATE1 | Design user without an owner field edits a project whose owners is [''] | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| GATE2 | Design user without an owner field edits a project whose owner is '' | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| GATE3 | Design user without an owner field edits a normal project | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| GATE4 | The same user changes only the status of a project whose owners is [''] | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| F1 | Final documents by the last signer MGT; createdBy equals the uid though the stored users id differs | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| F2 | Final documents by DSG | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| D18.approved | DSG writes a new approval whose status is Approved | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D18.completed | DSG writes a new approval at stage Completed | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D18.entries | DSG writes a new approval with Approved entries | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D19 | DSG writes a new approval over a Pending approval with a snapshotId | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D19a | ADM writes a new approval over a Pending approval with a snapshotId | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D19b | DSG writes a new approval over an Approved approval with a snapshotId | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| D19c | ADM writes a new approval over an Approved approval with a snapshotId | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.emptyMaps | New approval shape violation: emptyMaps | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.unsupportedOwner | New approval shape violation: unsupportedOwner | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.mismatchedKeys | New approval shape violation: mismatchedKeys | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.nonPending | New approval shape violation: nonPending | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.badOwnerSignOffs | New approval shape violation: badOwnerSignOffs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.requestedByUid | New approval shape violation: requestedByUid | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.finalApproved | New approval shape violation: finalApproved | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D20.finalDocuments | New approval shape violation: finalDocuments | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D21.finalApprovedOutside | Forged finalApprovedAt/By outside completion | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D21.finalDocsEarly | finalDocuments before completion | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D21.finalDocsWrongUid | finalDocuments with createdBy not the uid | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D21.finalDocsOverwrite | finalDocuments overwritten by a non-Admin | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D22 | Status-only write by DSG | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| D22b | Status-only write by ADM (pinned) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP1 | ADM rewinds Completed to Draft with populated approvalDraft and total distance | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP2 | Completed to Planning, retaining finalDocuments and a rejectionReason | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP3 | Completed to OM (planning and ownerSignOffs unchanged, omSignOffs reset) | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP4 | OM to Draft | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP5 | OM to Planning | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP6 | Rejected to Draft | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP7 | Rejected to Planning, retaining the rejection reason | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP8 | Planning (Pending) to Draft | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP9a | Three-owner populated rewind to Planning | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP9b | Three-owner populated rewind to OM | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WP9c | Legacy (no snapshot) rewind with the project-owner key set | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WX1 | Rewind-shaped write Planning to Planning (resets an Approved entry) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WX2 | Planning to OM | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WX3 | OM to OM | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WX4 | Rejected to OM | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WX5 | Legacy Rejected approval without approvalStage rewound to Planning | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WX6 | Same legacy approval rewound to Draft | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| WC1 | ADM rewind that also changes documentNumber | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| WC2 | ADM rewind that also changes contractorName | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| WC3 | ADM rewind that also changes designNotes | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| WC4 | ADM rewind that also changes snapshotId | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| WC5 | ADM rewind that also changes unknownKey | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| WR1 | Rewind to Planning with a reset entry set to Approved | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WR2 | Reset entry set to Rejected | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WR3 | Pending entry carrying a forged signedByUid | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WR4a | Reset maps with different key sets | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WR4b | Reset map with an unsupported owner key | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WR4c | Reset maps empty | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WR5a | Rewind to OM that also changes planningSignOffs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WR5b | Rewind to OM that also changes ownerSignOffs | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WF1 | Rewind retains finalApprovedAt/By | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WF2 | Rewind that also changes finalDocuments | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WD1 | Rewind to Planning leaves approvalDraft present | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WD2 | Rewind to Draft with approvalDraft.designNotes not equal to the previous approval's | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WD3a | Rewind to Draft without approvalDraft | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WD3b | Rewind to Draft with top-level status not 'Draft' | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| WD4 | Rewind to Draft with an extra key in approvalDraft | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| W8.a | Non-Admin rewinds OM to Planning | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| W8.b | Non-Admin rewinds Completed to OM | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| W8.c | Non-Admin turns Approved entries to Pending (Design editor) | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| W9 | ADM-E rewinds Rejected to Planning with no Approved entries | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| W10.a | ADM-E rewinds a Completed approval | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| W10.b | ADM-E rewinds to Draft | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| C1 | PLN creates a project with the dashboard payload | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| C1b | PLN migrates a legacy project with no designApproval | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| C1c | setDoc({approvalDraft}, merge) on an absent project by PLN | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| C1d | The same merge on an absent project by ADM | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| C1e | Create from a payload that lacks uid | DENY / DENY | DENY | DENY | UNCHANGED-DENY |
| C2 | PLN creates a project carrying a valid Pending submit-shape designApproval | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| C3 | PLN creates a project carrying an Approved designApproval (forged) | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| C4 | PLN migrates a legacy-shaped project carrying its old designApproval | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| C4b | PLN creates a project carrying an empty-map designApproval | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |
| C5 | ADM creates a project carrying a Pending submit-shape designApproval | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| C6 | ADM creates a project carrying an Approved designApproval | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| C7 | ADM migrates a legacy-shaped project carrying its old designApproval | ALLOW / ALLOW | ALLOW | ALLOW | UNCHANGED-ALLOW |
| C8 | ADM-E creates a project carrying a designApproval | ALLOW / DENY | ALLOW | DENY | CLOSED-HOLE |

### Narrowing sweep

`sweep.rules.test.mjs`: a seeded generator takes a faithful sign, rewind, attach, final-documents or status payload against eight project states and eleven writers, applies one to three mutations (stage, status, entry owner/level/status/uid, dropped or extra keys, wiped maps, tampered content fields, final fields, writer) and replays it on both rulesets. Result: no case where the previous rules denied and the new rules allowed.

| Run | Cases | old/new tally |
|---|---|---|
| default seed (`npm run test:rules`) | 500 | DENY/DENY 287, ALLOW/DENY 181, ALLOW/ALLOW 32 |
| seed 1 | 1500 | DENY/DENY 925, ALLOW/DENY 471, ALLOW/ALLOW 104 |
| seed 2 | 1500 | DENY/DENY 920, ALLOW/DENY 495, ALLOW/ALLOW 85 |
| seed 3 | 1500 | DENY/DENY 914, ALLOW/DENY 471, ALLOW/ALLOW 115 |

### Expression headroom

Historical measurements before review-fix round 3. Rerun `npm run test:rules` on the current tree; the four-unit padding guard is retained and now also covers G19, WP9b and both complete-then-rewind flows. No current-tree headroom result is claimed.

Measured for every one of the 86 ALLOW fixtures; none is refused by the limit. The table lists the tightest ones. The figure is the largest amount of padding (cheap units of about 10 expressions each) the rule can take before the fixture is refused; fixtures that are not sign or rewind writes are capped by the compiler's static complexity limit rather than the runtime budget, so their figure is a lower bound. The unit-to-expression conversion is an estimate from calibration, so read the figures as relative.

| Fixture | Spare expressions (approx.) | Padding units |
|---|---|---|
| G13 | ~62 | 6 |
| L1 | ~83 | 8 |
| G11 | ~94 | 9 |
| G16 | ~104 | 10 |
| G2 | ~104 | 10 |
| G4 | ~104 | 10 |
| G17 | ~114 | 11 |
| G4b | ~114 | 11 |
| G9 | ~114 | 11 |
| LS1c | ~114 | 11 |
| O1 | ~125 | 12 |
| O2 | ~125 | 12 |
| LS1b | ~146 | 14 |
| LS3 | ~146 | 14 |
| G3 | ~156 | 15 |
| RT2 | ~156 | 15 |
| RT3 | ~156 | 15 |
| WP9a | ~156 | 15 |
| G15 | ~166 | 16 |
| S2 | ~166 | 16 |

### Browser QA on the emulator (Claude)

Historical evidence before review-fix round 3; current rules still need the relevant browser QA repeated after emulator verification.

The served app was redirected to the emulator (Vite plugin that points only the Firestore client at it), synthetic fixtures, Cloud Function calls and file uploads stubbed locally, only Firebase Auth sign-in left the machine. The Firestore token used a neutral email (the real QA account email is one of the rules' Admin emails), and roles were switched through the users document. All five suites were run after loading the final working-tree rules and clearing the data before each:

- `browser-qa5.mjs` (new, 15/15): a Design editor submits through the real UI (snapshot writes and the attach transaction); a Planning user signs Planning for ITEL; a Management user with the permissions granted in `rolePermissions` signs Planning and then O&M for SYMC; forged direct writes from that same signed-in session (wrong owner, forged completion, forged `signedByUid`) are refused with `permission-denied` and change nothing; a Planning user with `approveOM` signs the last O&M entry, the approval completes and the automatic final-documents write succeeds; an Admin rewinds Completed to Planning, rejects, and rewinds the rejected approval to Draft; a non-Admin status write is refused.
- `browser-qa.mjs` legacy lock (15/15 with an extended wait for the last two checks): the lock itself under the new backfill class, and two pages racing to lock the same approval end with exactly one "state changed, reload" loser. In other runs the race did not finish inside the default 20 s wait; the same stall happens with the previous rules, so it is an emulator transaction-contention artefact.
- `browser-qa2.mjs` 13/13 (sign-off path, final file names, rewind, reject and resubmit), `browser-qa3.mjs` 11/11 (signing queue), `browser-qa4.mjs` 14/14 (history panel).

Several of these scripts gave wrong results when the emulator still held a ruleset left behind by another script; the evidence above was produced after loading the working-tree rules and clearing the data before each script.

### Limits of this evidence

Not verified, and called out for the release: production data (see the pre-deploy checks), the live ruleset compared with `main`, Cloud Monitoring after a deploy, and whether the production database's expression accounting equals the emulator's (the post-deploy checklist exercises the heaviest write, the final O&M signature, at once and rolls back on failure).

## Rollout, rollback and lockout detection

A rule that is too strict locks real signers out. Deploying rules is a production change to a shared database and needs explicit authorization naming "Firestore rules, project gen-lang-client-0942355314".

Before deploying:
1. Review approved, `npm run verify` green, `npm run test:rules` green, and the browser QA evidence below recorded.
2. Compare the live ruleset with `main`'s `firestore.rules` and record the difference: the deployed ruleset may predate `main`, and deploying this file ships every undeployed rule difference too. Record the console release name, a copy of the live content, and the git SHA of the previous `firestore.rules`.
3. Pre-deploy data checks (read-only, by the owner or with the Admin SDK if credentials exist). They supplement the fixtures and do not replace them:
   - **Release prerequisite for exception 2:** no document under `users/*/projects` that contains a `designApproval` is waiting for migration by a non-Admin user. If one exists, return to the owner before deploying.
   - Project `owners` values are canonical (ITEL, SYMC, UIH).
   - Existing approvals' sign-off keys and snapshot `participatingOwners` are well formed. Count approvals that have neither a snapshot nor project owners, and any whose map keys differ from their route-derived owners (exception 3).
   - Which users can sign but are neither editors nor creators (D14, D15): the UI shows them a sign button that the rules refuse, as before.
4. Deploy in a low-use window with the owner on call: `firebase deploy --only firestore:rules --project gen-lang-client-0942355314`.
5. Run the post-deploy checklist at once.

Rollback: redeploy the previous `firestore.rules` from git (`git show <previous-sha>:firestore.rules`), or restore the previous release from the console's rules history. Rules take effect within about a minute and need no data migration. Roll back immediately on a failed checklist item or any lockout report.

Post-deploy checklist (the QA account on a synthetic project; never put credentials in chat or files):
1. The QA Planning user signs Planning for its Owner.
2. The QA Management user signs O&M after Planning completes.
3. The final-documents write succeeds.
4. A rejection works.
5. An Admin rewinds to Planning and to Draft.
6. A new submit with its snapshot, and a resubmit after a rejection, work.
7. A new project without an approval is created by a non-Admin QA user.
8. A forged direct write (wrong owner or level) is denied.
9. The "waiting for my signature" queue still lists the QA user's rows.

Lockout detection: watch Cloud Monitoring for a spike in Firestore rules denies and the request logs for `PERMISSION_DENIED` on `projects/*` updates and creates over the first hours; ask known signers to confirm; keep the checklist as the quick signal.

## How to run the checks

- `npm run test:rules` (needs a JRE and the `firebase` CLI; not part of `npm run verify`): the declared old/new table, the budget and batch scenarios, and the narrowing sweep, on the Firestore emulator in Enterprise edition against the named database.
- `npm run verify`: includes `src/utils/rulesPermissionDefaults.test.ts`, the JRE-free pin of the default permission lists.
- `RULES_SWEEP=1500 RULES_SWEEP_SEED=2 npm run test:rules` runs a larger sweep with another seed.
