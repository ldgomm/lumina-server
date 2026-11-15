import test from 'node:test';
import assert from 'node:assert/strict';
import {portal,agency,owner,colleague,password,documentFor} from './helpers.mjs';

const snapshot=db=>Object.fromEntries(['accounts','companies','company_services','contracts','requests','sessions','audit'].map(table=>[table,db.all('SELECT * FROM '+table)]));
const register=(alias,overrides={})=>({company:'Negocio '+alias,category:'CAFE',name:'Responsable',document:documentFor(alias),ruc:documentFor(alias)+'001',phone:'0991234567',password,consent:'yes',...overrides});
async function fresh(w,alias){const client=w.session();assert.equal((await client.post('/register',register(alias))).status,303);await client.get('/welcome');await client.post('/welcome',{service:'LATER'});return {client,id:w.db.get('SELECT id FROM companies WHERE name=?','Negocio '+alias).id};}

test('public entry pages share branded access layout without private navigation or database changes',async t=>{
 const w=await portal(t),client=w.session(),before=snapshot(w.db);
 for(const path of ['/login','/register','/activate','/legacy-login']){
  const response=await client.get(path);assert.equal(response.status,200,path);assert.match(response.body,/class="public-access"/);assert.equal((response.body.match(/<h1\b/g)||[]).length,1);
  assert.match(response.body,/href="\/">Volver a Lúmina/);assert.match(response.body,new RegExp('action="'+path+'"'));
  assert.doesNotMatch(response.body,/href="\/(team|plans|account|wallet)"|lumina-csrf|name="_csrf"/);
 }
 assert.deepEqual(snapshot(w.db),before);
});
test('public entry styles and scripts resolve under the same restrictive CSP',async t=>{
 const w=await portal(t),client=w.session(),page=await client.get('/register');
 assert.match(page.headers.get('content-security-policy'),/default-src 'none'/);assert.doesNotMatch(page.headers.get('content-security-policy'),/unsafe-inline|unsafe-eval/);
 for(const [,path] of page.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))assert.equal((await client.get(path)).status,200,path);
 assert.match((await client.get('/assets/access.css')).headers.get('content-type'),/text\/css/);
 assert.match((await client.get('/assets/identity-rules.mjs')).headers.get('content-type'),/javascript/);
 assert.match(page.body,/name="robots" content="noindex,follow"/);
});
test('registration failure retains safe non-secret values and escapes markup in the same form',async t=>{
 const w=await portal(t),client=w.session(),before=snapshot(w.db),data=register('invalid-contact',{company:'<img src=x onerror=alert(1)>',phone:'123',password:'never-echo-this-password'});
 const response=await client.post('/register',data);assert.equal(response.status,400);assert.match(response.body,/class="public-access"/);assert.match(response.body,/role="alert"/);assert.match(response.body,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(response.body,/value="123"/);
 assert.doesNotMatch(response.body,/<img src=x|never-echo-this-password/);assert.deepEqual(snapshot(w.db),before);
});
test('activation errors never reflect invitation codes or passwords',async t=>{
 const w=await portal(t),client=w.session(),code='z'.repeat(43),secret='never-echo-invitation-password';
 const response=await client.post('/activate',{code,password:secret,phone:'0991234567'});assert.equal(response.status,403);assert.match(response.body,/action="\/activate"/);assert.match(response.body,/class="public-access"/);assert.ok(!response.body.includes(code));assert.ok(!response.body.includes(secret));assert.match(response.body,/value="0991234567"/);
});
test('invalid login keeps its dedicated form and never exposes a password',async t=>{
 const w=await portal(t),client=w.session(),document=documentFor('unknown'),secret='never-echo-login-password';
 const response=await client.post('/login',{document,password:secret});assert.equal(response.status,401);assert.match(response.body,/role="alert"/);assert.match(response.body,/action="\/login"/);assert.ok(response.body.includes('value="'+document+'"'));assert.ok(!response.body.includes(secret));assert.equal(w.db.get('SELECT count(*) n FROM sessions').n,0);
});
test('service selection starts with five explicit actions and no automatic activation',async t=>{
 const w=await portal(t),a=await fresh(w,'services-empty'),before=snapshot(w.db),response=await a.client.get('/services');
 assert.equal(response.status,200);assert.match(response.body,/id="available-services"/);assert.doesNotMatch(response.body,/id="active-services"|id="pending-services"/);assert.equal((response.body.match(/action="\/services\/activate"/g)||[]).length,5);assert.match(response.body,/href="\/plans"/);assert.deepEqual(snapshot(w.db),before);
});
test('active pending and available services are distinct and keep the original activation semantics',async t=>{
 const w=await portal(t),a=await fresh(w,'services-mixed');await a.client.get('/services');
 assert.equal((await a.client.post('/services/activate',{service:'SOCIAL'})).status,303);assert.equal((await a.client.post('/services/activate',{service:'WALLET'})).status,303);
 const response=await a.client.get('/services');assert.match(response.body,/id="active-services"/);assert.match(response.body,/id="pending-services"/);assert.match(response.body,/id="available-services"/);
 assert.match(response.body,/data-service="SOCIAL" data-service-state="ACTIVE"/);assert.match(response.body,/data-service="WALLET" data-service-state="SETUP"/);assert.match(response.body,/href="\/content"/);assert.match(response.body,/href="\/plans\/wallet"/);assert.equal((response.body.match(/action="\/services\/activate"/g)||[]).length,3);
 assert.equal(w.db.get("SELECT status FROM company_services WHERE company_id=? AND service='WALLET'",a.id).status,'SETUP');assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);
});
test('an existing fully active business opens services without an activation or billing mutation',async t=>{
 const w=await portal(t),a=await owner(w,'Existing workspace',21),before=snapshot(w.db),response=await a.client.get('/services');
 assert.equal(response.status,200);assert.match(response.body,/id="active-services"/);assert.doesNotMatch(response.body,/id="available-services"|id="pending-services"|action="\/services\/activate"/);assert.match(response.body,/href="\/wallet"/);assert.deepEqual(snapshot(w.db),before);
});
test('service state shown in the owner workspace is isolated per business',async t=>{
 const w=await portal(t),a=await fresh(w,'isolated-a'),b=await fresh(w,'isolated-b');await a.client.get('/services');await a.client.post('/services/activate',{service:'WEB'});
 const response=await b.client.get('/services');assert.doesNotMatch(response.body,/id="active-services"/);assert.match(response.body,/data-service="WEB" data-service-state="INACTIVE"/);assert.equal(w.db.get('SELECT count(*) n FROM company_services WHERE company_id=?',b.id).n,0);
});
test('agency and collaborator cannot acquire owner service controls or activate a business service',async t=>{
 const w=await portal(t),admin=await agency(w),a=await owner(w,'Restricted workspace',22),member=await colleague(w,a.client,{name:'Colaborador',document:documentFor('entry-member'),'SOCIAL.VIEW':'yes'}),before=snapshot(w.db);
 assert.equal((await admin.get('/services')).status,403);
 const assigned=await member.session.get('/services');assert.equal(assigned.status,200);assert.doesNotMatch(assigned.body,/action="\/services\/activate"|data-service="WEB"/);
 for(const client of [admin,member.session])assert.equal((await client.post('/services/activate',{service:'WEB'})).status,403);
 assert.deepEqual(snapshot(w.db),before);
});
test('package explanations are public and do not invent prices offers or create contracts',async t=>{
 const w=await portal(t),before=snapshot(w.db),response=await w.session().get('/');
 assert.match(response.body,/id="ways-to-work"/);for(const label of ['Un trabajo puntual','Un plan mensual','Tu combinación'])assert.ok(response.body.includes(label));
 assert.doesNotMatch(response.body,/<form\b|action="\/plans|\$\d/);assert.deepEqual(snapshot(w.db),before);
});
test('setup keeps the public layout and closes after agency registration',async t=>{
 const w=await portal(t),client=w.session(),page=await client.get('/setup');assert.equal(page.status,200);assert.match(page.body,/class="public-access"/);assert.match(page.body,/action="\/setup"/);assert.doesNotMatch(page.body,/terminal local muestra/i);
 await agency(w);assert.equal((await client.get('/setup')).status,404);assert.doesNotMatch((await client.get('/login')).body,/href="\/setup"/);
});
