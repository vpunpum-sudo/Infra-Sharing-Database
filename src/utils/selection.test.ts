import test from 'node:test';
import assert from 'node:assert/strict';
import { countActiveFilters, reconcileSelection } from './selection';

test('no selection is never cleared', () => {
  assert.deepEqual(reconcileSelection(undefined, ['a'], true), { id: undefined, cleared: false });
  assert.deepEqual(reconcileSelection(undefined, [], false), { id: undefined, cleared: false });
});

test('selection is kept while the list is still loading', () => {
  assert.deepEqual(reconcileSelection('r1', [], false), { id: 'r1', cleared: false });
  assert.deepEqual(reconcileSelection('r1', new Set<string>(), false), { id: 'r1', cleared: false });
});

test('selection that still exists survives a refresh (array and set)', () => {
  assert.deepEqual(reconcileSelection('r1', ['r0', 'r1'], true), { id: 'r1', cleared: false });
  assert.deepEqual(reconcileSelection('r1', new Set(['r1']), true), { id: 'r1', cleared: false });
});

test('selection that disappeared is cleared with cleared=true', () => {
  assert.deepEqual(reconcileSelection('r1', ['r2'], true), { id: undefined, cleared: true });
  assert.deepEqual(reconcileSelection('r1', new Set<string>(), true), { id: undefined, cleared: true });
});

test('countActiveFilters counts non-empty values after trim', () => {
  assert.equal(countActiveFilters({ query: 'abc', owner: 'UIH' }), 2);
  assert.equal(countActiveFilters({ query: '   ', owner: '' }), 0);
  assert.equal(countActiveFilters({ query: undefined, owner: null }), 0);
  assert.equal(countActiveFilters({}), 0);
});

test('countActiveFilters ignores values equal to the neutral default', () => {
  assert.equal(countActiveFilters({ sort: 'name-asc', owner: 'UIH' }, { sort: 'name-asc' }), 1);
  assert.equal(countActiveFilters({ sort: 'name-desc', owner: '' }, { sort: 'name-asc' }), 1);
  assert.equal(countActiveFilters({ owner: 'all' }, { owner: 'all' }), 0);
});
