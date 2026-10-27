import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-results');
export function writeObserved(name, rows) {
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const lines = ['| ID | Fixture | Declared (old/new) | Observed old | Observed new | Category |', '|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.id} | ${r.title} | ${(r.declared ?? ['?', '?']).join(' / ')} | ${r.before} | ${r.after} | ${r.category} |`)];
  writeFileSync(resolve(out, `rules-${name}.md`), `${lines.join('\n')}\n`);
}
