const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { getStorage } = require('firebase-admin/storage');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const nodemailer = require('nodemailer');
const {
  notificationForTransition, notificationRecipients, deliveryId, emailContent
} = require('./approvalNotifications');

const DATABASE_ID = 'ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece';
const gmailAppPassword = defineSecret('fiberinfrasharing');
const emailFrom = defineString('APPROVAL_EMAIL_FROM');
const appUrl = defineString('APPROVAL_APP_URL');

initializeApp();

const projectFiles = require('./projectFiles');
exports.manageProjectFile = projectFiles.manageProjectFile;
exports.getProjectCreatedDates = projectFiles.getProjectCreatedDates;

exports.cleanupProjectFiles = onDocumentDeleted({
  document: 'projects/{projectId}', database: DATABASE_ID, region: 'asia-southeast1', retry: true
}, async event => {
  const files = getFirestore(DATABASE_ID).collection('projects').doc(event.params.projectId).collection('files');
  const bucket = getStorage().bucket('gen-lang-client-0942355314.firebasestorage.app');
  const snapshot = await files.get();
  for (const fileDoc of snapshot.docs) {
    const path = fileDoc.data().storagePath;
    if (path) await bucket.file(path).delete({ ignoreNotFound: true });
    await fileDoc.ref.delete();
  }
  const folders = await files.parent.collection('folders').get();
  for (const folderDoc of folders.docs) await folderDoc.ref.delete();
});

async function claimDelivery(db, id, details) {
  const ref = db.collection('approvalEmailDeliveries').doc(id);
  const now = Date.now();
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (current?.status === 'sent') return 'sent';
    if (current?.status === 'sending' && current.leaseUntil > now) return 'busy';
    transaction.set(ref, {
      ...details,
      status: 'sending',
      attempts: (current?.attempts || 0) + 1,
      leaseUntil: now + 10 * 60 * 1000,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return 'claimed';
  });
  return { ref, result };
}

exports.sendApprovalNotifications = onDocumentUpdated({
  document: 'projects/{projectId}',
  database: DATABASE_ID,
  region: 'asia-southeast1',
  retry: true,
  secrets: [gmailAppPassword],
  timeoutSeconds: 120
}, async event => {
  if (!event.data) return;
  const notification = notificationForTransition(
    event.data.before.data(), event.data.after.data()
  );
  if (!notification) return;

  const from = emailFrom.value().trim().toLowerCase();
  const url = appUrl.value().trim();
  const password = gmailAppPassword.value();
  if (!/^[^\s@]+@gmail\.com$/.test(from) || !/^https:\/\//.test(url) || !password) {
    throw new Error('Gmail sender, app URL, or Gmail App Password is missing');
  }

  const db = getFirestore(DATABASE_ID);
  const users = await db.collection('users').get();
  const recipients = notificationRecipients(users.docs.map(user => user.data()), notification);
  const content = emailContent(notification, url);
  const projectId = event.params.projectId;
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass: password }
  });

  for (const email of recipients) {
    const id = deliveryId(projectId, notification, email);
    const { ref, result } = await claimDelivery(db, id, {
      projectId, approvalId: notification.approvalId,
      kind: notification.kind, email
    });
    if (result === 'sent') continue;
    // Retry after an in-flight attempt finishes; the lease also recovers a
    // process that stopped before recording a result.
    if (result === 'busy') throw new Error('Approval email delivery is in progress');
    let sent;
    try {
      sent = await transport.sendMail({
        from, to: email, ...content,
        messageId: `<approval-${id}@gmail.com>`
      });
    } catch (error) {
      await ref.set({
        status: 'failed', leaseUntil: 0,
        lastError: String(error?.message || error).slice(0, 300),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      throw error;
    }
    await ref.set({
      status: 'sent', providerMessageId: sent.messageId,
      sentAt: FieldValue.serverTimestamp(), leaseUntil: 0
    }, { merge: true });
  }

  logger.info('Approval notification processed', {
    projectId, kind: notification.kind, recipientCount: recipients.length
  });
});
