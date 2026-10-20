export function selectRoute(names: string[], wanted?: string):
  | { ok: true; index: number }
  | { ok: false; error: 'not-found'; names: string[] }
  | { ok: false; error: 'ambiguous'; matches: string[] } {
  if (!names.length) return { ok: false, error: 'not-found', names };
  if (!wanted?.trim()) return { ok: true, index: 0 };
  const matches = names.map((name, index) => ({ name, index })).filter(item => item.name.trim() === wanted.trim());
  if (!matches.length) return { ok: false, error: 'not-found', names };
  if (matches.length > 1) return { ok: false, error: 'ambiguous', matches: matches.map(item => item.name) };
  return { ok: true, index: matches[0].index };
}
