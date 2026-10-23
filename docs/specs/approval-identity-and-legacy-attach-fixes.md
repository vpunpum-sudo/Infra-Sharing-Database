# Approval identity and legacy attach fixes

Status: IMPLEMENTED — awaiting independent review and manual QA
Risk: HIGH (Firestore rules and approval evidence identities)

## Objective and decisions

1. Snapshot metadata creation requires a string `createdByUid` equal to `request.auth.uid`. This applies to normal submissions and Admin backfills; metadata remains immutable.
2. A project with no `designApproval` may attach a new request regardless of its project status. The transaction still rejects an intervening approval. Rejected resubmissions still require the same approval id, a Rejected approval, and a Rejected project.
3. Signing sets a rejection reason when any sign-off is Rejected, clears a non-empty prior reason when approving, and otherwise keeps the key as it was. An absent reason stays absent.
4. The signed-in `appUser.id` comes from the `users/{uid}` document path, even if its stored `id` differs. Approval evidence (`requestedByUid`, `signedByUid`) and normal snapshot `createdByUid` use `auth.currentUser.uid` directly. Submit and sign stop before their own writes if the auth uid is missing. The Admin lock already does this.
5. Enforcing `data.id == userId` for user documents is a separate follow-up, after surveying and migrating mismatched production records. Enforcing it now would block those users from updating their own profile, including display name, photo, and password-change flag.

## `appUser.id` inventory

| Site | Decision |
| --- | --- |
| Approval request `requestedByUid` and snapshot `createdByUid` | Use one `auth.currentUser.uid` read per submit action. |
| Approval sign-off `signedByUid` | Use `auth.currentUser.uid` read before the sign action. |
| Admin backfill `createdByUid` | Keep existing `auth.currentUser.uid` use. |
| Admin rewind `adminUid` | Keep `appUser.id`; the log service separately stamps auth uid. |
| `finalDocuments.createdBy` | Keep `appUser.id`; this is informational. |
| Project schedule `updatedBy` and `scheduleLogs.byUid` | Keep `appUser.id`; the corrected path identity makes `byUid` match auth uid. |
| User Management effect dependency | Keep `appUser.id`; it tracks the current account. |
| User Management managed `user.id` | Keep; it identifies a different user in the list. |

`appUser` is populated by the listener on `users/{currentUser.uid}`. Email migration, default-admin creation, and pending-user creation write to that path, so the path remains the authoritative identity.

## UI and pending draft writes

The existing entry buttons require `viewApprovalDocs` but do not require Draft status. When there is no `designApproval`, the modal renders the slides, its “ยื่นขออนุมัติใหม่” banner and the request form without a status gate. Only the attach guard needed to change. Projects with an existing Pending Approval or Approved request retain their existing UI conditions.

The submit uid check runs before waiting for `pendingDraftWrites` and before the action writes a snapshot or attaches an approval. A draft write already sent by input blur can still commit after sign-out. This is accepted: `approvalDraft` is the working copy and does not freeze document content.

## Verification and release gate

Unit tests cover legacy attach states, rejection reason patch behavior, and path-derived user identity. `npm run verify` checks code and tests but does not evaluate `firestore.rules`. Rules Playground rows S18–S25 plus the existing S, R, and B regressions, and authenticated browser scenarios in `.context/qa-checklist.md`, are required before publishing rules. No deployment is part of this implementation.
