import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotonResponse } from './placeSearch';

test('turns Photon features into place rows and drops ones without a point or name', () => {
  const rows = parsePhotonResponse({ features: [
    { geometry: { coordinates: [100.5853, 13.7449] }, properties: { osm_id: 1, name: 'ซอยเพชรบุรี 47', street: 'ถนนเพชรบุรี', district: 'ห้วยขวาง', city: 'กรุงเทพมหานคร', country: 'ประเทศไทย', osm_value: 'residential' } },
    { geometry: { coordinates: [100.5853, 13.7449] }, properties: { osm_id: 2, name: 'ซอยเพชรบุรี 47', city: 'กรุงเทพมหานคร' } },
    { properties: { name: 'No point' } },
    { geometry: { coordinates: [100.5, 13.7] }, properties: {} }
  ] });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { id: '1', name: 'ซอยเพชรบุรี 47', detail: 'ถนนเพชรบุรี, ห้วยขวาง, กรุงเทพมหานคร, ประเทศไทย',
    lat: 13.7449, lng: 100.5853, kind: 'residential' });
});
