import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { getRolePermissions } from '../services/rolePermissionsStore';

// Exercise the actual component callbacks without a DOM or Firebase. Each render
// retains hook slots; effects and unrelated child components are deliberately inert.
// This catches wiring bugs that tests of createSingleFlight alone cannot detect.
type Element = React.ReactElement<any>;
type Component = (props: any) => Element;
type Slot = { value: any };
let activeSlots: Slot[];
let cursor = 0;
const hooks = {
  useState(initial: any) {
    const index = cursor++;
    const slot = activeSlots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, (next: any) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  },
  useRef(initial: any) { return hooks.useState(() => ({ current: initial }))[0]; },
  useReducer(reducer: any, initial: any) {
    const [value, setValue] = hooks.useState(initial);
    return [value, (event: any) => setValue((previous: any) => reducer(previous, event))];
  },
  useCallback(callback: any) { return callback; },
  useId() { return hooks.useState('disabled-reason')[0]; },
  useEffect() {}
};

const require = createRequire(import.meta.url);
const result = await build({
  stdin: {
    contents: `export { default as Dashboard } from './ProjectsDashboard';
      export { AsyncActionButton } from './AsyncActionButton';
      export { DashboardHeader } from './DashboardHeader';`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    loader: 'tsx'
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  plugins: [{
    name: 'component-boundaries',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (!args.importer) return;
        if (/^\.\//.test(args.path) && /(?:ProjectsDashboard|AsyncActionButton|DashboardHeader)$/.test(args.path)) return;
        if (/^\.\.\/utils\/(?:asyncAction|pageContext|selection)$/.test(args.path)) return;
        return { path: args.path, external: true };
      });
    }
  }]
});

const user = { uid: 'test-user', email: 'test@example.invalid' };
const appUser = { uid: user.uid, role: 'Admin', displayName: 'Test user' };
let pathname = '/';
let writes: { data: any; resolve: () => void; reject: (error: unknown) => void }[] = [];
let notices: unknown[][] = [];
const Null = () => null;
const stubs = new Proxy({}, { get: () => Null });
const module = { exports: {} as Record<string, Component> };
new Function('require', 'module', 'exports', result.outputFiles[0].text)((id: string) => {
  if (id === 'react') return { ...React, ...hooks };
  if (id === 'react/jsx-runtime' || id === 'lucide-react') return require(id);
  if (id === 'firebase/firestore') return {
    doc: (_db: unknown, path: string) => path,
    setDoc: (_path: string, data: unknown) => new Promise<void>((resolve, reject) => { writes.push({ data, resolve, reject }); })
  };
  if (id === '../firebase') return { db: {}, OperationType: {}, handleFirestoreError: () => {} };
  if (id === '../services/rolePermissionsStore') return { getRolePermissions, useRolePermissions: () => {} };
  if (id === '../services/logService') return { logActivity: async () => {} };
  if (id === './Toast') return { useToast: () => (...args: unknown[]) => notices.push(args) };
  if (id === 'uuid') return { v4: () => `project-${writes.length + 1}` };
  if (id === 'react-router-dom') return { useNavigate: () => (path: string) => { pathname = path; }, useLocation: () => ({ pathname }) };
  if (id === 'motion/react') return { motion: new Proxy({}, { get: (_target, tag) => tag }), AnimatePresence: React.Fragment };
  return stubs;
}, module, module.exports);
const { Dashboard, AsyncActionButton, DashboardHeader } = module.exports;

function mount(component: Component, props: any) {
  const slots: Slot[] = [];
  return () => {
    activeSlots = slots;
    cursor = 0;
    return component(props);
  };
}

function elements(tree: React.ReactNode): Element[] {
  if (!React.isValidElement(tree)) return [];
  const element = tree as Element;
  return [element, ...React.Children.toArray(element.props.children).flatMap(elements)];
}

function find(tree: Element, predicate: (element: Element) => boolean): Element {
  const found = elements(tree).find(predicate);
  assert.ok(found, 'expected element exists');
  return found;
}

function text(tree: React.ReactNode): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!React.isValidElement(tree)) return '';
  return React.Children.toArray((tree as Element).props.children).map(text).join('');
}

function createProject() {
  writes = [];
  notices = [];
  const render = mount(Dashboard, { user, appUser });
  find(render(), el => el.type === 'button' && text(el).trim() === 'สร้างโครงการ').props.onClick();
  find(render(), el => el.type === 'input' && el.props.autoFocus).props.onChange({ target: { value: 'Regression project' } });
  const save = () => find(render(), el => el.type === AsyncActionButton && el.props.pendingLabel === 'กำลังสร้าง…');
  const enter = () => find(render(), el => el.type === 'input' && el.props.autoFocus).props.onKeyDown({ key: 'Enter' });
  return { render, save, enter };
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

for (const first of ['click', 'enter'] as const) {
  test(`project save: ${first} followed by the other entry point writes once and shares pending`, async () => {
    const { save, enter, render } = createProject();
    // Save both handlers before pending renders: this also exercises same-tick activation.
    const click = save().props.onAction;
    const nameEnter = find(render(), el => el.type === 'input' && el.props.autoFocus).props.onKeyDown;
    const routeEnter = find(render(), el => el.type === 'input' && el.props.id === 'project-route-code').props.onKeyDown;
    const clickPromise = first === 'click' ? click() : (nameEnter({ key: 'Enter' }), click());
    nameEnter({ key: 'Enter' });
    routeEnter({ key: 'Enter' });
    enter();
    assert.equal(writes.length, 1);
    assert.equal(save().props.pending, true);
    const button = mount(AsyncActionButton, save().props)();
    assert.equal(button.props.disabled, true);
    assert.equal(button.props['aria-busy'], true);
    assert.equal(text(button), 'กำลังสร้าง…');
    writes[0].resolve();
    await clickPromise;
    await flush();
    assert.equal(notices.filter(([message]) => message === 'สร้างโครงการแล้ว').length, 1);
    assert.equal(elements(render()).some(el => el.type === 'input' && el.props.autoFocus), false);
  });
}

test('project save: keyboard failure preserves inputs, clears pending and allows click retry', async () => {
  const { render, save, enter } = createProject();
  find(render(), el => el.type === 'input' && el.props.id === 'project-route-code').props.onChange({ target: { value: 'TEST-01' } });
  enter();
  writes[0].reject({ code: 'permission-denied' });
  await flush();
  assert.equal(save().props.pending, false);
  assert.equal(find(render(), el => el.type === 'input' && el.props.autoFocus).props.value, 'Regression project');
  assert.equal(find(render(), el => el.type === 'input' && el.props.id === 'project-route-code').props.value, 'TEST-01');
  assert.equal(notices[0][1], 'error');
  const retry = save().props.onAction();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].data.routeCode, 'TEST-01');
  assert.deepEqual(writes[1].data.owners, ['ITEL']);
  writes[1].resolve();
  await retry;
});

test('disabled reasons are visible text associated with the disabled button', () => {
  const tree = mount(AsyncActionButton, {
    disabled: true, disabledReason: 'กรุณากรอกชื่อโครงการ', pendingLabel: 'กำลังสร้าง…', children: 'สร้างโครงการ', onAction() {}
  })();
  const button = find(tree, el => el.type === 'button');
  const reason = find(tree, el => el.props.id === button.props['aria-describedby']);
  assert.equal(text(reason), 'กรุณากรอกชื่อโครงการ');
  assert.doesNotMatch(reason.props.className, /sr-only|hidden/);
  assert.equal(button.props.disabled, true);
});

for (const path of ['/logs', '/settings']) {
  test(`shared navigation: ${path} has one current item on desktop and mobile`, () => {
    pathname = path;
    const render = mount(DashboardHeader, { user, appUser });
    const currentDesktop = elements(render()).filter(el => el.type === 'button' && el.props['aria-current'] === 'page');
    assert.equal(currentDesktop.length, 1);
    assert.equal(text(currentDesktop[0]).trim(), path === '/logs' ? 'ประวัติการใช้งาน' : 'โลโก้ Owner');
    find(render(), el => el.props['aria-label'] === 'เปิดเมนู').props.onClick();
    const menu = find(render(), el => el.props.role === 'menu');
    const currentMobile = elements(menu).filter(el => el.props['aria-current'] === 'page');
    assert.equal(currentMobile.length, 1);
    currentMobile[0].props.onClick();
    assert.equal(elements(render()).some(el => el.props.role === 'menu'), false);
  });
}
