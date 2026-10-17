// Signed approval PDF and KMZ attached to the "approval completed" email.
// The browser of the last signer builds both and records them on
// designApproval.finalDocuments a few seconds after the approval completes.

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // Gmail accepts 25 MB including encoding overhead.

/** Project file ids to attach, PDF first. */
function finalDocumentFileIds(finalDocuments) {
  if (!finalDocuments) return [];
  return [finalDocuments.pdfFileId, finalDocuments.kmzFileId].filter(id => typeof id === 'string' && /^[\w-]{1,100}$/.test(id));
}

/** Keeps files in order while they fit the size limit; reports what was left out. */
function fitAttachments(files, limit = MAX_ATTACHMENT_BYTES) {
  const attached = [];
  const skipped = [];
  let total = 0;
  for (const file of files) {
    if (total + file.size <= limit) { attached.push(file); total += file.size; } else skipped.push(file.name);
  }
  return { attached, skipped };
}

function attachmentNote(attachedNames, skippedNames) {
  if (!attachedNames.length && !skippedNames.length) {
    return 'ดาวน์โหลดเอกสารอนุมัติฉบับลงนามครบและไฟล์ KMZ ได้ที่ ไฟล์โครงการ › เอกสารอนุมัติ';
  }
  const parts = [];
  if (attachedNames.length) parts.push(`แนบไฟล์: ${attachedNames.join(', ')}`);
  if (skippedNames.length) parts.push(`ไฟล์ใหญ่เกินแนบได้ (${skippedNames.join(', ')}) ดาวน์โหลดได้ที่ ไฟล์โครงการ › เอกสารอนุมัติ`);
  return parts.join(' · ');
}

module.exports = { MAX_ATTACHMENT_BYTES, finalDocumentFileIds, fitAttachments, attachmentNote };
