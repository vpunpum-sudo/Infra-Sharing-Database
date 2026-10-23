const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { getStorage } = require('firebase-admin/storage');
const { defineSecret, defineString, defineInt } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { claimDelivery } = require('./deliveryClaims');
const { STAGE_REMINDER_OPTIONS, REMINDER_DEFAULTS } = require('./approvalReminderConfig');
const { createStageReminderHandler } = require('./approvalReminders');
const nodemailer = require('nodemailer');
const {
  notificationForTransition, notificationRecipients, deliveryId, emailContent
} = require('./approvalNotifications');
const { finalDocumentFileIds, fitAttachments, attachmentNote } = require('./finalDocuments');

const DATABASE_ID = 'ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece';
const gmailAppPassword = defineSecret('fiberinfrasharing');
const emailFrom = defineString('APPROVAL_EMAIL_FROM');
const appUrl = defineString('APPROVAL_APP_URL');
const reminderMode = defineString('APPROVAL_REMINDER_MODE', { default: REMINDER_DEFAULTS.mode });
const reminderMaxEmails = defineInt('APPROVAL_REMINDER_MAX_EMAILS', { default: REMINDER_DEFAULTS.maxEmails });

initializeApp();

const projectFiles = require('./projectFiles');
exports.manageProjectFile = projectFiles.manageProjectFile;
exports.getProjectCreatedDates = projectFiles.getProjectCreatedDates;
const userAccounts = require('./userAccounts');
exports.createManagedUser = userAccounts.createManagedUser;
exports.deleteManagedUser = userAccounts.deleteManagedUser;

exports.cleanupProjectFiles = onDocumentDeleted({
  document: 'projects/{projectId}', database: DATABASE_ID, region: 'asia-southeast1', retry: true
}, async event => {
  const db = getFirestore(DATABASE_ID);
  const project = db.collection('projects').doc(event.params.projectId);
  const bucket = getStorage().bucket('gen-lang-client-0942355314.firebasestorage.app');
  // Stored files first: their documents hold the Storage paths.
  const files = await project.collection('files').get();
  for (const fileDoc of files.docs) {
    const path = fileDoc.data().storagePath;
    if (path) await bucket.file(path).delete({ ignoreNotFound: true });
  }
  // Then every subcollection the project had (routes, enclosures, loops,
  // files, folders, schedule, ...), including ones added later.
  await db.recursiveDelete(project);
});

/**
 * The signed PDF and KMZ for a completed approval. The last signer's browser
 * saves them shortly after the approval completes, so wait up to ~2.5 minutes
 * for designApproval.finalDocuments; send without them if they never arrive.
 */
async function finalDocumentAttachments(db, projectId, approvalId) {
  const project = db.collection('projects').doc(projectId);
  let finalDocuments;
  for (let attempt = 0; attempt < 15; attempt++) {
    const approval = (await project.get()).data()?.designApproval;
    if (approval?.id !== approvalId) break;
    finalDocuments = approval.finalDocuments;
    if (finalDocuments) break;
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  const bucket = getStorage().bucket('gen-lang-client-0942355314.firebasestorage.app');
  const files = [];
  for (const fileId of finalDocumentFileIds(finalDocuments)) {
    const record = (await project.collection('files').doc(fileId).get()).data();
    if (!record?.storagePath) continue;
    try {
      const [content] = await bucket.file(record.storagePath).download();
      files.push({ filename: record.name, content, contentType: record.contentType, name: record.name, size: content.length });
    } catch (error) {
      logger.warn('Final document not attached', { projectId, fileId, message: String(error?.message || error) });
    }
  }
  const { attached, skipped } = fitAttachments(files);
  return {
    attachments: attached.map(({ filename, content, contentType }) => ({ filename, content, contentType })),
    note: attachmentNote(attached.map(file => file.name), skipped)
  };
}

exports.sendApprovalNotifications = onDocumentUpdated({
  document: 'projects/{projectId}',
  database: DATABASE_ID,
  region: 'asia-southeast1',
  retry: true,
  secrets: [gmailAppPassword],
  // Room to wait for the signed documents on the completion email.
  timeoutSeconds: 300,
  memory: '512MiB'
}, async event => {
  if (!event.data) return;
  const notification = notificationForTransition(
    event.data.before.data(), event.data.after.data(), event.time
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
  const projectId = event.params.projectId;
  const final = notification.kind === 'approval-completed' || notification.kind === 'final-documents'
    ? await finalDocumentAttachments(db, projectId, notification.approvalId)
    : { attachments: [], note: undefined };
  const content = emailContent(notification, url, projectId, final.note);
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass: password }
  });

  for (const email of recipients) {
    const id = deliveryId(projectId, notification, email, event.id);
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
        ...(final.attachments.length ? { attachments: final.attachments } : {}),
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

exports.sendApprovalStageReminders = onSchedule({
  ...STAGE_REMINDER_OPTIONS, secrets: [gmailAppPassword]
}, createStageReminderHandler({
  getDb: () => getFirestore(DATABASE_ID),
  // Firebase param defaults are deployment metadata; .value() alone returns ''/0
  // when an env variable is absent in a local runtime.
  mode: () => process.env.APPROVAL_REMINDER_MODE === undefined ? undefined : reminderMode.value(),
  maxEmails: () => process.env.APPROVAL_REMINDER_MAX_EMAILS === undefined ? undefined : reminderMaxEmails.value(),
  from: () => emailFrom.value(), appUrl: () => appUrl.value(),
  password: () => gmailAppPassword.value(),
  createTransport: options => nodemailer.createTransport(options), logger
}));
