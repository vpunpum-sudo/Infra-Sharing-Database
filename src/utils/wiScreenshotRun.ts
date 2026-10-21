export class SafetyViolation extends Error {}
export type FigureStatus = 'captured' | 'skipped: permission' | 'skipped: data-state' | `failed: ${string}`;
export type FigureResult = { id: string; status: FigureStatus; reason?: string };
export type RunSummary = { status: 'completed' | 'aborted: guard' | 'aborted: safety'; results: FigureResult[]; quietDenied: number; exitCode: 0 | 1 };

export async function runFigures(options: {
  figures: string[];
  guard: { readonly tripped: boolean; readonly quietDenied: number };
  capture: (id: string, index: number) => Promise<FigureResult>;
  beforeCommit?: () => Promise<void>;
  commitOutputs: (captured: FigureResult[]) => Promise<void>;
  redact?: (message: string) => string;
}): Promise<RunSummary> {
  const results: FigureResult[] = [];
  const abort = (status: RunSummary['status']): RunSummary => ({ status, results, quietDenied: options.guard.quietDenied, exitCode: 1 });
  try {
    for (const [index, id] of options.figures.entries()) {
      if (options.guard.tripped) return abort('aborted: guard');
      results.push(await options.capture(id, index));
      if (options.guard.tripped) return abort('aborted: guard');
    }
    await options.beforeCommit?.();
    if (options.guard.tripped) return abort('aborted: guard');
    await options.commitOutputs(results.filter(item => item.status === 'captured'));
    return { status: 'completed', results, quietDenied: options.guard.quietDenied,
      exitCode: results.some(item => item.status.startsWith('failed:')) ? 1 : 0 };
  } catch (error) {
    const message = `Run error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(options.redact?.(message) ?? message);
    if (options.guard.tripped) return abort('aborted: guard');
    return abort('aborted: safety');
  }
}
