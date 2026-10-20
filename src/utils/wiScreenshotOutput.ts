import { basename } from 'node:path';

export const GIT_RECOVERY_COMMAND = 'git checkout -- public/wi src/content/wiScreenshotMarks.ts';
export type OutputEntry = { staged: string; target: string };
export type OutputFs = {
  exists(path: string): Promise<boolean>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string): Promise<void>;
};

export function planStaleCleanup(entries: { name: string; isDirectory: boolean }[]): string[] {
  return entries.filter(entry => entry.isDirectory && entry.name.startsWith('.wi-screenshots-tmp-') && entry.name.length > '.wi-screenshots-tmp-'.length).map(entry => entry.name);
}

export async function commitOutputs(entries: OutputEntry[], fsOps: OutputFs, tempDir: string): Promise<
  | { ok: true }
  | { ok: false; error: string; rollback: 'restored' | 'failed'; tempDir: string; backups: string[]; recoveryHint: string }
> {
  const backups: { source: string; backup: string }[] = [];
  const installed: string[] = [];
  try {
    for (const entry of entries) {
      if (await fsOps.exists(entry.target)) {
        const backup = `${tempDir}/${basename(entry.target)}.bak`;
        await fsOps.rename(entry.target, backup);
        backups.push({ source: entry.target, backup });
      }
    }
    for (const entry of entries) {
      await fsOps.rename(entry.staged, entry.target);
      installed.push(entry.target);
    }
    for (const item of backups) await fsOps.rm(item.backup);
    return { ok: true };
  } catch (error) {
    let rollback: 'restored' | 'failed' = 'restored';
    for (const target of installed.reverse()) {
      try { await fsOps.rm(target); } catch { rollback = 'failed'; }
    }
    for (const item of backups.reverse()) {
      try { await fsOps.rename(item.backup, item.source); } catch { rollback = 'failed'; }
    }
    return {
      ok: false, error: error instanceof Error ? error.message : String(error), rollback, tempDir,
      backups: backups.map(item => item.backup).filter(Boolean), recoveryHint: GIT_RECOVERY_COMMAND
    };
  }
}
