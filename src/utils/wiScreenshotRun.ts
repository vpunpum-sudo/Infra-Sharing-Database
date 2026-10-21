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
}): Promise<RunSummary> {
  const results: FigureResult[] = [];
  const abort = (status: RunSummary['status']): RunSummary => ({ status, results, quietDenied: options.guard.quietDenied, exitCode: 1 });
  try {
    for (const [index, id] of options.figures.entries()) {
      if (options.guard.tripped) return abort('aborted: guard');
      const result = await options.capture(id, index);
      results.push(result);
      if (options.guard.tripped) return abort('aborted: guard');
      if (result.status.startsWith('failed:')) return abort('aborted: safety');
    }
    await options.beforeCommit?.();
    if (options.guard.tripped) return abort('aborted: guard');
    const captured = results.filter(item => item.status === 'captured');
    if (captured.length) await options.commitOutputs(captured);
    return { status: 'completed', results, quietDenied: options.guard.quietDenied,
      exitCode: 0 };
  } catch {
    // Browser and capture errors may contain live page values. Never print them.
    console.error('Run error: capture aborted');
    if (options.guard.tripped) return abort('aborted: guard');
    return abort('aborted: safety');
  }
}
