import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from './profilePhoto';
import { resizeToAvatar } from './profilePhotoBrowser';

test('2–4: source types, empty/10MiB boundary, decoded pixel boundary', () => {
  for (const type of ['image/gif','image/svg+xml','application/pdf','image/heic','text/plain']) assert.equal(P.validatePhotoFile({ type, size: 100 }), P.PHOTO_MESSAGES.type);
  for (const type of P.ACCEPTED_IMAGE_TYPES) assert.equal(P.validatePhotoFile({ type, size: P.MAX_SOURCE_BYTES }), null);
  assert.equal(P.validatePhotoFile({ type: 'image/jpeg', size: P.MAX_SOURCE_BYTES + 1 }), P.PHOTO_MESSAGES.tooLarge);
  assert.equal(P.validatePhotoFile({ type: 'image/jpeg', size: 0 }), P.PHOTO_MESSAGES.empty);
  assert.equal(P.checkDecodedSize(8000,5000), null);
  assert.equal(P.checkDecodedSize(8000,5001), P.PHOTO_MESSAGES.pixels);
  assert.equal(P.checkDecodedSize(0,1), P.PHOTO_MESSAGES.unreadable);
});
test('1,6: crop, no upscale and quality ladder 200KiB boundary', () => {
  assert.deepEqual(P.squareCropRect(1200,800), { x:200,y:0,side:800 });
  assert.deepEqual(P.squareCropRect(60,100), { x:0,y:20,side:60 });
  assert.equal(P.targetSide(800),256); assert.equal(P.targetSide(60),60);
  assert.equal(P.pickEncoding([300000,250000,P.AVATAR_MAX_BYTES]),0.65);
  assert.equal(P.pickEncoding([300000,250000,240000,P.AVATAR_MAX_BYTES+1]),null);
});
test('9,27,51: object names, same-bucket/same-owner managed URLs, exact persisted URL boundaries', () => {
  const name = P.makeAvatarObjectName(1790000000000,'0123456789abcdef');
  const path = P.avatarObjectPath('u', name);
  const url = `http://127.0.0.1:9199/v0/b/demo.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=abc`;
  assert.match(name,P.AVATAR_NAME_PATTERN);
  for (const invalid of ['', 'x/y']) assert.throws(() => P.avatarObjectPath(invalid,name));
  assert.throws(() => P.makeAvatarObjectName(123,'ABC'));
  assert.equal(P.managedObjectPath(url,'u','demo.appspot.com'),path);
  assert.equal(P.managedObjectPath(url.replace('127.0.0.1:9199','other.example'),'u','demo.appspot.com'),path);
  for (const invalid of [url.replace('demo.appspot.com','other'), url.replace(encodeURIComponent(path),encodeURIComponent(path.replace('/u/','/other/'))), url.replace(name,'avatar.jpg'), 'bad', 'https://google.example/photo']) assert.equal(P.managedObjectPath(invalid,'u','demo.appspot.com'),null);
  for (const length of [999,1000,1001]) assert.equal(P.checkPersistableUrl('https://example.test/'+'a'.repeat(length-21)),length <=1000 ? null : P.PHOTO_MESSAGES.url);
  const worst = `https://firebasestorage.googleapis.com/v0/b/${'b'.repeat(200)}/o/${encodeURIComponent(P.avatarObjectPath('u'.repeat(128),name))}?alt=media&token=${'f'.repeat(36)}`;
  assert.equal(P.checkPersistableUrl(worst),null); assert.equal(P.checkPersistableUrl(url),null);
  for (const invalid of ['', 'javascript:alert(1)', 'x', ' https://example.test']) assert.equal(P.checkPersistableUrl(invalid), P.PHOTO_MESSAGES.url);
});
test('rules share the client avatar pattern and inclusive 256KiB cap; project-files remains denied', () => {
  const rules = readFileSync('storage.rules','utf8');
  const pattern = rules.match(/fileName.matches\('([^']+)'\)/)![1].replaceAll('\\\\','\\');
  assert.equal(pattern,P.AVATAR_NAME_PATTERN.source.slice(1,-1));
  assert.match(rules,/request.resource.size > 0/); assert.match(rules,/request.resource.size <= 262144/);
  assert.match(rules,/match \/project-files\/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
  assert.doesNotMatch(rules,/allow update/);
});
test('14,17: fixed photo errors do not echo raw Firebase text', () => {
  for (const [code,key] of [['storage/unauthorized','unauthorized'],['storage/unauthenticated','unauthenticated'],['storage/quota-exceeded','quota'],['storage/retry-limit-exceeded','offline'],['storage/unknown','generic']] as const) assert.equal(P.describePhotoError({ code, message:'sensitive' }),P.PHOTO_MESSAGES[key]);
});

// Exercise the browser pipeline with controlled canvas/bitmap APIs. Real codecs/EXIF are review-stage browser QA.
test('1–6: browser processing releases bitmaps, honors boundaries and maps every decode/canvas failure', async t => {
  let dimensions = [1200,800], fail = '', sizes = [P.AVATAR_MAX_BYTES];
  let closed = 0, decoded = 0, qualities: number[] = [], drawn: unknown[] = [];
  const canvas = { width:0,height:0, getContext: () => fail === 'context' ? null : { fillStyle:'', fillRect() {}, drawImage(...args: unknown[]) { drawn=args; if(fail==='draw') throw Error('raw'); } }, toBlob(callback: (blob: Blob|null) => void, type: string, q: number) { qualities.push(q); if(fail==='throwBlob') throw Error('raw'); callback(fail==='blob' ? null : new Blob([new Uint8Array(sizes.shift() ?? P.AVATAR_MAX_BYTES+1)], { type })); } };
  t.mock.method(globalThis, 'fetch', async () => { throw Error('network forbidden'); });
  Object.defineProperty(globalThis,'createImageBitmap',{ configurable:true,writable:true,value:async (_file: File, options: unknown) => { decoded++; assert.deepEqual(options,{imageOrientation:'from-image'}); if(fail==='decode') throw Error('raw'); return {width:dimensions[0],height:dimensions[1],close(){closed++;}}; } });
  Object.defineProperty(globalThis,'document',{ configurable:true,value:{createElement:()=>canvas} });
  t.after(() => { delete (globalThis as any).createImageBitmap; delete (globalThis as any).document; });
  const file = (size=3_000_000,type='image/jpeg') => new File([new Uint8Array(size)],'photo.jpg',{type});
  const blob = await resizeToAvatar(file());
  assert.equal(blob.type,'image/jpeg'); assert.equal(blob.size,P.AVATAR_MAX_BYTES);
  assert.equal(canvas.width,256); assert.equal(canvas.height,256); assert.deepEqual(drawn.slice(1),[200,0,800,800,0,0,256,256]);
  dimensions=[100,60]; sizes=[100]; await resizeToAvatar(file()); assert.equal(canvas.width,60);
  dimensions=[8000,5000]; sizes=[100]; await resizeToAvatar(file());
  dimensions=[8000,5001]; await assert.rejects(resizeToAvatar(file()), {message:P.PHOTO_MESSAGES.pixels});
  dimensions=[1200,800];
  for (const mode of ['decode','context','draw','blob','throwBlob']) { fail=mode; await assert.rejects(resizeToAvatar(file()), {message:mode==='decode'? P.PHOTO_MESSAGES.unreadable:P.PHOTO_MESSAGES.process}); }
  fail=''; sizes=[300000,300000,300000,P.AVATAR_MAX_BYTES]; qualities=[];
  await resizeToAvatar(file()); assert.deepEqual(qualities,[...P.JPEG_QUALITY_LADDER]);
  sizes=[300000,300000,300000,P.AVATAR_MAX_BYTES+1]; await assert.rejects(resizeToAvatar(file()), {message:P.PHOTO_MESSAGES.shrink});
  const before=decoded;
  for (const [size,type] of [[0,'image/jpeg'],[P.MAX_SOURCE_BYTES+1,'image/jpeg'],[10,'text/plain']] as const) await assert.rejects(resizeToAvatar(file(size,type)));
  assert.equal(decoded,before); assert.equal(closed,decoded-1);
});
