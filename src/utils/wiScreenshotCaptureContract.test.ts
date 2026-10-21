import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFigure, clickSafe, openApprovalSignForm, closeApprovalSignForm, type CaptureContext } from '../../scripts/wi-screenshot-figures';
import { runFigures, SafetyViolation } from './wiScreenshotRun';
import type { Locator, Page } from 'playwright';

function fakeContext(redirect = false): CaptureContext {
  let current = 'http://127.0.0.1:3000/';
  const page = {
    goto: async (url: string) => { current = redirect ? 'http://127.0.0.1:3000/' : url; },
    url: () => current,
    getByRole: () => ({ isVisible: async () => false })
  };
  return { page: page as unknown as CaptureContext['page'], baseUrl: 'http://127.0.0.1:3000',
    projectId: 'sample', tempDir: '/tmp', known: {}, guardTripped: () => false, dialogSeen: () => false };
}

test('route drawing reaches its permission check instead of an unconditional data-state skip', async () => {
  assert.equal((await captureFigure(fakeContext(), 'route-draw')).status, 'skipped: permission');
  assert.equal((await captureFigure(fakeContext(), 'enclosure-form')).status, 'skipped: permission');
});

test('Admin pages redirected to the dashboard are permission skips', async () => {
  for (const id of ['permissions', 'logs'] as const) {
    assert.equal((await captureFigure(fakeContext(true), id)).status, 'skipped: permission');
  }
});

function fakeButton(text: string, aria = ''): { locator: Locator; clicks: () => number } {
  let clicked = 0;
  const locator = {
    first() { return this; },
    evaluate: async (reader: (element: unknown) => string) => reader({
      textContent: text, getAttribute: (name: string) => name === 'aria-label' ? aria : null
    }),
    click: async () => { clicked++; }
  };
  return { locator: locator as unknown as Locator, clicks: () => clicked };
}

test('unsafe signing click aborts before the click or output commit', async () => {
  const submit = fakeButton('✓ ลงนามอนุมัติ');
  let commits = 0;
  const result = await runFigures({ figures: ['dashboard', 'approval-sign', 'logs'], guard: { tripped: false, quietDenied: 0 },
    capture: async id => {
      if (id === 'approval-sign') await clickSafe(submit.locator, 'openSignForm');
      return { id, status: 'captured' };
    },
    commitOutputs: async () => { commits++; }
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.status, 'aborted: safety');
  assert.equal(submit.clicks(), 0);
  assert.equal(commits, 0);
});

test('reading a denied label without clicking does not abort', async () => {
  const submit = fakeButton('✓ ลงนามอนุมัติ');
  let commits = 0;
  const result = await runFigures({ figures: ['approval-sign'], guard: { tripped: false, quietDenied: 0 },
    capture: async id => {
      await submit.locator.evaluate(element => element.textContent);
      return { id, status: 'captured' };
    },
    commitOutputs: async () => { commits++; }
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.results[0].status, 'captured');
  assert.equal(submit.clicks(), 0);
  assert.equal(commits, 1);
});

test('clickSafe uses visible text before aria and rejects empty labels', async () => {
  const safeText = fakeButton('ปิด', 'ลงนามอนุมัติ');
  await clickSafe(safeText.locator, 'closeSignForm');
  assert.equal(safeText.clicks(), 1);
  const empty = fakeButton('');
  await assert.rejects(clickSafe(empty.locator, 'closeSignForm'), SafetyViolation);
  assert.equal(empty.clicks(), 0);
});

function fakeApproval(labels: string[], signerAppears = true) {
  const clicks: string[] = [];
  let approvalOpen = true;
  let signOpen = false;
  const buttons = labels.map(label => ({
    first() { return this; },
    evaluate: async (reader: (element: unknown) => string) => reader({ textContent: label, getAttribute: () => null }),
    isVisible: async () => true,
    click: async () => { clicks.push(label); signOpen = true; }
  }));
  const closeButton = (close: () => void) => ({ first() { return this; },
    evaluate: async (reader: (element: unknown) => string) => reader({ textContent: '', getAttribute: () => 'ปิด' }),
    click: async () => close() });
  const modal = {
    locator: () => ({ count: async () => buttons.length, nth: (index: number) => buttons[index] }),
    isVisible: async () => approvalOpen,
    getByRole: () => closeButton(() => { approvalOpen = false; })
  };
  const signer = { waitFor: async () => { if (!signOpen || !signerAppears) throw new Error('not open'); }, isVisible: async () => signOpen && signerAppears };
  const popup = { last() { return this; }, isVisible: async () => signOpen,
    getByRole: () => closeButton(() => { signOpen = false; }) };
  const page = {
    locator: (selector: string) => selector === '[data-wi-pii="signer-name"]' ? signer : popup,
    keyboard: { press: async (key: string) => { assert.equal(key, 'Escape'); } }
  };
  return { page: page as unknown as Page, modal: modal as unknown as Locator,
    clicks, isApprovalOpen: () => approvalOpen, isSignOpen: () => signOpen };
}

test('approval modal with only denied labels skips and closes without clicking', async () => {
  const app = fakeApproval(['รอลงนามระดับ Planning', 'แก้ไขข้อมูล / ลงนามใหม่', 'ไม่อนุมัติ / ขอแก้ไข']);
  assert.equal(await openApprovalSignForm(app.page, app.modal), 'skipped: data-state');
  assert.deepEqual(app.clicks, []);
  assert.equal(app.isApprovalOpen(), false);
});

test('approval form opens the first exact action button and closes without submitting', async () => {
  const app = fakeApproval(['แก้ไขข้อมูล / ลงนามใหม่', 'ลงนาม Planning (ITEL)', 'ลงนาม O&M (ITEL)', 'อนุมัติ (Approve)']);
  assert.equal(await openApprovalSignForm(app.page, app.modal), 'opened');
  assert.deepEqual(app.clicks, ['ลงนาม Planning (ITEL)']);
  assert.equal(app.isSignOpen(), true);
  await closeApprovalSignForm(app.page, app.modal);
  assert.equal(app.isSignOpen(), false);
  assert.equal(app.isApprovalOpen(), false);
  assert.deepEqual(app.clicks, ['ลงนาม Planning (ITEL)']);
});

test('a sign opener without a visible form reports its specific failure', async () => {
  const app = fakeApproval(['ลงนาม Planning (ITEL)'], false);
  assert.equal(await openApprovalSignForm(app.page, app.modal), 'failed: sign-form-not-opened');
  await closeApprovalSignForm(app.page, app.modal);
  assert.equal(app.isSignOpen(), false);
  assert.equal(app.isApprovalOpen(), false);
});
