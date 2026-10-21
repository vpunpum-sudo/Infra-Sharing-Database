import { type Page, type Locator } from 'playwright';
import { join } from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { assertAllowedAction, assertAllowedPath, assertSafeClickLabel, matchesActionExactLabel, missingMenuItems, REQUIRED_MENU_ITEMS } from '../src/utils/wiScreenshotActions';
import { WI_FIGURES, figureImagePath, type FigureId } from '../src/utils/wiScreenshotFigures';
import { WI_MASK_SPECS, type MaskSpec, type PageSnapshot } from '../src/utils/wiScreenshotMaskSpec';
import { checkMaskResult, WI_MASK_PLACEHOLDERS } from '../src/utils/wiScreenshotMaskSpec';
import { candidateFractions, validateClickPoint, type Point, type Rect } from '../src/utils/wiScreenshotPoint';
import { evaluateRouteReadiness, routeReadinessMessage, type ReadinessSample } from '../src/utils/wiScreenshotReadiness';
import { selectRoute } from '../src/utils/wiScreenshotRoute';
import { toPercentMarks, stackParts, type Mark, type MarkBox } from '../src/utils/wiScreenshotMarks';
import { SafetyViolation, type FigureResult } from '../src/utils/wiScreenshotRun';
import type { KnownValues } from '../src/utils/wiScreenshotRedact';
import { captureCheckedScreenshot } from '../src/utils/wiScreenshotCaptureCheck';
const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const fail = (message: string): never => { throw new Error(message); };
const PROJECT_PATH = (id: string) => `/project/${encodeURIComponent(id)}`;

async function samplePoint(page: Page, routeId: string, fraction: number): Promise<{ point: Point; area: Parameters<typeof validateClickPoint>[1]; routeAtPoint: boolean }> {
  return page.evaluate(({ routeId, fraction }) => {
    const routeClass = `wi-route-${CSS.escape(routeId)}`;
    const visible = document.querySelector<SVGPathElement>(`.leaflet-overlay-pane .wi-route-line.${routeClass}`);
    if (!visible) throw new Error('selected route path disappeared');
    const local = visible.getPointAtLength(Math.max(0, Math.min(1, fraction)) * visible.getTotalLength());
    const ctm = visible.getScreenCTM();
    if (!ctm) throw new Error('route path has no screen transform');
    const mapped = local.matrixTransform(ctm);
    const point = { x: mapped.x, y: mapped.y };
    const map = document.querySelector<HTMLElement>('.leaflet-container');
    if (!map) throw new Error('map disappeared');
    const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const excluded = [
      ['sidebar', '.glass-panel'],
      ['toggle', 'button[aria-label="Collapse Sidebar"], button[aria-label="Expand Sidebar"]'],
      ['control', '.leaflet-control-container'],
      ['map-tools', 'button[aria-label="Focus all objects"]'],
      ['header', 'header'],
      ['toolbar', '.wi-toolbar']
    ].flatMap(([name, selector]) => [...document.querySelectorAll(selector)]
      .filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map(element => ({ name, rect: rect(element) })));
    const target = document.elementFromPoint(point.x, point.y);
    const routeAtPoint = !!target?.matches(`.leaflet-overlay-pane .wi-route-line.${routeClass}, .leaflet-overlay-pane .wi-route-hit.${routeClass}`);
    return { point, area: { mapRect: rect(map), viewport: { width: innerWidth, height: innerHeight }, excluded, margin: 4 }, routeAtPoint };
  }, { routeId, fraction });
}

async function checkedPoint(page: Page, routeId: string, fraction: number): Promise<{ point: Point; reason?: string }> {
  const data = await samplePoint(page, routeId, fraction);
  const geometry = validateClickPoint(data.point, data.area);
  if (geometry.ok === false) return { point: data.point, reason: geometry.reason };
  if (!data.routeAtPoint) return { point: data.point, reason: 'another element covers the route' };
  return { point: data.point };
}

async function waitForSettle(page: Page, selector: string, capMs: number, failure: string): Promise<void> {
  const start = Date.now();
  let previous = '';
  let stableSince = 0;
  while (Date.now() - start < capMs) {
    const current = await page.evaluate(selector => {
      const map = document.querySelector('.leaflet-container');
      const pane = document.querySelector<HTMLElement>('.leaflet-map-pane');
      const path = document.querySelector(selector);
      if (!map || !pane || !path || map.classList.contains('leaflet-zoom-anim')) return '';
      const r = path.getBoundingClientRect();
      return [pane.style.transform, r.x, r.y, r.width, r.height].join('|');
    }, selector);
    if (current && current === previous) {
      if (Date.now() - stableSince >= 500) return;
    } else { previous = current; stableSince = Date.now(); }
    await wait(100);
  }
  fail(failure);
}

async function waitForTiles(page: Page): Promise<void> {
  const start = Date.now();
  let unloaded = 0;
  while (Date.now() - start < 20_000) {
    const state = await page.evaluate(() => {
      const map = document.querySelector('.leaflet-container')?.getBoundingClientRect();
      const tiles = [...document.querySelectorAll<HTMLImageElement>('.leaflet-tile')].filter(tile => {
        const r = tile.getBoundingClientRect();
        return !!map && r.width > 0 && r.height > 0 && r.right > map.left && r.left < map.right && r.bottom > map.top && r.top < map.bottom;
      });
      return { unloaded: tiles.filter(tile => !tile.classList.contains('leaflet-tile-loaded')).length,
        error: tiles.some(tile => tile.classList.contains('leaflet-tile-error')) };
    });
    unloaded = state.unloaded;
    if (state.error) fail(`map tiles did not finish loading within 20s (${unloaded} unloaded tiles; tile error)`);
    if (!unloaded) return;
    await wait(200);
  }
  fail(`map tiles did not finish loading within 20s (${unloaded} unloaded tiles)`);
}

async function box(page: Page, selector: string, last = false): Promise<Rect | undefined> {
  // A short wait: a missing target should fail the figure quickly, not hold it for Playwright's 30 s default.
  return (last ? page.locator(selector).last() : page.locator(selector).first()).evaluate(element => {
    const r = element.getBoundingClientRect();
    return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : undefined;
  }, undefined, { timeout: 3_000 }).catch(() => undefined);
}

async function assertPanelsAbsent(page: Page): Promise<void> {
  const core = await page.locator('div.fixed.top-0.right-0.h-screen').isVisible().catch(() => false);
  const splice = await page.getByRole('heading', { name: /^Enclosure:/ }).isVisible().catch(() => false);
  if (core || splice) fail('Core Manager or Splice Manager panel is unexpectedly visible');
}

async function firstSidebarEntry(page: Page, section: 'Routes' | 'Enclosures', prefix: string): Promise<Locator | undefined> {
  const entry = page.locator(`li[id^="${prefix}"]`).first();
  if (!await entry.count()) {
    const heading = page.locator('.glass-panel button').filter({ has: page.locator('span.uppercase').getByText(section, { exact: true }) }).first();
    if (!await heading.count()) return undefined;
    await clickSafe(heading, section === 'Routes' ? 'expandRoutesList' : 'expandEnclosuresList');
  }
  return await entry.waitFor({ state: 'visible', timeout: 20_000 }).then(() => entry, () => undefined);
}

/** Pages render after navigation, so an element counts as missing only after a bounded wait. */
const visibleWithin = (target: Locator, ms = 10_000) => target.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

/** The project page streams data in after navigation: wait for the map, the sidebar lists, the routes and the tiles. */
async function waitProjectReady(page: Page): Promise<boolean> {
  if (!await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)) return false;
  const routesHeader = page.locator('.glass-panel button').filter({ has: page.locator('span.uppercase').getByText('Routes', { exact: true }) }).first();
  if (!await routesHeader.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)) return false;
  await page.locator('.leaflet-overlay-pane .wi-route-line').first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  await waitForTiles(page).catch(() => undefined);
  return true;
}

export type CapturedFigure = FigureResult & { marks?: Mark[]; staged?: string };
export type CaptureContext = {
  page: Page;
  baseUrl: string;
  projectId: string;
  routeName?: string;
  tempDir: string;
  known: KnownValues;
  guardTripped: () => boolean;
  dialogSeen: () => boolean;
};

function checkSafety(ctx: CaptureContext): void {
  if (ctx.guardTripped()) throw new SafetyViolation('Network write blocked');
  if (ctx.dialogSeen()) throw new SafetyViolation('Native dialog appeared');
}

async function goto(ctx: CaptureContext, path: string): Promise<void> {
  try { assertAllowedAction('goto'); assertAllowedPath(path); }
  catch { throw new SafetyViolation('Disallowed navigation'); }
  await ctx.page.goto(new URL(path, ctx.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  checkSafety(ctx);
  if (new URL(ctx.page.url()).pathname !== path) throw new Error(`redirected from ${path}`);
}

export async function clickSafe(target: Locator, action: string): Promise<void> {
  try { assertAllowedAction(action); }
  catch { throw new SafetyViolation('Disallowed action'); }
  const label = await target.first().evaluate(element => element.textContent?.trim() || element.getAttribute('aria-label') || '');
  try { assertSafeClickLabel(label, action); }
  catch { throw new SafetyViolation('Disallowed click label'); }
  await target.first().click();
}

const approvalModal = (page: Page) => page.locator('div.fixed:has(h2:has-text("FIBER INFRA SHARING")) > div').first();
const signerName = (page: Page) => page.locator('[data-wi-pii="signer-name"]');

async function closeApprovalModal(page: Page, modal: Locator): Promise<void> {
  assertAllowedAction('pressEscape');
  await page.keyboard.press('Escape');
  if (await modal.isVisible().catch(() => false)) await clickSafe(modal.getByRole('button', { name: 'ปิด', exact: true }).first(), 'closePopup');
  if (await modal.isVisible().catch(() => false)) throw new Error('approval modal did not close');
}

export async function openApprovalSignForm(page: Page, modal: Locator): Promise<'opened' | 'skipped: data-state' | 'failed: sign-form-not-opened'> {
  const buttons = modal.locator('button');
  for (let index = 0; index < await buttons.count(); index++) {
    const button = buttons.nth(index);
    const label = await button.evaluate(element => element.textContent?.trim() || element.getAttribute('aria-label') || '');
    if (!matchesActionExactLabel(label, 'openSignForm') || !await button.isVisible().catch(() => false)) continue;
    await clickSafe(button, 'openSignForm');
    console.log('approval-sign action: openSignForm');
    try { await signerName(page).waitFor({ state: 'visible', timeout: 10_000 }); }
    catch { return 'failed: sign-form-not-opened'; }
    return 'opened';
  }
  await closeApprovalModal(page, modal);
  return 'skipped: data-state';
}

export async function closeApprovalSignForm(page: Page, modal: Locator): Promise<void> {
  assertAllowedAction('pressEscape');
  await page.keyboard.press('Escape');
  const popup = page.locator('div.fixed:has(h3:has-text("ลงนามอนุมัติ")) > div').last();
  if (await popup.isVisible().catch(() => false)) {
    await clickSafe(popup.getByRole('button', { name: 'ปิด', exact: true }).first(), 'closeSignForm');
  }
  if (await popup.isVisible().catch(() => false) || await signerName(page).isVisible().catch(() => false)) throw new Error('signing form did not close');
  console.log('approval-sign action: closeSignForm');
  await closeApprovalModal(page, modal);
}

/** The browser mutation is display-only. It never dispatches input/change events. */
async function maskPage(ctx: CaptureContext, spec: MaskSpec, mutate = true): Promise<string | undefined> {
  // Functions cannot cross into the page, so the numbered placeholders are built here.
  const placeholders = {
    name1: WI_MASK_PLACEHOLDERS.name(1),
    email1: WI_MASK_PLACEHOLDERS.email(1),
    names: Array.from({ length: 999 }, (_, i) => WI_MASK_PLACEHOLDERS.name(i + 1)),
    emails: Array.from({ length: 999 }, (_, i) => WI_MASK_PLACEHOLDERS.email(i + 1))
  };
  const snapshot = await ctx.page.evaluate(({ spec, sampleId, placeholders, mutate }): PageSnapshot => {
    const regions: PageSnapshot['regions'] = {};
    for (const region of spec.regions) {
      const elements = [...document.querySelectorAll<HTMLElement>(region.selector)];
      regions[region.name] = { matches: elements.length, values: [], imageMasked: [], maskValid: [] };
      for (const [index, element] of elements.entries()) {
        const row = Math.min(index + 1, 999);
        const replacement = region.placeholder === placeholders.name1 ? placeholders.names[row - 1]
          : region.placeholder === placeholders.email1 ? placeholders.emails[row - 1] : region.placeholder;
        if (region.kind === 'hide') {
          if (mutate && element.dataset.wiProjectId !== sampleId) {
            element.textContent = '';
            element.style.display = 'none';
          }
          if (element.dataset.wiProjectId !== sampleId) regions[region.name].maskValid!.push(getComputedStyle(element).display === 'none');
          continue;
        }
        if (region.kind === 'image') {
          const images = element.matches('img,canvas,svg') ? [element] : [...element.querySelectorAll<HTMLElement>('img,canvas,svg')];
          for (const image of images) {
            if (mutate) {
              image.setAttribute('data-wi-masked', '1');
              image.style.visibility = 'hidden';
              const cover = document.createElement('div');
              cover.textContent = 'ปิดบังรูปภาพ';
              cover.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#e2e8f0;color:#334155;font-size:12px;z-index:9999;';
              const parent = image.parentElement;
              if (parent) { parent.style.position = 'relative'; parent.appendChild(cover); }
            }
            regions[region.name].imageMasked!.push(image.getAttribute('data-wi-masked') === '1' && getComputedStyle(image).visibility === 'hidden');
          }
          continue;
        }
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          // An empty field stays empty; only its example text is replaced.
          if (mutate) { if (element.value) element.value = replacement || ''; element.placeholder = replacement || ''; }
        } else if (mutate) {
          element.textContent = replacement || '';
        }
        if (mutate) for (const attr of ['title', 'alt', 'aria-label']) if (element.hasAttribute(attr)) element.setAttribute(attr, replacement || '');
        const actual = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : element.textContent?.trim() || '';
        regions[region.name].values.push(actual);
        const emptyField = (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && !actual && element.placeholder === (replacement || '');
        regions[region.name].maskValid!.push(emptyField || actual === (replacement || ''));
      }
    }
    return {
      bodyText: document.body.innerText,
      inputs: [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')].flatMap(element => [element.value, element.placeholder]),
      attrs: [...document.querySelectorAll<HTMLElement>('[title],[alt],[aria-label]')].flatMap(element => ['title', 'alt', 'aria-label'].map(name => element.getAttribute(name) || '')),
      regions
    };
  }, { spec, sampleId: ctx.projectId, placeholders, mutate });
  return checkMaskResult(snapshot, spec, ctx.known)[0];
}

async function measuredMarks(page: Page, targets: readonly string[], clip: Rect, names = targets): Promise<{ marks: Mark[]; error?: string }> {
  const boxes: MarkBox[] = [];
  for (const [index, selector] of targets.entries()) boxes.push({ name: names[index], box: await box(page, selector), anchor: 'top-left' });
  const result = toPercentMarks(boxes, clip, []);
  if (result.kept.length) return { marks: [], error: `${result.kept[0]} not measurable` };
  for (const warning of result.warnings) console.warn(warning);
  return { marks: result.marks };
}

async function screenshot(ctx: CaptureContext, id: FigureId, targets: readonly string[], crop?: string): Promise<CapturedFigure> {
  checkSafety(ctx);
  const maskError = await maskPage(ctx, WI_MASK_SPECS[id]);
  if (maskError) return { id, status: `failed: ${maskError}` };
  const clip = crop ? await box(ctx.page, crop, id === 'approval-sign') : { x: 0, y: 0, width: 1440, height: 900 };
  if (!clip) return { id, status: 'failed: crop not measurable' };
  const measured = await measuredMarks(ctx.page, targets, clip);
  if (measured.error) return { id, status: `failed: ${measured.error}` };
  if (measured.marks.length !== WI_FIGURES.find(item => item.id === id)!.markCount) return { id, status: 'failed: mark count mismatch' };
  const staged = join(ctx.tempDir, figureImagePath(id).split('/').at(-1)!);
  const captured = await captureCheckedScreenshot(
    () => ctx.page.screenshot({ path: staged, clip, animations: 'disabled' }),
    () => maskPage(ctx, WI_MASK_SPECS[id], false),
    () => rm(staged, { force: true }));
  if (captured.ok === false) return { id, status: `failed: ${captured.error}` };
  checkSafety(ctx);
  return { id, status: 'captured', marks: measured.marks, staged };
}

const MARK_TARGETS: Partial<Record<FigureId, readonly string[]>> = {
  login: ['#login-email', '#login-password', 'button:has-text("ลืมรหัสผ่าน")', 'form:has(#login-email) button[type="submit"]'],
  dashboard: ['header nav', 'input[aria-label="ค้นหาชื่อโครงการหรือรหัสเส้นทาง"]', 'button:has-text("ทั้งหมด")', 'button:has-text("สร้างโครงการ")', '[data-wi-project-id]:visible', '[data-wi-project-id]:visible .card-action'],
  'card-actions': ['[data-wi-project-id]:visible button:has-text("แผนงาน")', '[data-wi-project-id]:visible button:has-text("ไฟล์โครงการ")', '[data-wi-project-id]:visible button:has-text("Export KMZ")', '[data-wi-project-id]:visible button:has-text("เปิดแผนที่")', '[data-wi-project-id]:visible button[aria-label="แก้ไขโครงการ"]', '[data-wi-project-id]:visible button[aria-label="ลบโครงการ"]'],
  'project-form': ['label:has-text("ชื่อโครงการ") + input', '#project-route-code', 'div.fixed:has(#project-route-code) .grid.grid-cols-3', 'div.fixed:has(#project-route-code) button:has-text("สร้างโครงการ")'],
  'enclosure-form': ['input[placeholder="e.g., SN-001"]', 'select:has(option:has-text("Keep clicked location"))', 'select:has(option:text-is("Select Type"))', 'select:has(option:has-text("Select Location Type"))', 'input[placeholder="e.g., 13.7563"]', 'button:has-text("Save Enclosure")'],
  'core-manager': ['select:has(option:has-text("Owner"))', 'select:has(option:has-text("Priority"))', 'text=Enclosure span for Tube Priority', 'text=Owner', 'text=Status', 'button:has-text("Confirm Changes?")'],
  splice: ['text=Fiber A', 'text=Fiber B', 'text=Core', 'svg', 'button:has-text("Splice")', 'button:has-text("Export Diagram as PDF")'],
  files: ['button:has-text("สร้างโฟลเดอร์")', 'button:has-text("เพิ่มไฟล์")', 'nav[aria-label="ตำแหน่งโฟลเดอร์"]', 'section[role="dialog"] ul li', 'section[role="dialog"] li:has(svg)', 'section[role="dialog"] button[title="ดาวน์โหลด"]'],
  schedule: ['section[role="dialog"] header', '.schedule-plan', 'section[role="dialog"] .grid.grid-cols-2', 'section[role="dialog"] input[aria-label="ชื่องาน"]', '[data-wi-pii="task-owner"]', '#schedule-progress'],
  'approval-request': ['[data-wi-pii="approval-company"]', 'text=กำหนดการติดตั้ง', 'text=บันทึกประกอบ', 'text=ตัวอย่างเอกสาร', 'button:has-text("ส่งคำขออนุมัติแบบ")'],
  'approval-sign': ['div.fixed:has([data-wi-pii="signer-name"]) h3:has-text("ลงนามอนุมัติ")', '[data-wi-pii="signer-name"]', '[data-wi-pii="signer-position"]', '[data-wi-pii="signature-pad"]', 'div.fixed:has([data-wi-pii="signer-name"]) button:has-text("อนุมัติ (Approve)")', 'div.fixed:has([data-wi-pii="signer-name"]) button:has-text("ไม่อนุมัติ / ขอแก้ไข")'],
  users: ['input[name="new-user-email"]', 'select >> nth=0', 'select >> nth=1', 'button:has-text("Add User")', 'button:text-is("Approved")', 'button[title="Edit User"]'],
  permissions: ['table th', 'table th:nth-child(2)', 'table td label:has(input[type="checkbox"])', 'button:has-text("Save Changes")'],
  settings: ['button:has-text("Enclosure Types")', 'text=Enclosure Types', 'input', 'label[for="icon-upload"]', 'button:has-text("บันทึก")'],
  logs: ['th:has-text("Timestamp")', 'th:has-text("User")', 'th:has-text("Action")', 'th:has-text("Description")']
};

async function openDashboardCard(ctx: CaptureContext): Promise<Locator> {
  await goto(ctx, '/');
  const card = ctx.page.locator(`[data-wi-project-id="${ctx.projectId}"]`);
  await card.waitFor({ state: 'visible', timeout: 20_000 });
  const name = await card.locator('h3').first().textContent();
  if (!name?.trim()) throw new Error('sample project name unavailable');
  await ctx.page.getByRole('textbox', { name: 'ค้นหาชื่อโครงการหรือรหัสเส้นทาง' }).fill(name.trim());
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  return card;
}

async function composite(ctx: CaptureContext, id: FigureId, parts: { png: Buffer; width: number; height: number; marks: Mark[] }[]): Promise<CapturedFigure> {
  const geometry = stackParts(parts);
  const encoded = await ctx.page.evaluate(async input => {
    const canvas = document.createElement('canvas');
    canvas.width = input.width;
    canvas.height = input.height;
    const painter = canvas.getContext('2d');
    if (!painter) throw new Error('composite canvas unavailable');
    let y = 0;
    for (const part of input.parts) {
      const image = new Image();
      image.src = part.data;
      await image.decode();
      painter.drawImage(image, 0, y);
      y += part.height;
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width: geometry.width, height: geometry.height, parts: parts.map(part => ({ data: `data:image/png;base64,${part.png.toString('base64')}`, height: part.height })) });
  const staged = join(ctx.tempDir, figureImagePath(id).split('/').at(-1)!);
  await writeFile(staged, Buffer.from(encoded, 'base64'));
  checkSafety(ctx);
  return { id, status: 'captured', staged, marks: geometry.marks };
}

async function captureProfile(ctx: CaptureContext): Promise<CapturedFigure> {
  await goto(ctx, '/');
  if (!await visibleWithin(ctx.page.locator('[data-wi-pii="account-name"]'), 15_000)) return { id: 'profile', status: 'failed: account name not shown' };
  const headerSpec = { regions: WI_MASK_SPECS.profile.regions.filter(region => region.name === 'account-name' || region.name === 'account-avatar') };
  const firstMask = await maskPage(ctx, headerSpec);
  if (firstMask) return { id: 'profile', status: `failed: ${firstMask}` };
  const headClip = { x: 0, y: 0, width: 1440, height: 64 };
  const headMarks = await measuredMarks(ctx.page, ['[data-wi-pii="account-name"]', 'header button[aria-label="Toggle theme"]', 'header button[aria-label="ออกจากระบบ"]'], headClip);
  if (headMarks.error) return { id: 'profile', status: `failed: ${headMarks.error}` };
  const headShot = await captureCheckedScreenshot(
    () => ctx.page.screenshot({ clip: headClip, animations: 'disabled' }),
    () => maskPage(ctx, headerSpec, false));
  if (headShot.ok === false) return { id: 'profile', status: `failed: ${headShot.error}` };
  const headPng = headShot.value;
  await goto(ctx, '/profile');
  if (!await visibleWithin(ctx.page.locator('[data-wi-pii="profile-display-name"]'), 15_000)) return { id: 'profile', status: 'failed: profile form not shown' };
  const profileSpec = { regions: WI_MASK_SPECS.profile.regions.filter(region => !['account-name', 'account-avatar'].includes(region.name)) };
  const profileMask = await maskPage(ctx, profileSpec);
  if (profileMask) return { id: 'profile', status: `failed: ${profileMask}` };
  const bodyClip = { x: 0, y: 64, width: 1440, height: 836 };
  const bodyMarks = await measuredMarks(ctx.page, ['[data-wi-pii="profile-display-name"]', 'text=Security & Password'], bodyClip);
  if (bodyMarks.error) return { id: 'profile', status: `failed: ${bodyMarks.error}` };
  const bodyShot = await captureCheckedScreenshot(
    () => ctx.page.screenshot({ clip: bodyClip, animations: 'disabled' }),
    () => maskPage(ctx, profileSpec, false));
  if (bodyShot.ok === false) return { id: 'profile', status: `failed: ${bodyShot.error}` };
  const bodyPng = bodyShot.value;
  return composite(ctx, 'profile', [
    { png: headPng, width: 1440, height: 64, marks: headMarks.marks },
    { png: bodyPng, width: 1440, height: 836, marks: bodyMarks.marks }
  ]);
}

async function captureRouteDraw(ctx: CaptureContext): Promise<CapturedFigure> {
  await goto(ctx, PROJECT_PATH(ctx.projectId));
  const page = ctx.page;
  if (!await waitProjectReady(page)) return { id: 'route-draw', status: 'failed: project did not load' };
  const tool = page.getByRole('button', { name: 'Route', exact: true });
  if (!await visibleWithin(tool)) return { id: 'route-draw', status: 'skipped: permission' };
  await clickSafe(tool, 'openRouteDraft');
  const map = await box(page, '.leaflet-container');
  if (!map) return { id: 'route-draw', status: 'skipped: data-state' };
  const points = [{ x: map.x + map.width * .56, y: map.y + map.height * .35 }, { x: map.x + map.width * .61, y: map.y + map.height * .38 }, { x: map.x + map.width * .66, y: map.y + map.height * .40 }];
  const free = await page.evaluate(points => points.every(point => {
    const target = document.elementFromPoint(point.x, point.y);
    return !!target?.closest('.leaflet-container') && !target.closest('.wi-route-line,.wi-route-hit,.leaflet-control-container,.glass-panel');
  }), points);
  if (!free) return { id: 'route-draw', status: 'skipped: data-state' };
  assertAllowedAction('leftClickPoint');
  for (const point of points) await page.mouse.click(point.x, point.y);
  const finish = page.getByRole('button', { name: 'Finish Drawing', exact: true });
  const finishBox = await finish.boundingBox();
  if (!finishBox) return { id: 'route-draw', status: 'failed: Finish Drawing not measurable' };
  const firstClip = { x: 0, y: 0, width: 1440, height: 900 };
  const firstMarks = toPercentMarks([
    { name: 'draft points', box: { x: points[0].x, y: points[0].y, width: 1, height: 1 }, anchor: 'top-left' },
    { name: 'Finish Drawing', box: finishBox, anchor: 'top-left' }
  ], firstClip, []);
  if (firstMarks.kept.length) return { id: 'route-draw', status: `failed: ${firstMarks.kept[0]} not measurable` };
  const firstMask = await maskPage(ctx, WI_MASK_SPECS['route-draw']);
  if (firstMask) return { id: 'route-draw', status: `failed: ${firstMask}` };
  const firstShot = await captureCheckedScreenshot(
    () => page.screenshot({ clip: firstClip, animations: 'disabled' }),
    () => maskPage(ctx, WI_MASK_SPECS['route-draw'], false));
  if (firstShot.ok === false) return { id: 'route-draw', status: `failed: ${firstShot.error}` };
  const firstPng = firstShot.value;
  await clickSafe(finish, 'finishRouteDraft');
  const modal = page.locator('div.fixed:has(button:has-text("Save Route")) .glass-panel').first();
  if (!await visibleWithin(modal)) return { id: 'route-draw', status: 'failed: route form unavailable' };
  const secondMask = await maskPage(ctx, WI_MASK_SPECS['route-draw']);
  if (secondMask) return { id: 'route-draw', status: `failed: ${secondMask}` };
  const secondClip = { x: 0, y: 0, width: 1440, height: 900 };
  const secondMarks = await measuredMarks(page, ['input[placeholder="e.g., Main Backbone"]', 'label:text-is("Capacity / Fiber Type") + select', 'select:has(option:has-text("Tier 1"))', 'input[placeholder="0"]'], secondClip,
    ['Route Name', 'Capacity / Fiber Type', 'Tier and Operator', 'Mark Length']);
  if (secondMarks.error) return { id: 'route-draw', status: `failed: ${secondMarks.error}` };
  const secondShot = await captureCheckedScreenshot(
    () => page.screenshot({ clip: secondClip, animations: 'disabled' }),
    () => maskPage(ctx, WI_MASK_SPECS['route-draw'], false));
  if (secondShot.ok === false) return { id: 'route-draw', status: `failed: ${secondShot.error}` };
  const secondPng = secondShot.value;
  await clickSafe(modal.getByRole('button', { name: 'Cancel', exact: true }), 'cancelDraft');
  await clickSafe(page.getByRole('button', { name: 'Cancel', exact: true }), 'cancelDraft');
  if (await page.getByRole('button', { name: 'Finish Drawing', exact: true }).isVisible().catch(() => false)) return { id: 'route-draw', status: 'failed: draft remained after cancel' };
  return composite(ctx, 'route-draw', [
    { png: firstPng, width: 1440, height: 900, marks: firstMarks.marks },
    { png: secondPng, width: 1440, height: 900, marks: secondMarks.marks }
  ]);
}

async function captureEnclosureForm(ctx: CaptureContext): Promise<CapturedFigure> {
  await goto(ctx, PROJECT_PATH(ctx.projectId));
  const page = ctx.page;
  if (!await waitProjectReady(page)) return { id: 'enclosure-form', status: 'failed: project did not load' };
  const tool = page.getByRole('button', { name: 'Enclosure', exact: true });
  if (!await visibleWithin(tool)) return { id: 'enclosure-form', status: 'skipped: permission' };
  const routeEntry = await firstSidebarEntry(page, 'Routes', 'sidebar-route-');
  const routeId = await routeEntry?.getAttribute('id');
  if (!routeId) return { id: 'enclosure-form', status: 'skipped: data-state' };
  const modalSelector = 'div.fixed.inset-0:has(button:has-text("Save Enclosure")) .glass-panel';
  const modal = page.locator(modalSelector).first();
  // The tool opens the form directly; "Pick on Map" returns to the map so a click on the route offers the snap option.
  await clickSafe(tool, 'openEnclosureForm');
  let picking = false;
  try {
    if (!await visibleWithin(modal)) return { id: 'enclosure-form', status: 'failed: enclosure form did not open' };
    await clickSafe(page.getByRole('button', { name: 'Pick on Map', exact: true }), 'pickOnMap');
    picking = true;
    if (!await modal.waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true, () => false)) return { id: 'enclosure-form', status: 'failed: pick on map did not start' };
    // Try every listed route: the first one may be hidden under a parallel route or enclosure icons.
    const routeIds = await page.locator('li[id^="sidebar-route-"]').evaluateAll(items => items.map(item => item.id.slice('sidebar-route-'.length)));
    let point: Point | undefined;
    for (const candidateRoute of routeIds) {
      for (const fraction of candidateFractions()) {
        const candidate = await checkedPoint(page, candidateRoute, fraction);
        if (!candidate.reason) { point = candidate.point; break; }
      }
      if (point) break;
    }
    if (!point) return { id: 'enclosure-form', status: 'skipped: data-state' };
    assertAllowedAction('leftClickPoint');
    await page.mouse.click(point.x, point.y);
    if (!await visibleWithin(modal)) return { id: 'enclosure-form', status: 'failed: enclosure form did not reopen' };
    picking = false;
    await page.waitForTimeout(800);
    return await screenshot(ctx, 'enclosure-form', MARK_TARGETS['enclosure-form']!, modalSelector);
  } finally {
    // Every exit leaves the map as it was: the form cancelled, or pick mode ended with the Select tool.
    const cancel = modal.getByRole('button', { name: 'Cancel', exact: true });
    if (await cancel.isVisible().catch(() => false)) await clickSafe(cancel, 'cancelDraft');
    if (picking && !await modal.isVisible().catch(() => false)) await clickSafe(page.getByRole('button', { name: 'Select', exact: true }), 'exitDrawMode');
    if (!await modal.waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true, () => false)) throw new Error('enclosure form did not close');
  }
}

async function captureCoreManager(ctx: CaptureContext): Promise<CapturedFigure> {
  await goto(ctx, PROJECT_PATH(ctx.projectId));
  const page = ctx.page;
  if (!await waitProjectReady(page)) return { id: 'core-manager', status: 'failed: project did not load' };
  const route = await firstSidebarEntry(page, 'Routes', 'sidebar-route-');
  if (!route) return { id: 'core-manager', status: 'skipped: data-state' };
  await clickSafe(route, 'openCoreManager');
  const panel = page.locator('div.fixed.top-0.right-0.h-screen').first();
  if (!await visibleWithin(panel)) return { id: 'core-manager', status: 'skipped: permission' };
  const expand = panel.getByRole('button', { name: /expand|tube/i }).first();
  if (await expand.isVisible().catch(() => false)) await clickSafe(expand, 'selectCore');
  const core = panel.locator('button:has-text("Core")').first();
  if (await core.isVisible().catch(() => false)) await clickSafe(core, 'selectCore');
  // The sixth callout appears only when the sample has a pending edit. Do not edit production data for a figure.
  if (!await panel.getByText('Confirm Changes?').isVisible().catch(() => false)) return { id: 'core-manager', status: 'skipped: data-state' };
  return screenshot(ctx, 'core-manager', MARK_TARGETS['core-manager']!, 'div.fixed.top-0.right-0.h-screen');
}

async function captureSplice(ctx: CaptureContext): Promise<CapturedFigure> {
  await goto(ctx, PROJECT_PATH(ctx.projectId));
  const page = ctx.page;
  if (!await waitProjectReady(page)) return { id: 'splice', status: 'failed: project did not load' };
  const enclosure = await firstSidebarEntry(page, 'Enclosures', 'sidebar-enclosure-');
  if (!enclosure) return { id: 'splice', status: 'skipped: data-state' };
  await clickSafe(enclosure, 'openSpliceManager');
  const panelSelector = 'div.bg-slate-900.border-l:has(h2:text-matches("^Enclosure:"))';
  const tool = page.getByRole('button', { name: 'Splicing Tool', exact: true });
  if (!await visibleWithin(tool)) return { id: 'splice', status: 'skipped: permission' };
  await clickSafe(tool, 'selectFiberSide');
  if (!await visibleWithin(page.getByText(/Spliced to|Splice Core/).first())) return { id: 'splice', status: 'skipped: data-state' };
  return screenshot(ctx, 'splice', MARK_TARGETS.splice!, panelSelector);
}

async function captureMap(ctx: CaptureContext, id: 'map' | 'context-menu'): Promise<CapturedFigure> {
  await goto(ctx, `/project/${encodeURIComponent(ctx.projectId)}`);
  const page = ctx.page;
  await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 20_000 });
  const header = page.locator('.glass-panel button').filter({ has: page.locator('span.uppercase').getByText('Routes', { exact: true }) }).first();
  await header.waitFor({ state: 'visible', timeout: 10_000 });
  const section = header.locator('xpath=..');
  const routeEntries = section.locator('li[id^="sidebar-route-"]');
  const empty = section.getByText('No routes drawn yet.', { exact: true });
  if (await routeEntries.count() === 0 && await empty.count() === 0) await clickSafe(header, 'expandRoutesList');
  const samples: ReadinessSample[] = [];
  const readyStart = Date.now();
  while (true) {
    checkSafety(ctx);
    samples.push({ t: Date.now() - readyStart, count: await routeEntries.count(), emptyState: await empty.isVisible().catch(() => false) });
    const state = evaluateRouteReadiness(samples);
    if (state.state === 'ready') break;
    const message = routeReadinessMessage(state, ctx.projectId);
    if (message) return { id, status: 'skipped: data-state' };
    await wait(200);
  }
  const routes = await routeEntries.evaluateAll(elements => elements.map(element => ({ id: element.id.slice('sidebar-route-'.length), name: element.querySelector('.font-bold')?.textContent?.trim() || '' })));
  const selection = selectRoute(routes.map(route => route.name), ctx.routeName);
  if ('error' in selection) return { id, status: 'skipped: data-state' };
  const route = routes[selection.index];
  const routeSelector = `.leaflet-overlay-pane .wi-route-line.wi-route-${await page.evaluate(routeId => CSS.escape(routeId), route.id)}`;
  await page.locator(routeSelector).waitFor({ state: 'attached', timeout: 20_000 });
  await clickSafe(page.locator('button[aria-label="Focus all objects"]'), 'focusAllObjects');
  await waitForSettle(page, routeSelector, 15_000, 'map did not settle');
  await waitForTiles(page);
  let chosen: { fraction: number; point: Point } | undefined;
  for (const fraction of candidateFractions()) {
    const result = await checkedPoint(page, route.id, fraction);
    if (!result.reason) { chosen = { fraction, point: result.point }; break; }
  }
  if (!chosen) return { id, status: 'skipped: data-state' };
  if (id === 'map') {
    assertAllowedAction('leftClickPoint');
    await page.mouse.click(chosen.point.x, chosen.point.y);
    await page.locator('.fiber-detail-popup.leaflet-popup').waitFor({ state: 'visible', timeout: 10_000 });
    await waitForSettle(page, routeSelector, 5_000, 'map did not settle after popup');
    await waitForTiles(page);
    await assertPanelsAbsent(page);
    return screenshot(ctx, id, ['.glass-panel button:has-text("Back to Projects")', '.glass-panel div.grid.grid-cols-2:has(span:text-is("Enclosure"))', '.glass-panel button:has-text("ROUTES")', '.leaflet-control-layers', '.fiber-detail-popup .leaflet-popup-content-wrapper', 'button[aria-label="Collapse Sidebar"]']);
  }
  const again = await checkedPoint(page, route.id, chosen.fraction);
  if (again.reason) return { id, status: 'skipped: data-state' };
  assertAllowedAction('rightClickPoint');
  await page.mouse.click(again.point.x, again.point.y, { button: 'right' });
  const menu = page.locator('.fiber-context-menu');
  await menu.waitFor({ state: 'visible', timeout: 10_000 });
  const missing = missingMenuItems(await menu.locator('button:visible span').allTextContents());
  if (missing.length) return { id, status: 'skipped: permission' };
  await waitForSettle(page, routeSelector, 5_000, 'map did not settle after menu');
  await waitForTiles(page);
  await assertPanelsAbsent(page);
  return screenshot(ctx, id, [routeSelector, ...REQUIRED_MENU_ITEMS.map(item => `.fiber-context-menu button:has-text("${item}")`)]);
}

/** Settings needs two parts: the Add Type form covers the tabs and list it is opened from. Nothing is saved. */
async function captureSettings(ctx: CaptureContext): Promise<CapturedFigure> {
  const id = 'settings';
  await goto(ctx, '/settings');
  const page = ctx.page;
  const tab = page.getByRole('button', { name: 'Enclosure Types', exact: true });
  if (!await tab.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)) return { id, status: 'skipped: permission' };
  await clickSafe(tab, 'openSettingsTab');
  const item = page.locator('div.rounded-\\[2rem\\]:has(> div button[aria-label="Edit"])');
  if (!await item.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)) return { id, status: 'skipped: data-state' };
  const add = page.getByRole('button', { name: 'Add Type', exact: true });
  if (!await visibleWithin(add)) return { id, status: 'skipped: permission' };
  await page.waitForTimeout(500);
  const spec = WI_MASK_SPECS[id];
  const maskError = await maskPage(ctx, spec);
  if (maskError) return { id, status: `failed: ${maskError}` };
  const card = await box(page, '.glass-panel.rounded-\\[2\\.5rem\\]');
  const tabs = await box(page, 'div.flex-wrap:has(> button:has-text("Enclosure Types"))');
  const last = await box(page, 'div.rounded-\\[2rem\\]:has(> div button[aria-label="Edit"])', true);
  if (!card || !tabs || !last) return { id, status: 'failed: settings layout not measurable' };
  const listClip = { x: card.x, y: tabs.y - 24, width: card.width, height: last.y + last.height + 24 - (tabs.y - 24) };
  const listMarks = await measuredMarks(page, ['div.flex-wrap:has(> button:has-text("Enclosure Types"))', 'div.rounded-\\[2rem\\]:has(> div button[aria-label="Edit"])'], listClip);
  if (listMarks.error) return { id, status: `failed: ${listMarks.error}` };
  const listShot = await captureCheckedScreenshot(() => page.screenshot({ clip: listClip, animations: 'disabled' }), () => maskPage(ctx, spec, false));
  if (listShot.ok === false) return { id, status: `failed: ${listShot.error}` };
  await clickSafe(add, 'openSettingsForm');
  const form = page.locator('div.fixed.inset-0 div.rounded-\\[2\\.5rem\\]:has(button:has-text("Save Specification"))').first();
  try {
    if (!await form.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)) return { id, status: 'failed: settings form did not open' };
    await page.waitForTimeout(600);
    const modal = await box(page, 'div.fixed.inset-0 div.rounded-\\[2\\.5rem\\]:has(button:has-text("Save Specification"))');
    if (!modal) return { id, status: 'failed: settings form not measurable' };
    const formClip = { x: card.x, y: modal.y - 16, width: card.width, height: modal.height + 32 };
    const formMarks = await measuredMarks(page, ['div.fixed.inset-0 input >> nth=0', 'div.fixed.inset-0 div.border-dashed >> nth=0', 'div.fixed.inset-0 button:has-text("Save Specification")'], formClip);
    if (formMarks.error) return { id, status: `failed: ${formMarks.error}` };
    const formShot = await captureCheckedScreenshot(() => page.screenshot({ clip: formClip, animations: 'disabled' }), () => maskPage(ctx, spec, false));
    if (formShot.ok === false) return { id, status: `failed: ${formShot.error}` };
    return await composite(ctx, id, [
      { png: listShot.value, width: listClip.width, height: listClip.height, marks: listMarks.marks },
      { png: formShot.value, width: formClip.width, height: formClip.height, marks: formMarks.marks }
    ]);
  } finally {
    const cancel = page.locator('div.fixed.inset-0').getByRole('button', { name: 'Cancel', exact: true });
    if (await cancel.isVisible().catch(() => false)) await clickSafe(cancel, 'cancelDraft');
    // A form left open would mean the page is not back to its saved state; fail the figure rather than report it captured.
    if (!await form.waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true, () => false)) throw new Error('settings form did not close');
  }
}

export async function captureFigure(ctx: CaptureContext, id: FigureId): Promise<CapturedFigure> {
  try {
    if (id === 'map' || id === 'context-menu') return await captureMap(ctx, id);
    if (id === 'login') {
      await ctx.page.locator('#login-email').evaluate(element => {
        const input = element as HTMLInputElement;
        input.value = '';
        input.placeholder = 'อีเมล';
      });
      await ctx.page.locator('#login-password').evaluate(element => { (element as HTMLInputElement).value = ''; });
      return screenshot(ctx, id, MARK_TARGETS.login!, '.glass-panel-elevated');
    }
    if (id === 'profile') return await captureProfile(ctx);
    if (id === 'enclosure-form') return await captureEnclosureForm(ctx);
    if (id === 'route-draw') return await captureRouteDraw(ctx);
    if (id === 'core-manager') return await captureCoreManager(ctx);
    if (id === 'splice') return await captureSplice(ctx);
    if (id === 'settings') return await captureSettings(ctx);
    const item = WI_FIGURES.find(figure => figure.id === id)!;
    if (item.screen.startsWith('/project')) await goto(ctx, `/project/${encodeURIComponent(ctx.projectId)}`);
    else if (['dashboard', 'card-actions', 'project-form', 'files', 'schedule', 'approval-request', 'approval-sign'].includes(id)) await openDashboardCard(ctx);
    else await goto(ctx, item.screen);
    if (['users', 'permissions', 'settings', 'logs'].includes(id) && new URL(ctx.page.url()).pathname === '/') return { id, status: 'skipped: permission' };
    // These lists stream in after navigation; masking before they arrive would miss the rows.
    const rowsReady = { users: '[data-wi-pii="user-email"]', logs: '[data-wi-pii="log-user"]', permissions: 'table td label' }[id as 'users' | 'logs' | 'permissions'];
    if (rowsReady && !await ctx.page.locator(rowsReady).first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)) return { id, status: 'skipped: data-state' };
    if (rowsReady) await ctx.page.waitForTimeout(1_000);
    const page = ctx.page;
    const card = page.locator(`[data-wi-project-id="${ctx.projectId}"]`);
    if (id === 'card-actions') {
      const edit = card.getByRole('button', { name: 'แก้ไขโครงการ' });
      const remove = card.getByRole('button', { name: 'ลบโครงการ' });
      if (!await edit.isVisible().catch(() => false) || !await remove.isVisible().catch(() => false)) return { id, status: 'skipped: permission' };
    }
    if (id === 'project-form') {
      const button = page.getByRole('button', { name: 'สร้างโครงการ', exact: true });
      if (!await visibleWithin(button)) return { id, status: 'skipped: permission' };
      await clickSafe(button, 'openProjectForm');
      assertAllowedAction('fillProjectDraft');
      const name = page.locator('label:has-text("ชื่อโครงการ") + input').first();
      const route = page.locator('#project-route-code');
      if (await name.count()) await name.fill('โครงการตัวอย่าง');
      if (await route.count()) await route.fill('ROUTE-DEMO');
    }
    if (id === 'files') {
      const button = card.getByRole('button', { name: 'ไฟล์โครงการ' });
      if (!await visibleWithin(button)) return { id, status: 'skipped: permission' };
      await clickSafe(button, 'openFiles');
      if (await page.locator('section[role="dialog"] ul').count() < 2) return { id, status: 'skipped: data-state' };
    }
    if (id === 'schedule') {
      const button = card.getByRole('button', { name: /แผนงาน/ });
      if (!await visibleWithin(button)) return { id, status: 'skipped: permission' };
      await clickSafe(button, 'openSchedule');
      await page.locator('section[role="dialog"] button.schedule-row').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
      const task = page.locator('section[role="dialog"] button.schedule-row').filter({ hasNot: page.locator('[aria-label="ซิงก์กับเอกสารอนุมัติ"]') }).first();
      if (!await task.count()) return { id, status: 'skipped: data-state' };
      await clickSafe(task, 'selectTask');
      if (!await page.locator('#schedule-progress').isVisible().catch(() => false)) return { id, status: 'skipped: data-state' };
    }
    if (id === 'approval-request' || id === 'approval-sign') {
      const button = card.getByRole('button', { name: /เอกสารอนุมัติ|ลงนาม 2 ระดับ/ });
      if (!await visibleWithin(button)) return { id, status: 'skipped: permission' };
      await clickSafe(button, 'openApprovalDocument');
      if (id === 'approval-sign') {
        console.log('approval-sign action: openApprovalDocument');
        const modal = approvalModal(page);
        // The Planning and O&M sign buttons live on the last slide of the approval document.
        const signSlide = modal.getByRole('button', { name: '6', exact: true });
        if (await visibleWithin(signSlide)) { await clickSafe(signSlide, 'openSignSlide'); await page.waitForTimeout(800); }
        const state = await openApprovalSignForm(page, modal);
        if (state === 'skipped: data-state') return { id, status: state };
        try {
          if (state === 'failed: sign-form-not-opened') return { id, status: state };
          return await screenshot(ctx, id, MARK_TARGETS[id]!, 'div.fixed:has([data-wi-pii="signer-name"]) > div');
        } finally {
          await closeApprovalSignForm(page, modal);
        }
      }
      if (id === 'approval-request' && !await page.locator('[data-wi-pii="approval-supervisor"]').isVisible().catch(() => false)) return { id, status: 'skipped: data-state' };
    }
    const targets = MARK_TARGETS[id];
    if (!targets) return { id, status: 'failed: capture targets unavailable' };
    const crop = item.clip === 'element' ? id === 'card-actions' ? `[data-wi-project-id="${ctx.projectId}"]` : id === 'project-form' ? 'div.fixed:has(input#project-route-code) .glass-panel-elevated' : id === 'approval-request' ? 'div.fixed:has(h2:has-text("FIBER INFRA SHARING")) > div' : 'section[role="dialog"]' : undefined;
    const result = await screenshot(ctx, id, targets, crop);
    if (id === 'project-form') await clickSafe(page.getByRole('button', { name: 'ยกเลิก', exact: true }), 'cancelDraft');
    return result;
  } catch (error) {
    if (error instanceof SafetyViolation || ctx.guardTripped() || ctx.dialogSeen()) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    if (process.env.WI_SCREENSHOT_DEBUG === '1') console.error(`[debug] ${id}: ${reason.split('\n')[0]}`);
    const needs = WI_FIGURES.find(item => item.id === id)?.needs;
    if (/redirected|not visible|Timeout/i.test(reason) && (needs?.startsWith('permission') || needs === 'admin')) return { id, status: 'skipped: permission' };
    return { id, status: 'failed: capture unavailable' };
  }
}
