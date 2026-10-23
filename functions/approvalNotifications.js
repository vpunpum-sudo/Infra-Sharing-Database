const { createHash } = require('node:crypto');
const { REMINDER_DEFAULTS } = require('./approvalReminderConfig');

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

function rejectingSignOff(approval, owners) {
  const candidates = [
    { level: 'Planning', signOffs: approval.planningSignOffs },
    { level: 'OM', signOffs: approval.omSignOffs }
  ].flatMap(({ level, signOffs }) => owners.flatMap((owner, ownerIndex) => {
    const entry = signOffs?.[owner];
    if (entry?.status !== 'Rejected') return [];
    const signedAt = entry.signedAt || '';
    const timestamp = Date.parse(signedAt);
    return [{ owner, signedBy: entry.signedBy || '', signedAt, level, ownerIndex,
      timestamp: Number.isNaN(timestamp) ? null : timestamp }];
  }));

  candidates.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
      return b.timestamp - a.timestamp;
    }
    if (a.timestamp === null && b.timestamp !== null) return 1;
    if (a.timestamp !== null && b.timestamp === null) return -1;
    if (a.level !== b.level) return a.level === 'OM' ? -1 : 1;
    return a.ownerIndex - b.ownerIndex;
  });
  if (!candidates.length) return null;
  const { owner, signedBy, signedAt, level } = candidates[0];
  return { owner, signedBy, signedAt, level };
}

// The completion email waits this long for the signed documents (see index.js).
const FINAL_DOCUMENTS_WAIT_MS = 170 * 1000;

/** `changedAt` is when this update happened (the event time), used to spot signed documents saved too late for the completion email. */
function notificationForTransition(before, after, changedAt) {
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
  } else if (stage === 'Completed' && after.status === 'Approved' &&
      previous?.id === approval.id && previous.approvalStage === 'Completed' &&
      !previous.finalDocuments && approval.finalDocuments &&
      Date.parse(changedAt) - Date.parse(approval.finalApprovedAt) > FINAL_DOCUMENTS_WAIT_MS) {
    // Saved after the completion email went out without them: send them now.
    kind = 'final-documents';
    roles = ['Design', 'Planning', 'Management'];
  } else if (stage === 'Rejected' && after.status === 'Rejected' &&
      previous?.id === approval.id && previous.approvalStage !== 'Rejected') {
    kind = 'approval-rejected';
    roles = ['Design', 'Planning', 'Management'];
  } else {
    return null;
  }

  const signOff = (signOffs, owner) => {
    const entry = signOffs?.[owner] || {};
    return { status: entry.status || 'Pending', signedBy: entry.signedBy || '', signedAt: entry.signedAt || '' };
  };

  return { kind, roles, owners, approvalId: approval.id,
    documentNumber: approval.documentNumber, projectName: after.name || 'Project',
    details: {
      routeCode: after.routeCode || '',
      requestedBy: approval.requestedBy || '',
      requestedByEmail: approval.requestedByEmail || '',
      requestedAt: approval.requestedAt || '',
      projectCorridorDistanceKm: approval.projectCorridorDistanceKm,
      totalOperationDistanceKm: approval.totalOperationDistanceKm,
      estimatedInstallationDate: approval.estimatedInstallationDate || '',
      contractorName: approval.contractorName || '',
      contractorPoNumber: approval.contractorPoNumber || '',
      ...(kind === 'approval-rejected' ? { rejection: {
        reason: String(approval.rejectionReason || '').trim(),
        ...(rejectingSignOff(approval, owners) || { owner: '', signedBy: '', signedAt: '', level: '' })
      } } : {}),
      signOffs: owners.map(owner => ({
        owner,
        planning: signOff(approval.planningSignOffs, owner),
        management: signOff(approval.omSignOffs, owner)
      }))
    } };
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

/**
 * One delivery per recipient per triggering change. `eventId` is the Firestore
 * event id: retries of the same change reuse it (no duplicate mail), while a
 * later identical transition, e.g. completing again after an Admin rewind on
 * the same approval, is a new event and is delivered again.
 */
function deliveryId(projectId, notification, email, eventId = '') {
  return createHash('sha256').update(JSON.stringify([
    projectId, notification.approvalId, notification.kind, email, eventId
  ])).digest('hex');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const KIND_COPY = {
  'planning-requested': {
    description: 'มีเอกสารรออนุมัติขั้น Planning',
    stage: 'Planning',
    intro: 'มีคำขออนุมัติการออกแบบโครงการใหม่ รอการพิจารณาลงนามจาก Planning ของแต่ละ Operator',
    action: 'ตรวจสอบและอนุมัติเอกสาร',
    accent: '#d97706'
  },
  'management-requested': {
    description: 'Planning อนุมัติครบแล้ว มีเอกสารรออนุมัติขั้น Management',
    stage: 'Management (O&M)',
    intro: 'Planning ของทุก Operator อนุมัติครบแล้ว เอกสารรอการพิจารณาลงนามจาก Management',
    action: 'ตรวจสอบและอนุมัติเอกสาร',
    accent: '#2563eb'
  },
  'final-documents': {
    description: 'เอกสารอนุมัติฉบับลงนามครบ',
    stage: 'อนุมัติครบทุกขั้น',
    intro: 'ส่งเอกสารขออนุมัติฉบับลงนามครบ (PDF) และไฟล์แผนที่ (KMZ) ของโครงการที่ได้รับอนุมัติแล้ว',
    action: 'เปิดดูโครงการ',
    accent: '#059669'
  },
  'approval-completed': {
    description: 'Management อนุมัติครบแล้ว เอกสารได้รับอนุมัติเรียบร้อย',
    stage: 'อนุมัติครบทุกขั้น',
    intro: 'เอกสารได้รับการอนุมัติครบทั้งขั้น Planning และ Management แล้ว',
    action: 'เปิดดูโครงการ',
    accent: '#059669'
  },
  'approval-rejected': {
    description: 'เอกสารไม่ได้รับอนุมัติ',
    stage: 'ไม่อนุมัติ',
    intro: 'คำขออนุมัติการออกแบบนี้ไม่ได้รับอนุมัติ คำขอทั้งหมดถูกยกเลิก ผู้ขออนุมัติต้องแก้ไขและยื่นคำขอใหม่',
    action: 'เปิดดูโครงการ',
    accent: '#b91c1c'
  }
};

const STATUS_LABELS = {
  Approved: { text: 'อนุมัติแล้ว', color: '#047857', background: '#d1fae5' },
  Rejected: { text: 'ไม่อนุมัติ', color: '#b91c1c', background: '#fee2e2' },
  Pending: { text: 'รออนุมัติ', color: '#b45309', background: '#fef3c7' }
};

function formatDate(value, withTime) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}), timeZone: 'Asia/Bangkok'
  }).format(date) + (withTime ? ' น.' : '');
}

function formatKm(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} กม.` : '';
}

function projectLink(appUrl, projectId) {
  const base = appUrl.replace(/\/+$/, '');
  return projectId ? `${base}/project/${encodeURIComponent(projectId)}` : base;
}

/** Rows shown in both the HTML and plain-text bodies; empty values are left out. */
function summaryRows(notification, copy) {
  const details = notification.details || {};
  const rejection = details.rejection;
  const requester = [details.requestedBy, details.requestedByEmail && `(${details.requestedByEmail})`]
    .filter(Boolean).join(' ');
  const contractor = [details.contractorName,
    details.contractorPoNumber && `PO ${details.contractorPoNumber}`].filter(Boolean).join(' / ');
  return [
    ['โครงการ', notification.projectName],
    ['รหัสเส้นทาง', details.routeCode],
    ['เลขที่เอกสาร', notification.documentNumber],
    ['ขั้นการอนุมัติ', copy.stage],
    ['Operator', notification.owners.join(', ')],
    ['ผู้ขออนุมัติ', requester],
    ['วันที่ขออนุมัติ', formatDate(details.requestedAt, true)],
    ['ระยะ Project Corridor', formatKm(details.projectCorridorDistanceKm)],
    ['ระยะดำเนินการรวม', formatKm(details.totalOperationDistanceKm)],
    ['ผู้รับเหมา', contractor],
    ['วันติดตั้งโดยประมาณ', formatDate(details.estimatedInstallationDate, false)],
    ...(rejection ? [
      ['ระดับที่ไม่อนุมัติ', rejection.level === 'OM' ? 'Management (O&M)' : rejection.level],
      ['ผู้ไม่อนุมัติ', rejection.owner &&
        [rejection.owner, rejection.signedBy].filter(Boolean).join(' — ')],
      ['วันที่ไม่อนุมัติ', formatDate(rejection.signedAt, true)]
    ] : [])
  ].filter(([, value]) => value);
}

function signOffText(signOff) {
  const label = (STATUS_LABELS[signOff.status] || STATUS_LABELS.Pending).text;
  const signer = [signOff.signedBy, formatDate(signOff.signedAt, true)].filter(Boolean).join(', ');
  return signer ? `${label} (${signer})` : label;
}

function signOffCell(signOff) {
  const label = STATUS_LABELS[signOff.status] || STATUS_LABELS.Pending;
  const signer = [signOff.signedBy, formatDate(signOff.signedAt, true)].filter(Boolean).map(escapeHtml).join('<br>');
  return `<td style="padding:10px 12px;border-top:1px solid #e2e8f0;vertical-align:top;">` +
    `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:bold;` +
    `color:${label.color};background:${label.background};">${escapeHtml(label.text)}</span>` +
    (signer ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">${signer}</div>` : '') +
    `</td>`;
}

/** `attachmentNote` (optional) is one line about the attached documents. */
function emailContent(notification, appUrl, projectId, attachmentNote) {
  const isReminder = ['stage-reminder', 'stage-escalation'].includes(notification.kind);
  if (isReminder) {
    // Strict allow-list: never carry requester/signature/reason/contact data into reminders.
    notification = {
      kind: notification.kind, projectName: notification.projectName,
      documentNumber: notification.documentNumber, owners: notification.owners,
      stage: notification.stage, daysWaiting: notification.daysWaiting,
      reminderNumber: notification.reminderNumber,
      details: { routeCode: notification.details?.routeCode }
    };
    attachmentNote = undefined;
  }
  const stage = notification.stage === 'OM' ? 'Management (O&M)' : 'Planning';
  const copy = isReminder ? {
    description: notification.kind === 'stage-reminder'
      ? `เตือน: เอกสารรออนุมัติขั้น ${stage} ค้างอยู่ ${notification.daysWaiting} วัน`
      : `เอกสารรออนุมัติค้างเกิน ${REMINDER_DEFAULTS.escalationDays} วัน`,
    stage,
    intro: notification.kind === 'stage-reminder'
      ? `เอกสารขออนุมัติการออกแบบโครงการนี้รอการลงนามของคุณมาแล้ว ${notification.daysWaiting} วัน กรุณาตรวจสอบและลงนามเพื่อให้โครงการดำเนินต่อได้`
      : `เอกสารขออนุมัติรายการนี้ค้างอยู่ในขั้น ${stage} เกิน ${REMINDER_DEFAULTS.escalationDays} วัน ยังไม่ลงนาม: ${notification.owners.join(', ')}`,
    action: 'ตรวจสอบและอนุมัติเอกสาร', accent: '#d97706'
  } : KIND_COPY[notification.kind];
  const link = projectLink(appUrl, projectId);
  const rows = summaryRows(notification, copy);
  if (isReminder) {
    rows.push(['รอการลงนาม', `${notification.daysWaiting} วัน`]);
    if (notification.kind === 'stage-reminder') {
      rows.push(['การแจ้งเตือน', `เตือนครั้งที่ ${notification.reminderNumber} จาก ${REMINDER_DEFAULTS.maxReminders}`]);
    }
  }
  const signOffs = notification.details?.signOffs || [];
  const rejection = notification.details?.rejection;
  const reason = rejection?.reason || 'ไม่ระบุเหตุผล';
  const subject = `[Fiber Sharing] ${copy.description}: ${notification.projectName} (${notification.documentNumber})`;

  const text = [
    copy.description, '', copy.intro, '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(rejection ? ['', 'เหตุผลที่ไม่อนุมัติ', reason] : []),
    ...(signOffs.length ? ['', 'สถานะการลงนาม',
      ...signOffs.map(s => `- ${s.owner}: Planning ${signOffText(s.planning)} | Management ${signOffText(s.management)}`)] : []),
    ...(attachmentNote ? ['', attachmentNote] : []),
    '', `${copy.action}: ${link}`, '',
    'อีเมลนี้ส่งอัตโนมัติจากระบบ Fiber Sharing กรุณาอย่าตอบกลับ'
  ].join('\n');

  const font = "font-family:'Sarabun','Leelawadee UI',Tahoma,Arial,sans-serif;";
  const summaryHtml = rows.map(([label, value]) =>
    `<tr><td style="padding:8px 0;width:40%;color:#64748b;font-size:14px;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:bold;vertical-align:top;">${escapeHtml(value)}</td></tr>`
  ).join('');
  const rejectionHtml = rejection ?
    `<div style="margin:24px 0 0;padding:14px;border-radius:8px;color:${STATUS_LABELS.Rejected.color};background:${STATUS_LABELS.Rejected.background};">` +
    `<p style="margin:0 0 8px;font-size:14px;font-weight:bold;">เหตุผลที่ไม่อนุมัติ</p>` +
    `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(reason)}</div></div>` : '';
  const signOffHtml = signOffs.length ? (
    `<p style="margin:28px 0 8px;font-size:15px;font-weight:bold;color:#0f172a;">สถานะการลงนาม</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;font-size:14px;">` +
    `<tr style="background:#f8fafc;color:#475569;font-size:12px;text-transform:uppercase;">` +
    `<th align="left" style="padding:10px 12px;">Operator</th><th align="left" style="padding:10px 12px;">Planning</th>` +
    `<th align="left" style="padding:10px 12px;">Management</th></tr>` +
    signOffs.map(s => `<tr><td style="padding:10px 12px;border-top:1px solid #e2e8f0;font-weight:bold;color:#0f172a;vertical-align:top;">${escapeHtml(s.owner)}</td>` +
      signOffCell(s.planning) + signOffCell(s.management) + `</tr>`).join('') +
    `</table>`
  ) : '';

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f1f5f9;${font}">` +
    `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(`${notification.projectName} · ${notification.documentNumber}`)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">` +
    `<tr><td style="background:#0f172a;padding:18px 28px;color:#ffffff;font-size:16px;font-weight:bold;letter-spacing:0.5px;">Fiber Sharing</td></tr>` +
    `<tr><td style="height:4px;background:${copy.accent};font-size:0;line-height:0;">&nbsp;</td></tr>` +
    `<tr><td style="padding:28px;">` +
    `<p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:${copy.accent};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(copy.stage)}</p>` +
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.4;color:#0f172a;">${escapeHtml(copy.description)}</h1>` +
    `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(copy.intro)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">${summaryHtml}</table>` +
    rejectionHtml +
    signOffHtml +
    (attachmentNote ? `<p style="margin:24px 0 0;padding:10px 14px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:14px;color:#166534;">📎 ${escapeHtml(attachmentNote)}</p>` : '') +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr>` +
    `<td style="border-radius:8px;background:${copy.accent};">` +
    `<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">${escapeHtml(copy.action)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:8px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">หรือเปิดลิงก์: <a href="${escapeHtml(link)}" style="color:#2563eb;">${escapeHtml(link)}</a></p>` +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">` +
    `อีเมลนี้ส่งอัตโนมัติจากระบบ Fiber Sharing กรุณาอย่าตอบกลับ</td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

module.exports = {
  notificationForTransition, notificationRecipients, deliveryId, emailContent
};
