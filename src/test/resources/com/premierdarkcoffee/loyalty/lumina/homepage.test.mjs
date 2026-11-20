import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { portal, agency, owner, colleague, password } from './helpers.mjs';
import { canonicalPath } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/routes.mjs';
const root=fileURLToPath(new URL('../../../../../../main/',import.meta.url));
const retired=/WhatsApp Business|asistentes con IA|Business e IA|href="\/coming-soon/;
const snapshot=db=>Object.fromEntries(['accounts','companies','company_services','contracts','requests','sessions','audit'].map(name=>[name,db.all('SELECT * FROM '+name)]));

test('public homepage presents the five services without login or account creation',async t=>{
 const w=await portal(t),before=snapshot(w.db),response=await w.session().get('/');
 assert.equal(response.status,200);assert.equal(response.location,null);assert.match(response.body,/<title>Lúmina Digital/);
 assert.equal((response.body.match(/<h1\b/g)||[]).length,1);
 for(const id of ['content','web','maps','brand','loyalty'])assert.match(response.body,new RegExp('id="service-'+id+'"'));
 assert.match(response.body,/href="\/login"/);assert.match(response.body,/href="\/register"/);
 assert.doesNotMatch(response.body,/name="password"|method="post"|lumina-csrf|Configurar la agencia/);assert.doesNotMatch(response.body,retired);
 assert.deepEqual(snapshot(w.db),before);assert.equal(response.headers.get('set-cookie'),null);
});
test('homepage assets are public, typed, same-origin and served under restrictive headers',async t=>{
 const w=await portal(t),client=w.session(),response=await client.get('/');
 assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
 assert.doesNotMatch(response.headers.get('content-security-policy'),/unsafe-inline|unsafe-eval/);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-frame-options'),'DENY');
 for(const [,path] of response.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)){
  const resource=await client.get(path);assert.equal(resource.status,200,path);assert.notEqual(resource.headers.get('content-type'),'text/html; charset=utf-8');
 }
 assert.match((await client.get('/assets/homepage.css')).headers.get('content-type'),/text\/css/);
});
test('public homepage links and section anchors resolve without private destinations',async t=>{
 const w=await portal(t),client=w.session(),response=await client.get('/');
 const ids=[...response.body.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 const paths=new Set();
 for(const [,href] of response.body.matchAll(/href="([^"]+)"/g)){
  if(href.startsWith('#'))assert.ok(ids.includes(href.slice(1)),href);
  else if(href.startsWith('/')){assert.equal(canonicalPath(href),href);paths.add(href);}
  else assert.ok(/^https:\/\/www\.(instagram\.com\/luminadigital360\/|tiktok\.com\/@luminadigital360)$/.test(href),href);
 }
 for(const path of paths)assert.equal((await client.get(path)).status,200,path);
 assert.doesNotMatch(response.body,/href="\/(wallet|plans|businesses|team|setup)(?:[/?"])/);
});
test('login stays a dedicated page and failed submissions keep the login form',async t=>{
 const w=await portal(t),client=w.session();
 const form=await client.get('/login');assert.equal(form.status,200);assert.match(form.body,/action="\/login"/);assert.doesNotMatch(form.body,/class="agency-home"/);
 const bad=await client.post('/login',{document:'1748225842',password:'never-echo-this'});assert.equal(bad.status,401);assert.match(bad.body,/action="\/login"/);assert.match(bad.body,/role="alert"/);assert.doesNotMatch(bad.body,/never-echo-this|class="agency-home"/);
});
test('signed-in agency owner and collaborator can view the homepage without account leakage',async t=>{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Private company',1),member=await colleague(w,business.client,{name:'Private member',document:'1712423381','SOCIAL.VIEW':'yes'});
 for(const client of [admin,business.client,member.session]){
  const before=snapshot(w.db),response=await client.get('/');assert.equal(response.status,200);assert.match(response.body,/href="\/home">Ir a mi espacio/);
  assert.doesNotMatch(response.body,/Private company|Private member|1712423381|name="_csrf"|lumina-csrf/);
  assert.deepEqual(snapshot(w.db),before);assert.equal((await client.get('/login')).location,'/home');
 }
});
test('expired or revoked sessions open the public homepage and private paths go to login',async t=>{
 const w=await portal(t),business=await owner(w,'Inactive account',1);w.db.run('UPDATE accounts SET active=0 WHERE company_id=?',business.id);
 const page=await business.client.get('/');assert.equal(page.status,200);assert.match(page.body,/href="\/login"/);assert.doesNotMatch(page.body,/Ir a mi espacio/);
 for(const path of ['/home','/wallet','/content','/team','/plans'])assert.equal((await business.client.get(path)).location,'/login');
 assert.equal((await business.client.get('/wallet-api/api/staff/dashboard')).status,401);
});
test('registration from the public page remains opt-in and never activates Wallet',async t=>{
 const w=await portal(t),client=w.session();await client.get('/');
 const response=await client.post('/register',{company:'New business',category:'RESTAURANT',name:'Fictional person',document:'1748225842',ruc:'1748225842001',phone:'0991234567',password,consent:'yes'});
 assert.equal(response.status,303);assert.equal(response.location,'/welcome');
 assert.equal(w.db.get("SELECT count(*) n FROM company_services WHERE status='ACTIVE'").n,0);
 const before=snapshot(w.db);assert.equal((await client.get('/')).status,200);assert.deepEqual(snapshot(w.db),before);assert.equal((await client.get('/home')).location,'/welcome');
});
test('logout returns to the public homepage and invalidates access to private workspaces',async t=>{
 const w=await portal(t),business=await owner(w,'Logout case',1);await business.client.get('/account');
 assert.equal((await business.client.post('/logout')).location,'/');
 const page=await business.client.get('/');assert.equal(page.status,200);assert.match(page.body,/href="\/login"/);
 assert.equal((await business.client.get('/account')).location,'/login');assert.equal(w.db.get('SELECT count(*) n FROM sessions').n,0);
});
test('retired service routes cannot render or accept new requests for any role',async t=>{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Retirement check',1),member=await colleague(w,business.client,{name:'Team member',document:'1712423381','SOCIAL.VIEW':'yes'});
 for(const client of [w.session(),admin,business.client,member.session]){
  assert.equal((await client.get('/coming-soon')).status,404);assert.equal((await client.post('/coming-soon')).status,404);
  const old=await client.get('/proximamente');assert.equal(old.location,'/coming-soon');assert.equal((await client.get(old.location)).status,404);
 }
 const count=w.db.get('SELECT count(*) n FROM requests').n;
 assert.equal((await business.client.post('/requests',{type:'CONTENT',channel:'WHATSAPP',service:'AI',title:'Unsupported request',quantity:'1',phone:'0991234567'})).status,400);
 assert.equal(w.db.get('SELECT count(*) n FROM requests').n,count);
});
test('agency owner and collaborator navigation no longer advertise the retired service',async t=>{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Service menu',1),member=await colleague(w,business.client,{name:'Team member',document:'1712423381','SOCIAL.VIEW':'yes'});
 for(const client of [admin,business.client,member.session])for(const path of ['/home','/content','/account','/help']){
  const r=await client.get(path);if(r.status===303){assert.doesNotMatch((await client.get(r.location)).body,retired);}else{assert.equal(r.status,200);assert.doesNotMatch(r.body,retired);}
 }
 assert.match((await w.session().get('/register')).body,/WhatsApp del negocio/);
});
test('bootstrap is absent from the public homepage and stays closed after agency creation',async t=>{
 const w=await portal(t),client=w.session();assert.doesNotMatch((await client.get('/')).body,/\/setup|Configurar la agencia/);assert.equal((await client.get('/setup')).status,200);
 await agency(w);assert.equal((await client.get('/setup')).status,404);assert.doesNotMatch((await client.get('/login')).body,/href="\/setup"/);
});
test('homepage ignores untrusted display parameters and never reflects credentials or company selection',async t=>{
 const w=await portal(t),client=w.session(),plain=await client.get('/');
 const injected=await client.get('/?company=secret-business&name=%3Cscript%3Ealert(1)%3C/script%3E&token=secret-token');
 assert.equal(injected.status,200);assert.equal(injected.body,plain.body);assert.doesNotMatch(injected.body,/secret-business|secret-token|alert\(1\)/);
});
test('runtime route literals use English outside the explicit legacy compatibility boundary',()=>{
 const legacy=JSON.parse(readFileSync(join(root,'resources/com/premierdarkcoffee/loyalty/lumina/shared/legacy-routes.json'),'utf8'));
 const spanish=Object.keys(legacy.routes).filter(key=>key!==legacy.routes[key]);
 const pattern=new RegExp('[\'"`]\\/(?:'+spanish.join('|')+')(?:[\\/\\?\\#\'"`]|$)','g');
 const visit=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?visit(join(dir,entry.name)):[join(dir,entry.name)]);
 for(const file of visit(root).filter(file=>/\.(mjs|js|kt|html)$/.test(file))){
  if(file.endsWith('/lumina/shared/routes.mjs'))continue;
  const body=readFileSync(file,'utf8');assert.doesNotMatch(body,pattern,relative(root,file));
  if(file.includes('/lumina/presentation/'))assert.doesNotMatch(body,/WhatsApp Business|asistentes con IA|Business e IA/,relative(root,file));
 }
});
test('homepage remains usable without scripts and provides native disclosure, focus and reduced-motion support',async t=>{
 const w=await portal(t),page=await w.session().get('/'),css=await w.session().get('/assets/homepage.css');
 assert.doesNotMatch(page.body,/<script(?! defer src="\/assets\/homepage.js")|\sonclick=|style="|localStorage|sessionStorage/);
 assert.match(page.body,/<html lang="es">/);assert.match(page.body,/class="skip-link" href="#main"/);assert.equal((page.body.match(/<details\b/g)||[]).length,11);
 assert.match(css.body,/prefers-reduced-motion/);assert.match(css.body,/:focus-visible/);assert.match(css.body,/@media\(max-width:540px\)/);
 assert.match(page.body,/class="studio-photo"/);assert.match(page.body,/srcset="[^"]*studio-small\.webp 640w/);assert.match(page.body,/alt="Una cámara encuadra/);assert.match(page.body,/Diseño ilustrativo/);
});
