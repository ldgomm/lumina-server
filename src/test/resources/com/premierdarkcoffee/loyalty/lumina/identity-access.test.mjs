import test from 'node:test';
import assert from 'node:assert/strict';
import {agency,owner,portal,password,documentFor,teamRevision} from './helpers.mjs';
import {activate} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';

const codeOf=response=>response.body.match(/<code class="secret">([^<]+)/)?.[1];
const account=(w,id)=>w.db.get('SELECT * FROM accounts WHERE id=?',id);
async function invitation(t){
 const w=await portal(t);await agency(w);const o=await owner(w,'Business fixture','identity-access');
 const values={name:'Team fixture',document:documentFor('identity-member'),phone:'0991234567','SOCIAL.VIEW':'yes'};
 const created=await o.client.post('/team',values);assert.equal(created.status,201,created.body);
 const id=w.db.get('SELECT id FROM accounts WHERE document=?',values.document).id;
 return {...w,owner:o.client,company:o.id,id,code:codeOf(created),values};
}
const activation=(w,overrides={})=>({code:w.code,document:w.values.document,phone:w.values.phone,password,...overrides});
const credentials=w=>w.db.all('SELECT * FROM codes WHERE account_id=?',w.id);
const grants=w=>w.db.all('SELECT * FROM grants WHERE account_id=? ORDER BY scope,action',w.id);
async function legacyAdmin(t){
 const w=await portal(t),original=await agency(w),a=w.db.get("SELECT * FROM accounts WHERE kind='AGENCY'");
 w.db.run("UPDATE accounts SET document=NULL,email='previous-admin@example.test',welcome_done=0 WHERE id=?",a.id);
 return {...w,id:a.id,original,email:'previous-admin@example.test'};
}

test('activation asks for required cedula and assigned phone without exposing invitation data',async t=>{
 const w=await invitation(t),page=await w.session().get('/activate');assert.equal(page.status,200);
 assert.match(page.body,/name="document"[^>]*required[^>]*pattern="\[0-9\]\{10\}"[^>]*maxlength="10"/);
 assert.match(page.body,/name="phone"[^>]*required/);assert.match(page.body,/teléfono que registró el dueño/);
 assert.ok(!page.body.includes(w.values.document));assert.ok(!page.body.includes(w.code));
 const create=await w.owner.get('/team/new');assert.match(create.body,/name="phone"[^>]*required/);assert.doesNotMatch(create.body,/si lo conoces/);
});
test('invalid or different cedulas cannot activate or change the assigned identity',async t=>{
 const w=await invitation(t),before=account(w,w.id),codes=credentials(w),permissions=grants(w);
 for(const [document,status] of [['',400],['1712345678',400],[documentFor('different'),403]]){
  const r=await w.session().post('/activate',activation(w,{document}));assert.equal(r.status,status,r.body);
  assert.deepEqual(account(w,w.id),before);assert.deepEqual(credentials(w),codes);assert.deepEqual(grants(w),permissions);
  assert.ok(!r.body.includes(w.code));assert.ok(!r.body.includes(password));
 }
 assert.equal((await w.session().post('/activate',activation(w))).status,303);
});
test('a different valid phone is rejected with a recoverable form and no disclosure of assigned values',async t=>{
 const w=await invitation(t),before=account(w,w.id),r=await w.session().post('/activate',activation(w,{phone:'0987654321'}));
 assert.equal(r.status,403);assert.match(r.body,/action="\/activate"/);assert.match(r.body,/value="0987654321"/);
 assert.match(r.body,/cédula o el teléfono no coinciden/);assert.ok(!r.body.includes('+593991234567'));assert.ok(!r.body.includes(w.code));assert.ok(!r.body.includes(password));assert.deepEqual(account(w,w.id),before);
});
test('matching normalized phone activates the same member once and preserves all assigned grants',async t=>{
 const w=await invitation(t),before=account(w,w.id),permissions=grants(w),business=w.db.get('SELECT * FROM companies WHERE id=?',w.company),s=w.session();
 assert.equal((await s.post('/activate',activation(w,{phone:'+593 (99) 123-4567',kind:'OWNER',company_id:'other'}))).location,'/welcome');
 const after=account(w,w.id);for(const key of ['id','company_id','document','contact_phone','kind','email','name'])assert.equal(after[key],before[key],key);
 assert.ok(after.password);assert.equal(after.revision,before.revision+1);assert.deepEqual(grants(w),permissions);assert.deepEqual(w.db.get('SELECT * FROM companies WHERE id=?',w.company),business);
 assert.equal((await w.session().post('/activate',activation(w))).status,403);assert.equal((await w.session().post('/login',{document:before.document,password})).status,303);
});
test('old invitations missing either assigned field fail closed without claiming submitted data',async t=>{
 const w=await invitation(t);
 for(const field of ['document','contact_phone']){
  const saved=account(w,w.id)[field];w.db.run('UPDATE accounts SET '+field+'=NULL WHERE id=?',w.id);const before=account(w,w.id),codes=credentials(w);
  const r=await w.session().post('/activate',activation(w));assert.equal(r.status,409);assert.match(r.body,/dueño debe completar/);assert.deepEqual(account(w,w.id),before);assert.deepEqual(credentials(w),codes);
  w.db.run('UPDATE accounts SET '+field+'=? WHERE id=?',saved,w.id);
 }
});
test('owner can repair an old invitation and issue a code bound to both corrected fields',async t=>{
 const w=await invitation(t);w.db.run('UPDATE accounts SET document=NULL,contact_phone=NULL WHERE id=?',w.id);
 assert.match((await w.owner.get('/team/'+w.id)).body,/Completa la cédula y el teléfono/);
 const renew=()=>w.owner.post('/team/'+w.id+'/invite',{revision:teamRevision(w,w.id),confirm:'yes'});
 assert.equal((await renew()).status,400);
 assert.equal((await w.owner.post('/team/'+w.id+'/details',{...w.values,revision:teamRevision(w,w.id)})).status,303);
 assert.equal((await w.session().post('/activate',activation(w))).status,403);
 const r=await renew();const code=codeOf(r);assert.ok(code);assert.equal((await w.session().post('/activate',activation(w,{code}))).status,303);
});
test('changing assigned phone while password hashing is in flight cannot activate stale data',async t=>{
 const w=await invitation(t),codes=credentials(w),pending=activate(w.db,activation(w));
 w.db.run('UPDATE accounts SET contact_phone=?,revision=revision+1 WHERE id=?','+593981234567',w.id);
 await assert.rejects(pending,e=>e.status===409);assert.equal(account(w,w.id).password,null);assert.deepEqual(credentials(w),codes);
 assert.equal((await w.session().post('/activate',activation(w,{phone:'0981234567'}))).status,303);
});
test('revoking an invitation during password hashing prevents activation',async t=>{
 const w=await invitation(t),pending=activate(w.db,activation(w));w.db.run('DELETE FROM codes WHERE account_id=?',w.id);w.db.run('UPDATE accounts SET active=0,revision=revision+1 WHERE id=?',w.id);
 await assert.rejects(pending,e=>e.status===403);assert.equal(account(w,w.id).password,null);assert.equal(account(w,w.id).active,0);
});
test('two simultaneous activation attempts produce only one active account and session-ready result',async t=>{
 const w=await invitation(t),before=account(w,w.id),results=await Promise.allSettled([activate(w.db,activation(w)),activate(w.db,activation(w))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='fulfilled').value,w.id);assert.equal(results.find(r=>r.status==='rejected').reason.status,403);assert.equal(account(w,w.id).revision,before.revision+1);assert.equal(credentials(w).length,0);
});
test('a code rebound to an owner cannot activate or overwrite the owner account',async t=>{
 const w=await invitation(t),a=w.db.get("SELECT * FROM accounts WHERE company_id=? AND kind='OWNER'",w.company);w.db.run('UPDATE codes SET account_id=? WHERE account_id=?',a.id,w.id);
 const r=await w.session().post('/activate',activation(w,{document:a.document}));assert.equal(r.status,409);assert.deepEqual(account(w,a.id),a);
});
test('legacy administrator migrates in place and cedula login opens the agency dashboard',async t=>{
 const native=await fakeLoyalty(t),w=await portal(t,native.origin,{platformToken:native.platformToken}),original=await agency(w);await owner(w,'Linked business','stable-link');
 const a=w.db.get("SELECT * FROM accounts WHERE kind='AGENCY'");w.db.run("UPDATE accounts SET document=NULL,email='previous-admin@example.test' WHERE id=?",a.id);
 const before=account(w,a.id),companies=w.db.all('SELECT * FROM companies'),permissions=w.db.all('SELECT * FROM grants'),calls=native.calls.length,s=w.session();
 assert.equal((await s.post('/legacy-login',{email:before.email,password})).location,'/account/identity');const page=await s.get('/account/identity');assert.equal(page.status,200);assert.doesNotMatch(page.body,/name="ruc"|name="phone"/);
 const document=documentFor('new-admin-identity');assert.equal((await s.post('/account/identity',{document,current:password})).location,'/account');
 const after=account(w,a.id);for(const key of Object.keys(before).filter(k=>!['document','revision'].includes(k)))assert.equal(after[key],before[key],key);
 assert.equal(after.document,document);assert.deepEqual(w.db.all('SELECT * FROM companies'),companies);assert.deepEqual(w.db.all('SELECT * FROM grants'),permissions);assert.equal(native.calls.length,calls);
 assert.equal((await original.get('/account')).location,'/login');assert.equal((await s.get('/account')).status,200);assert.equal((await w.session().post('/legacy-login',{email:before.email,password})).status,401);
 const login=w.session();assert.equal((await login.post('/login',{document,password})).location,'/dashboard');assert.equal((await login.get('/dashboard')).status,200);assert.equal((await login.get('/account/identity')).location,'/account');
});
test('administrator claim rejects wrong password CSRF and duplicate identity without changing the account',async t=>{
 const w=await legacyAdmin(t),o=await owner(w,'Other identity','duplicate-admin'),duplicate=w.db.get("SELECT document FROM accounts WHERE company_id=? AND kind='OWNER'",o.id).document,s=w.session();
 await s.post('/legacy-login',{email:w.email,password});await s.get('/account/identity');const before=account(w,w.id),document=documentFor('unused-admin');
 for(const [values,status] of [[{document,current:'wrong'},403],[{document,current:password,_csrf:'wrong'},403],[{document:duplicate,current:password},409]]){
  assert.equal((await s.post('/account/identity',values)).status,status);assert.deepEqual(account(w,w.id),before);
 }
 assert.equal((await s.post('/account/identity',{document,current:password})).status,303);
});
test('legacy login is visible and signed-in legacy administrators can reach identity from account or login',async t=>{
 const w=await legacyAdmin(t),publicPage=await w.session().get('/login');assert.match(publicPage.body,/class="legacy-access" href="\/legacy-login"/);
 const page=await w.original.get('/account');assert.ok(page.body.indexOf('account-identity')<page.body.indexOf('account-contact'));assert.match(page.body,/action="\/account\/identity"/);
 for(const path of ['/login','/legacy-login'])assert.equal((await w.original.get(path)).location,'/account/identity');
});
test('a configured administrator never enters business onboarding after normal login',async t=>{
 const w=await portal(t);await agency(w);w.db.run("UPDATE accounts SET welcome_done=0 WHERE kind='AGENCY'");const a=w.db.get("SELECT * FROM accounts WHERE kind='AGENCY'");
 const s=w.session();assert.equal((await s.post('/login',{document:a.document,password})).location,'/dashboard');assert.equal((await s.get('/dashboard')).status,200);
});
test('legacy collaborators cannot assign their own identity through the administrator migration endpoint',async t=>{
 const w=await invitation(t);assert.equal((await w.session().post('/activate',activation(w))).status,303);
 w.db.run("UPDATE accounts SET document=NULL,email='previous-member@example.test' WHERE id=?",w.id);const before=account(w,w.id),s=w.session();
 await s.post('/legacy-login',{email:before.email,password});const page=await s.get('/account/identity');assert.equal(page.status,200);assert.match(page.body,/Solicita al dueño/);assert.doesNotMatch(page.body,/action="\/account\/identity"/);
 assert.equal((await s.post('/account/identity',{document:documentFor('self-assigned'),current:password,kind:'AGENCY'})).status,403);assert.deepEqual(account(w,w.id),before);
});
test('only the owning business can change member identity and contact',async t=>{
 const w=await invitation(t),other=await owner(w,'Unrelated business','other-owner'),before=account(w,w.id),payload={...w.values,phone:'0981234567',revision:String(before.revision)};
 assert.equal((await other.client.post('/team/'+w.id+'/details',payload)).status,404);assert.deepEqual(account(w,w.id),before);
 const admin=w.session();await admin.post('/login',{document:'1748225842',password});await admin.get('/account');assert.equal((await admin.post('/team/'+w.id+'/details',payload)).status,403);assert.deepEqual(account(w,w.id),before);
});
