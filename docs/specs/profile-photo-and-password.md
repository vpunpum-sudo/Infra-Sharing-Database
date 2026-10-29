# Profile photo upload and password changes

Status: implemented; independent review and emulator/browser gates pending.
Risk: HIGH (Storage authorization and password re-authentication).

Profile Settings accepts photos from the device and removes the editable Profile Image
URL field. Existing Firestore photo URLs, including external/Google photos, remain visible
without migration or writes on mount. An explicitly empty Firestore photo wins over Auth.

## Photos

Accept JPEG, PNG and WebP, from 1 byte through 10 MiB. Decode with EXIF orientation,
reject more than 40,000,000 pixels, center-crop, and resize to at most 256 square pixels
without upscaling. Canvas re-encoding removes metadata. JPEG quality is tried at 0.85,
0.75, 0.65 and 0.5 until the result is at most 200 KiB. Failure leaves saved data untouched.
Transparent input receives a white background. Preview is local until explicit confirmation.
Generation checks discard stale decodes before allocating preview URLs. Replace, cancel
and unmount revoke previews; unmount prevents subsequent UI updates and job steps.

Photo controls are outside all forms. The camera badge and visible picker are keyboard
controls. Confirmation, retry and cancel are explicit non-submit buttons. Removal uses
a confirmation dialog; cancel makes no request. Save Changes and photo writes exclude
each other while pending; password changes run independently. Each form has one submit
button and a preventDefault-only submit handler, so actions run solely through the
AsyncActionButton single-flight click handler (including implicit Enter activation).

Upload creates `profile-photos/{uid}/avatar-<13-digit timestamp>-<16 lowercase hex>.jpg`
with JPEG content type and a one-year cache policy. New object names preserve the previous
photo's bytes during partial failures. A checkpoint job runs upload, URL retrieval, Auth,
then Firestore. A retry skips completed steps; a failed/ambiguous upload uses a fresh name.
The exact persisted URL must be nonempty HTTP(S), no longer than 1000 characters. No cache
parameter is appended. Photo actions write only Auth `{ photoURL }` and Firestore
`{ photoURL }` with merge. They cannot save an unsaved name or replay stale user fields.
Save Changes retains its whole-document merge shape but uses the latest locally saved
photo URL and sends only displayName to Auth. Activity details contain no photo URL.

Removal writes Auth null, then Firestore empty string, with checkpoint retries. After both
writes succeed, cleanup best-effort deletes only the previous managed object in the same
bucket and user's folder, with the valid filename pattern, excluding the new object.
Managed URL parsing supports emulator and production shapes independently of hostname.
An external URL produces no Storage deletion. Cleanup and activity failures do not fail
an otherwise completed save. Already-issued writes cannot be canceled; stale jobs stop
before the next step. Orphan cleanup and per-user object-count quotas are out of scope.

Storage rules allow only the owning authenticated uid to read/delete valid avatar paths,
and create JPEG objects from 1 through 262144 bytes. Overwrite and other paths are denied.
The pre-existing project-files denial is unchanged. The client re-encodes image bytes;
rules inspect declared metadata only and cannot check approval in the named Firestore DB.
Unapproved sign-ups and unlimited object counts remain accepted storage-cost risks.

## Passwords

The password provider's trimmed email decides whether password changes are available.
Password-only and password+Google accounts get the form. The latter explains that changing
this password affects email sign-in, not Google. Google-only accounts get an explanation
and administrator contact guidance, with no linking or set-password action. Accounts
without a password provider or usable provider email get fixed notices and no form.

Validate current password, new password (no surrounding spaces, minimum six characters,
matching confirmation), and difference from current. The shared validator preserves
ForceChangePassword behavior. Build an email credential, re-authenticate, then update the
password. Re-authentication failure never calls updatePassword. Fixed Thai messages map
wrong credentials, weak passwords, expired sessions, rate limits, network and unknown
failures. No passwords or raw errors are logged or sent to activity logging. Success
clears all three fields; failure preserves them.

## Work Instruction and verification

Remove only the profile-image-url mask region. Keep display name/email/avatar masking,
five profile callouts and unchanged screenshot marks/capture tooling. Update the profile
manual and fallback drawing for device selection and current-password entry. The existing
owner-approved PNG is stale and requires a separate guarded recapture and owner review.

Required implementation checks: focused helper/service/component contracts and existing WI
and ForceChangePassword regression tests; `npm run verify`. `npm run test:profile-emulator`
uses only demo-profile-settings, loopback Auth/Storage/Enterprise Firestore and the named
database. It copies root rules byte-for-byte into an ignored .rules folder. A normal shell
with Java, Firebase CLI and local sockets must run this gate. The independent reviewer
owns executable Chromium evidence per .context/plan.md: actual codecs/EXIF, preview URL
balance, decode races, keyboard/single-flight requests, retries, photo-only writes, rules
not deployed, provider flows, removals and removed URL field. Source contracts alone do
not prove browser runtime behavior. No review approval without those gates.

## Deployment and rollback

Nothing is deployed by this change. Production Storage rules deployment needs separate
explicit authorization naming **Storage rules**, project **gen-lang-client-0942355314**.
Cloudflare frontend authorization is separate (merging to main triggers its build).
No functions or Firestore rules deployment is included. Prefer rules first or together:
before rules are deployed there is no way to change a photo. Local preview works;
upload denial shows the fixed Thai “ยังไม่เปิดใช้งาน” message and preserves edits, preview
and saved photo. Display Name, removal and password changes remain usable.

After an authorized deployment, use an approved test account to upload, check the header
and stored URL length, replace and confirm deletion of the previous managed object,
remove, and verify another account cannot access the path. Record results in the PR.
Rollback code by reverting the change; rollback rules by redeploying the prior storage.rules.
Uploaded objects/token URLs and cached bytes persist until separate cleanup; best-effort
deletion does not promise bearer-URL revocation. No orphan cleanup, provider linking,
other-user editing, screenshot regeneration, commit, merge or deploy is included here.
