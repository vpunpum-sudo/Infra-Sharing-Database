import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_TITLE, PROJECT_LOADING_LABEL, isNavActive, resolvePageContext } from './pageContext';

test('constants', () => {
  assert.equal(APP_TITLE, 'Fiber Sharing Database');
  assert.equal(PROJECT_LOADING_LABEL, 'กำลังโหลดโครงการ…');
});

test('dashboard: only โครงการ as the current crumb', () => {
  const ctx = resolvePageContext('/');
  assert.equal(ctx.navId, 'projects');
  assert.equal(ctx.title, 'โครงการ');
  assert.deepEqual(ctx.breadcrumbs, [{ label: 'โครงการ', current: true }]);
});

test('known pages map to title and navId with a two-level breadcrumb', () => {
  const cases: Array<[string, string, string]> = [
    ['/settings', 'ตั้งค่าระบบ', 'settings'],
    ['/user-management', 'จัดการผู้ใช้งาน', 'users'],
    ['/permission-management', 'กำหนดสิทธิ์ตามบทบาท', 'permissions'],
    ['/logs', 'ประวัติการใช้งานระบบ', 'logs'],
    ['/profile', 'โปรไฟล์', 'profile'],
    ['/manual', 'คู่มือการใช้งาน', 'manual'],
    ['/system-summary', 'คู่มือการใช้งาน', 'manual']
  ];
  for (const [path, title, navId] of cases) {
    const ctx = resolvePageContext(path);
    assert.equal(ctx.title, title, path);
    assert.equal(ctx.navId, navId, path);
    assert.deepEqual(ctx.breadcrumbs, [{ label: 'โครงการ', path: '/' }, { label: title, current: true }], path);
  }
});

test('trailing slash is normalized', () => {
  assert.deepEqual(resolvePageContext('/logs/'), resolvePageContext('/logs'));
});

test('workspace uses the project name for the last crumb', () => {
  const ctx = resolvePageContext('/project/abc', { projectName: 'Route A' });
  assert.equal(ctx.navId, 'projects');
  assert.equal(ctx.title, 'Route A');
  assert.deepEqual(ctx.breadcrumbs, [{ label: 'โครงการ', path: '/' }, { label: 'Route A', current: true }]);
});

test('workspace without a loaded name shows the loading label, never the id', () => {
  for (const options of [undefined, {}, { projectName: '' }, { projectName: '   ' }]) {
    const ctx = resolvePageContext('/project/abc', options);
    assert.equal(ctx.title, PROJECT_LOADING_LABEL);
    assert.equal(ctx.breadcrumbs[1].label, PROJECT_LOADING_LABEL);
    assert.ok(!JSON.stringify(ctx).includes('abc'));
    assert.ok(!JSON.stringify(ctx).includes('undefined'));
  }
});

test('only the last crumb is current and it has no path', () => {
  for (const path of ['/', '/settings', '/project/abc']) {
    const crumbs = resolvePageContext(path, { projectName: 'P' }).breadcrumbs;
    crumbs.forEach((c, i) => {
      if (i === crumbs.length - 1) {
        assert.equal(c.current, true);
        assert.equal(c.path, undefined);
      } else {
        assert.notEqual(c.current, true);
      }
    });
  }
});

test('unknown and auth paths give app title and no breadcrumbs', () => {
  for (const path of ['/login', '/pending-approval', '/change-password', '/whatever']) {
    const ctx = resolvePageContext(path);
    assert.equal(ctx.navId, null, path);
    assert.equal(ctx.title, APP_TITLE, path);
    assert.deepEqual(ctx.breadcrumbs, [], path);
  }
});

test('isNavActive matches equal normalized paths', () => {
  assert.equal(isNavActive('/logs', '/logs'), true);
  assert.equal(isNavActive('/logs', '/logs/'), true);
  assert.equal(isNavActive('/logs/', '/logs'), true);
  assert.equal(isNavActive('/logs', '/settings'), false);
  assert.equal(isNavActive('/settings', '/'), false);
});

test('isNavActive treats / as active inside a project workspace only', () => {
  assert.equal(isNavActive('/', '/'), true);
  assert.equal(isNavActive('/', '/project/abc'), true);
  assert.equal(isNavActive('/', '/logs'), false);
  assert.equal(isNavActive('/logs', '/project/abc'), false);
});
