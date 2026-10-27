// Emulator harness for the signing-authority rules suite. The same fixtures run
// against the previous rules (fixtures/firestore.rules.before) and the current
// firestore.rules by swapping the ruleset over the emulator's REST API.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, deleteDoc, doc, getFirestore, setDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT = process.env.RULES_PROJECT || 'demo-signing-authority';
export const DB_ID = 'ai-studio-0f13f204-a764-4677-a292-7476ef7d2ece';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8187').split(':');
export const RULE_FILES = {
  before: resolve(here, 'fixtures/firestore.rules.before'),
  after: resolve(here, '../../firestore.rules'),
};

export async function setRules(which, text) {
  // A unique trailing comment defeats the emulator's content-keyed ruleset cache, which otherwise
  // can leave a previously loaded ruleset active when the same content is loaded twice.
  const content = `${text ?? readFileSync(RULE_FILES[which], 'utf8')}\n// load ${Date.now()}-${Math.random()}\n`;
  const response = await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/${PROJECT}/databases/${DB_ID}:securityRules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'security.rules', content }] } }),
  });
  if (!response.ok) throw new Error(`Rules "${which}" did not compile: ${(await response.text()).slice(0, 600)}`);
}

export async function clearData() {
  const response = await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/${PROJECT}/databases/${DB_ID}/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Could not clear emulator data: ${response.status}`);
}

const apps = [];
let counter = 0;
/** A Firestore client authenticated as the identity, or as the rules-bypassing owner when identity is null. */
export function clientFor(identity) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key' }, `rules-${counter += 1}`);
  const db = getFirestore(app, DB_ID);
  const token = identity ? { sub: identity.uid, user_id: identity.uid, email: identity.email } : 'owner';
  connectFirestoreEmulator(db, HOST, Number(PORT), { mockUserToken: token });
  apps.push(app);
  return db;
}
export async function closeClients() { await Promise.all(apps.splice(0).map(app => deleteApp(app))); }

/** Seeds documents (path -> data) with the rules-bypassing owner client. */
export async function seedDocs(docs) {
  const owner = clientFor(null);
  for (const [path, data] of Object.entries(docs)) await setDoc(doc(owner, path), data);
}
export async function removeDoc(path) { await deleteDoc(doc(clientFor(null), path)); }

/** Why the last attempt was denied: the emulator's message names a false condition, an evaluation error or the expression limit. */
export let lastDenial = '';
export async function attempt(action) {
  lastDenial = '';
  try { await action(); return 'ALLOW'; }
  catch (error) {
    if (error?.code === 'permission-denied' || String(error?.message).includes('PERMISSION_DENIED')) {
      lastDenial = String(error?.message).replace(/\s+/g, ' ');
      return 'DENY';
    }
    return `ERROR ${error?.code ?? ''} ${String(error?.message).slice(0, 160)}`;
  }
}
const SEGMENT = /(false|evaluation error at L\d+:\d+|Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached\.) for '(create|update|delete|get|list)' @ L\d+/g;
/** The emulator's denial message is a list of "<outcome> for '<operation>' @ L<line>" segments, one per evaluated statement. */
export function denialSegments(message) {
  return [...String(message).matchAll(SEGMENT)].map(match => ({
    kind: match[1] === 'false' ? 'false' : match[1].startsWith('evaluation error') ? 'error' : 'limit', op: match[2],
  }));
}
/**
 * Classifies a denial for the operation the fixture attempted.
 *  'false'           the decisive statement for that operation was false and nothing else went wrong for it
 *  'false+limit'     false, plus an auxiliary "expression limit" segment (see the calibration test: the previous
 *                    rules show it on denials that stop at the very first condition, so it is not a budget signal)
 *  'false+error'     false, plus an evaluation error for the same operation (accepted only when the previous rules
 *                    raise the same error for the same payload)
 *  'evaluation-error' / 'expression-limit'  no false segment for the operation: a real failure
 *  'unrecognised'    no segment for the operation at all
 */
export function classifyDenial(message = lastDenial, op = 'update') {
  const mine = denialSegments(message).filter(segment => segment.op === op);
  if (!mine.length) return 'unrecognised';
  const kinds = new Set(mine.map(segment => segment.kind));
  if (kinds.has('false')) return kinds.has('error') ? 'false+error' : kinds.has('limit') ? 'false+limit' : 'false';
  return kinds.has('error') ? 'evaluation-error' : 'expression-limit';
}
