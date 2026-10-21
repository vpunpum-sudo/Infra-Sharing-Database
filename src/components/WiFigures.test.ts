import test from 'node:test';
import assert from 'node:assert/strict';
import { wiFigureView } from './WiFigures';

test('WI chooses drawing without image or after image load failure', () => {
  assert.equal(wiFigureView({ image: undefined, failed: false }), 'drawing');
  assert.equal(wiFigureView({ image: '/wi/map-overview.png', failed: false }), 'image');
  assert.equal(wiFigureView({ image: '/wi/map-overview.png', failed: true }), 'drawing');
});
