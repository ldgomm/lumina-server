import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {portal,agency,owner,colleague,documentFor,teamRevision,password} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {getSession} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import {businessControl} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/control.mjs';
import {serviceStatus} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/service-status.mjs';

async function world(t){
 const states=new Map(),commands=new Map();let offline=false,reported=null;
 const loyalty=await fakeLoyalty(t,null,{administration:async call=>{
  if(offline)return {status:503,body:{message:'Servidor de prueba no disponible'}};
  const tenant=call.path.split('/')[4];if(!states.has(tenant))states.set(tenant,{state:'ACTIVE',version:1});
  if(call.path.endsWith('/access')){
   if(call.method==='GET')return {body:states.get(tenant)};
   if(commands.has(call.payload.commandId))return {body:commands.get(call.payload.commandId)};
   if(call.payload.expectedVersion!==states.get(tenant).version)return {status:409,body:{code:'VERSION_CONFLICT'}};
   const next={state:call.payload.state,version:call.payload.expectedVersion+1};states.set(tenant,next);commands.set(call.payload.commandId,next);return {body:next};
  }
  return {body:{today:'2026-11-15',business:{id:tenant,name:'Negocio de prueba'},access:{effectiveState:reported||states.get(tenant).state},summary:{balanceMinor:0,overdueMinor:0,invoiceCount:0},invoices:[],payments:[],paymentCount:0,offset:0}};
 }});
 const w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken}),admin=await agency(w),business=await owner(w,'Negocio de prueba','status-business');
 const member=await colleague(w,business.client,{name:'Persona de prueba',document:documentFor('status-person'),'SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes','WALLET.VIEW':'yes','WEB.VIEW':'yes','MAPS.VIEW':'yes','BRAND.VIEW':'yes'});
 const base='/admin/businesses/'+business.id;
 const change=state=>({state,requestKey:randomUUID(),revision:String(businessControl(w.db,business.id).revision),reason:'Revisión solicitada por el negocio',confirm:'yes'});
 return {...w,...business,admin,member,base,change,loyalty,states,offline:value=>{offline=value;},reported:value=>{reported=value;},
  actor:client=>getSession(w.db,client.cookie.split('=')[1]),
  services:()=>w.db.all('SELECT * FROM company_services WHERE company_id=? ORDER BY service',business.id)};
}
const servicePaths=['/content','/services/web','/services/maps','/services/brand','/wallet','/cashier','/requests','/requests/new','/calendar','/reports','/maps','/management','/content/files/'+randomUUID()];

test('all service areas are blocked for owner and collaborator while the same configuration is retained',async t=>{
 const w=await world(t),before=w.services();
 for(const state of ['PAUSED','SUSPENDED','CLOSED']){
  assert.equal((await w.admin.post(w.base+'/state',w.change(state))).status,303);
  for(const client of [w.client,w.member.session]){
   for(const path of servicePaths){const r=await client.get(path);assert.equal(r.status,423,path);assert.match(r.body,/Servicios detenidos/);assert.equal((r.body.match(/data-effective-state="/g)||[]).length,5);}
   for(const area of ['SOCIAL','WALLET','WEB','MAPS','BRAND'])assert.equal((await client.post('/requests',{area,title:'Bloqueada'})).status,423,area);
   for(const path of ['/home','/services','/account','/help'])assert.equal((await client.get(path)).status,200,path);
  }
  assert.deepEqual(w.services(),before);
 }
 assert.equal(w.db.get('SELECT COUNT(*) n FROM requests').n,0);
});
test('reactivation restores only services previously activated without creating configuration or new links',async t=>{
 const w=await world(t);
 w.db.run("DELETE FROM company_services WHERE company_id=? AND service='BRAND'",w.id);
 w.db.run("UPDATE company_services SET status='SETUP' WHERE company_id=? AND service='WALLET'",w.id);
 const before=w.services(),company={...w.db.get('SELECT * FROM companies WHERE id=?',w.id)};
 await w.admin.post(w.base+'/state',w.change('SUSPENDED'));
 w.offline(true);assert.equal((await w.admin.post(w.base+'/state',w.change('ACTIVE'))).status,503);
 const pending=await w.client.get('/services');assert.match(pending.body,/reactivación/);assert.doesNotMatch(pending.body,/href="\/content"|action="\/services\/activate"/);
 w.offline(false);assert.equal((await w.admin.post(w.base+'/retry',{confirm:'yes'})).status,303);
 assert.equal((await w.client.get('/content')).status,200);
 assert.equal((await w.client.get('/services/brand')).status,409);
 assert.equal((await w.client.get('/wallet')).location,'/plans/wallet');
 assert.deepEqual(w.services(),before);assert.deepEqual({...w.db.get('SELECT * FROM companies WHERE id=?',w.id)},company);
});
test('pending provider change is explicit and repeated reads never retry or activate Wallet',async t=>{
 const w=await world(t);w.offline(true);await w.admin.post(w.base+'/state',w.change('SUSPENDED'));
 const before=w.loyalty.calls.length,command=businessControl(w.db,w.id).pending_id;
 for(const path of ['/home','/services','/wallet']){const r=await w.client.get(path);assert.match(r.body,/data-wallet-sync="PENDING"/);assert.match(r.body,/confirmación pendiente/);assert.doesNotMatch(r.body,/Último cambio confirmado/);}
 assert.equal(w.loyalty.calls.length,before);assert.equal(businessControl(w.db,w.id).pending_id,command);
 assert.equal((await w.admin.post(w.base+'/retry',{})).status,400);
 w.offline(false);await w.admin.post(w.base+'/retry',{confirm:'yes'});
 assert.match((await w.client.get('/services')).body,/data-wallet-sync="CONFIRMED"/);
});
test('collaborator sees only assigned areas and no owner billing or activation actions',async t=>{
 const w=await world(t);
 w.db.run("DELETE FROM grants WHERE account_id=? AND scope<>'SOCIAL'",w.member.id);
 for(const state of ['ACTIVE','SUSPENDED']){
  if(state!=='ACTIVE')await w.admin.post(w.base+'/state',w.change(state));
  const r=await w.member.session.get('/services?company='+randomUUID());assert.equal(r.status,200);
  assert.match(r.body,/data-service="SOCIAL"/);assert.doesNotMatch(r.body,/data-service="(?:WALLET|MAPS|WEB|BRAND)"/);
  assert.doesNotMatch(r.body,/href="\/billing|href="\/plans|action="\/services\/activate|deuda|cargos vigentes/);
  assert.equal((await w.member.session.get('/billing')).status,403);
 }
});
test('cash-only collaborator opens cashier from services and keeps branch abilities after business reactivation',async t=>{
 const w=await world(t),tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant,branch=w.loyalty.branches.get(tenant)[0];
 const grant=await w.admin.post(w.base+'/team/'+w.member.id+'/access',{revision:teamRevision(w,w.member.id),cash_mode:'BOTH',branch:branch.id});assert.equal(grant.status,303,grant.body);
 let r=await w.member.session.get('/services');assert.equal(r.status,200);assert.match(r.body,/href="\/cashier"/);assert.doesNotMatch(r.body,/data-service="SOCIAL"/);
 const before={...w.db.get('SELECT * FROM cash_grants WHERE account_id=?',w.member.id)};
 await w.admin.post(w.base+'/state',w.change('SUSPENDED'));
 assert.equal((await w.member.session.post('/api/staff/purchases',{branchId:branch.id,memberId:randomUUID(),amountMinor:500},{json:true})).status,423);
 await w.admin.post(w.base+'/state',w.change('ACTIVE'));
 assert.deepEqual({...w.db.get('SELECT * FROM cash_grants WHERE account_id=?',w.member.id)},before);
 assert.equal((await w.member.session.post('/api/staff/purchases',{branchId:branch.id,memberId:randomUUID(),amountMinor:500},{json:true})).status,200);
 assert.equal((await w.member.session.post('/api/staff/counter-redemptions',{branchId:branch.id,memberId:randomUUID(),rewardId:randomUUID()},{json:true})).status,200);
});
test('blocked requests and API methods stay denied even though the status page is readable',async t=>{
 const w=await world(t);await w.admin.post(w.base+'/state',w.change('PAUSED'));
 for(const path of ['/services/activate','/welcome','/plans/request','/team','/wallet-api/api/staff/programs','/management-api/api/staff/team'])assert.equal((await w.client.post(path,{service:'WEB'})).status,423,path);
 const before=w.loyalty.calls.length;
 for(const path of ['/api/staff/dashboard','/wallet-api/api/staff/dashboard','/management-api/api/staff/dashboard']){
  const r=await w.member.session.get(path);assert.equal(r.status,423);assert.doesNotMatch(r.headers.get('content-type'),/text\/html/);
 }
 assert.equal(w.loyalty.calls.length,before);
});
test('agency sees the five service impacts and real native state without business impersonation',async t=>{
 const w=await world(t);await w.admin.post(w.base+'/state',w.change('CLOSED'));
 const r=await w.admin.get(w.base);assert.equal(r.status,200);assert.equal((r.body.match(/data-effective-state="CLOSED"/g)||[]).length,5);
 assert.match(r.body,/Servidor de Wallet: cerrado/);assert.match(r.body,/conservan su estado externo/);assert.match(r.body,/Equipo Lúmina/);
 assert.equal((await w.admin.post('/requests?company='+w.id,{area:'SOCIAL'})).status,423);
});
test('an unavailable or contradictory native response is never labelled as confirmed',async t=>{
 const w=await world(t);await w.admin.post(w.base+'/state',w.change('SUSPENDED'));
 w.offline(true);let r=await w.admin.get(w.base);assert.match(r.body,/data-wallet-sync="UNAVAILABLE"/);assert.doesNotMatch(r.body,/data-wallet-sync="CONFIRMED"/);
 w.offline(false);w.reported('ACTIVE');r=await w.admin.get(w.base);assert.match(r.body,/data-wallet-sync="REVIEW"/);assert.match(r.body,/no|antes de dar el cambio por confirmado/);
 assert.equal((await w.client.get('/wallet')).status,423);
 w.reported('UNKNOWN');r=await w.admin.get(w.base);assert.match(r.body,/data-wallet-sync="UNAVAILABLE"/);
});
test('suspending a business never changes a second business or its service projection',async t=>{
 const w=await world(t),other=await owner(w,'Otro negocio','status-other');
 await w.admin.post(w.base+'/state',w.change('SUSPENDED'));
 const before=w.db.get('SELECT COUNT(*) n FROM audit').n;
 const r=await other.client.get('/services');assert.equal(r.status,200);assert.match(r.body,/Listos para trabajar/);assert.doesNotMatch(r.body,/Servicios detenidos/);
 assert.equal((await other.client.get('/content')).status,200);
 assert.equal(w.db.get('SELECT COUNT(*) n FROM audit').n,before);
 assert.throws(()=>serviceStatus(w.db,w.actor(w.client),other.id),e=>e.status===403);
});
test('business deletion keeps a read-only status after new login without restoring operations',async t=>{
 const w=await world(t),document=w.actor(w.client).document;
 const r=await w.admin.post(w.base+'/delete',{...w.change('CLOSED'),name:'Negocio de prueba'});assert.equal(r.status,303);
 assert.equal((await w.client.get('/services')).location,'/login');
 const login=w.session();assert.equal((await login.post('/login',{document,password})).status,303);
 const page=await login.get('/services');assert.equal(page.status,200);assert.match(page.body,/data-effective-state="ARCHIVED"/);assert.doesNotMatch(page.body,/action="\/services\/activate"/);
 assert.equal((await login.post('/requests',{area:'WEB'})).status,423);
});
test('empty assignment has a useful service overview and cannot acquire new service permissions',async t=>{
 const w=await world(t);w.db.run('DELETE FROM grants WHERE account_id=?',w.member.id);
 const r=await w.member.session.get('/services');assert.equal(r.status,200);assert.match(r.body,/Aún no tienes áreas asignadas/);assert.doesNotMatch(r.body,/data-service="/);
 assert.equal((await w.member.session.post('/services/activate',{service:'WALLET'})).status,403);
 assert.equal((await w.client.post('/services/activate',{service:'WEB',_csrf:'wrong'})).status,403);
});
test('state explanations are escaped and grants remain distinct from service activation',async t=>{
 const w=await world(t),reason='<script>alert("test")</script> Revisión pendiente';
 await w.admin.post(w.base+'/state',{...w.change('PAUSED'),reason});
 const r=await w.client.get('/services');assert.match(r.body,/&lt;script&gt;/);assert.doesNotMatch(r.body,/<script>alert/);
 w.db.run("DELETE FROM company_services WHERE company_id=? AND service='WEB'",w.id);
 let status=serviceStatus(w.db,w.actor(w.member.session),w.id);assert.equal(status.rows.find(row=>row.code==='WEB').activation,'INACTIVE');assert.equal(status.rows.find(row=>row.code==='WEB').effective,'PAUSED');
 await w.admin.post(w.base+'/state',w.change('ACTIVE'));
 status=serviceStatus(w.db,w.actor(w.member.session),w.id);assert.equal(status.rows.find(row=>row.code==='WEB').effective,'INACTIVE');assert.equal(status.rows.find(row=>row.code==='WEB').canOpen,false);
});
