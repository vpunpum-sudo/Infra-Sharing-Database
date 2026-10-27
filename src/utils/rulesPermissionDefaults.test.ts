import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PERMISSIONS } from '../constants';

// firestore.rules cannot import the client defaults, so signerMayWrite copies the roles that hold
// approvePlanning / approveOM by default. This JRE-free test pins the copy to DEFAULT_PERMISSIONS.
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const ROLES = ['Admin', 'Management', 'Planning', 'Design', 'Viewer', 'Sub-contract'] as const;

function roleList(level: 'Planning' | 'OM'): string[] {
  const start = rules.indexOf('let byDefault = ');
  assert.notEqual(start, -1, 'byDefault role lists not found in firestore.rules');
  const lists = rules.slice(start, start + 400).match(/u\.role in \[([^\]]*)\]/g) ?? [];
  const raw = lists[level === 'Planning' ? 0 : 1];
  assert.ok(raw, `no ${level} role list found`);
  return [...raw.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

test('the approvePlanning default roles in firestore.rules equal DEFAULT_PERMISSIONS', () => {
  const fromConstants = ROLES.filter(role => DEFAULT_PERMISSIONS[role].approvePlanning);
  assert.deepEqual([...roleList('Planning')].sort(), [...fromConstants].sort());
});

test('the approveOM default roles in firestore.rules equal DEFAULT_PERMISSIONS', () => {
  const fromConstants = ROLES.filter(role => DEFAULT_PERMISSIONS[role].approveOM);
  assert.deepEqual([...roleList('OM')].sort(), [...fromConstants].sort());
});

test('the pin covers all six roles and the signing predicate keeps reading the saved role document', () => {
  assert.deepEqual(Object.keys(DEFAULT_PERMISSIONS).sort(), [...ROLES].sort());
  assert.match(rules, /rolePermissions\/\$\(u\.role\)/);
  assert.match(rules, /'approvePlanning' : 'approveOM'/);
});
