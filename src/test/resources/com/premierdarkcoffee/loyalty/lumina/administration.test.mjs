import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {portal,agency,owner,colleague,documentFor,password,teamRevision} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {businessControl} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/control.mjs';
import {teamAdministrator} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/team-administration.mjs';

async function setup(t){
 const native=new Map(),commands=new Map();let offline=false;
 const loyalty=await fakeLoyalty(t,null,{administration:async call=>{
  if(offline)return {status:503,body:{message:'Prueba sin conexión'}};
  const tenant=call.path.split('/')[4];if(!native.has(tenant))native.set(tenant,{state:'ACTIVE',version:1});
  if(call.path.endsWith('/access')){
   if(call.method==='GET')return {body:native.get(tenant)};
   if(commands.has(call.payload.commandId))return {body:commands.get(call.payload.commandId)};
   if(native.get(tenant).version!==call.payload.expectedVersion)return {status:409,body:{code:'VERSION_CONFLICT'}};
   const next={state:call.payload.state,version:call.payload.expectedVersion+1};native.set(tenant,next);commands.set(call.payload.commandId,next);return {body:next};
  }
  return {body:{today:'2026-11-14',business:{id:tenant,name:'Ficticio'},summary:{balanceMinor:0,overdueMinor:0,invoiceCount:0},invoices:[],payments:[],paymentCount:0,offset:0}};
 }});
 const w=await portal(t,loyalty.origin,{platformToken:loyalty.platformToken});
 const admin=await agency(w),business=await owner(w,'Negocio Uno',801),other=await owner(w,'Negocio Dos',802);
 const member=await colleague(w,business.client,{name:'Persona Uno',document:documentFor('admin-person-1'),'SOCIAL.VIEW':'yes'});
 const base='/admin/businesses/'+business.id,team=base+'/team',person=team+'/'+member.id;
 const state=(action,revision=0)=>({state:action,revision:String(revision),requestKey:randomUUID(),reason:'Gestión solicitada por el negocio',confirm:'yes'});
 const change=extra=>({revision:teamRevision(w,member.id),reason:'Ayuda solicitada por el negocio',confirm:'yes',...extra});
 return {...w,...business,admin,other,member,base,team,person,loyalty,native,commands,state,change,offline:value=>{offline=value;}};
}
async function assign(w){
 const company=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id),branch=w.loyalty.branches.get(company.loyalty_tenant)[0];
 const result=await w.admin.post(w.person+'/access',{revision:teamRevision(w,w.member.id),cash_mode:'BOTH',branch:branch.id,'SOCIAL.VIEW':'yes'});
 assert.equal(result.status,303,result.body);return branch;
}
const codeFrom=response=>response.body.match(/<code class="secret">([^<]+)<\/code>/)?.[1];

test('agency can find and manage business collaborators without entering as owner',async t=>{
 const w=await setup(t);
 for(const path of [w.base,w.team,w.person,'/teams?company='+w.id]){const r=await w.admin.get(path);assert.equal(r.status,200);assert.match(r.body,/Equipo|equipo|Persona Uno/);}
 const page=await w.admin.get(w.person);assert.match(page.body,new RegExp(w.person+'/access'));assert.doesNotMatch(page.body,/Consulta del negocio · Solo lectura/);
 const created=await w.admin.post(w.team,{name:'Persona Dos',document:documentFor('admin-person-2'),phone:'099 555 1234',kind:'OWNER',company_id:w.other.id});
 assert.equal(created.status,201,created.body);assert.ok(codeFrom(created));
 const row=w.db.get('SELECT id,company_id,kind,contact_phone FROM accounts WHERE document=?',documentFor('admin-person-2'));
 assert.equal(row.kind,'COLLABORATOR');assert.equal(row.company_id,w.id);assert.equal(row.contact_phone,'+593995551234');
 const audit=w.db.get("SELECT * FROM audit WHERE subject_id=? AND action='ACCESO_CREADO'",row.id);
 assert.equal(audit.actor_name,'Equipo Lúmina');assert.equal(JSON.parse(audit.details).actorKind,'AGENCY');
 assert.equal((await w.admin.post('/requests?company='+w.id,{title:'Actuar como negocio'})).status,403);
});
test('agency invitation preserves the assigned identity and phone',async t=>{
 const w=await setup(t),document=documentFor('admin-created');
 const created=await w.admin.post(w.team,{name:'Persona Nueva',document,phone:'0994442233'}),code=codeFrom(created),browser=w.session();
 assert.ok(code);
 for(const data of [{document:documentFor('wrong'),phone:'0994442233'},{document,phone:'0994442234'}])assert.equal((await browser.post('/activate',{code,password,...data})).status,403);
 assert.equal((await browser.post('/activate',{code,password,document,phone:'+593994442233'})).status,303);
});
test('agency assigns cash through platform authority with no owner impersonation or token exposure',async t=>{
 const w=await setup(t),before=w.loyalty.calls.length,branch=await assign(w);
 const calls=w.loyalty.calls.slice(before);assert.ok(calls.some(c=>c.path.endsWith('/credentials')&&c.role==='PLATFORM'));
 assert.ok(!calls.some(c=>c.path.startsWith('/api/staff/team')||c.path==='/api/staff/credentials'));
 const grant=w.db.get('SELECT * FROM cash_grants WHERE account_id=?',w.member.id),native=w.loyalty.staff.get(grant.staff_id);
 assert.equal(native.role,'CASHIER');assert.equal(native.branchId,branch.id);assert.equal(grant.status,'ACTIVE');
 const html=(await w.admin.get(w.person)).body;assert.ok(!html.includes(native.token));assert.ok(!html.includes(w.loyalty.platformToken));
 assert.equal(w.db.get("SELECT actor_name FROM audit WHERE action='CAJA_AUTORIZADA'").actor_name,'Equipo Lúmina');
 assert.equal((await w.member.session.get('/wallet')).location,'/cashier');
 const purchase=await w.member.session.post('/api/staff/purchases',{branchId:branch.id,memberId:randomUUID(),amountMinor:500},{json:true});
 assert.equal(purchase.status,200,purchase.body);
 const redeem=await w.member.session.post('/api/staff/counter-redemptions',{branchId:branch.id,memberId:randomUUID(),rewardId:randomUUID()},{json:true});
 assert.equal(redeem.status,200,redeem.body);
});
test('suspension kills existing sessions and resume keeps password permissions and cash',async t=>{
 const w=await setup(t);await assign(w);
 const original=w.db.get('SELECT password,document FROM accounts WHERE id=?',w.member.id);
 assert.equal((await w.admin.post(w.person+'/suspend',w.change())).status,303);
 assert.equal((await w.member.session.get('/cashier')).location,'/login');
 assert.equal((await w.member.session.post('/api/staff/purchases',{}, {json:true})).status,401);
 const fresh=w.session();assert.equal((await fresh.post('/login',{document:original.document,password})).status,401);
 assert.equal((await w.other.client.get('/content')).status,200);
 assert.equal((await w.admin.post(w.person+'/resume',w.change())).status,303);
 assert.equal(w.db.get('SELECT password FROM accounts WHERE id=?',w.member.id).password,original.password);
 assert.equal((await fresh.post('/login',{document:original.document,password})).status,303);await fresh.get('/home');
 assert.equal((await fresh.get('/wallet')).location,'/cashier');
 assert.equal((await fresh.get('/api/staff/dashboard')).status,200);
 assert.equal((await w.member.session.get('/cashier')).location,'/login');
});
test('collaborator deletion hides the person preserves audit and requires explicit restoration',async t=>{
 const w=await setup(t);await assign(w);const row=w.db.get('SELECT * FROM accounts WHERE id=?',w.member.id);
 assert.equal((await w.admin.post(w.person+'/delete',w.change({name:'equivocado'}))).status,400);
 assert.equal((await w.admin.post(w.person+'/delete',w.change({name:row.name}))).status,303);
 assert.equal((await w.member.session.get('/home')).location,'/login');
 assert.ok(w.db.get('SELECT archived_at FROM accounts WHERE id=?',row.id).archived_at);
 assert.equal(w.db.get('SELECT document FROM accounts WHERE id=?',row.id).document,row.document);
 assert.doesNotMatch((await w.admin.get(w.team)).body,/Persona Uno/);
 assert.match((await w.admin.get(w.team+'?state=ARCHIVED')).body,/Persona Uno/);
 assert.equal((await w.admin.post(w.person+'/invite',w.change())).status,409);
 assert.equal((await w.admin.post(w.person+'/restore',w.change())).status,303);
 const invitation=await w.admin.post(w.person+'/invite',w.change());assert.ok(codeFrom(invitation));
 assert.ok(w.db.get("SELECT seq FROM audit WHERE subject_id=? AND action='MEMBER_REMOVED'",row.id));
});
test('team changes require confirmation current revision and CSRF',async t=>{
 const w=await setup(t),revision=teamRevision(w,w.member.id);
 for(const bad of [{confirm:''},{reason:'x'},{revision:'999'},{_csrf:'wrong'}])assert.ok([400,403,409].includes((await w.admin.post(w.person+'/suspend',w.change(bad))).status));
 assert.equal(teamRevision(w,w.member.id),revision);
 assert.equal((await w.admin.post(w.person+'/suspend',w.change())).status,303);
 assert.equal((await w.admin.post(w.person+'/resume',w.change({revision}))).status,409);
});
test('foreign owners collaborators and a forged company cannot use agency team routes',async t=>{
 const w=await setup(t),otherMember=await colleague(w,w.other.client,{name:'Otra Persona',document:documentFor('other-person')});
 for(const session of [w.client,w.other.client,w.member.session]){
  assert.equal((await session.get(w.team)).status,403);
  assert.equal((await session.post(w.person+'/suspend',w.change())).status,403);
 }
 assert.equal((await w.admin.post(w.team+'/'+otherMember.id+'/suspend',w.change())).status,404);
 assert.equal(w.db.get('SELECT active FROM accounts WHERE id=?',otherMember.id).active,1);
 assert.equal((await w.admin.post('/team/'+w.member.id+'/suspend?company='+w.id,w.change())).status,403);
 const ownerId=w.db.get("SELECT id FROM accounts WHERE company_id=? AND kind='OWNER'",w.id).id;
 assert.equal((await w.admin.post(w.team+'/'+ownerId+'/delete',w.change({name:'Dueño de Negocio Uno'}))).status,404);
});
test('business suspension still permits agency help but never makes services operational',async t=>{
 const w=await setup(t);await assign(w);
 assert.equal((await w.admin.post(w.base+'/state',w.state('SUSPENDED'))).status,303);
 assert.equal((await w.admin.post(w.person+'/suspend',w.change())).status,303);
 assert.equal((await w.admin.post(w.person+'/resume',w.change())).status,303);
 const session=w.session();assert.equal((await session.post('/login',{document:documentFor('admin-person-1'),password})).status,303);
 assert.equal((await session.get('/wallet')).status,423);
 const edit=await w.admin.post(w.person+'/details',w.change({name:'Persona Corregida',document:documentFor('admin-person-1'),phone:'0991234567'}));assert.equal(edit.status,303,edit.body);
});
test('deleted business is hidden by default but remains recoverable with its original tenant and ledger',async t=>{
 const w=await setup(t),before={...w.db.get('SELECT * FROM companies WHERE id=?',w.id)};
 const command={...w.state('CLOSED'),name:before.name};
 assert.equal((await w.admin.post(w.base+'/delete',{...command,name:'Otro'})).status,400);
 assert.equal((await w.admin.post(w.base+'/delete',command)).status,303);
 assert.ok(businessControl(w.db,w.id).archived_at);assert.equal(w.native.get(before.loyalty_tenant).state,'CLOSED');
 assert.doesNotMatch((await w.admin.get('/businesses')).body,/Negocio Uno/);
 assert.match((await w.admin.get('/businesses?state=ARCHIVED')).body,/Negocio Uno/);
 assert.equal((await w.client.get('/home')).location,'/login');
 assert.deepEqual({...w.db.get('SELECT * FROM companies WHERE id=?',w.id)},before);
 assert.equal((await w.admin.post(w.base+'/state',w.state('ACTIVE',1))).status,409);
 assert.equal((await w.admin.post(w.base+'/restore',w.state('ACTIVE',1))).status,303);
 assert.equal(businessControl(w.db,w.id).archived_at,null);assert.equal(w.native.get(before.loyalty_tenant).state,'ACTIVE');
 assert.deepEqual({...w.db.get('SELECT * FROM companies WHERE id=?',w.id)},before);
 assert.match((await w.admin.get('/businesses')).body,/Negocio Uno/);
});
test('failed business deletion remains blocked and retries the same durable command',async t=>{
 const w=await setup(t),command={...w.state('CLOSED'),name:'Negocio Uno'};w.offline(true);
 assert.equal((await w.admin.post(w.base+'/delete',command)).status,503);
 assert.equal(businessControl(w.db,w.id).pending_id,command.requestKey);assert.ok(businessControl(w.db,w.id).archived_at);
 w.offline(false);assert.equal((await w.admin.post(w.base+'/retry',{confirm:'yes'})).status,303);
 assert.equal((await w.admin.post(w.base+'/delete',command)).status,303);
 assert.equal(w.db.get('SELECT count(*) n FROM business_commands WHERE company_id=?',w.id).n,1);
});
test('business restoration is not published until native Wallet confirms it',async t=>{
 const w=await setup(t);await w.admin.post(w.base+'/delete',{...w.state('CLOSED'),name:'Negocio Uno'});
 w.offline(true);assert.equal((await w.admin.post(w.base+'/restore',w.state('ACTIVE',1))).status,503);
 assert.ok(businessControl(w.db,w.id).archived_at);assert.equal(businessControl(w.db,w.id).state,'CLOSED');
 w.offline(false);assert.equal((await w.admin.post(w.base+'/retry',{confirm:'yes'})).status,303);assert.equal(businessControl(w.db,w.id).archived_at,null);
});
test('agency cannot bypass business removal confirmation or forge a lifecycle operation',async t=>{
 const w=await setup(t);
 assert.equal((await w.admin.post(w.base+'/state',{...w.state('CLOSED'),operation:'DELETE'})).status,303);
 assert.equal(businessControl(w.db,w.id).archived_at,null);
 assert.equal((await w.admin.post(w.base+'/delete',{...w.state('CLOSED',1),name:'Negocio Uno',confirm:''})).status,400);
 assert.equal((await w.client.post(w.base+'/delete',{...w.state('CLOSED',1),name:'Negocio Uno'})).status,423);
});
test('removed cashier is locally denied even while native Wallet is unavailable',async t=>{
 const w=await setup(t);await assign(w);w.loyalty.unavailable(true);
 const result=await w.admin.post(w.person+'/delete',w.change({name:'Persona Uno'}));assert.equal(result.status,200);assert.match(result.body,/bloqueada en Lúmina/);
 assert.equal((await w.member.session.get('/cashier')).location,'/login');assert.equal(w.db.get('SELECT status FROM cash_grants WHERE account_id=?',w.member.id).status,'REVOKING');
 w.loyalty.unavailable(false);
 assert.equal((await w.admin.post(w.person+'/cashier/revoke',w.change())).status,303);
 assert.equal(w.db.get('SELECT status FROM cash_grants WHERE account_id=?',w.member.id).status,'INACTIVE');
});
test('agency session lost during native team lookup cannot publish new permissions',async t=>{
 const w=await setup(t),branch=w.loyalty.branches.get(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',w.id).loyalty_tenant)[0];
 w.loyalty.beforeRequest(({path})=>{if(path.startsWith('/api/platform/')&&path.endsWith('/team'))w.db.run("DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE kind='AGENCY')");});
 const r=await w.admin.post(w.person+'/access',{revision:teamRevision(w,w.member.id),cash_mode:'BOTH',branch:branch.id});
 assert.equal(r.status,401,r.body);assert.equal(w.db.get('SELECT * FROM cash_grants WHERE account_id=?',w.member.id),undefined);
});
test('owner retains team controls and can also suspend and restore their collaborator',async t=>{
 const w=await setup(t),path='/team/'+w.member.id;
 assert.equal((await w.client.post(path+'/suspend',w.change())).status,303);
 assert.match((await w.client.get(path)).body,/Reactivar acceso/);
 assert.equal((await w.client.post(path+'/resume',w.change())).status,303);
 assert.equal(w.db.get('SELECT active FROM accounts WHERE id=?',w.member.id).active,1);
 assert.throws(()=>teamAdministrator(w.db,{kind:'OWNER'},w.id),e=>e.status===403);
});

test('schema 11 upgrades once with a private backup and preserves business identity sessions and grants',async t=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {mkdtempSync,readFileSync,readdirSync,statSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {openDatabase}=await import('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs');
 const folder=mkdtempSync(join(tmpdir(),'lumina-admin-migration-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const file=join(folder,'agency.sqlite'),raw=new DatabaseSync(file),infra=new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/',import.meta.url);
 raw.exec(readFileSync(new URL('schema.sql',infra),'utf8'));
 for(const name of readdirSync(new URL('migrations/',infra)).filter(x=>/^\d+/.test(x)&&Number(x.slice(0,3))<=11).sort())raw.exec(readFileSync(new URL('migrations/'+name,infra),'utf8'));
 const company=randomUUID(),account=randomUUID(),tenant=randomUUID();
 raw.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,loyalty_tenant) VALUES(?,?,?,?,?,?,?)').run(company,'Negocio migrado','registration-test','1234','0991234567','2026-11-14',tenant);
 raw.prepare("INSERT INTO accounts(id,company_id,name,email,kind,password,document,contact_phone) VALUES(?,?,?,?,'COLLABORATOR',?,?,?)").run(account,company,'Persona migrada','legacy@example.test','hash-preserved',documentFor('migration'),'+593991234567');
 raw.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('session-digest-preserved',account,'csrf-preserved','2027-11-14');
 raw.prepare("INSERT INTO grants VALUES(?,'SOCIAL','VIEW')").run(account);
 raw.prepare('INSERT INTO business_controls VALUES(?,?,?,?,?,?)').run(company,'CLOSED','Cierre anterior',4,null,'2026-11-14');
 const before=Object.fromEntries(['companies','accounts','sessions','grants','business_controls'].map(table=>[table,raw.prepare('SELECT * FROM '+table).all()]));
 raw.exec('PRAGMA user_version=11');raw.close();
 let db=openDatabase(file);assert.equal(db.get('PRAGMA user_version').user_version,12);
 for(const [table,rows] of Object.entries(before)){
  const after=db.all('SELECT * FROM '+table);assert.equal(after.length,rows.length);
  rows.forEach((row,i)=>{for(const key of Object.keys(row))assert.equal(after[i][key],row[key],table+'.'+key);});
 }
 assert.equal(db.get('SELECT archived_at FROM business_controls').archived_at,null);
 assert.equal(db.get('SELECT suspended_at FROM accounts').suspended_at,null);
 assert.deepEqual(db.all('PRAGMA foreign_key_check'),[]);db.close();
 const backups=readdirSync(join(folder,'migrations'));assert.equal(backups.length,1);assert.match(backups[0],/^before-v12-/);assert.equal(statSync(join(folder,'migrations',backups[0])).mode&0o777,0o600);
 db=openDatabase(file);db.close();assert.equal(readdirSync(join(folder,'migrations')).length,1);
});
