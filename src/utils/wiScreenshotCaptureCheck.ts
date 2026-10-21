/** Verify the live page immediately after capture, before retaining its pixels. */
export async function captureCheckedScreenshot<T>(
  capture: () => Promise<T>,
  check: () => Promise<string | undefined>,
  discard?: () => Promise<void>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const value = await capture();
  try {
    const error = await check();
    if (error) {
      await discard?.();
      return { ok: false, error };
    }
    return { ok: true, value };
  } catch (error) {
    await discard?.();
    throw error;
  }
}
