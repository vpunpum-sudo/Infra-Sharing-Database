import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { WI_MASK_SPECS, checkMaskResult, WI_MASK_PLACEHOLDERS } from '../utils/wiScreenshotMaskSpec';
const source = readFileSync('src/components/ProfileSettings.tsx','utf8');
const tree = ts.createSourceFile('ProfileSettings.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const tag = (node: ts.Node) => ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
const attr = (node: ts.JsxOpeningLikeElement, name: string) => node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(tree)===name) as ts.JsxAttribute|undefined;
const value = (node: ts.JsxOpeningLikeElement,name:string) => attr(node,name)?.initializer?.getText(tree);
function walk(node:ts.Node, visit:(node:ts.Node)=>void) { visit(node);ts.forEachChild(node,child=>walk(child,visit)); }

test('26,43,47–50: two nonnested noValidate forms, only one submit button per form; photo controls outside all forms',()=>{
  const forms:ts.JsxElement[]=[];walk(tree,node=>{if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(tree)==='form')forms.push(node);});
  assert.equal(forms.length,2);
  for(const form of forms) {
    assert.ok(attr(form.openingElement,'noValidate'));assert.equal(value(form.openingElement,'onSubmit'),'{event => event.preventDefault()}');
    const submits:ts.JsxOpeningLikeElement[]=[];
    walk(form,node=>{
      const el=tag(node);if(!el)return;
      if(el.tagName.getText(tree)==='form'&&node!==form)assert.fail('nested form');
      if(['button','AsyncActionButton'].includes(el.tagName.getText(tree))) {
        assert.ok(attr(el,'type'),'all form buttons declare type');if(value(el,'type')==='"submit"')submits.push(el);
      }
      assert.notEqual(value(el,'type'),'"file"');
    });
    assert.equal(submits.length,1);assert.equal(submits[0].tagName.getText(tree),'AsyncActionButton');
  }
  const profileInputs:ts.JsxOpeningLikeElement[]=[];walk(forms[0],node=>{const el=tag(node);if(el?.tagName.getText(tree)==='input')profileInputs.push(el);});
  assert.deepEqual(profileInputs.map(el=>value(el,'data-wi-pii')),['"profile-display-name"','"profile-email"']);assert.ok(attr(profileInputs[1],'disabled'));
  walk(tree,node=>{
    const el=tag(node);if(!el)return;
    const name=el.tagName.getText(tree);
    if((['button','AsyncActionButton'].includes(name)&&value(el,'type')!=='"submit"')||name==='ConfirmModal'||value(el,'type')==='"file"') {
      let parent=node.parent;
      while(parent) { assert.notEqual(tag(parent)?.tagName.getText(tree),'form');parent=parent.parent; }
      if(name!=='ConfirmModal'&&value(el,'type')!=='"file"')assert.equal(value(el,'type'),'"button"');
    }
  });
});
test('17–21,26,38,42,45: fixed copy, photo-only persistence, savedPhotoUrl for Save, provider-email guard and WI attributes',()=>{
  for(const text of ['profile-display-name','profile-email','profile-avatar','referrerPolicy="no-referrer"','Security & Password','Appearance','Display Name','เลือกรูปจากอุปกรณ์','ลองบันทึกอีกครั้ง','รหัสผ่านปัจจุบัน','autoComplete="current-password"'])assert.ok(source.includes(text),text);
  assert.doesNotMatch(source,/profile-image-url|Profile Image URL|error\.message|console\.|logActivity\('update_password'/);
  assert.match(source,/updateAuthPhoto: photoURL => updateProfile\(user, \{ photoURL: photoURL \?\? '' \}\)/);
  assert.match(source,/writeUserPhoto: photoURL => setDoc\(doc\(db, 'users', user.uid\), \{ photoURL \}, \{ merge: true \}\)/);
  assert.match(source,/updateProfile\(user, \{ displayName \}\)/);
  assert.match(source,/\.\.\.appUser, displayName, photoURL: savedPhotoUrl/);
  assert.match(source,/appUser\?\.photoURL \?\? user.photoURL \?\? ''/);
  assert.match(source,/email: passwordProviderEmail\(user.providerData\)/);
  const save=source.slice(source.indexOf('const handleUpdateProfile'),source.indexOf('const handleUpdatePassword'));
  assert.doesNotMatch(save,/clearChoice|uploadBytes|runPhotoJob|setStaged/);
  assert.match(save,/\{ displayName \}\);/);
});
test('7–8,15–16,24,34,43,48–49: lifecycle, retries, confirmation, single-flight wiring and password clearing',()=>{
  const pick=source.slice(source.indexOf('const pickPhoto'),source.indexOf('const photoDeps'));
  assert.ok(pick.indexOf('if (!isCurrent()) return')<pick.indexOf('URL.createObjectURL'));
  assert.match(source,/URL.revokeObjectURL\(previewUrl.current\)/);
  assert.match(source,/mounted.current = false;\s*choiceGeneration.current \+= 1/);
  assert.match(source,/setStaged\(null\);\s*setJob\(null\)/);
  assert.match(source,/const photoDisabled = photoPending \|\| savePending/);
  assert.match(source,/if \(profileBusy.current\) return;\s*profileBusy.current = true/);
  assert.match(source,/setRemoveOpen\(true\)/);assert.match(source,/onCancel=\{\(\) => setRemoveOpen\(false\)\}/);
  assert.match(source,/onConfirm=\{removePhoto\}/);
  assert.match(source,/if \(result.status === 'done'\) \{ setCurrentPassword\(''\); setNewPassword\(''\); setConfirmPassword\(''\); \}/);
  const actionButton=readFileSync('src/components/AsyncActionButton.tsx','utf8');
  assert.match(actionButton,/if \(flight.isRunning\(\)\) return/);
  assert.match(actionButton,/type = 'button'/);
});
test('52–53: profile masks need no URL input; procedure and drawing keep five callouts and current-password step',()=>{
  const spec=WI_MASK_SPECS.profile;
  assert.equal(spec.regions.some(r=>r.name==='profile-image-url'),false);
  for(const name of ['profile-display-name','profile-email','profile-avatar'])assert.ok(spec.regions.some(r=>r.name===name));
  assert.equal(spec.regions.find(r=>r.name==='profile-avatar')?.required,false);
  const regions=Object.fromEntries(spec.regions.map(r=>[r.name,{matches:r.required?1:0,values:r.placeholder?[r.placeholder]:[],maskValid:[true],imageMasked:[true]}]));
  assert.deepEqual(checkMaskResult({bodyText:'',inputs:[WI_MASK_PLACEHOLDERS.ownName,WI_MASK_PLACEHOLDERS.email(1)],attrs:[],regions},spec,{}),[]);
  const manual=readFileSync('src/content/workInstruction.ts','utf8');
  const start=manual.indexOf("figure: 'profile'");const procedure=manual.slice(start,manual.indexOf('result:',start));
  assert.doesNotMatch(procedure,/Profile Image URL|ลิงก์รูปโปรไฟล์/);assert.match(procedure,/รหัสผ่านปัจจุบัน/);
  const figures=readFileSync('src/components/WiFigures.tsx','utf8');const drawing=figures.slice(figures.indexOf('function Profile()'),figures.indexOf('function MapCanvas'));
  assert.doesNotMatch(drawing,/Profile Image URL|ลิงก์รูปโปรไฟล์/);assert.equal([...drawing.matchAll(/<A n=\{/g)].length,5);
});
