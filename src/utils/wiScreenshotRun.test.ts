import test from 'node:test';
import assert from 'node:assert/strict';
import { runFigures, SafetyViolation, type FigureResult } from './wiScreenshotRun';

const captured = (id: string): FigureResult => ({ id, status: 'captured' });
test('block during a figure or just before commit aborts without writing', async () => {
  for (const at of [3, 6]) {
    const guard = { tripped: false, quietDenied: 0 };
    let commits = 0;
    const result = await runFigures({ figures: ['a', 'b', 'c', 'd', 'e'], guard,
      capture: async (id, index) => { if (index === at - 1) { guard.tripped = true; throw new SafetyViolation('blocked'); } return captured(id); },
      beforeCommit: async () => { if (at === 6) guard.tripped = true; },
      commitOutputs: async () => { commits += 1; }
    });
    assert.equal(result.status, 'aborted: guard');
    assert.equal(result.exitCode, 1);
    assert.equal(commits, 0);
  }
});

test('quiet denies do not trip; captured figures commit once', async () => {
  const guard = { tripped: false, quietDenied: 0 };
  const writes: string[][] = [];
  const result = await runFigures({ figures: ['dashboard', 'card-actions'], guard,
    capture: async id => { guard.quietDenied += 1; return captured(id); },
    commitOutputs: async figures => { writes.push(figures.map(item => item.id)); }
  });
  assert.deepEqual(writes, [['dashboard', 'card-actions']]);
  assert.equal(result.quietDenied, 2);
  assert.equal(result.exitCode, 0);
});

test('quiet deny followed by block prevents all writes', async () => {
  const guard = { tripped: false, quietDenied: 0 };
  let commits = 0;
  const result = await runFigures({ figures: ['dashboard', 'other'], guard,
    capture: async (id, index) => { if (index === 0) guard.quietDenied++; else guard.tripped = true; return captured(id); },
    commitOutputs: async () => { commits++; }
  });
  assert.equal(result.status, 'aborted: guard');
  assert.equal(commits, 0);
});

test('a failure aborts the selected run and preserves earlier staged outputs', async () => {
  const writes: string[][] = [];
  const results: FigureResult[] = [captured('a'), { id: 'b', status: 'skipped: permission' }, { id: 'c', status: 'failed: mask-required:user' }];
  const run = () => runFigures({ figures: ['a', 'b', 'c'], guard: { tripped: false, quietDenied: 0 },
    capture: async (_id, index) => results[index], commitOutputs: async figures => { writes.push(figures.map(item => item.id)); } });
  const failed = await run();
  assert.equal(failed.status, 'aborted: safety');
  assert.equal(failed.exitCode, 1);
  assert.deepEqual(writes, []);
  results[2] = { id: 'c', status: 'skipped: data-state' };
  assert.equal((await run()).exitCode, 0);
  assert.deepEqual(writes, [['a']]);
});

test('non-Admin views and an unavailable signature are skipped without writes', async () => {
  const figures = ['users', 'permissions', 'settings', 'logs', 'approval-sign'];
  const writes: string[][] = [];
  const result = await runFigures({ figures, guard: { tripped: false, quietDenied: 0 },
    capture: async id => ({ id, status: id === 'approval-sign' ? 'skipped: data-state' : 'skipped: permission' }),
    commitOutputs: async captured => { writes.push(captured.map(item => item.id)); }
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.results.map(item => item.status), [
    'skipped: permission', 'skipped: permission', 'skipped: permission', 'skipped: permission', 'skipped: data-state'
  ]);
  assert.deepEqual(writes, []);
});

test('safety errors have safety status and do not print raw error details', async () => {
  const printed: string[] = [];
  const original = console.error;
  console.error = (message: string) => { printed.push(message); };
  try {
    const result = await runFigures({ figures: ['a'], guard: { tripped: false, quietDenied: 0 },
      capture: async () => { throw new SafetyViolation('blocked token-value'); },
      commitOutputs: async () => { throw new Error('must not commit'); } });
    assert.equal(result.status, 'aborted: safety');
    assert.deepEqual(printed, ['Run error: capture aborted']);
  } finally { console.error = original; }
});
