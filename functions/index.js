const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const {
  notificationForTransition, notificationRecipients, deliveryId, emailContent
} = require('./approvalNotifications');

const DATABASE_ID = 'ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece';
const resendApiKey = defineSecret('RESEND_API_KEY');
const emailFrom = defineString('APPROVAL_EMAIL_FROM');
const appUrl = defineString('APPROVAL_APP_URL');

initializeApp();

async function sendEmail(apiKey, from, to, content, idempotencyKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ from, to: [to], ...content })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Resend rejected approval notification (${response.status}): ${result.message || 'unknown error'}`);
  }
  return result.id;
}

exports.sendApprovalNotifications = onDocumentUpdated({
  document: 'projects/{projectId}',
  database: DATABASE_ID,
  retry: true,
  secrets: [resendApiKey],
  timeoutSeconds: 120
}, async event => {
  if (!event.data) return;
  const notification = notificationForTransition(
    event.data.before.data(), event.data.after.data()
  );
  if (!notification) return;

  const from = emailFrom.value().trim();
  const url = appUrl.value().trim();
  const key = resendApiKey.value();
  if (!from || !/^https:\/\//.test(url) || !key) {
    throw new Error('Approval email sender, app URL, or Resend secret is missing');
  }

  const db = getFirestore(DATABASE_ID);
  const users = await db.collection('users').get();
  const recipients = notificationRecipients(users.docs.map(user => user.data()), notification);
  const content = emailContent(notification, url);
  const projectId = event.params.projectId;

  for (const email of recipients) {
    const id = deliveryId(projectId, notification, email);
    const delivery = db.collection('approvalEmailDeliveries').doc(id);
    if ((await delivery.get()).data()?.status === 'sent') continue;

    // One key per project, approval, stage and recipient. Resend also deduplicates
    // concurrent retries; Firestore keeps the sent state after Resend's 24h window.
    const messageId = await sendEmail(key, from, email, content, id);
    await delivery.set({
      projectId,
      approvalId: notification.approvalId,
      kind: notification.kind,
      email,
      status: 'sent',
      providerMessageId: messageId,
      sentAt: FieldValue.serverTimestamp()
    });
  }

  logger.info('Approval notification processed', {
    projectId, kind: notification.kind, recipientCount: recipients.length
  });
});
