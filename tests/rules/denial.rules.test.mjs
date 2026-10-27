// The classifier that decides whether a denial came from a false condition (and not from an evaluation error or the
// expression limit) is itself tested: unit cases for mixed messages, and a calibration against the previous rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDenial } from './harness.mjs';
import { FIXTURES } from './fixtures.base.mjs';
import './fixtures.sign.mjs';
import { observeAll } from './run-fixtures.mjs';

const LIMIT = 'Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached.';

test('classifyDenial looks only at the segments of the attempted operation', () => {
  assert.equal(classifyDenial("false for 'update' @ L10", 'update'), 'false');
  assert.equal(classifyDenial(`${LIMIT} for 'update' @ L10, false for 'update' @ L10`, 'update'), 'false+limit');
  assert.equal(classifyDenial("evaluation error at L5:24 for 'update' @ L10, false for 'update' @ L10", 'update'), 'false+error');
  // a false CREATE segment must not hide an UPDATE failure
  assert.equal(classifyDenial("evaluation error at L5:24 for 'update' @ L10, false for 'create' @ L9", 'update'), 'evaluation-error');
  assert.equal(classifyDenial(`${LIMIT} for 'update' @ L10, false for 'create' @ L9`, 'update'), 'expression-limit');
  assert.equal(classifyDenial(`${LIMIT} for 'update' @ L10, ${LIMIT} for 'update' @ L10`, 'update'), 'expression-limit');
  assert.equal(classifyDenial("false for 'create' @ L9", 'update'), 'unrecognised');
  assert.equal(classifyDenial('PERMISSION_DENIED: something else entirely', 'update'), 'unrecognised');
  assert.equal(classifyDenial("evaluation error at L5:24 for 'create' @ L9, false for 'create' @ L9", 'create'), 'false+error');
});

test('calibration: an ordinary denial carries an auxiliary error or limit segment next to its false segment', async () => {
  // D13c is refused by the outer gate (an unapproved non-editor) before anything heavy can run, so an error or a
  // limit segment next to the false one cannot be a real failure of the decisive evaluation.
  const observed = await observeAll(FIXTURES.filter(fixture => fixture.id === 'D13c'));
  assert.equal(observed.D13c.before, 'DENY');
  assert.equal(observed.D13c.after, 'DENY');
  for (const which of ['before', 'after']) {
    assert.match(observed.D13c[`${which}Why`], /^false/, `${which}: ${observed.D13c[`${which}Msg`]}`);
  }
});
