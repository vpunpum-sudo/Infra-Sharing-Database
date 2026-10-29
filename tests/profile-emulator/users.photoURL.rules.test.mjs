import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { doc,setDoc,getDoc } from 'firebase/firestore';
// Reuse the existing named-database harness without changing it. The launcher supplies RULES_PROJECT.
import { PROJECT,clientFor,seedDocs,closeClients } from '../rules/harness.mjs';
if(PROJECT!=='demo-profile-settings')throw Error('Run through npm run test:profile-emulator (demo project only)');
after(closeClients);
test('33: photo-only merges preserve displayName, role, owner, approval, email and out-of-band values',async()=>{
  const uid='profile-owner';const email='owner@example.test';
  const before={id:uid,email,role:'Design',owner:'None',isApproved:true,displayName:'Stored name',outOfBand:'preserve',photoURL:'https://old.example/photo'};
  await seedDocs({[`users/${uid}`]:before});
  const db=clientFor({uid,email}),target=doc(db,'users',uid);
  for(const photoURL of ['https://example.test/photo','','x'.repeat(1000)]) {
    await setDoc(target,{photoURL},{merge:true});assert.deepEqual((await getDoc(target)).data(),{...before,photoURL});
  }
  for(const photoURL of ['x'.repeat(1001),123,null])await assert.rejects(setDoc(target,{photoURL},{merge:true}),e=>e.code==='permission-denied');
  await assert.rejects(setDoc(doc(clientFor({uid:'other',email:'other@example.test'}),'users',uid),{photoURL:''},{merge:true}),e=>e.code==='permission-denied');
  // A legacy document missing protected fields already fails today's owner-update checks.
  await seedDocs({'users/legacy':{id:'legacy',email:'legacy@example.test',role:'Design'}});
  await assert.rejects(setDoc(doc(clientFor({uid:'legacy',email:'legacy@example.test'}),'users','legacy'),{photoURL:''},{merge:true}),e=>e.code==='permission-denied');
});
