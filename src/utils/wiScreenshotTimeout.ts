/** Closing the page cancels Playwright operations before the next figure starts. */
export async function captureWithTimeout<T>(
  capture: () => Promise<T>,
  closePage: () => Promise<void>,
  timeoutMs: number
): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  let timedOut = false;
  let closing: Promise<void> | undefined;
  let closeError: unknown;
  const timer = setTimeout(() => {
    timedOut = true;
    closing = closePage().catch(error => { closeError = error; });
  }, timeoutMs);
  try {
    const value = await capture();
    if (timedOut) { await closing; if (closeError) throw closeError; return { timedOut: true }; }
    return { timedOut: false, value };
  } catch (error) {
    if (error instanceof SafetyViolation) throw error;
    if (timedOut) { await closing; if (closeError) throw closeError; return { timedOut: true }; }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
import { SafetyViolation } from './wiScreenshotRun';

