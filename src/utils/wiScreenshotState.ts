import type { Project, Route } from '../types';

/** Only opaque fingerprints reach the DOM and capture log. No project content is logged. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(value: unknown): string {
  const serialized = stable(value);
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export type CaptureState = { approval: string; splices: string };
export function captureState(project: Project | null, routes: Route[]): CaptureState | undefined {
  if (!project) return undefined;
  const approval = project.designApproval;
  const splices = routes.map(route => ({ id: route.id, cores: route.cores?.map(core => ({ id: core.id, splices: core.splices || {} })) || [] }));
  return {
    approval: fingerprint(approval ? { stage: approval.approvalStage, status: approval.status,
      planning: approval.planningSignOffs, om: approval.omSignOffs, owner: approval.ownerSignOffs } : null),
    splices: fingerprint(splices)
  };
}

export function compareCaptureState(before: CaptureState, after: CaptureState): boolean {
  return before.approval === after.approval && before.splices === after.splices;
}
