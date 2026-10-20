# admin-user-provisioning-first-login

Archived by `agent-flow` on 2026-10-20 after an approved review.

- Branch: `vpunpum-sudo/signature-image-automation-v2`
- Base commit: `5100621`
- Verification: `npm run verify`, Started: 2026-10-20T04:06:58Z, Exit code: 0

Status: APPROVED
Feature: admin-user-provisioning-first-login
Risk: HIGH. This changes Firebase Auth account creation, password resets and deletion. It adds Admin-only Cloud Functions that use the Admin SDK and moves audit logging into them. It changes the permission-sensitive provisioning flow and the forced-password-change gate in `App.tsx`. The Firebase functions and the Cloudflare frontend must be released in a set order.

### Objective

Fix the first-login bug for users an Admin creates. Today their first sign-in fails with "อีเมลหรือรหัสผ่านไม่ถูกต้อง" even though they typed the password the Admin set. After the fix:

- A user provisioned with a password can sign in with exactly that password.
- After signing in that way, the user must change the password on the existing ForceChangePassword screen. This restores the original behaviour: "ตามเดิมในการ login ครั้งแรกจะต้องบังคับให้เปลี่ยนรหัสผ่าน".
- This also holds when the email already exists in Firebase Auth. That includes users deleted earlier (only their Firestore doc was removed), users who once signed up themselves, and accounts linked to Google.
- A session signed in through Google is not forced, because there is no password to change in that session.

### Root cause (confirmed in code, not yet confirmed against production data)

1. **Main cause.** `UserManagement.tsx` `handleDeleteUser` deletes only `users/{id}`. The Firebase Auth account survives with its old password. When the Admin creates the same email again, `createUserWithEmailAndPassword(secondaryAuth, …)` throws `auth/email-already-in-use`. The catch block then quietly creates a `preauth_` profile. It does not set the new password and does not set `requiresPasswordChange`, yet it shows a success message. The user can only sign in with the old password, which nobody knows, so Login reports `auth/invalid-credential`.
2. **Contributing cause.** The provisioning email and password inputs have no `autoComplete` attributes. The browser can fill the Admin's own saved password into the new user's password field.
3. **Contributing cause.** The password is sent as typed. Only `password.trim()` is checked for emptiness, so a leading or trailing space becomes part of the password. A password made only of spaces silently takes the passwordless pre-authorize path.
4. **Related gate gap.** `App.tsx` skips ForceChangePassword whenever a Google provider is linked to the account (`isGoogleUser`). It does this even when the current session signed in with email and password.

**How to confirm in production** (read-only checks for the human Admin; no code needed):

- In the Activity Log, look for `create_preauth_user` with the description "Created pre-authorized profile for existing auth user <email>" for the affected email.
- In Firebase Console → Authentication, check whether the account was created before the Admin's latest provisioning, and which providers it has.
- Check whether the email's `users` doc has a `preauth_` id or is missing `requiresPasswordChange`.

If none of these match, causes 2–3 apply. This plan fixes all four.

### In scope

#### Callable Cloud Functions

New file `functions/userAccounts.js`, exported from `functions/index.js`. It follows the `projectFiles.js` `onCall` pattern: `asia-southeast1`, the same `DATABASE_ID`, `HttpsError` with Thai messages, and unexpected errors logged and returned as `internal`.

- `createManagedUser({ email, password, role, owner })` returns `{ uid, existingAccount: boolean, revokeFailed?: true }`.
- `deleteManagedUser({ userId })` returns `{ deleted: string[] }`.

#### Server Admin check

The check mirrors `firestore.rules` `isAdmin()`: the caller's `users/{auth.uid}.role == 'Admin'`, or the token email is one of the two bootstrap Admin emails already listed in the rules. Roles that have `manageUsers` but are not Admin are rejected.

#### Server audit logging (best-effort)

- The functions write to `logs` with the Admin SDK, using the `isValidLog` fields: `id`, `userId` (the Admin's uid), `userEmail`, `action`, `description`, an ISO `timestamp`, and `metadata`.
- Actions:
  - `create_user`, with `role`, `owner`, `isApproved`, `existingAccount` and `targetUid` in `metadata`.
  - `delete_user`, with `deletedUserId`, `role` and `deletedDocIds` in `metadata`.
- Audit writes are best-effort. If the write fails, the server logs it with `console.error` and the action stays successful. That action then has no Activity Log entry; the Cloud Functions log line is the only trace left.
- The password never appears in logs, results or errors.

#### Client: UserManagement

- **Testable logic.** The decision and control logic moves into pure modules under `src/utils/`. They take Firebase calls as injected dependencies, so the components become thin wrappers and no new devDependencies are needed.
- **Callables.** `UserManagement.tsx` calls `httpsCallable(functions, 'createManagedUser' | 'deleteManagedUser')`.
  - Remove the `secondaryAuth` use and the `email-already-in-use` → preauth fallback.
  - The client no longer calls `logActivity` for creating a user with a password or for deleting a user.
  - The passwordless preauth path keeps its client-side `create_preauth_user` log.
- **Input attributes.**
  - Email: `autoComplete="off"`, `name="new-user-email"`.
  - Password: `autoComplete="new-password"`, `name="new-user-password"`.
- **Email handling.** The client trims and lowercases the email first. The local duplicate check, the regex validation and the Admin's global Firestore duplicate query all use the normalized value, and so does the callable. The server normalizes again.
- **Password handling.**
  - An exactly empty password `''` means the unchanged passwordless preauth path.
  - Any non-empty password is validated, including one made only of spaces. It is rejected with a Thai message if it has a leading or trailing space, or if it is shorter than 6 characters.
  - Spaces inside the password are allowed. Nothing is trimmed silently.
- **Messages.**
  - Success messages are distinct and in Thai: new account; existing account reset to the Admin's password, which must be changed at first login; and an extra note when `revokeFailed` is set.
  - Error messages are in Thai for `unauthenticated`, `permission-denied`, `already-exists`, `invalid-argument` (shows the server message), `not-found`, `failed-precondition`, and `internal` with each partial-failure reason. Any other error gets a generic message.

#### Client: ForceChangePassword

`ForceChangePassword.tsx` uses a controller.

- It calls `updatePassword` once, then clears the flag.
- If clearing the flag fails, it shows a Thai message that the new password is already active. The retry only clears the flag.
- It rejects a new password with a leading or trailing space, shorter than 6 characters, or different from the confirmation.
- `auth/requires-recent-login` and `auth/weak-password` show Thai messages instead of the raw `error.message`.

#### Client: forced-change gate in App.tsx

- **New pure helper.** `src/utils/passwordChangeGate.ts` exports `passwordChangeGate({ requiresPasswordChange, signInProvider })`, which returns `'force' | 'skip' | 'pending'`.
  - `requiresPasswordChange !== true` → `'skip'`.
  - `signInProvider === undefined` (still loading) → `'pending'`.
  - `signInProvider === 'google.com'` → `'skip'`.
  - Anything else → `'force'`. This covers `'password'`, `null`, other providers, and a failed lookup.
- **Wiring.** `App.tsx` replaces `!isGoogleUser` with this helper.
  - When the Firebase user changes, it reads `signInProvider` from `user.getIdTokenResult()` into state. It resets to `undefined` while loading. On error it sets `null`, so the gate fails closed and forces the change.
  - While the gate is `'pending'`, the app shows the existing loading screen instead of app content, so the user never briefly sees the app before the gate.
  - A Google-session user whose flag is still true keeps the flag. They are forced to change the password the next time they sign in with email and password.

#### Partial failures and retries (the steps cannot be atomic)

- **New Auth account.** Order: `createUser`, then the `users/{uid}` write. If the write fails, the function deletes the just-created Auth user (rollback). A rollback failure is logged. The call returns `internal`, and the client says nothing was created and the Admin can retry.
- **Existing Auth account with no `users` doc.** Order: `updateUser(uid, { password, disabled: false })`, then the `users/{uid}` write, then `revokeRefreshTokens(uid)`.
  - If the write fails, the call returns `internal` with `details.reason = 'profile_write_failed_password_changed'`. The client says the sign-in password was already changed but the profile was not saved, and that a retry is safe. It is safe because there is still no `users` doc, so the retry repeats `updateUser` and the write.
  - Revocation is best-effort. A failure is logged and returned as `revokeFailed: true`; the request still succeeds.
- **Delete.** Steps run in this order:
  1. Delete the Auth user, only for ids that do not start with `preauth_`. `auth/user-not-found` is ignored. Any other Auth error stops the call before Firestore is touched.
  2. Delete the same-email `preauth_` docs (excluding the target) in a loop:
     - Query `users` where `email == targetEmail` and keep docs whose id starts with `preauth_` and is not the target id.
     - Delete them in batches of at most 400 writes.
     - Repeat the query until no matching docs remain, with a safety cap of 50 rounds. Hitting the cap counts as a failure.
  3. Delete the target doc last, so a retry after a partial failure still finds it.

  If any Firestore step fails after the Auth delete, the call returns `internal` with `details.reason = 'profile_delete_failed_auth_deleted'`, and the client says a retry is safe. Deleting your own account returns `failed-precondition`; a missing target returns `not-found`.

### Out of scope

- An Admin "reset password" button for users who already have a `users` doc. Use delete, then provision again.
- Changes to `firestore.rules`.
- Automatically fixing accounts that are already broken. Remediation after deploy is delete, then provision again.
- A component or browser test framework.
- Email or invite flows, a stronger password policy, and App Check.
- Deployment.

### Acceptance criteria

- [ ] **New account.** Provisioning a new email with password P creates an Auth user with exactly P and writes `users/{uid}` with `isApproved: true` and `requiresPasswordChange: true`. Manual QA: sign in with P → ForceChangePassword → change the password → reach the app; the flag becomes `false`.
- [ ] **Existing Auth account with no doc.** Provisioning sets the Auth password to P and enables the account. It writes `users/{realUid}` with `requiresPasswordChange: true` and creates no `preauth_` doc. It returns `existingAccount: true`, and the UI shows the "existing account reset" message.
- [ ] **Old sessions.** P works immediately. Other existing sessions can no longer refresh and end within about 1 hour, when their current ID token expires. A revocation failure is logged and reported as `revokeFailed`; the request does not fail.
- [ ] **Forced-change gate.**
  - A session signed in with email and password and `requiresPasswordChange: true` always gets ForceChangePassword, even when the account also has a linked Google provider.
  - A session signed in with Google is not forced.
  - While the sign-in provider is still loading, no app content is shown to a user whose flag is true.
  - If the provider lookup fails, the gate forces the change.
- [ ] **Delete.** Deleting a uid user removes the Auth account, the `users/{uid}` doc and every same-email `preauth_` doc, in batches of at most 400 writes and looping until none remain. Deleting a `preauth_` entry touches only Firestore.
- [ ] **Permissions.** Both functions reject unauthenticated callers (`unauthenticated`) and non-Admin callers (`permission-denied`), with no side effects and no audit entry. Bootstrap Admin emails are allowed.
- [ ] **Duplicates.** `createManagedUser` rejects an email that already has any `users` doc with `already-exists` and makes no Auth call.
- [ ] **Password rules.** Client and server both reject non-empty passwords with a leading or trailing space or shorter than 6 characters, including passwords made only of spaces. `''` takes the preauth path. Inner spaces are accepted.
- [ ] **Email normalization.** The client normalizes the email before the duplicate checks, the validation and the callable.
- [ ] **Audit log.** The functions write `create_user` and `delete_user` entries that satisfy `isValidLog`. Audit writes are best-effort: a failure is reported with `console.error` and does not change the result. The client does not log these two actions.
- [ ] **Partial failures.** Each partial-failure path behaves as specified and shows its Thai message, and a retry succeeds.
- [ ] **ForceChangePassword retry.** If the flag write fails after `updatePassword` succeeds, the user sees the "new password is already active" message, and the retry calls only the flag write.
- [ ] **Input attributes.** The provisioning inputs have the specified `autoComplete` and `name` attributes.
- [ ] **Regressions** (manual QA): preauth without a password, its migration in `App.tsx`, editing role or owner, toggling approval, and Google sign-in for regular users all work as before.
- [ ] `npm run verify` passes.

### Acceptance scenarios

#### Server (`functions/userAccounts.test.js`)

These tests use fake Auth and Firestore objects that record every call.

1. **New account.** No Auth user and no doc exist for `a@x.com`, and the Admin uses `Passw0rd`.
   - `createUser` is called with `{ email: 'a@x.com', password: 'Passw0rd' }`.
   - The doc is written with `requiresPasswordChange: true` and `isApproved: true`.
   - The result has `existingAccount: false`.
   - A `create_user` audit entry is written, with no password in it.
2. **Normalization.** The email ` A@X.com ` is used and stored as `a@x.com`.
3. **Existing Auth account (the reported bug).** Uid U exists for `b@x.com` and there is no doc.
   - Calls happen in order: `updateUser(U, { password, disabled: false })`, then the doc write, then `revokeRefreshTokens(U)`.
   - No `preauth_` doc is created, and the result has `existingAccount: true`.
   - The same result holds when the fake user record lists a `google.com` provider.
4. **Revocation fails.** Revocation throws. The call succeeds with `revokeFailed: true`, and the failure is logged.
5. **Profile write fails for a new account.** `createUser` succeeds and the write throws.
   - `deleteUser(newUid)` is called and the result is `internal`.
   - If the rollback also fails, the result is still `internal`.
6. **Profile write fails for an existing account.** `updateUser` succeeds and the write throws.
   - The result is `internal` with reason `profile_write_failed_password_changed`, and revocation is not called.
   - A retry with working fakes succeeds.
7. **Doc already exists.** A uid doc or a `preauth_` doc already has `c@x.com`. The result is `already-exists`, with no Auth calls.
8. **Non-Admin caller.** The caller is Management, Planning or Viewer. Both functions return `permission-denied`, with no Auth calls, no writes and no audit entry.
9. **Bootstrap Admin.** A caller with a bootstrap email and no Admin doc is allowed.
10. **Unauthenticated caller.** The result is `unauthenticated`.
11. **Invalid input.** Each of these returns `invalid-argument` with a Thai message and has no side effects: a bad email, an unknown role, an unknown owner, and the passwords `' abc123'`, `'abc123 '`, `'      '`, `'abc12'` or a non-string.
    - Role Admin with owner ITEL is stored as owner `None`.
    - `'abc 123'` is accepted.
12. **Unexpected Auth create error.** No doc is written and the result is `internal`.
13. **Delete a uid user.** `deleteUser(uid)` runs, then the same-email `preauth_` docs are deleted, then the target doc. A `delete_user` audit entry is written.
14. **Delete when the Auth user is already gone.** `deleteUser` throws `auth/user-not-found`. The docs are still deleted and the call succeeds.
15. **Delete when Auth fails with another error.** The call returns an error and makes no Firestore delete.
16. **Firestore fails after the Auth delete.** The result is `internal` with reason `profile_delete_failed_auth_deleted`. A retry, where `deleteUser` throws `user-not-found`, succeeds.
17. **Delete a `preauth_` target.** There is no Auth call, and the doc is deleted.
18. **Self-delete.** The result is `failed-precondition`, and nothing is deleted.
19. **Unknown user id.** The result is `not-found`.
20. **Audit write fails.** Create and delete results are unchanged, and `console.error` (the logger) is called.
21. **Chunked preauth cleanup.** The target uid has 950 same-email `preauth_` docs.
    - The fake records commits of 400, 400 and 150 writes; no batch exceeds 400.
    - A final query returns none, and the target doc is deleted after them.
    - When the fake query keeps returning docs, the 50-round cap returns `internal` and the target doc is not deleted.
22. **Partial cleanup failure.** The second batch commit throws. The result is `internal` with reason `profile_delete_failed_auth_deleted`, and the target doc still exists. A retry deletes the rest and then the target.

#### Client (`src/utils/*.test.ts`, run with `node --test` and tsx)

23. **Client normalization.** `submitProvisionUser` is called with ` A@X.com `.
    - The local duplicate check, the regex, the global check and the callable all receive `a@x.com`.
    - An existing `a@x.com` in the list is reported as a duplicate before any call.
24. **Password routing.**
    - `''` calls only the preauth writer and the preauth log.
    - `'   '` returns the whitespace error and makes no writer or callable call.
    - `' abc123'` and `'abc12'` are rejected before any call.
25. **Success messages.**
    - `{ existingAccount: false }` gives the "new account" message.
    - `{ existingAccount: true }` gives the "existing account reset" message.
    - `revokeFailed` adds the note.
26. **Error mapping.** Each case gets its own Thai text: `functions/unauthenticated`, `permission-denied`, `already-exists`, `invalid-argument` (shows the server message), `not-found`, `failed-precondition`, `internal` with each reason, `internal` with no reason, and an unknown error.
27. **Delete controller.** It calls `deleteManagedUser(id)` and maps success and the `profile_delete_failed_auth_deleted` "retry is safe" text. It never calls `logActivity`.
28. **ForceChangePassword `run`.**
    - On success, `updatePassword` and `clearFlag` are each called once and the result is `'done'`.
    - Validation failures make no calls.
    - `auth/requires-recent-login` and `auth/weak-password` map to Thai messages, and `clearFlag` is not called.
    - When `clearFlag` throws, the result is `'flag_failed_password_active'`.
29. **ForceChangePassword `retryClearFlag`.** It calls only `clearFlag`, and the result is `'done'` or `'flag_failed_password_active'`.
30. **Gate: password session.** `{ requiresPasswordChange: true, signInProvider: 'password' }` gives `'force'`. This is the Google-linked account signed in with the Admin-set email and password; only the session provider matters.
31. **Gate: Google session.** `{ requiresPasswordChange: true, signInProvider: 'google.com' }` gives `'skip'`.
32. **Gate: loading and failure.**
    - `{ requiresPasswordChange: true, signInProvider: undefined }` gives `'pending'`.
    - `signInProvider: null` (lookup failed) gives `'force'`.
33. **Gate: flag not set.** `requiresPasswordChange` `false`, `undefined` or missing gives `'skip'` for every provider value, including `undefined`, so ordinary users never see the loading wait.

#### Manual QA

Run with the emulator or after a separately authorized deploy, in a private window with the password manager off. This is not part of the automated gate.

34. Provision a new throwaway email. Sign in with exactly the Admin-set password, get forced to change it, and reach the app.
35. Make an orphaned Auth account with no doc, and separately a Google-linked account with no doc. Provision each. Signing in with the Admin's password forces the change. A Google sign-in on the linked account is not forced.
36. Delete a user. The Auth account is gone. Provision the same email again, and the first login works.
37. **Regressions.** Preauth without a password followed by Google sign-in migrates correctly. Edit role or owner, toggle approval, and confirm a non-Admin with `manageUsers` gets a clear permission error. Normal users see no flash of the gate or extra delay.
38. The browser does not autofill the Admin's credentials into the provisioning fields.

### Proposed design

#### Server (`functions/userAccounts.js`)

- **Pure helpers:**
  - `normalizeEmail`
  - `validatePassword(p)`: a string, `p === p.trim()`, length 6–128.
  - `validateProvisionInput`
  - `isAdminCaller(userData, tokenEmail)`
  - `auditEntry(...)`
  - `chunk(items, 400)`
- **Core logic, with injected Auth, Firestore and logger:**
  - `createManagedUserCore({ auth, db, caller, data, logger })`
  - `deleteManagedUserCore(...)`
- **Wrappers.** Thin `onCall({ region: 'asia-southeast1' })` wrappers pass in `getAuth()`, `getFirestore(DATABASE_ID)` and the logger.
- **Error details.** Partial-failure reasons go in `HttpsError` `details`.
- **Audit writes.** A best-effort `writeAudit` wraps the write in try/catch and calls `logger.error`.

#### Client modules

- **`src/utils/userProvisioning.ts`:**
  - `normalizeEmail`
  - `validateNewUserPassword`
  - `submitProvisionUser(input, deps)`, where `deps` is `{ listHasEmail, isAdmin, globalEmailExists, writePreauth, logPreauth, createManagedUser }`
  - `submitDeleteUser(userId, deps)`
  - `errorMessageKey`
  - `MESSAGES`, the Thai message table
- **`src/utils/forceChangePassword.ts`:**
  - `run(newPassword, confirmPassword, { updatePassword, clearFlag })`
  - `retryClearFlag({ clearFlag })`
- **`src/utils/passwordChangeGate.ts`:** `passwordChangeGate`.

#### Components

- `UserManagement.tsx` and `ForceChangePassword.tsx` only wire the controllers to the UI. ForceChangePassword keeps a `passwordUpdated` state so its retry button calls `retryClearFlag`.
- `App.tsx` gets a `signInProvider` state, set from `getIdTokenResult()` when the Firebase user changes:
  - The gate result `'pending'` shows the existing loading screen.
  - The gate result `'force'` shows ForceChangePassword.
  - The `isGoogleUser` bypass is removed from the gate.
- The `secondaryAuth` export can stay.

#### Security

- Only the server-side Admin check allows account creation, password reset and deletion.
- A password can be set on an existing Auth account only when the email has no `users` doc. This prevents silently taking over an active user.
- Taking over an orphaned or Google-linked account is recorded with `existingAccount: true`, but audit writes are best-effort. If the audit write fails, the action may have no Activity Log entry; the server `console.error` line in Cloud Functions logs is the only trace.
- The gate change only makes the forced change apply more often (password sessions on Google-linked accounts) and fails closed when the provider is unknown.
- No secrets are added.

### Expected files

- `functions/userAccounts.js` (new)
- `functions/userAccounts.test.js` (new)
- `functions/index.js`
- `src/utils/userProvisioning.ts` (new)
- `src/utils/userProvisioning.test.ts` (new)
- `src/utils/forceChangePassword.ts` (new)
- `src/utils/forceChangePassword.test.ts` (new)
- `src/utils/passwordChangeGate.ts` (new)
- `src/utils/passwordChangeGate.test.ts` (new)
- `src/components/UserManagement.tsx`
- `src/components/ForceChangePassword.tsx`
- `src/App.tsx`
- `docs/specs/admin-user-provisioning-first-login.md`

### Risks and rollback

- **Missing Auth admin permission.** If the functions' service account lacks it, the callables return `internal` and the UI shows an error, not a false success. Verify with a throwaway email after deploy.
- **Deploy order.** Deploy the functions before the frontend. Otherwise provisioning and delete fail with clear errors.
- **Real deletion.** Deleting a user now removes their sign-in account. This is intended.
- **Gate scope.** Users who have a linked Google provider, `requiresPasswordChange: true`, and sign in with a password will now be forced to change it. This is intended. Google sessions are unaffected. The provider lookup adds a short loading step, but only for users whose flag is true.
- **Orphaned accounts.** An Admin can take over an orphaned or Google-linked Auth account that has no `users` doc. This is intended for remediation. Because audit writes are best-effort, a takeover can go unaudited when the audit write fails; the server `console.error` line remains as a fallback trace.
- **Old sessions.** They can stay valid for up to about 1 hour after a reset, or longer if revocation fails (reported as `revokeFailed`).
- **Large preauth cleanup.** Bounded at 50 rounds of 400 deletes. Beyond that the call fails safely, with the target doc kept, and a retry continues the cleanup.
- **Rollback.** Revert the frontend build. The functions can stay deployed but unused, or be deleted. There are no rule changes and no data migration, and the docs the functions write keep today's shape.

### Verification

- **Focused tests:**
  - `npm --prefix functions test` (scenarios 1–22)
  - `npm test` (scenarios 23–33)
- **Manual QA:** scenarios 34–38, run with the emulator or after an authorized deploy. These are manual and not part of the build gate.
- **Production check:** run the root-cause confirmation steps for the reporting user, then fix the account by deleting it and provisioning it again.
- **Full gate:** `npm run verify`

### Deployment

- **Target:** NONE in this flow (code and tests only).
- **Surface:** both. Firebase functions (`createManagedUser`, `deleteManagedUser`) first, then the Cloudflare frontend.
- **Required authorization:** explicit human authorization naming Firebase functions and the Cloudflare frontend. Approval of the plan or review is not deployment authorization.

## Independent review

Status: APPROVED

### Diff reviewed

- Base: `5100621` (HEAD, `main` lineage), branch `vpunpum-sudo/signature-image-automation-v2`
- Head: working tree (uncommitted). Modified: `functions/index.js`, `src/App.tsx`, `src/components/ForceChangePassword.tsx`, `src/components/UserManagement.tsx`. Untracked: `functions/userAccounts.js`, `functions/userAccounts.test.js`, `src/utils/userProvisioning.ts`, `src/utils/userProvisioning.test.ts`, `src/utils/forceChangePassword.ts`, `src/utils/forceChangePassword.test.ts`, `src/utils/passwordChangeGate.ts`, `src/utils/passwordChangeGate.test.ts`, `docs/specs/admin-user-provisioning-first-login.md`. No files outside the plan's expected list were changed.
- Verification evidence checked: the stage reports `npm run verify` exit 0 on the current tree. I read the test files: tests are named 1–22 in `functions/userAccounts.test.js` and 23–33 in `src/utils/*.test.ts`, one per acceptance scenario. Manual scenarios 34–38 have not been run.

### Findings

- LOW: `functions/userAccounts.js:133`: if a legacy target `users/{uid}` doc has no `email` field, `where('email', '==', undefined)` throws after the Auth account is already deleted. The call returns `profile_delete_failed_auth_deleted` ("retry is safe"), but every retry hits the same query error, so the doc can never be deleted through the callable. Suggested follow-up: skip the preauth cleanup when `targetData.email` is not a non-empty string. Current provisioning always writes `email`, so this affects only malformed legacy data.
- LOW: `functions/userAccounts.js:65`: the server duplicate check matches only the lowercase email. A legacy `preauth_` doc saved with a mixed-case email would not block a new password provisioning. The UID guard at `functions/userAccounts.js:80` covers uid docs, and the old client also lowercased emails, so the risk is small. A leftover preauth doc could still migrate over `users/{uid}` only if `users/{uid}` is missing, and that cannot happen after a successful provision.
- LOW: `src/App.tsx:2904`: `ForceChangePassword` now renders outside `<BrowserRouter>` so it covers direct URLs. It uses no router hooks today (checked), but adding `useNavigate`/`Link` to it later would crash at runtime. Consider a comment in the component or keep it router-free.
- LOW: `functions/userAccounts.js:65-91`: provisioning is not transactional. Two concurrent Admin requests for the same orphaned email could both pass the duplicate check and both call `updateUser`, and the last password wins. This needs simultaneous Admin action, has a small impact, and was not required by the plan.
- LOW: manual QA scenarios 34–38 have not been run: real sign-in with `getIdTokenResult().signInProvider`, Auth deletion with the service account's permissions, autofill behaviour, and regressions. They are required before or right after an authorized deploy, with functions deployed before the frontend.

### Acceptance-criteria result

- [x] **New account.** `createUser({email, password})` with the exact password, then `users/{uid}` with `isApproved: true` and `requiresPasswordChange: true` (`functions/userAccounts.js:85-91`). Test 1.
- [x] **Existing Auth account with no doc.** `updateUser(uid, {password, disabled:false})`, then the doc write, then revoke. No preauth doc is created, and the result has `existingAccount: true` (`:77-108`). The client shows the existingAccount message (`src/utils/userProvisioning.ts:83`). Tests 3 and 25.
- [x] **Old sessions.** Revocation is best-effort and returns `revokeFailed` (`:101-105`). Test 4.
- [x] **Forced-change gate.** `passwordChangeGate` matches the spec (`src/utils/passwordChangeGate.ts:1-5`). It reads `signInProvider` per auth generation and fails closed to `null` (`src/App.tsx:2776-2780`). The loading screen shows while the gate is pending (`src/App.tsx:2884`). The gate is enforced before the router, so direct URLs cannot bypass it (`src/App.tsx:2904`). The `isGoogleUser` bypass is removed. Tests 30–33.
- [x] **Delete.** Order is Auth delete (except `preauth_`, ignoring user-not-found), then the preauth sweep (re-queried each round, batches of ≤400, cap of 50 rounds), then the target doc last (`:122-147`). Tests 13–17, 21 and 22.
- [x] **Permissions.** `authorize` runs first in both cores. It rejects unauthenticated and non-Admin callers and allows bootstrap emails (`:46-53`). Tests 8–10.
- [x] **Duplicates.** `already-exists` is returned before any Auth call (`:65-67`), with an extra UID guard (`:80-81`). Test 7.
- [x] **Password rules.** Server (`:13-15`) and client (`src/utils/userProvisioning.ts:26-30, 70-73`) both enforce them. `''` takes the preauth path and inner spaces are accepted. Tests 11 and 24.
- [x] **Email normalization.** The client normalizes before the local check, the regex, the global query and the callable (`src/utils/userProvisioning.ts:65-82`). Test 23.
- [x] **Audit log.** `create_user` and `delete_user` entries have the `isValidLog` fields and metadata, with no password. The write is best-effort and logs through `logger.error` on failure (`:29-45`). The client no longer logs these two actions. Tests 1, 13 and 20.
- [x] **Partial failures.** New-account rollback, the existing-account reason `profile_write_failed_password_changed`, the delete reason `profile_delete_failed_auth_deleted`, and retry all work, with Thai messages mapped (`src/utils/userProvisioning.ts:40-43`). Tests 5, 6, 16, 22 and 26. Auth errors are logged by code only, so passwords cannot leak (`:54-59`).
- [x] **ForceChangePassword retry.** `passwordUpdated` state routes the retry to `retryClearFlag` only (`src/components/ForceChangePassword.tsx:28-33`). Tests 28 and 29.
- [x] **Input attributes.** `name`/`autoComplete` are set as specified (`src/components/UserManagement.tsx:191-203`).
- [ ] **Regressions (manual QA 37).** Not run in this stage. The code paths for passwordless preauth, its migration in `App.tsx`, and role/approval editing are unchanged apart from the removed fallback.
- [x] **`npm run verify` passes** (exit 0 on the current tree).

### Verdict

No BLOCKER or HIGH findings. The implementation matches the approved plan and acceptance scenarios 1–33. The LOW items are optional hardening, plus the manual QA still owed before or after an authorized deploy. This approval does not authorize deployment. Deploying needs explicit human authorization naming Firebase functions and the Cloudflare frontend, with functions first.

Verdict: APPROVED
