import test from 'node:test';
import assert from 'node:assert/strict';
import { appUserFromDoc } from './appUser';

test('app user identity comes from the document path while profile fields are retained', () => {
  assert.deepEqual(appUserFromDoc('uid-path', {
    id: 'stale-id', email: 'user@example.com', role: 'Planning', owner: 'UIH', isApproved: true
  }), {
    id: 'uid-path', email: 'user@example.com', role: 'Planning', owner: 'UIH', isApproved: true
  });
});
