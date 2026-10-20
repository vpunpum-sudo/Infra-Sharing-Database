export const WI_REQUIRED_KEYS = ['WI_SCREENSHOT_EMAIL', 'WI_SCREENSHOT_PASSWORD', 'WI_SCREENSHOT_PROJECT_ID'] as const;

export type WiScreenshotConfig = {
  email: string;
  password: string;
  projectId: string;
  baseUrl?: string;
  routeName?: string;
};

export function resolveWiScreenshotConfig(env: Record<string, string | undefined>):
  | { ok: true; config: WiScreenshotConfig }
  | { ok: false; missing: string[] } {
  const missing = WI_REQUIRED_KEYS.filter(key => !env[key]?.trim());
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      email: env.WI_SCREENSHOT_EMAIL!.trim(),
      password: env.WI_SCREENSHOT_PASSWORD!,
      projectId: env.WI_SCREENSHOT_PROJECT_ID!.trim(),
      baseUrl: env.WI_SCREENSHOT_BASE_URL?.trim() || undefined,
      routeName: env.WI_SCREENSHOT_ROUTE_NAME?.trim() || undefined
    }
  };
}
