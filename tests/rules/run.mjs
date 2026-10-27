#!/usr/bin/env node
// `npm run test:rules`: runs the Firestore rules suite on the Firestore emulator in Enterprise edition
// against the named database. Needs a JRE (Java 21 works) and the firebase CLI. It is NOT part of
// `npm run verify`, which stays JRE-free. See docs/specs/signing-authority-firestore-rules.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fail = message => { console.error(`test:rules cannot run: ${message}`); process.exit(2); };

const javaHome = process.env.JAVA_HOME || (existsSync(resolve(root, '.context/java/Contents/Home')) ? resolve(root, '.context/java/Contents/Home') : '');
const env = { ...process.env, ...(javaHome ? { JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH}` } : {}), FIREBASE_CLI_DISABLE_UPDATE_CHECK: '1' };
if (spawnSync('java', ['-version'], { env, stdio: 'ignore' }).status !== 0) fail('Java (a JRE, version 21 or newer) was not found. Install one or set JAVA_HOME.');
if (spawnSync('firebase', ['--version'], { env, stdio: 'ignore' }).status !== 0) fail('the firebase CLI was not found (npm i -g firebase-tools).');

delete env.FIRESTORE_EMULATOR_HOST;
const logPath = resolve(root, 'firestore-debug.log');
const result = spawnSync('firebase', ['emulators:exec', '--config', 'tests/rules/firebase.json', '--project', 'demo-signing-authority', '--only', 'firestore',
  'node --test --test-concurrency=1 tests/rules/predicates.test.mjs tests/rules/signing.rules.test.mjs tests/rules/rewind.rules.test.mjs tests/rules/create.rules.test.mjs tests/rules/limits.rules.test.mjs tests/rules/denial.rules.test.mjs tests/rules/sweep.rules.test.mjs'],
  { cwd: root, env, stdio: 'inherit' });

// The suites share one emulator and swap its ruleset, so they must not run in parallel (--test-concurrency=1).
// Secondary evidence only. The emulator prefixes many denials, including those of the previous rules, with an
// "expression limit" segment from an auxiliary evaluation, so the count below is NOT a failure signal. The
// authoritative checks are per fixture (a denial must come from a false condition) and limits.rules.test.mjs (ALLOW margin).
if (existsSync(logPath)) {
  const traces = readFileSync(logPath, 'utf8').split('\n').filter(line => /maximum of 1000 expressions/.test(line)).length;
  console.log(`note: ${traces} auxiliary expression-limit trace(s) in firestore-debug.log (also produced by the previous rules; not a failure signal)`);
}
process.exit(result.status ?? 1);
