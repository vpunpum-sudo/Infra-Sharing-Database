import test from 'node:test';
import assert from 'node:assert/strict';
import { getConnectedEnclosureRoutes } from './enclosureRoutes';
import { FiberEnclosure, Route } from '../types';

const enclosure = { id: 'E', position: { lat: 13.75, lng: 100.5 } } as FiberEnclosure;
const route = (id: string, offset: number) => ({
  id,
  path: [{ lat: 13.75 + offset, lng: 100.499 }, { lat: 13.75 + offset, lng: 100.501 }]
}) as Route;

test('connected routes include a path through the enclosure and exclude a nearby parallel path', () => {
  assert.deepEqual(getConnectedEnclosureRoutes(enclosure, [route('connected', 0), route('nearby', 0.0001)]).map(r => r.id), ['connected']);
});

test('an explicit route endpoint remains connected even if its geometry is offset', () => {
  const endpointRoute = { ...route('endpoint', 0.0001), startEnclosureId: 'E' };
  assert.deepEqual(getConnectedEnclosureRoutes(enclosure, [endpointRoute]).map(r => r.id), ['endpoint']);
});
