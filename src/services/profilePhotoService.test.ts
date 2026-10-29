import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhotoJob, type PhotoCheckpoint, type PhotoDependencies } from './profilePhotoService';
import { PHOTO_MESSAGES } from '../utils/profilePhoto';
const name = 'avatar-1790000000000-0123456789abcdef.jpg';
const old = 'avatar-1780000000000-fedcba9876543210.jpg';
const urlFor = (name: string) => `https://host.test/v0/b/demo.bucket/o/${encodeURIComponent(`profile-photos/u/${name}`)}?alt=media&token=demo`;
const checkpoint = (kind: 'upload' | 'remove' = 'upload'): PhotoCheckpoint => ({ kind, blob:new Blob(['photo']), previousUrl:urlFor(old), authUpdated:false,firestoreUpdated:false });
function fake() {
  const calls: [string, unknown][] = [];
  let fail = '', current = true, count = 0, staleAt = '';
  const values = { auth: urlFor(old) as string|null, document: { photoURL: urlFor(old), displayName:'stored', role:'design', outOfBand:'new' } };
  const step = async (key: string, value?: unknown) => {
    calls.push([key,value]); if (staleAt===key) current=false;
    if(fail===key) throw {code:key==='upload'?'storage/unauthorized':'unknown',message:'raw-not-for-ui'};
  };
  const deps: PhotoDependencies = {
    uid:'u',bucket:'demo.bucket',newObjectName:()=>`avatar-179000000000${count++}-0123456789abcdef.jpg`,
    uploadBytes: async path => step('upload',path),
    getDownloadURL: async path => { await step('url',path); return urlFor(path.split('/').at(-1)!); },
    updateAuthPhoto: async photoURL => { await step('auth',{photoURL}); values.auth=photoURL; },
    writeUserPhoto: async photoURL => { await step('firestore',{photoURL}); values.document={...values.document,photoURL}; },
    deleteObject: async path => step('delete',path), logSuccess: async () => step('log')
  };
  return { deps,calls,values,isCurrent:()=>current,setCurrent:(v:boolean)=>{current=v;},setFail:(v:string)=>{fail=v;},setStale:(v:string)=>{staleAt=v;} };
}
const keys = (calls: [string,unknown][]) => calls.map(c=>c[0]);
test('9,18,19: ordered upload, URL, Auth photo only, Firestore photo only, cleanup, log', async () => {
  const f=fake(), cp=checkpoint();
  assert.equal((await runPhotoJob(cp,f.deps,f.isCurrent)).status,'done');
  assert.deepEqual(keys(f.calls),['upload','url','auth','firestore','delete','log']);
  assert.equal(cp.objectPath,`profile-photos/u/${name}`);
  assert.equal(f.values.auth,cp.uploadedUrl); assert.equal(f.values.document.photoURL,cp.uploadedUrl);
  assert.equal(f.values.document.displayName,'stored'); assert.equal(f.values.document.outOfBand,'new');
  for (const [key,value] of f.calls) if(['auth','firestore'].includes(key)) assert.deepEqual(Object.keys(value as object),['photoURL']);
});
for (const [failure,expected] of [
  ['upload',['upload','url','auth','firestore','delete','log']],
  ['url',['url','auth','firestore','delete','log']],
  ['auth',['auth','firestore','delete','log']],
  ['firestore',['firestore','delete','log']]
] as const) test(`10–14: failure at ${failure} retains checkpoints and retries only missing steps`, async () => {
  const f=fake(),cp=checkpoint(); f.setFail(failure);
  const result=await runPhotoJob(cp,f.deps,f.isCurrent);
  assert.equal(result.status,'failed'); assert.equal(f.calls.some(c=>c[0]==='delete'),false);
  assert.equal(cp.authUpdated,failure==='firestore'); assert.equal(cp.firestoreUpdated,false);
  if(failure==='upload') assert.equal(result.message,PHOTO_MESSAGES.unauthorized);
  const path=cp.objectPath;
  f.calls.length=0;f.setFail('');
  assert.equal((await runPhotoJob(cp,f.deps,f.isCurrent)).status,'done');
  assert.deepEqual(keys(f.calls),expected);
  if(path) assert.equal(cp.objectPath,path);
  else assert.notEqual(cp.objectPath,`profile-photos/u/${name}`); // failed/ambiguous upload uses a fresh name
});
test('15: generation invalidated before any next step stops writes (including an already-issued write)', async () => {
  for (const stage of ['upload','url','auth','firestore','delete','log']) {
    const f=fake(),cp=checkpoint();f.setStale(stage);
    assert.equal((await runPhotoJob(cp,f.deps,f.isCurrent)).status,'stale');
    assert.equal(keys(f.calls).at(-1),stage);
    if(stage==='auth') assert.equal(cp.authUpdated,true); // issued writes can complete; Firestore cannot start
  }
  const f=fake();f.setCurrent(false);
  assert.equal((await runPhotoJob(checkpoint(),f.deps,f.isCurrent)).status,'stale');assert.deepEqual(f.calls,[]);
});
test('15: stale failed A cannot overwrite successful later choice B', async () => {
  const f=fake(),a=checkpoint();f.setFail('firestore');await runPhotoJob(a,f.deps,f.isCurrent);
  f.setFail(''); const b=checkpoint();await runPhotoJob(b,f.deps,f.isCurrent);
  const count=f.calls.length;
  assert.equal((await runPhotoJob(a,f.deps,()=>false)).status,'stale');
  assert.equal(f.calls.length,count);assert.equal(f.values.document.photoURL,b.uploadedUrl);assert.equal(f.values.auth,b.uploadedUrl);
});
test('21,25: unmanaged previous URLs never cause a Storage delete; removal makes zero Storage calls', async () => {
  for(const kind of ['remove','upload'] as const) {
    const f=fake(),cp={...checkpoint(kind),previousUrl:'https://google.example/old-photo'};
    assert.equal((await runPhotoJob(cp,f.deps,f.isCurrent)).status,'done');
    assert.equal(f.calls.some(c=>c[0]==='delete'),false);
    if(kind==='remove') { assert.deepEqual(keys(f.calls),['auth','firestore','log']);assert.equal(f.values.auth,null);assert.equal(f.values.document.photoURL,''); }
  }
});
test('22–23: removal checkpoints Auth/null and Firestore/empty; deletion and logging failures are best effort', async () => {
  const f=fake(),cp=checkpoint('remove');f.setFail('firestore');
  assert.equal((await runPhotoJob(cp,f.deps,f.isCurrent)).status,'failed');
  assert.equal(cp.authUpdated,true);assert.equal(f.values.auth,null);
  f.calls.length=0;f.setFail('delete');
  assert.equal((await runPhotoJob(cp,f.deps,f.isCurrent)).status,'done');
  assert.deepEqual(keys(f.calls),['firestore','delete','log']);assert.equal(f.values.document.photoURL,'');
  for(const failure of ['auth','delete','log']) {
    const f=fake(),cp=checkpoint('remove');f.setFail(failure);
    assert.equal((await runPhotoJob(cp,f.deps,f.isCurrent)).status,failure==='auth'?'failed':'done');
    if(failure==='auth') { f.calls.length=0;f.setFail(''); await runPhotoJob(cp,f.deps,f.isCurrent);assert.deepEqual(keys(f.calls),['auth','firestore','delete','log']); }
  }
});
test('27: invalid/overlong download URL never reaches Auth/Firestore and retrieval is retried', async () => {
  for(const url of ['', 'https://example.test/'+'x'.repeat(981),'javascript:alert(1)']) {
    const f=fake(),cp=checkpoint();f.deps.getDownloadURL=async()=>url;
    const result=await runPhotoJob(cp,f.deps,f.isCurrent);
    assert.equal(result.message,PHOTO_MESSAGES.url);assert.deepEqual(keys(f.calls),['upload']);assert.equal(cp.uploadedUrl,undefined);
    f.deps.getDownloadURL=async()=>urlFor(name);
    await runPhotoJob(cp,f.deps,f.isCurrent);assert.equal(keys(f.calls).filter(k=>k==='upload').length,1);
  }
});
test('old object is not deleted if it is the newly uploaded object', async()=>{
  const f=fake(),cp={...checkpoint(),previousUrl:urlFor(name)};
  await runPhotoJob(cp,f.deps,f.isCurrent);assert.equal(f.calls.some(c=>c[0]==='delete'),false);
});
