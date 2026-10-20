export type ReadinessSample = { t: number; count: number; emptyState: boolean };
export type Readiness =
  | { state: 'ready'; count: number }
  | { state: 'waiting' }
  | { state: 'timeout-empty' }
  | { state: 'timeout-unstable'; count: number };

export const ROUTE_READY_TIMEOUT_MS = 20_000;
export const ROUTE_READY_STABLE_MS = 1_000;

export function evaluateRouteReadiness(
  samples: ReadinessSample[],
  opts: { timeoutMs?: number; stableMs?: number } = {}
): Readiness {
  const latest = samples.at(-1);
  if (!latest) return { state: 'waiting' };
  const { timeoutMs = ROUTE_READY_TIMEOUT_MS, stableMs = ROUTE_READY_STABLE_MS } = opts;
  let start = samples.length - 1;
  while (start > 0 && samples[start - 1].count === latest.count) start--;
  if (latest.count >= 1 && latest.t - samples[start].t >= stableMs) return { state: 'ready', count: latest.count };
  if (latest.t < timeoutMs) return { state: 'waiting' };
  return latest.count === 0 ? { state: 'timeout-empty' } : { state: 'timeout-unstable', count: latest.count };
}

export function routeReadinessMessage(result: Readiness, projectId: string): string | undefined {
  if (result.state === 'timeout-empty') return `No routes found in project ${projectId}, or route data did not load within 20s ('No routes drawn yet.' still shown). Check the project has at least one Fiber route and that the network or Firestore is reachable.`;
  if (result.state === 'timeout-unstable') return `route list was still changing after 20s (last count ${result.count})`;
  return undefined;
}
