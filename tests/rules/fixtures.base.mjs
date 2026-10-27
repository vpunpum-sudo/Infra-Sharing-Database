import { doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { DB_PROJECT, project, world } from './world.mjs';

export const FIXTURES = [];
/** Register a fixture. build() returns { docs, proj, ...extra }; run(ctx) performs the faithful write(s). */
export function fx(id, group, title, spec) {
  if (FIXTURES.some(item => item.id === id)) throw new Error(`Duplicate fixture id ${id}`);
  FIXTURES.push({ id, group, title, ...spec });
}

export const ref = db => doc(db, DB_PROJECT);

/** Applies a client payload ({status, designApproval}) to a project copy, for multi-step flows. */
export function applyWrite(proj, payload) {
  const next = structuredClone(proj);
  if ('owners' in payload) next.owners = structuredClone(payload.owners);
  if ('status' in payload) next.status = payload.status;
  if ('designApproval' in payload) {
    if (payload.designApproval?._methodName === 'deleteField') delete next.designApproval; else next.designApproval = payload.designApproval;
  }
  return next;
}

/** Runs writes in order, each from the state left by the previous one. Stops at the first non-ALLOW. */
export async function sequence(ctx, steps) {
  let proj = ctx.proj;
  for (const step of steps) {
    const payload = step.payload(proj);
    await updateDoc(ref(ctx.as(step.as)), payload);
    proj = applyWrite(proj, payload);
  }
}

export const update = (ctx, payload, actor) => updateDoc(ref(actor ? ctx.as(actor) : ctx.db), payload);
export const merge = (ctx, payload, actor) => setDoc(ref(actor ? ctx.as(actor) : ctx.db), payload, { merge: true });
export const inTransaction = (ctx, payload, actor) => {
  const db = actor ? ctx.as(actor) : ctx.db;
  return runTransaction(db, async transaction => { await transaction.get(ref(db)); transaction.update(ref(db), payload); });
};

/** A seeded world: the default project unless overridden. Returns the builder fx() expects.
 *  Every build deep-copies its inputs: the old-rules and new-rules runs must each start from pristine data,
 *  because fixtures (and the payload builders) mutate the objects they are given. */
export const scen = (options = {}) => () => {
  const copy = structuredClone(options);
  const proj = copy.proj ?? project();
  return { docs: world({ proj, snap: copy.snap, roles: copy.roles, extra: copy.extra }), proj };
};
