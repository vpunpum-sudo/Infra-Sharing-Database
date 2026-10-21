export type RequestShape = { method: string; url: string };
export type RequestDecision = 'allow' | 'block' | 'deny-quiet';
export type CountSnapshot = { routes: number; enclosures: number; loops: number };

export function functionsOriginFor(projectId: string, region = 'asia-southeast1'): string {
  return `https://${region}-${projectId}.cloudfunctions.net`;
}

export function describeRequest(request: RequestShape): string {
  const url = new URL(request.url);
  return `${request.method.toUpperCase()} ${url.host} ${url.pathname}`;
}

export function classifyRequest(request: RequestShape, config: { functionsOrigin: string }): RequestDecision {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const host = url.hostname.toLowerCase();
  if (host === 'cloudfunctions.net' || host.endsWith('.cloudfunctions.net') || host === 'run.app' || host.endsWith('.run.app')) {
    return method === 'POST' && url.origin === config.functionsOrigin && url.pathname === '/getProjectCreatedDates' ? 'deny-quiet' : 'block';
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'allow';
  if (host === 'firestore.googleapis.com' && method === 'POST') {
    if (url.pathname === '/google.firestore.v1.Firestore/Listen/channel') return 'allow';
    if (/(?:\:runQuery|\:batchGet|\:runAggregationQuery)$/.test(url.pathname)) return 'allow';
  }
  if (host === 'identitytoolkit.googleapis.com' && method === 'POST' && /\/accounts:(?:signInWithPassword|lookup)$/.test(url.pathname)) return 'allow';
  if (host === 'securetoken.googleapis.com' && method === 'POST' && url.pathname === '/v1/token') return 'allow';
  return 'block';
}

export function createGuard(config: { functionsOrigin: string }) {
  const observed: string[] = [];
  const blocked: string[] = [];
  let quietDenied = 0;
  let tripped = false;
  return {
    observed, blocked,
    get quietDenied() { return quietDenied; },
    get tripped() { return tripped; },
    handle(request: RequestShape): 'continue' | 'abort' {
      const decision = classifyRequest(request, config);
      if (decision === 'deny-quiet') { quietDenied += 1; return 'abort'; }
      if (decision === 'block') { const description = describeRequest(request); blocked.push(description); observed.push(description); tripped = true; return 'abort'; }
      return 'continue';
    }
  };
}

/** True once the project page reports routes, enclosures and loops all loaded from the server. */
export function projectListsLoaded(attribute: string | null | undefined): boolean {
  const loaded = new Set((attribute || '').split(/\s+/).filter(Boolean));
  return ['routes', 'enclosures', 'loops'].every(name => loaded.has(name));
}

export function compareCounts(before: CountSnapshot, after: CountSnapshot): boolean {
  return before.routes === after.routes && before.enclosures === after.enclosures && before.loops === after.loops;
}
