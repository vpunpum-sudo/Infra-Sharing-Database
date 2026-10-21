import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest, compareCounts, projectListsLoaded, createGuard, describeRequest, functionsOriginFor } from './wiScreenshotGuard';

const functionsOrigin = 'https://asia-southeast1-demo.cloudfunctions.net';
const classify = (method: string, url: string) => classifyRequest({ method, url }, { functionsOrigin });
test('classifier blocks writes and every callable except the exact quiet denial', () => {
  const f = 'https://firestore.googleapis.com';
  const s = 'https://firebasestorage.googleapis.com/v0/b/demo/o/file?alt=media';
  for (const method of ['POST', 'GET']) assert.equal(classify(method, `${f}/google.firestore.v1.Firestore/Listen/channel?x=1`), 'allow');
  for (const path of ['documents:runQuery', 'documents:batchGet', 'documents:runAggregationQuery']) assert.equal(classify('POST', `${f}/v1/projects/demo/databases/(default)/${path}`), 'allow');
  for (const path of ['documents:commit', 'documents:batchWrite', 'google.firestore.v1.Firestore/Write/channel']) assert.equal(classify('POST', `${f}/${path}`), 'block');
  for (const method of ['PATCH', 'DELETE']) assert.equal(classify(method, `${f}/v1/projects/demo/databases/(default)/documents/projects/x`), 'block');
  assert.equal(classify('GET', s), 'allow');
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(classify(method, s), 'block');
  assert.equal(classify('POST', `${functionsOrigin}/getProjectCreatedDates`), 'deny-quiet');
  for (const method of ['GET', 'OPTIONS']) assert.equal(classify(method, `${functionsOrigin}/getProjectCreatedDates`), 'block');
  for (const path of ['/getProjectCreatedDatesX', '/x/getProjectCreatedDates/extra', '/getProjectCreatedDates/', '/createManagedUser', '/deleteManagedUser', '/manageProjectFile']) assert.equal(classify('POST', `${functionsOrigin}${path}`), 'block');
  for (const origin of ['https://us-central1-demo.cloudfunctions.net', 'https://asia-southeast1-other.cloudfunctions.net', 'https://demo.run.app']) assert.equal(classify('POST', `${origin}/getProjectCreatedDates`), 'block');
  for (const path of ['accounts:signInWithPassword', 'accounts:lookup']) assert.equal(classify('POST', `https://identitytoolkit.googleapis.com/v1/${path}`), 'allow');
  for (const path of ['accounts:update', 'accounts:delete', 'accounts:sendOobCode']) assert.equal(classify('POST', `https://identitytoolkit.googleapis.com/v1/${path}`), 'block');
  assert.equal(classify('POST', 'https://securetoken.googleapis.com/v1/token'), 'allow');
  assert.equal(classify('POST', 'https://unknown.example/x'), 'block');
  assert.equal(classify('GET', 'https://tile.openstreetmap.org/1/2/3.png'), 'allow');
  assert.equal(classify('GET', 'http://127.0.0.1:3000/'), 'allow');
  assert.equal(describeRequest({ method: 'POST', url: `${f}/google.firestore.v1.Firestore/Write/channel?x=1` }), 'POST firestore.googleapis.com /google.firestore.v1.Firestore/Write/channel');
  assert.equal(functionsOriginFor('demo'), functionsOrigin);
});

test('write blocking applies during sign-in and capture; only authentication and read requests continue', () => {
  const guard = createGuard({ functionsOrigin });
  const blocked = { method: 'POST', url: 'https://unknown.example/x' };
  const quiet = { method: 'POST', url: `${functionsOrigin}/getProjectCreatedDates` };
  assert.equal(guard.handle(quiet), 'abort');
  assert.equal(guard.quietDenied, 1);
  assert.equal(guard.tripped, false);
  assert.equal(guard.handle({ method: 'POST', url: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword' }), 'continue');
  assert.equal(guard.handle({ method: 'POST', url: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel' }), 'continue');
  assert.equal(guard.handle(blocked), 'abort');
  assert.equal(guard.tripped, true);
  assert.equal(guard.blocked.length, 1);
  assert.equal(guard.observed.length, 1);
});

test('count comparison detects a changed route, enclosure, or loop count', () => {
  assert.equal(compareCounts({ routes: 1, enclosures: 2, loops: 3 }, { routes: 1, enclosures: 2, loops: 3 }), true);
  assert.equal(compareCounts({ routes: 1, enclosures: 2, loops: 3 }, { routes: 1, enclosures: 1, loops: 3 }), false);
});

test('counts are trusted only after every project list has loaded, even when listeners arrive at different times', () => {
  assert.equal(projectListsLoaded(''), false);
  assert.equal(projectListsLoaded('routes'), false);
  assert.equal(projectListsLoaded('enclosures routes'), false);
  assert.equal(projectListsLoaded('enclosures loops routes'), true);
  assert.equal(projectListsLoaded(null), false);
});
