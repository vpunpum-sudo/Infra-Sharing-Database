import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EmailAuthProvider,GoogleAuthProvider,reauthenticateWithCredential,updatePassword,signInWithEmailAndPassword,signInWithCredential,linkWithCredential } from 'firebase/auth';
import { client,closeClients } from './run.mjs';
import { changePassword,PROFILE_PASSWORD_MESSAGES } from '../../src/utils/profilePassword.ts';
import { PASSWORD_MESSAGES } from '../../src/utils/forceChangePassword.ts';
import { passwordSectionMode,passwordProviderEmail } from '../../src/utils/authProviders.ts';
const deps=user=>({buildCredential:EmailAuthProvider.credential,reauthenticate:credential=>reauthenticateWithCredential(user,credential),updatePassword:next=>updatePassword(user,next)});
const googleCredential=email=>GoogleAuthProvider.credential(JSON.stringify({sub:randomUUID(),email,email_verified:true,name:'Demo account'}));
after(closeClients);

test('34,39: wrong current cannot update; correct reauth changes password; old password no longer signs in',async()=>{
  const c=await client();const next=`sentinel-${randomUUID()}`;
  const input={current:c.password,next,confirm:next,email:passwordProviderEmail(c.user.providerData)};
  assert.equal(passwordSectionMode(c.user.providerData),'password');
  let updates=0;
  const d=deps(c.user),realUpdate=d.updatePassword;
  d.updatePassword=async next=>{updates++;return realUpdate(next);};
  assert.equal((await changePassword({...input,current:'wrong-sentinel'},d)).message,PROFILE_PASSWORD_MESSAGES.wrongCurrent);assert.equal(updates,0);
  assert.equal((await changePassword(input,d)).status,'done');assert.equal(updates,1);
  await assert.rejects(signInWithEmailAndPassword(c.auth,c.email,c.password));
  await signInWithEmailAndPassword(c.auth,c.email,next);
});
test('35: Google plus password account uses password-provider email and can change its email sign-in password',async()=>{
  const c=await client();await linkWithCredential(c.user,googleCredential(c.email));
  assert.equal(passwordSectionMode(c.user.providerData),'password+google');
  const next=`sentinel-${randomUUID()}`;
  assert.equal((await changePassword({current:c.password,next,confirm:next,email:passwordProviderEmail(c.user.providerData)},deps(c.user))).status,'done');
  await signInWithEmailAndPassword(c.auth,c.email,next);
});
test('36: emulated Google-only account is explain-only and cannot construct a password credential',async()=>{
  const c=await client(false);const {user}=await signInWithCredential(c.auth,googleCredential(c.email));
  assert.equal(passwordSectionMode(user.providerData),'google-only');assert.equal(passwordProviderEmail(user.providerData),null);
  const forbidden=()=>{throw Error('must not call');};
  assert.equal((await changePassword({email:null,current:'sentinel-current',next:'sentinel-next',confirm:'sentinel-next'},{buildCredential:forbidden,reauthenticate:forbidden,updatePassword:forbidden})).message,PROFILE_PASSWORD_MESSAGES.noEmail);
});
test('41: emulator rejects a weak password after reauthentication with fixed Thai mapping',async()=>{
  const c=await client();const d=deps(c.user);
  // Bypass the client length guard only at the SDK boundary to exercise a server weak-password error.
  d.updatePassword=()=>updatePassword(c.user,'x');
  assert.deepEqual(await changePassword({email:c.email,current:c.password,next:'valid-sentinel',confirm:'valid-sentinel'},d),{status:'failed',message:PASSWORD_MESSAGES.weak});
});
