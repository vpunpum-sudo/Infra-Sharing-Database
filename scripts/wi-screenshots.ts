import { readdir, mkdtemp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, loadEnv, type ViteDevServer } from 'vite';
import { assertAllowedAction, missingMenuItems, REQUIRED_MENU_ITEMS } from '../src/utils/wiScreenshotActions';
import { resolveWiScreenshotConfig } from '../src/utils/wiScreenshotConfig';
import { toPercentMarks, formatMarksModule, type MarkBox } from '../src/utils/wiScreenshotMarks';
import { candidateFractions, validateClickPoint, type Point, type Rect } from '../src/utils/wiScreenshotPoint';
import { commitOutputs, planStaleCleanup } from '../src/utils/wiScreenshotOutput';
import { evaluateRouteReadiness, routeReadinessMessage, type ReadinessSample } from '../src/utils/wiScreenshotReadiness';
import { selectRoute } from '../src/utils/wiScreenshotRoute';
import { WI_SCREENSHOT_MARKS } from '../src/content/wiScreenshotMarks';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_NAMES = ['map-overview.png', 'route-context-menu.png', 'wiScreenshotMarks.ts'] as const;
const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const fail = (message: string): never => { throw new Error(message); };

function createActions(page: Page, routesHeader: () => ReturnType<Page['locator']>) {
  const act = {
    fillLogin: async (email: string, password: string) => {
      assertAllowedAction('fillLogin');
      await page.locator('#login-email').fill(email);
      await page.locator('#login-password').fill(password);
    },
    submitLogin: async () => { assertAllowedAction('submitLogin'); await page.locator('form:has(#login-email) button[type="submit"]').click(); },
    goto: async (url: string) => { assertAllowedAction('goto'); await page.goto(url, { waitUntil: 'domcontentloaded' }); },
    expandRoutesList: async () => { assertAllowedAction('expandRoutesList'); await routesHeader().click(); },
    focusAllObjects: async () => { assertAllowedAction('focusAllObjects'); await page.locator('button[aria-label="Focus all objects"]').click(); },
    leftClickPoint: async (point: Point) => { assertAllowedAction('leftClickPoint'); await page.mouse.click(point.x, point.y); },
    rightClickPoint: async (point: Point) => { assertAllowedAction('rightClickPoint'); await page.mouse.click(point.x, point.y, { button: 'right' }); },
    pressEscape: async () => { assertAllowedAction('pressEscape'); await page.keyboard.press('Escape'); },
    closePopup: async () => { assertAllowedAction('closePopup'); await page.locator('.leaflet-popup-close-button').click(); }
  };
  return act;
}

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

async function box(page: Page, selector: string): Promise<Rect | undefined> {
  return page.locator(selector).first().evaluate(element => {
    const r = element.getBoundingClientRect();
    return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : undefined;
  }).catch(() => undefined);
}

async function assertPanelsAbsent(page: Page): Promise<void> {
  const core = await page.locator('div.fixed.top-0.right-0.h-screen').isVisible().catch(() => false);
  const splice = await page.getByRole('heading', { name: /^Enclosure:/ }).isVisible().catch(() => false);
  if (core || splice) fail('Core Manager or Splice Manager panel is unexpectedly visible');
}

async function cleanupStale(): Promise<void> {
  const entries = await readdir(ROOT, { withFileTypes: true });
  for (const name of planStaleCleanup(entries.map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() })))) {
    const path = join(ROOT, name);
    const backups = (await readdir(path)).filter(file => file.endsWith('.bak'));
    console.warn(`Removing stale ${path}; backups: ${backups.join(', ') || '(none)'}`);
    await rm(path, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await cleanupStale();
  const env = { ...loadEnv('development', ROOT, 'WI_SCREENSHOT_'), ...process.env };
  const resolved = resolveWiScreenshotConfig(env);
  if ('missing' in resolved) throw new Error(`Missing required variables: ${resolved.missing.join(', ')}. See docs/wi-screenshots.md.`);
  const config = resolved.config;
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let tempDir: string | undefined;
  let keepTemp = false;
  try {
    let baseUrl = config.baseUrl;
    if (!baseUrl) {
      server = await createServer({ root: ROOT, server: { host: '127.0.0.1', port: 0, strictPort: false } });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Could not start local Vite server');
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
    try { browser = await chromium.launch({ headless: true }); }
    catch { fail('Playwright Chromium is not installed. Run npx playwright install chromium.'); }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'th-TH', colorScheme: 'light' });
    // tsx compiles with keepNames, which wraps functions passed to page.evaluate in a __name() helper the page lacks.
    await context.addInitScript('globalThis.__name = globalThis.__name || (fn => fn);');
    await context.addInitScript(() => localStorage.setItem('fiber_theme', 'light'));
    const page = await context.newPage();
    let dialogSeen = false;
    page.on('dialog', dialog => { dialogSeen = true; void dialog.dismiss(); });
    const guardDialog = () => { if (dialogSeen) fail('A native dialog appeared; capture aborted'); };
    const header = () => page.locator('.glass-panel button').filter({ has: page.locator('span.uppercase').getByText('Routes', { exact: true }) }).first();
    const act = createActions(page, header);
    const url = (path: string) => new URL(path, baseUrl).toString();
    await act.goto(url('/login'));
    await act.fillLogin(config.email, config.password);
    await act.submitLogin();
    try { await page.waitForURL(address => !address.pathname.endsWith('/login'), { timeout: 30_000 }); }
    catch { fail('sign-in failed or stayed on /login'); }
    guardDialog();
    if (/\/(change-password|pending-approval)$/.test(new URL(page.url()).pathname)) fail(`Account sent to ${new URL(page.url()).pathname}`);
    await act.goto(url(`/project/${encodeURIComponent(config.projectId)}`));
    try { await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 20_000 }); }
    catch {
      const path = new URL(page.url()).pathname;
      if (path === '/change-password' || path === '/pending-approval') fail(`Account sent to ${path}`);
      fail('project could not be opened');
    }
    guardDialog();
    try { await header().waitFor({ state: 'visible', timeout: 10_000 }); }
    catch { fail('ROUTES header not found within 10s'); }
    const section = header().locator('xpath=..');
    const routeEntries = section.locator('li[id^="sidebar-route-"]');
    const empty = section.getByText('No routes drawn yet.', { exact: true });
    if (await routeEntries.count() === 0 && await empty.count() === 0) await act.expandRoutesList();
    const samples: ReadinessSample[] = [];
    const readyStart = Date.now();
    while (true) {
      guardDialog();
      samples.push({ t: Date.now() - readyStart, count: await routeEntries.count(), emptyState: await empty.isVisible().catch(() => false) });
      const state = evaluateRouteReadiness(samples);
      if (state.state === 'ready') break;
      const message = routeReadinessMessage(state, config.projectId);
      if (message) fail(message);
      await wait(200);
    }
    const routes = await routeEntries.evaluateAll(elements => elements.map(element => ({
      id: element.id.slice('sidebar-route-'.length),
      name: element.querySelector('.font-bold')?.textContent?.trim() || ''
    })));
    const selection = selectRoute(routes.map(route => route.name), config.routeName);
    if ('error' in selection) throw new Error(selection.error === 'not-found'
      ? `Route ${config.routeName ?? '(first)'} not found. Found: ${selection.names.join(', ')}`
      : `Route name is ambiguous (${selection.matches.length} matches): ${selection.matches.join(', ')}`);
    const route = routes[selection.index];
    const routeSelector = `.leaflet-overlay-pane .wi-route-line.wi-route-${await page.evaluate(id => CSS.escape(id), route.id)}`;
    try { await page.locator(routeSelector).waitFor({ state: 'attached', timeout: 20_000 }); }
    catch { fail(`route ${route.name} is not rendered on the map within 20s (check the Routes layer is on and the route has a path)`); }
    try { await page.locator('button[aria-label="Focus all objects"]').waitFor({ state: 'visible', timeout: 10_000 }); }
    catch { fail('Focus all objects control not found'); }
    await act.focusAllObjects();
    await waitForSettle(page, routeSelector, 15_000, 'map did not settle after Focus all within 15s');
    await waitForTiles(page);
    guardDialog();
    let chosen: { fraction: number; point: Point } | undefined;
    const failures: string[] = [];
    for (const fraction of candidateFractions()) {
      const result = await checkedPoint(page, route.id, fraction);
      if (!result.reason) { chosen = { fraction, point: result.point }; break; }
      failures.push(`${fraction}: ${result.reason}`);
    }
    if (!chosen) fail(`route ${route.name} has no clickable point in the map view after Focus all (${failures.join('; ')}); use a smaller sample project so every route is clearly visible when all objects are in view, or set WI_SCREENSHOT_ROUTE_NAME to a different route`);
    await act.leftClickPoint(chosen.point);
    try { await page.locator('.fiber-detail-popup.leaflet-popup').waitFor({ state: 'visible', timeout: 10_000 }); }
    catch { fail('detail popup did not appear within 10s'); }
    await waitForSettle(page, routeSelector, 5_000, 'map did not settle after detail popup within 5s');
    await waitForTiles(page);
    await assertPanelsAbsent(page);
    const mapBoxes: MarkBox[] = [
      { name: 'header', box: await box(page, '.glass-panel button:has-text("Back to Projects")'), anchor: 'top-left' },
      { name: 'tools', box: await box(page, '.glass-panel div.grid.grid-cols-2:has(span:text-is("Enclosure"))'), anchor: 'top-left' },
      { name: 'lists', box: await header().boundingBox().then(value => value ?? undefined), anchor: 'top-left' },
      { name: 'layers', box: await box(page, '.leaflet-control-layers') },
      { name: 'popup', box: await box(page, '.fiber-detail-popup .leaflet-popup-content-wrapper'), anchor: 'top-left' },
      { name: 'sidebar-toggle', box: await box(page, 'button[aria-label="Collapse Sidebar"]') }
    ];
    tempDir = await mkdtemp(join(ROOT, '.wi-screenshots-tmp-'));
    await page.screenshot({ path: join(tempDir, OUTPUT_NAMES[0]), animations: 'disabled' });
    await act.pressEscape();
    if (await page.locator('.fiber-detail-popup').isVisible().catch(() => false)) await act.closePopup();
    try { await page.locator('.fiber-detail-popup').waitFor({ state: 'hidden', timeout: 5_000 }); }
    catch { fail('detail popup did not close'); }
    await waitForSettle(page, routeSelector, 5_000, 'map did not settle after popup closed within 5s');
    const again = await checkedPoint(page, route.id, chosen.fraction);
    if (again.reason) fail(`route point moved out of usable map area after popup closed: ${again.reason}`);
    await act.rightClickPoint(again.point);
    try { await page.locator('.fiber-context-menu.leaflet-popup').waitFor({ state: 'visible', timeout: 10_000 }); }
    catch { fail('context menu did not appear within 10s'); }
    const menu = page.locator('.fiber-context-menu');
    const visibleItems = await menu.locator('button:visible span').allTextContents();
    const missing = missingMenuItems(visibleItems);
    if (missing.length) fail(`Context menu is missing ${missing.join(', ')}. See docs/wi-screenshots.md#account-and-sample-project.`);
    await waitForSettle(page, routeSelector, 5_000, 'map did not settle after context menu within 5s');
    await waitForTiles(page);
    await assertPanelsAbsent(page);
    guardDialog();
    const menuPoint = (await samplePoint(page, route.id, chosen.fraction)).point;
    const menuBoxes: MarkBox[] = [{ name: 'click point', box: { x: menuPoint.x, y: menuPoint.y, width: 0.1, height: 0.1 } }];
    for (const item of REQUIRED_MENU_ITEMS) menuBoxes.push({ name: item, box: await menu.getByRole('button', { name: item }).boundingBox().then(value => value ?? undefined), anchor: 'left-center' });
    await page.screenshot({ path: join(tempDir, OUTPUT_NAMES[1]), animations: 'disabled' });
    await act.pressEscape();
    guardDialog();
    const viewport = { width: 1440, height: 900 };
    const mapMarks = toPercentMarks(mapBoxes, viewport, WI_SCREENSHOT_MARKS.map);
    const menuMarks = toPercentMarks(menuBoxes, viewport, WI_SCREENSHOT_MARKS['context-menu']);
    for (const name of [...mapMarks.kept, ...menuMarks.kept]) console.warn(`Could not measure ${name}; kept previous mark`);
    await writeFile(join(tempDir, OUTPUT_NAMES[2]), formatMarksModule({ map: mapMarks.marks, 'context-menu': menuMarks.marks }));
    const targets = [join(ROOT, 'public/wi', OUTPUT_NAMES[0]), join(ROOT, 'public/wi', OUTPUT_NAMES[1]), join(ROOT, 'src/content', OUTPUT_NAMES[2])];
    await mkdir(join(ROOT, 'public/wi'), { recursive: true });
    const staged = OUTPUT_NAMES.map(name => join(tempDir!, name));
    for (const file of staged) if ((await stat(file)).size === 0) fail(`Staged output is empty: ${file}`);
    const result = await commitOutputs(staged.map((file, i) => ({ staged: file, target: targets[i] })), {
      exists: async path => stat(path).then(() => true, () => false), rename, rm: async path => rm(path, { force: true })
    }, tempDir);
    if (result.ok === false) {
      keepTemp = result.rollback === 'failed';
      fail(`Output replacement failed: ${result.error}; rollback ${result.rollback}. ${keepTemp ? `Temp directory: ${result.tempDir}; backups: ${result.backups.join(', ')}; recover with ${result.recoveryHint}` : ''}`);
    }
    for (const target of targets) console.log(`Wrote ${target} (${(await stat(target)).size} bytes)`);
    console.log(`Measured marks: ${[...mapMarks.measured, ...menuMarks.measured].join(', ') || '(none)'}`);
    console.log(`Kept previous marks: ${[...mapMarks.kept, ...menuMarks.kept].join(', ') || '(none)'}`);
    console.log('Before committing, open both PNGs and check them by eye for customer names, addresses, locations or any other sensitive data. Also check the sample project in the app is unchanged.');
  } finally {
    await browser?.close();
    await server?.close();
    if (tempDir && !keepTemp) await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  const raw = error instanceof Error ? error.message : String(error);
  const secrets = [process.env.WI_SCREENSHOT_EMAIL, process.env.WI_SCREENSHOT_PASSWORD, ...Object.values(loadEnv('development', ROOT, 'WI_SCREENSHOT_'))].filter((value): value is string => !!value);
  const message = secrets.reduce((current, secret) => current.replaceAll(secret, '[redacted]'), raw);
  console.error(message);
  process.exitCode = 1;
});
