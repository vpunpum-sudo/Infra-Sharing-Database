import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPECTED } from './expectations.mjs';
import { observeAll, categoryOf } from './run-fixtures.mjs';
import { FIXTURES } from './fixtures.base.mjs';
import { writeObserved } from './report.mjs';

/** Registers one test: every fixture of the groups must match its declared old/new outcome. */
export function declaredMatchesObserved(groups, reportName) {
  const only = process.env.RULES_ONLY ? process.env.RULES_ONLY.split(',') : null;
  const selected = FIXTURES.filter(f => groups.includes(f.group) && (!only || only.includes(f.id)));
  test(`declared outcomes match the observed old and new rules (${groups.join(', ')})`, { timeout: 1_800_000 }, async () => {
    const observed = await observeAll(selected);
    const rows = selected.map(f => ({ id: f.id, title: f.title, declared: EXPECTED[f.id], before: observed[f.id].before, after: observed[f.id].after,
      category: categoryOf(observed[f.id].before, observed[f.id].after) }));
    writeObserved(reportName, rows);
    const problems = [];
    for (const row of rows) {
      if (!row.declared) problems.push(`${row.id}: no declared expectation (observed ${row.before}/${row.after})`);
      else if (row.declared[0] !== row.before || row.declared[1] !== row.after) problems.push(`${row.id}: declared ${row.declared.join('/')} observed ${row.before}/${row.after}  — ${row.title}`);
      // A DENY by the new rules must come from a false condition for the operation attempted: the decisive
      // statement is false. A segment that only reports an evaluation error or the expression limit for that
      // operation, with no false segment, is a real failure. (The emulator also attaches an auxiliary error or
      // limit segment to ordinary false denials; denial.rules.test.mjs calibrates that on a denial that stops at
      // the very first condition.)
      if (row.after === 'DENY') {
        const o = observed[row.id];
        if (!['false', 'false+limit', 'false+error'].includes(o.afterWhy))
          problems.push(`${row.id}: denied as '${o.afterWhy}', not by a false condition (${String(o.afterMsg).slice(0, 220)})`);
      }
      if (row.category === 'INTENTIONALLY-CHANGED') problems.push(`${row.id}: INTENTIONALLY-CHANGED (old ${row.before}, new ${row.after})`);
    }
    assert.deepEqual(problems, []);
  });
}
