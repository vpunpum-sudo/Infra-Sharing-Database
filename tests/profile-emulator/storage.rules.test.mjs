import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { ref,uploadBytes,getDownloadURL,getMetadata,deleteObject } from 'firebase/storage';
import { client,closeClients } from './run.mjs';
import { makeAvatarObjectName,checkPersistableUrl } from '../../src/utils/profilePhoto.ts';
let serial=0;
const name=()=>makeAvatarObjectName(1790000000000+serial++,'0123456789abcdef');
const put=(storage,path,size=100,type='image/jpeg')=>uploadBytes(ref(storage,path),new Uint8Array(size),{contentType:type});
const denied=promise=>assert.rejects(promise,error=>error.code==='storage/unauthorized');
after(closeClients);

test('28–29: owner creates 200KiB and exactly 256KiB JPEGs, reads URL, cannot overwrite, deletes',async()=>{
  const c=await client();
  for(const size of [200*1024,262144]) {
    const path=`profile-photos/${c.user.uid}/${name()}`;
    await put(c.storage,path,size);
    const url=await getDownloadURL(ref(c.storage,path));assert.equal(checkPersistableUrl(url),null);
    assert.equal((await getMetadata(ref(c.storage,path))).size,size);
    await denied(put(c.storage,path,123));
    assert.equal((await getMetadata(ref(c.storage,path))).size,size);
    assert.equal(await getDownloadURL(ref(c.storage,path)),url);
    await deleteObject(ref(c.storage,path));
  }
});
test('30: another user and unauthenticated client cannot read/create/delete owner objects',async()=>{
  const owner=await client(),other=await client(),anonymous=await client(false);
  const path=`profile-photos/${owner.user.uid}/${name()}`;await put(owner.storage,path);
  for(const c of [other,anonymous]) {
    await denied(getMetadata(ref(c.storage,path)));
    await denied(getDownloadURL(ref(c.storage,path)));
    await denied(put(c.storage,`profile-photos/${owner.user.uid}/${name()}`));
    await denied(deleteObject(ref(c.storage,path)));
  }
  await deleteObject(ref(owner.storage,path));
});
test('31: type/size/name/nesting/uid boundaries are denied',async()=>{
  const c=await client(),base=`profile-photos/${c.user.uid}/`;
  for(const type of ['image/png','image/svg+xml','text/html'])await denied(put(c.storage,base+name(),100,type));
  for(const size of [0,262145])await denied(put(c.storage,base+name(),size));
  for(const bad of ['avatar.jpg','avatar-abc.jpg','avatar-1790000000000-ABCDEF0123456789.jpg','avatar-179000000000-0123456789abcdef.jpg','x/'+name()])await denied(put(c.storage,base+bad));
  await denied(put(c.storage,`profile-photos/other/${name()}`));
});
test('32: project-files and all unmatched paths remain denied to every identity',async()=>{
  for(const c of [await client(),await client(),await client(false)]) {
    for(const path of ['project-files/anything','unmatched/anything']) {
      await denied(put(c.storage,path));await denied(getMetadata(ref(c.storage,path)));await denied(deleteObject(ref(c.storage,path)));
    }
  }
});
