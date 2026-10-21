import test from 'node:test';
import assert from 'node:assert/strict';
import { WI_FIGURES, parseOnlyArg, figureImagePath } from './wiScreenshotFigures';

test('registry has all 19 WI figures and stable output paths', () => {
  assert.equal(WI_FIGURES.length, 19);
  assert.equal(new Set(WI_FIGURES.map(item => item.id)).size, 19);
  assert.equal(figureImagePath('map'), '/wi/map-overview.png');
  assert.equal(figureImagePath('context-menu'), '/wi/route-context-menu.png');
  assert.equal(figureImagePath('login'), '/wi/login.png');
  for (const item of WI_FIGURES) {
    assert.ok(item.screen && item.needs && item.clip && item.markCount > 0, item.id);
  }
});

test('--only selects in registry order and rejects malformed lists', () => {
  assert.deepEqual(parseOnlyArg(undefined).map(item => item.id), WI_FIGURES.map(item => item.id));
  assert.deepEqual(parseOnlyArg('--only=login,dashboard').map(item => item.id), ['login', 'dashboard']);
  assert.deepEqual(parseOnlyArg('--only=dashboard,login').map(item => item.id), ['login', 'dashboard']);
  for (const value of ['--only=foo', '--only=', '--only=login,login']) {
    assert.throws(() => parseOnlyArg(value), /Valid ids:.*login.*dashboard/);
  }
});
