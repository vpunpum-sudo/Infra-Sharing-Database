import type { FigureId } from './wiScreenshotFigures';

export const REMAINING_WI_FIGURES = ['profile', 'core-manager', 'splice', 'files', 'schedule', 'approval-request', 'approval-sign'] as const satisfies readonly FigureId[];
export type RemainingFigure = (typeof REMAINING_WI_FIGURES)[number];
export type FigureGate = { prerequisite?: string; reviewer?: string; sceneObserved?: boolean; publishable?: boolean; permission?: 'available' | 'missing'; state?: 'available' | 'missing'; projectId?: string; enclosureId?: string };
export type GateResult = { ready: true } | { ready: false; status: 'skipped: permission' | 'skipped: data-state' | 'failed: unpublishable content'; reason: string };
export type CaptureGateContext = { figureId: RemainingFigure; projectId: string };

const PROJECT_FIGURES: readonly RemainingFigure[] = ['core-manager', 'splice', 'files', 'schedule', 'approval-request', 'approval-sign'];

export function isRemainingFigure(id: FigureId): id is RemainingFigure {
  return (REMAINING_WI_FIGURES as readonly string[]).includes(id);
}

/** A human records only non-sensitive prerequisites in an ignored local manifest. */
export function evaluateFigureGate(gate: FigureGate | undefined, context?: CaptureGateContext): GateResult {
  if (!gate) return { ready: false, status: 'skipped: data-state', reason: 'human prerequisite and publishability record missing' };
  if (gate.publishable === false) return { ready: false, status: 'failed: unpublishable content', reason: 'visible sample data is not approved for publication' };
  if (gate.permission === 'missing') return { ready: false, status: 'skipped: permission', reason: gate.prerequisite || 'required control is inaccessible' };
  if (gate.state === 'missing') return { ready: false, status: 'skipped: data-state', reason: gate.prerequisite || 'required pre-existing state is absent' };
  if (!gate.prerequisite?.trim() || !gate.reviewer?.trim() || gate.sceneObserved !== true || gate.publishable !== true || gate.permission !== 'available' || gate.state !== 'available') {
    return { ready: false, status: 'skipped: data-state', reason: 'observed scene, reviewer, or publishability is unconfirmed' };
  }
  if (context && PROJECT_FIGURES.includes(context.figureId) && (!context.projectId || gate.projectId !== context.projectId)) {
    return { ready: false, status: 'failed: unpublishable content', reason: 'selected project does not match the observed scene' };
  }
  return { ready: true };
}

export function hasUnpublishableSelection(results: Iterable<GateResult>): boolean {
  return [...results].some(result => result.ready === false && result.status === 'failed: unpublishable content');
}

/** Select only the enclosure whose connected scene was observed in this project. */
export function observedSpliceEnclosure(gate: FigureGate | undefined, projectId: string): string | undefined {
  if (!gate || !evaluateFigureGate(gate).ready || gate.projectId !== projectId) return undefined;
  return gate.enclosureId?.trim() || undefined;
}
