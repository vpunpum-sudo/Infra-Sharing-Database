import assert from 'node:assert/strict';
import test from 'node:test';
import { Core, User } from '../types';
import { canChangeTubeOwner, getTubeOwner, validateTubeOwnerUpdates } from './tubeOwnership';

const core = (id: number, owner: Core['owner']): Core => ({
  id, owner, color: 'Blue', status: 'used', label: `T1-C${id}`,
  priority: 'Low', details: ''
});
const user = (role: User['role'], owner: User['owner']): User => ({
  id: 'user', email: 'user@example.com', role, owner, isApproved: true
});

test('a None Tube can be assigned by users from any company', () => {
  const currentOwner = getTubeOwner([core(1, 'None'), core(2, 'None')]);
  for (const company of ['ITEL', 'SYMC', 'UIH'] as const) {
    assert.equal(canChangeTubeOwner(user('Sub-contract', company), currentOwner), true);
  }
});

test('a claimed Tube can be reassigned by its current Owner or Admin/Design', () => {
  const currentOwner = getTubeOwner([core(1, 'SYMC'), core(2, 'SYMC')]);
  assert.equal(canChangeTubeOwner(user('Sub-contract', 'SYMC'), currentOwner), true);
  assert.equal(canChangeTubeOwner(user('Sub-contract', 'ITEL'), currentOwner), false);
  assert.equal(canChangeTubeOwner(user('Admin', 'ITEL'), currentOwner), true);
  assert.equal(canChangeTubeOwner(user('Design', 'UIH'), currentOwner), true);
});

test('a Mixed Tube is editable only by Admin/Design', () => {
  const currentOwner = getTubeOwner([core(1, 'None'), core(2, 'ITEL')]);
  assert.equal(currentOwner, 'Mixed');
  assert.equal(canChangeTubeOwner(user('Sub-contract', 'ITEL'), currentOwner), false);
  assert.equal(canChangeTubeOwner(user('Admin', 'None'), currentOwner), true);
});

test('route edit permission is required', () => {
  assert.equal(canChangeTubeOwner(user('Viewer', 'ITEL'), 'None'), false);
  assert.equal(canChangeTubeOwner(null, 'None'), false);
});

test('save validation lets any company assign a fully unowned Tube', () => {
  const cores = [core(1, 'None'), core(2, 'None')];
  for (const company of ['ITEL', 'SYMC', 'UIH'] as const) {
    assert.doesNotThrow(() => validateTubeOwnerUpdates(cores, [
      { coreId: 1, data: { owner: 'UIH' } },
      { coreId: 2, data: { owner: 'UIH' } }
    ], user('Sub-contract', company), ['ITEL', 'SYMC', 'UIH']));
  }
});

test('save validation rejects reassignment by another company and partial Tube updates', () => {
  const claimed = [core(1, 'SYMC'), core(2, 'SYMC')];
  const updates = claimed.map(item => ({ coreId: item.id, data: { owner: 'UIH' as const } }));
  assert.throws(() => validateTubeOwnerUpdates(claimed, updates,
    user('Sub-contract', 'ITEL'), ['ITEL', 'SYMC', 'UIH']));
  assert.doesNotThrow(() => validateTubeOwnerUpdates(claimed, updates,
    user('Sub-contract', 'SYMC'), ['ITEL', 'SYMC', 'UIH']));
  assert.throws(() => validateTubeOwnerUpdates([core(1, 'None'), core(2, 'SYMC')],
    [{ coreId: 1, data: { owner: 'ITEL' } }], user('Sub-contract', 'ITEL'),
    ['ITEL', 'SYMC', 'UIH']));
  assert.throws(() => validateTubeOwnerUpdates([core(1, 'None'), core(2, 'None')],
    [{ coreId: 1, data: { owner: 'ITEL' } }], user('Sub-contract', 'ITEL'),
    ['ITEL', 'SYMC', 'UIH']));
});
