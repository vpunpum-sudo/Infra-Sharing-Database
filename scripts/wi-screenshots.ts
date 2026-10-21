import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { createServer, loadEnv, type ViteDevServer } from 'vite';
import { parseOnlyArg, figureImagePath, type FigureId } from '../src/utils/wiScreenshotFigures';
import { resolveWiScreenshotConfig } from '../src/utils/wiScreenshotConfig';
import { functionsOriginFor, createGuard, compareCounts, projectListsLoaded, type CountSnapshot } from '../src/utils/wiScreenshotGuard';
import { runFigures, SafetyViolation } from '../src/utils/wiScreenshotRun';
import { formatMarksModule, mergeCapturedMarks, type Mark } from '../src/utils/wiScreenshotMarks';
import { commitOutputs } from '../src/utils/wiScreenshotOutput';
import { WI_SCREENSHOT_MARKS } from '../src/content/wiScreenshotMarks';
import { captureFigure, clickSafe, type CapturedFigure } from './wi-screenshot-figures';
import { redactSecrets } from '../src/utils/wiScreenshotRedact';
import { captureWithTimeout } from '../src/utils/wiScreenshotTimeout';

const ROOT = resolve(import.meta.dirname, '..');
const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

async function counts(page: import('playwright').Page): Promise<CountSnapshot> {
  // Until every list has arrived from the server, the sidebar shows provisional zeros.
  const loaded = await page.locator('[data-wi-loaded]').first().getAttribute('data-wi-loaded', { timeout: 2_000 }).catch(() => null);
  if (!projectListsLoaded(loaded)) throw new Error('project lists still loading');
  return page.evaluate(() => {
    const number = (label: string) => {
      const button = [...document.querySelectorAll('.glass-panel button')].find(item =>
        [...item.querySelectorAll('span.uppercase')].some(span => span.textContent?.trim().toLowerCase() === label));
      const badge = button?.querySelector('span.bg-slate-800')?.textContent?.trim();
      const value = Number(badge?.split('/').at(-1));
      if (!badge || !Number.isFinite(value)) throw new Error('project count badge unavailable');
      return value;
    };
    return { routes: number('routes'), enclosures: number('enclosures'), loops: number('loops') };
  });
}

/** Counts once they have held still for 1.5 s, so a half-loaded project is not taken as the baseline. */
async function stableCounts(page: import('playwright').Page): Promise<CountSnapshot> {
  let last: CountSnapshot | undefined;
  let steady = 0;
  for (const deadline = Date.now() + 20_000; Date.now() < deadline; await wait(300)) {
    const current = await counts(page).catch(() => undefined);
    steady = current && last && compareCounts(last, current) ? steady + 1 : 0;
    last = current;
    if (last && steady >= 5) return last;
  }
  throw new SafetyViolation('project counts did not settle within 20s');
}

async function main(): Promise<void> {
  const figures = parseOnlyArg(process.argv[2]); // Validation precedes browser startup or output mutation.
  const env = { ...loadEnv('development', ROOT, 'WI_SCREENSHOT_'), ...process.env };
  const resolved = resolveWiScreenshotConfig(env);
  if ('missing' in resolved) throw new Error(`Missing required variables: ${resolved.missing.join(', ')}. See docs/wi-screenshots.md.`);
  const config = resolved.config;
  const redact = (message: string) => redactSecrets(message, Object.entries(env)
    .filter(([key]) => key.startsWith('WI_SCREENSHOT_')).map(([, value]) => value));
  const firebaseConfig = JSON.parse(await readFile(join(ROOT, 'firebase-applet-config.json'), 'utf8')) as { projectId?: string };
  if (!firebaseConfig.projectId) throw new Error('Firebase projectId is missing from app config');
  const guard = createGuard({ functionsOrigin: functionsOriginFor(firebaseConfig.projectId) });
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
    catch { throw new Error('Playwright Chromium is not installed. Run npx playwright install chromium.'); }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'th-TH', serviceWorkers: 'block' });
    await context.addInitScript('globalThis.__name = globalThis.__name || (fn => fn);');
    await context.addInitScript(() => localStorage.setItem('fiber_theme', 'light'));
    let page = await context.newPage();
    let dialogSeen = false;
    const preparePage = async (target: typeof page) => {
      target.on('dialog', dialog => { dialogSeen = true; void dialog.dismiss(); });
      await target.route('**/*', async route => {
        const decision = guard.handle({ method: route.request().method(), url: route.request().url() });
        if (decision === 'abort') await route.abort(); else await route.continue();
      });
    };
    await preparePage(page);
    tempDir = await mkdtemp(join(ROOT, '.wi-screenshots-tmp-'));
    const captureContext = { page, baseUrl, projectId: config.projectId, routeName: config.routeName, tempDir,
      known: { email: config.email, displayName: '' }, guardTripped: () => guard.tripped, dialogSeen: () => dialogSeen };
    await page.goto(new URL('/login', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    let login: CapturedFigure | undefined;
    if (figures.some(item => item.id === 'login')) {
      const attempt = await captureWithTimeout(
        () => captureFigure({ ...captureContext, page }, 'login'),
        () => page.close(), 45_000);
      if (attempt.timedOut === true) {
        page = await context.newPage();
        await preparePage(page);
        captureContext.page = page;
        await page.goto(new URL('/login', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
        login = { id: 'login', status: 'failed: timeout' };
      } else login = attempt.value;
    }
    await page.locator('#login-email').fill(config.email);
    await page.locator('#login-password').fill(config.password);
    await clickSafe(page.locator('form:has(#login-email) button[type="submit"]'), 'submitLogin');
    try { await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 }); }
    catch { throw new SafetyViolation('sign-in failed or account gating redirect'); }
    if (dialogSeen) throw new SafetyViolation('native dialog appeared');
    await page.locator('header').waitFor({ state: 'visible', timeout: 20_000 });
    await wait(800);
    captureContext.known.displayName = await page.locator('[data-wi-pii="account-name"]').first().textContent().then(value => value?.trim() || '', () => '');
    guard.enforce();
    await page.goto(new URL(`/project/${encodeURIComponent(config.projectId)}`, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    try { await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 20_000 }); }
    catch { throw new SafetyViolation('sample project could not be opened'); }
    if (guard.tripped || dialogSeen) throw new SafetyViolation('safety guard tripped opening project');
    const before = await stableCounts(page);
    const captured: CapturedFigure[] = [];
    let commitError = '';
    const summary = await runFigures({
      figures: figures.map(item => item.id), guard,
      redact,
      capture: async id => {
        let result: CapturedFigure;
        if (id === 'login') result = login!;
        else {
          const capturePage = page;
          const attempt = await captureWithTimeout(
            () => captureFigure({ ...captureContext, page: capturePage }, id as FigureId),
            () => capturePage.close(), 45_000);
          if (attempt.timedOut === true) {
            page = await context.newPage();
            await preparePage(page);
            captureContext.page = page;
            result = { id, status: 'failed: timeout' };
          } else result = attempt.value;
          // Local troubleshooting only: the debug image is unmasked and goes to the git-ignored .context directory.
          if (process.env.WI_SCREENSHOT_DEBUG === '1' && result.status !== 'captured') {
            await mkdir(join(ROOT, '.context', 'wi-debug'), { recursive: true });
            await page.screenshot({ path: join(ROOT, '.context', 'wi-debug', `${id}.png`) }).catch(() => undefined);
          }
        }
        if (result.status === 'captured') captured.push(result);
        return result;
      },
      beforeCommit: async () => {
        if (dialogSeen) throw new SafetyViolation('native dialog appeared');
        await page.goto(new URL(`/project/${encodeURIComponent(config.projectId)}`, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
        await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 20_000 });
        // Project data streams in after the map appears: compare only once the counts have settled again.
        const after = await stableCounts(page).catch(() => undefined);
        if (!after || !compareCounts(before, after)) {
          const show = (value?: CountSnapshot) => value ? `${value.routes}/${value.enclosures}/${value.loops}` : 'unavailable';
          throw new SafetyViolation(`route, enclosure, or loop counts changed (before ${show(before)}, after ${show(after)})`);
        }
      },
      commitOutputs: async () => {
        const marks = mergeCapturedMarks(WI_SCREENSHOT_MARKS, Object.fromEntries(captured.map(item => [item.id, item.marks])) as Partial<Record<FigureId, Mark[]>>);
        const marksStaged = join(tempDir!, 'wiScreenshotMarks.ts');
        await writeFile(marksStaged, formatMarksModule(marks));
        const entries = captured.map(item => ({ staged: item.staged!, target: join(ROOT, 'public', figureImagePath(item.id as FigureId).slice(1)) }));
        entries.push({ staged: marksStaged, target: join(ROOT, 'src/content/wiScreenshotMarks.ts') });
        for (const item of entries) if ((await stat(item.staged)).size === 0) throw new Error('staged output is empty');
        await mkdir(join(ROOT, 'public/wi'), { recursive: true });
        const result = await commitOutputs(entries, { exists: path => stat(path).then(() => true, () => false), rename,
          rm: path => rm(path, { force: true }) }, tempDir!);
        if (result.ok === false) { keepTemp = result.rollback === 'failed'; commitError = `output replacement failed; rollback ${result.rollback}`; throw new Error(commitError); }
      }
    });
    console.log(redact('figure\tresult'));
    for (const item of summary.results) console.log(redact(`${item.id}\t${item.status}`));
    console.log(redact(`Files to inspect: ${captured.filter(item => summary.status === 'completed').map(item => figureImagePath(item.id as FigureId)).join(', ') || '(none)'}`));
    console.log(redact(`Observe phase: ${guard.observed.join('; ') || '(none)'}`));
    console.log(redact(`quiet-denied: ${guard.quietDenied}`));
    if (guard.blocked.length) console.error(redact(`Blocked requests: ${guard.blocked.join('; ')}`));
    if (commitError) console.error(redact(commitError));
    if (summary.status !== 'completed') console.error(redact(`Run ${summary.status}; no outputs committed`));
    process.exitCode = summary.exitCode;
  } finally {
    await browser?.close();
    await server?.close();
    if (tempDir && !keepTemp) await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch(async error => {
  const env = { ...loadEnv('development', ROOT, 'WI_SCREENSHOT_'), ...process.env };
  const raw = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(raw, Object.entries(env).filter(([key]) => key.startsWith('WI_SCREENSHOT_')).map(([, value]) => value)));
  process.exitCode = 1;
});
