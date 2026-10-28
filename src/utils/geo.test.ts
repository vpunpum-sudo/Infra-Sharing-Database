import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDistanceMeters, distanceKmText } from './geo';
const p = (lng: number) => ({ lat: 0, lng });
const ends = [{ id: 'a', position: p(0) }, { id: 'b', position: p(.02) }];
const endpointRoute = { startEnclosureId: 'a', endEnclosureId: 'b' };
const km = (route: unknown, enclosures: unknown = []) => distanceKmText(routeDistanceMeters(route, enclosures));

test('1–4,8: drawn metres override stored lengths/marks, with explicit endpoint fallback and no cap', () => {
  for (const totalLength of [0, 250000]) {
    const route = { totalLength, path: [p(0), p(.01)] };
    assert.equal(km(route), '1.11');
    assert.ok(Math.abs(routeDistanceMeters(route, [])! - 1111.9492664455875) < 1e-6);
  }
  assert.equal(km({ totalLength: 1500, markStart: 100, markEnd: 1600, path: [p(0), p(.02), p(.03)] }), '3.34');
  assert.equal(km({ markStart: 100, markEnd: 1600 }), '-');
  assert.equal(km({ ...endpointRoute, totalLength: 900 }, ends), '2.22');
  assert.equal(km({}), '-');
  assert.equal(km({ totalLength: 5, path: [p(0), p(3)] }), '333.58');
});

test('5–6: ordinary malformed inputs are filtered without throwing', () => {
  const invalid = [null, undefined, 5, 'a', { lat: 'x', lng: 0 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }];
  assert.equal(km({ path: [p(0), ...invalid, p(.01)] }), '1.11');
  assert.equal(km({ path: [{ lat: 'x', lng: 0 }, p(0)] }), '-');
  for (const path of ['abc', {}, 5, invalid, [...invalid, p(0)]]) {
    assert.equal(km({ ...endpointRoute, path }, [null, ...ends]), '2.22');
  }
  for (const route of [null, undefined, 5, 'a', endpointRoute]) {
    for (const enclosures of [null, undefined, {}, [null, { id: 'a', position: null }]]) {
      assert.equal(routeDistanceMeters(route, enclosures), undefined);
    }
  }
  assert.equal(km(endpointRoute, new Map(ends.map(e => [e.id, e]))), '2.22');
});

test('7: coincident path and endpoint positions are known zero', () => {
  assert.equal(routeDistanceMeters({ ...endpointRoute, path: [p(0), p(0)] }, ends), 0);
  assert.equal(km({ path: [p(0), p(0)] }), '0.00');
  assert.equal(km(endpointRoute, ends.map(e => ({ ...e, position: p(0) }))), '0.00');
});

test('9: overflow path falls back, non-finite endpoints remain unknown', () => {
  const path = [{ lat: 1.7e308, lng: 0 }, { lat: -1.7e308, lng: 0 }];
  assert.equal(km({ path }), '-');
  assert.equal(km({ ...endpointRoute, path }, ends), '2.22');
  assert.equal(km({ ...endpointRoute, path }, ends.map((e, i) => ({ ...e, position: path[i] }))), '-');
});

test('12: formatting distinguishes unknown and zero', () => {
  for (const meters of [undefined, NaN, Infinity, -Infinity, -5, -.001, '12', null]) {
    assert.equal(distanceKmText(meters as any), '-');
  }
  assert.equal(distanceKmText(0), '0.00');
});
