# Approval email notifications

The `sendApprovalNotifications` Firebase Function watches the named Firestore
database used by the app. It sends one email per address at each transition:

1. New Planning request → approved Design users of participating project owners.
2. All Planning sign-offs approved → approved Management users of those owners.
3. All Management sign-offs approved → approved Design and Management users.

Recipients must have a valid email, an approved user account, and an Owner
explicitly configured on the project. The Owner must also have a Planning
sign-off in the approval request. No email goes to all companies when a project
has no configured Owner. An address shared by multiple matching users receives
one message for the event.

## Required setup before deployment

- The Firebase project must be on Blaze and Cloud Functions must be enabled.
- Use a dedicated Gmail mailbox with 2-Step Verification and generate a unique
  App Password for this function. The account holder must do this in Google
  Account settings; do not put the password in chat or commit it to GitHub.
- Create the `fiberinfrasharing` secret in Google Cloud Secret Manager for
  project `gen-lang-client-0942355314`. Store the Gmail App Password as its
  first enabled version. Never put the password in chat or GitHub.
- Set `APPROVAL_EMAIL_FROM` to that Gmail address and
  `APPROVAL_APP_URL` to the HTTPS application URL when deploying. These are
  Firebase parameter values, not Vite frontend variables.
- Install dependencies in `functions/` and deploy **only when authorized** with
  `firebase deploy --only functions:sendApprovalNotifications --project gen-lang-client-0942355314`.
- The function runs in `asia-southeast1`, matching the named Firestore database.

The Cloudflare frontend deployment is separate. This feature sends no email
until the Firebase Function and its settings are deployed. Delivery receipts
are stored in `approvalEmailDeliveries`, a collection not exposed by client
Firestore rules. A Firestore transaction claims each recipient before sending,
and failed sends are retried. SMTP cannot guarantee exactly-once delivery if
the process stops after Gmail accepts a message but before the receipt is
saved. Gmail also has account sending limits and may block automated SMTP;
a dedicated mail service with a verified domain is preferable for production.
