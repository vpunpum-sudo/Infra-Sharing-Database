import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRouteReadiness, routeReadinessMessage } from './wiScreenshotReadiness';

const sample = (t: number, count: number, emptyState = count === 0) => ({ t, count, emptyState });

test('late data remains waiting through empty state and becomes ready after observed stability', () => {
  const samples = [sample(0, 0), sample(3000, 0), sample(3001, 2), sample(3800, 2)];
  for (let i = 1; i <= samples.length; i++) assert.deepEqual(evaluateRouteReadiness(samples.slice(0, i)), { state: 'waiting' });
  assert.deepEqual(evaluateRouteReadiness([...samples, sample(4001, 2)]), { state: 'ready', count: 2 });
});

test('growth or a drop resets the observed stability window', () => {
  const samples = [sample(0, 1), sample(300, 2), sample(600, 3), sample(1300, 3)];
  assert.deepEqual(evaluateRouteReadiness(samples), { state: 'waiting' });
  assert.deepEqual(evaluateRouteReadiness([...samples, sample(1600, 3)]), { state: 'ready', count: 3 });
  assert.deepEqual(evaluateRouteReadiness([sample(0, 2), sample(1000, 1)]), { state: 'waiting' });
  assert.deepEqual(evaluateRouteReadiness([sample(0, 2), sample(1000, 1), sample(2000, 1)]), { state: 'ready', count: 1 });
});

test('stability uses elapsed sample time, never sample count', () => {
  assert.deepEqual(evaluateRouteReadiness([sample(0, 1)]), { state: 'waiting' });
  assert.deepEqual(evaluateRouteReadiness([sample(0, 1), sample(1, 1), sample(2, 1)]), { state: 'waiting' });
  assert.deepEqual(evaluateRouteReadiness([sample(0, 1), sample(1000, 1)]), { state: 'ready', count: 1 });
});

test('empty and unstable timeouts have distinct, useful messages', () => {
  assert.deepEqual(evaluateRouteReadiness([sample(0, 0), sample(19_999, 0)]), { state: 'waiting' });
  const empty = evaluateRouteReadiness([sample(0, 0), sample(20_000, 0)]);
  assert.deepEqual(empty, { state: 'timeout-empty' });
  assert.match(routeReadinessMessage(empty, 'sample') ?? '', /No routes found in project sample, or route data did not load within 20s/);
  const unstable = evaluateRouteReadiness([sample(0, 1), sample(19_500, 2), sample(20_000, 3)]);
  assert.deepEqual(unstable, { state: 'timeout-unstable', count: 3 });
  assert.match(routeReadinessMessage(unstable, 'sample') ?? '', /route list was still changing after 20s \(last count 3\)/);
});
