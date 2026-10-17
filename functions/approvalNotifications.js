const { createHash } = require('node:crypto');

const OWNER_CODES = new Set(['ITEL', 'SYMC', 'UIH']);

function ownerCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return OWNER_CODES.has(code) ? code : null;
}

function participatingOwners(project) {
  const configured = Array.isArray(project?.owners) && project.owners.length
    ? project.owners
    : [project?.owner];
  const signedFor = new Set(Object.keys(project?.designApproval?.planningSignOffs || {}));
  return [...new Set(configured.map(ownerCode).filter(Boolean))]
    .filter(owner => signedFor.has(owner));
}

function allApproved(signOffs, owners) {
  return owners.length > 0 && owners.every(owner => signOffs?.[owner]?.status === 'Approved');
}

function notificationForTransition(before, after) {
  const approval = after?.designApproval;
  if (!approval?.id || !approval?.documentNumber) return null;
  const owners = participatingOwners(after);
  if (!owners.length) return null;

  const previous = before?.designApproval;
  const stage = approval.approvalStage;
  let kind;
  let roles;

  if (stage === 'Planning' && after.status === 'Pending Approval' &&
      (previous?.id !== approval.id || before?.status !== 'Pending Approval')) {
    kind = 'planning-requested';
    roles = ['Design', 'Planning'];
  } else if (stage === 'OM' && previous?.id === approval.id &&
      previous.approvalStage !== 'OM' &&
      allApproved(approval.planningSignOffs, owners)) {
    kind = 'management-requested';
    roles = ['Management'];
  } else if (stage === 'Completed' && after.status === 'Approved' &&
      previous?.id === approval.id && previous.approvalStage !== 'Completed' &&
      allApproved(approval.planningSignOffs, owners) &&
      allApproved(approval.omSignOffs, owners)) {
    kind = 'approval-completed';
    roles = ['Design', 'Planning', 'Management'];
  } else {
    return null;
  }

  return { kind, roles, owners, approvalId: approval.id,
    documentNumber: approval.documentNumber, projectName: after.name || 'Project' };
}

function notificationRecipients(users, notification) {
  const roles = new Set(notification.roles);
  const owners = new Set(notification.owners);
  const emails = new Set();
  for (const user of users) {
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (user.isApproved !== true || !roles.has(user.role) ||
        !owners.has(ownerCode(user.owner)) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    emails.add(email);
  }
  return [...emails].sort();
}

function deliveryId(projectId, notification, email) {
  return createHash('sha256').update(JSON.stringify([
    projectId, notification.approvalId, notification.kind, email
  ])).digest('hex');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function emailContent(notification, appUrl) {
  const description = {
    'planning-requested': 'มีเอกสารรออนุมัติขั้น Planning',
    'management-requested': 'Planning อนุมัติครบแล้ว มีเอกสารรออนุมัติขั้น Management',
    'approval-completed': 'Management อนุมัติครบแล้ว เอกสารได้รับอนุมัติเรียบร้อย'
  }[notification.kind];
  const subject = `[Fiber Sharing] ${description}: ${notification.documentNumber}`;
  const lines = [description, `โครงการ: ${notification.projectName}`,
    `เลขที่เอกสาร: ${notification.documentNumber}`, `เปิดระบบ: ${appUrl}`];
  const text = lines.join('\n');
  const html = `<p>${escapeHtml(description)}</p><p>โครงการ: ${escapeHtml(notification.projectName)}<br>` +
    `เลขที่เอกสาร: ${escapeHtml(notification.documentNumber)}</p>` +
    `<p><a href="${escapeHtml(appUrl)}">เปิดระบบ Fiber Sharing</a></p>`;
  return { subject, text, html };
}

module.exports = {
  notificationForTransition, notificationRecipients, deliveryId, emailContent
};
