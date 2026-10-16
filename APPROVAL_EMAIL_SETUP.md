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
- Create a Resend account, verify a sender domain, and create an API key.
- Set the `RESEND_API_KEY` secret with `firebase functions:secrets:set RESEND_API_KEY`.
- Set `APPROVAL_EMAIL_FROM` to an address on the verified domain and
  `APPROVAL_APP_URL` to the HTTPS application URL when deploying. These are
  Firebase parameter values, not Vite frontend variables.
- Install dependencies in `functions/` and deploy **only when authorized** with
  `firebase deploy --only functions:sendApprovalNotifications --project gen-lang-client-0942355314`.
- Check the Firestore database location and set the function region if the
  default region is not appropriate for the named database.

The Cloudflare frontend deployment is separate. This feature sends no email
until the Firebase Function and its settings are deployed. Delivery receipts
are stored in `approvalEmailDeliveries`, a collection not exposed by client
Firestore rules. Failed sends are retried. Resend's idempotency key protects
retries for 24 hours; the receipt protects later retries once recorded.
