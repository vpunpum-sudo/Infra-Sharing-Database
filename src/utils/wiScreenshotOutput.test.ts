import test from 'node:test';
import assert from 'node:assert/strict';
import { commitOutputs, GIT_RECOVERY_COMMAND, planStaleCleanup } from './wiScreenshotOutput';

const tempDir = '/repo/.wi-screenshots-tmp-abc';
const entries = [
  { staged: `${tempDir}/map-overview.png`, target: '/repo/public/wi/map-overview.png' },
  { staged: `${tempDir}/route-context-menu.png`, target: '/repo/public/wi/route-context-menu.png' },
  { staged: `${tempDir}/wiScreenshotMarks.ts`, target: '/repo/src/content/wiScreenshotMarks.ts' }
];

function fakeFs(existing = [true, true, true], failAt = -1, failRestore = false) {
  const files = new Map<string, string>();
  entries.forEach((entry, i) => {
    files.set(entry.staged, `new-${i}`);
    if (existing[i]) files.set(entry.target, `old-${i}`);
  });
  let renameNumber = 0;
  const ops = {
    exists: async (path: string) => files.has(path),
    rename: async (from: string, to: string) => {
      renameNumber++;
      if (renameNumber === failAt || (failRestore && from.endsWith('.bak'))) throw new Error('rename failed');
      const data = files.get(from);
      if (data === undefined) throw new Error(`missing ${from}`);
      files.delete(from);
      files.set(to, data);
    },
    rm: async (path: string) => { files.delete(path); }
  };
  return { files, ops };
}

test('successful commit replaces all outputs and removes backups', async () => {
  const { files, ops } = fakeFs();
  const result = await commitOutputs(entries, ops, tempDir);
  assert.deepEqual(result, { ok: true });
  entries.forEach((entry, i) => assert.equal(files.get(entry.target), `new-${i}`));
  assert.equal([...files.keys()].filter(path => path.endsWith('.bak')).length, 0);
});

test('a dashboard-only commit leaves existing login and map PNGs untouched', async () => {
  const subset = [
    { staged: `${tempDir}/dashboard.png`, target: '/repo/public/wi/dashboard.png' },
    { staged: `${tempDir}/wiScreenshotMarks.ts`, target: '/repo/src/content/wiScreenshotMarks.ts' }
  ];
  const files = new Map([
    [subset[0].staged, 'new-dashboard'], [subset[1].staged, 'merged-marks'],
    [subset[0].target, 'old-dashboard'], [subset[1].target, 'old-marks'],
    ['/repo/public/wi/login.png', 'old-login'],
    ['/repo/public/wi/map-overview.png', 'old-map'],
    ['/repo/public/wi/route-context-menu.png', 'old-context-menu']
  ]);
  const result = await commitOutputs(subset, {
    exists: async path => files.has(path),
    rename: async (from, to) => {
      const data = files.get(from);
      if (data === undefined) throw new Error('missing source');
      files.delete(from); files.set(to, data);
    },
    rm: async path => { files.delete(path); }
  }, tempDir);
  assert.deepEqual(result, { ok: true });
  assert.equal(files.get(subset[0].target), 'new-dashboard');
  assert.equal(files.get(subset[1].target), 'merged-marks');
  assert.equal(files.get('/repo/public/wi/login.png'), 'old-login');
  assert.equal(files.get('/repo/public/wi/map-overview.png'), 'old-map');
  assert.equal(files.get('/repo/public/wi/route-context-menu.png'), 'old-context-menu');
});

for (let step = 1; step <= 6; step++) {
  test(`rename failure at step ${step} restores every original output`, async () => {
    const { files, ops } = fakeFs([true, true, true], step);
    const result = await commitOutputs(entries, ops, tempDir);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.rollback, 'restored');
    entries.forEach((entry, i) => assert.equal(files.get(entry.target), `old-${i}`));
  });
}

test('first run with no PNGs removes partly installed images and restores tracked marks', async () => {
  const { files, ops } = fakeFs([false, false, true], 4);
  const result = await commitOutputs(entries, ops, tempDir);
  assert.equal(result.ok, false);
  assert.equal(files.has(entries[0].target), false);
  assert.equal(files.has(entries[1].target), false);
  assert.equal(files.get(entries[2].target), 'old-2');
});

test('failed rollback keeps backups and reports the git recovery command', async () => {
  const { files, ops } = fakeFs([true, true, true], 5, true);
  const result = await commitOutputs(entries, ops, tempDir);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rollback, 'failed');
    assert.equal(result.tempDir, tempDir);
    assert.equal(result.recoveryHint, GIT_RECOVERY_COMMAND);
    assert.ok(result.backups.some(path => path.endsWith('.bak')));
  }
  assert.ok([...files.keys()].some(path => path.endsWith('.bak')));
});

test('stale cleanup matches only temporary directories', () => {
  assert.deepEqual(planStaleCleanup([
    { name: '.wi-screenshots-tmp-abc', isDirectory: true },
    { name: '.wi-screenshots-tmpfoo', isDirectory: true },
    { name: '.wi-screenshots-tmp-file', isDirectory: false },
    { name: 'other', isDirectory: true }
  ]), ['.wi-screenshots-tmp-abc']);
});
