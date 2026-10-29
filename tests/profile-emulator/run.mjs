// Importable demo-only client helpers; the launcher runs only when this is the entry point.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { randomUUID } from 'node:crypto';

export const PROJECT = 'demo-profile-settings';
export const BUCKET = `${PROJECT}.appspot.com`;
if (!PROJECT.startsWith('demo-') || (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT)) throw Error('Only the demo-profile-settings emulator project is allowed');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function emulatorAddress(key, fallback) {
  const value = process.env[key] || fallback;
  if (!/^127\.0\.0\.1:\d+$/.test(value)) throw Error('Only loopback emulator endpoints are allowed');
  return value.split(':');
}
const apps = [];
export async function client(signedIn = true) {
  const app = initializeApp({ apiKey:'demo-key', projectId:PROJECT, storageBucket:BUCKET }, randomUUID());
  apps.push(app);
  const auth = getAuth(app);
  const [authHost, authPort] = emulatorAddress('FIREBASE_AUTH_EMULATOR_HOST','127.0.0.1:9198');
  connectAuthEmulator(auth,`http://${authHost}:${authPort}`,{disableWarnings:true});
  const storage = getStorage(app);
  const [host,port] = emulatorAddress('FIREBASE_STORAGE_EMULATOR_HOST','127.0.0.1:9298');
  connectStorageEmulator(storage,host,Number(port));
  storage.maxUploadRetryTime=1000;
  storage.maxOperationRetryTime=1000;
  const email=`profile-${randomUUID()}@example.test`;
  const password=`sentinel-${randomUUID()}`;
  const user = signedIn ? (await createUserWithEmailAndPassword(auth,email,password)).user : null;
  return {app,auth,storage,user,email,password};
}
export async function closeClients() { await Promise.all(apps.splice(0).map(deleteApp)); }

function main() {
  const fail=message=>{console.error(`test:profile-emulator cannot run: ${message}`);process.exit(2);};
  const javaHome=process.env.JAVA_HOME || (existsSync(resolve(root,'.context/java/Contents/Home')) ? resolve(root,'.context/java/Contents/Home') : '');
  const env={...process.env,...(javaHome?{JAVA_HOME:javaHome,PATH:`${javaHome}/bin:${process.env.PATH}`} : {}), FIREBASE_CLI_DISABLE_UPDATE_CHECK:'1', RULES_PROJECT:PROJECT};
  for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','GCLOUD_PROJECT']) delete env[key];
  if(spawnSync('java',['-version'],{env,stdio:'ignore'}).status!==0)fail('Java (a JRE version 21 or newer) was not found.');
  // The sandbox may forbid the CLI update-store write even for --version. Check availability through the shell instead.
  if(spawnSync('sh',['-c','command -v firebase'],{env,stdio:'ignore'}).status!==0)fail('Firebase CLI was not found.');
  mkdirSync(resolve(root,'tests/profile-emulator/.rules'),{recursive:true});
  for(const name of ['storage.rules','firestore.rules']) {
    const source=resolve(root,name),target=resolve(root,'tests/profile-emulator/.rules',name);
    copyFileSync(source,target);
    if(!readFileSync(source).equals(readFileSync(target)))fail(`${name} copy is not byte-identical`);
  }
  const command='node --import tsx --test --test-concurrency=1 tests/profile-emulator/storage.rules.test.mjs tests/profile-emulator/password.auth.test.mjs tests/profile-emulator/users.photoURL.rules.test.mjs';
  const result=spawnSync('firebase',['emulators:exec','--config','tests/profile-emulator/firebase.json','--project',PROJECT,'--only','auth,storage,firestore',command],{cwd:root,env,stdio:'inherit'});
  process.exit(result.status ?? 1);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
