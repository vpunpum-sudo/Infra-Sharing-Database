const { FieldValue } = require('firebase-admin/firestore');

// Existing transition trigger omits maxAttempts and retains its unlimited retry policy.
async function claimDelivery(db, id, details, {
  maxAttempts, now = Date.now, serverTimestamp = () => FieldValue.serverTimestamp()
} = {}) {
  const ref = db.collection('approvalEmailDeliveries').doc(id);
  const time = typeof now === 'function' ? now() : now;
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (current?.status === 'sent') return 'sent';
    if (maxAttempts !== undefined && current?.attempts >= maxAttempts) return 'exhausted';
    if (current?.status === 'sending' && current.leaseUntil > time) return 'busy';
    transaction.set(ref, {
      ...details, status: 'sending', attempts: (current?.attempts || 0) + 1,
      leaseUntil: time + 10 * 60 * 1000, updatedAt: serverTimestamp()
    }, { merge: true });
    return 'claimed';
  });
  return { ref, result };
}
module.exports = { claimDelivery };
