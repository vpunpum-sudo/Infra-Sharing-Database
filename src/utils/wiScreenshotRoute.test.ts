import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRoute } from './wiScreenshotRoute';

test('route selection defaults to the first entry and uses exact trimmed names', () => {
  assert.deepEqual(selectRoute([' A ', 'B']), { ok: true, index: 0 });
  assert.deepEqual(selectRoute([' A ', 'B'], ' B '), { ok: true, index: 1 });
});

test('unknown and ambiguous route names report the found names', () => {
  assert.deepEqual(selectRoute(['A', 'B'], 'C'), { ok: false, error: 'not-found', names: ['A', 'B'] });
  assert.deepEqual(selectRoute(['A', ' A ', 'B'], 'A'), { ok: false, error: 'ambiguous', matches: ['A', ' A '] });
  assert.deepEqual(selectRoute([]), { ok: false, error: 'not-found', names: [] });
});
