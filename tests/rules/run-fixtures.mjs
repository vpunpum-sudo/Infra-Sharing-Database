import { attempt, classifyDenial, clearData, clientFor, closeClients, seedDocs, setRules } from './harness.mjs';
import * as harness from './harness.mjs';
import { identity } from './world.mjs';

/** Runs every fixture against the previous rules and the current rules. Returns { id: { before, after } }. */
export async function observeAll(fixtures) {
  const observed = Object.fromEntries(fixtures.map(f => [f.id, {}]));
  for (const which of ['before', 'after']) {
    await setRules(which);
    for (const f of fixtures) {
      await clearData();
      const built = f.build();
      await seedDocs(built.docs);
      const cache = {};
      const ctx = {
        ...built,
        as: name => (cache[name] ??= clientFor(identity(name))),
        get db() { return this.as(f.actor); },
      };
      observed[f.id][which] = await attempt(() => f.run(ctx));
      if (observed[f.id][which] === 'DENY') {
        const op = f.op ?? (f.group === 'create' ? 'create' : 'update');
        observed[f.id][`${which}Why`] = classifyDenial(harness.lastDenial, op);
        observed[f.id][`${which}Msg`] = harness.lastDenial;
      }
      await closeClients();
    }
  }
  return observed;
}

export function categoryOf(before, after) {
  if (before === 'ALLOW' && after === 'ALLOW') return 'UNCHANGED-ALLOW';
  if (before === 'DENY' && after === 'DENY') return 'UNCHANGED-DENY';
  if (before === 'ALLOW' && after === 'DENY') return 'CLOSED-HOLE';
  return 'INTENTIONALLY-CHANGED';
}
