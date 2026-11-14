import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {portal,agency,password,documentFor,owner,acceptedContract} from './helpers.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
import {documentNumber,rucNumber,whatsappNumber} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/identity.mjs';
import {hashPassword,digest,fingerprint} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/security.mjs';
import {register} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import {openDatabase} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import {serviceState} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/businesses/services.mjs';
const legal={revision:'0',legalName:'Lúmina Prueba',ruc:'1234567890001',address:'Dirección ficticia Quito',email:'legal@example.test',phone:'0991234567',privacyUrl:'https://example.test/privacidad',confirm:'yes'};
const registration=(n='fresh')=>({company:'Negocio '+n,name:'Responsable '+n,document:documentFor(n),ruc:documentFor(n)+'001',phone:'0991234567',password,consent:'yes',category:'CAFE'});
async function world(t,options={}){const native=await fakeLoyalty(t,null,options),w=await portal(t,native.origin,{platformToken:native.platformToken});return {...w,native,admin:await agency(w)};}
async function signup(w,n='fresh'){const data=registration(n),client=w.session(),result=await client.post('/registro',data);assert.equal(result.status,303,result.body);await client.get(result.location);return {client,data,id:w.db.get('SELECT id FROM companies WHERE ruc=?',data.ruc).id};}
const bad=fn=>assert.throws(fn,e=>e.status===400);
const withCheck=body=>body+((10-[...body].reduce((n,d,i)=>{const p=Number(d)*(i%2?1:2);return n+(p>9?p-9:p)},0)%10)%10);

test('cedula preserves leading zero and validates checksum without inventing ownership',()=>{
 for(const body of ['010123456','170123456','300123456','176123456']){const id=withCheck(body);assert.equal(documentNumber(' '+id+' '),id);bad(()=>documentNumber(id.slice(0,9)+(Number(id[9])+1)%10));}
});
test('cedula rejects invalid length provinces controls letters and numeric coercion',()=>{
 for(const id of ['',null,1701234567,'0000000000','123','12345678901','171234567A','17-1234567','1712\n34567',withCheck('250123456'),withCheck('990123456')])bad(()=>documentNumber(id));
});
test('RUC accepts natural and corporate formats without a false corporate checksum rule',()=>{
 for(const id of [documentFor('natural')+'001','1791234567001','1760000000001','3090000000001'])assert.equal(rucNumber(' '+id+' '),id);
});
test('RUC rejects missing digits letters zero identities and branch suffixes as business registration',()=>{
 for(const id of ['',null,1791234567001,'0000000000001','1791234567002','17912345670','17912345670011','17912345X7001','179-234567001'])bad(()=>rucNumber(id));
});
test('WhatsApp normalizes Ecuador mobiles and international notation but not malformed contacts',()=>{
 for(const value of ['0991234567','099 123 4567','+593 (99) 123-4567','593991234567'])assert.equal(whatsappNumber(value),'+593991234567');
 assert.equal(whatsappNumber('+1 202 555 0123'),'+12025550123');
 for(const value of ['','023456789','099123456','09912345678','+59321234567','call me','593+991234567','++593991234567','0991234\n567'])bad(()=>whatsappNumber(value));
});
test('public forms ask for personal cedula business RUC and WhatsApp without new account emails',async t=>{
 const w=await world(t);for(const path of ['/registro','/configurar','/']){const p=await w.session().get(path);if(path==='/configurar')continue;assert.doesNotMatch(p.body,/name="email"/);assert.match(p.body,/name="document"/);}
 const p=await w.session().get('/registro');assert.match(p.body,/name="ruc"[^>]+required/);assert.match(p.body,/WhatsApp del negocio/);assert.match(p.body,/data-identity="phone"/);
});
test('fresh signup creates no Wallet no service no charge and returns one-screen welcome',async t=>{
 const w=await world(t),o=await signup(w);assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',o.id).loyalty_tenant,null);assert.equal(w.db.get('SELECT count(*) n FROM company_services').n,0);assert.equal(w.native.registrations.size,0);
 const p=await o.client.get('/bienvenida');assert.equal(p.status,200);assert.match(p.body,/Explorar primero/);assert.match(p.body,/value="LATER" checked/);assert.doesNotMatch(p.body,/value="WALLET" checked|name="email"/);assert.match(p.body,/video de cortesía/);
 assert.equal((await o.client.get('/inicio')).location,'/bienvenida');
});
test('exploring and reading administration or account never activates or provisions a service',async t=>{
 const w=await world(t),o=await signup(w);assert.equal((await o.client.post('/bienvenida',{service:'LATER'})).status,303);
 const before=w.native.calls.length;for(const path of ['/inicio','/servicios','/cuenta','/mi-estado-cuenta','/planes'])assert.equal((await o.client.get(path)).status,200,path);
 assert.equal((await w.admin.get('/administracion/negocios/'+o.id)).status,200);assert.equal(w.native.calls.length,before);assert.equal(w.native.registrations.size,0);
 const page=await o.client.get('/inicio');assert.doesNotMatch(page.body,/action="\/solicitudes"/);assert.match(page.body,/Mis servicios/);
});
test('choosing Content activates only Content and presents the courtesy without choosing a network',async t=>{
 const w=await world(t),o=await signup(w);const r=await o.client.post('/bienvenida',{service:'SOCIAL'});assert.equal(r.location,'/contenido');assert.equal((await o.client.get('/contenido')).status,200);
 const home=await o.client.get('/inicio');assert.match(home.body,/Tu video de cortesía/);assert.doesNotMatch(home.body,/Publicar la misma pieza en/);assert.equal(w.db.get('SELECT count(*) n FROM company_services').n,1);assert.equal(w.native.registrations.size,0);
});
test('disabled services reject direct operations and enabled services retain normal permissions',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/bienvenida',{service:'LATER'});
 for(const path of ['/wallet','/contenido','/servicios/maps','/servicios/web','/servicios/brand','/wallet-api/api/staff/dashboard'])assert.equal((await o.client.get(path)).status,409,path);
 assert.ok([403,409].includes((await o.client.post('/solicitudes',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Pedido',brief:'Quiero un video',phone:'0991234567'})).status));assert.equal(w.db.get('SELECT count(*) n FROM requests').n,0);
});
test('service activation is explicit POST CSRF owner-only and replay-safe',async t=>{
 const w=await world(t),o=await signup(w);assert.equal((await o.client.get('/servicios/activar?service=WEB')).status,404);
 assert.equal((await o.client.post('/servicios/activar',{service:'WEB',_csrf:'wrong'})).status,403);assert.equal((await w.admin.post('/servicios/activar?empresa='+o.id,{service:'WEB'})).status,403);
 for(let i=0;i<2;i++)assert.equal((await o.client.post('/servicios/activar',{service:'WEB'})).status,303);
 assert.equal(serviceState(w.db,o.id,'WEB'),'ACTIVE');assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE action='SERVICIO_ACTIVADO'").n,1);assert.equal(w.native.registrations.size,0);
});
test('duplicate cedula or RUC cannot create a second owner account or overwrite the first',async t=>{
 const w=await world(t),o=await signup(w);for(const values of [{document:o.data.document},{ruc:o.data.ruc}])assert.equal((await w.session().post('/registro',{...registration('duplicate'),...values})).status,409);
 assert.equal(w.db.get('SELECT count(*) n FROM companies').n,1);assert.equal(w.db.get('SELECT phone FROM companies').phone,'+593991234567');
 // A historical account awaiting its first identity update must not be duplicated either.
 const key=Buffer.alloc(32,7),normalized=o.data.company.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
 w.db.run('UPDATE accounts SET document=NULL WHERE company_id=?',o.id);
 w.db.run('UPDATE companies SET ruc=NULL,registration_key=? WHERE id=?',fingerprint(key,'registration',normalized+'\0'+o.data.document),o.id);
 await assert.rejects(register(w.db,key,o.data),e=>e.status===409);
 assert.equal(w.db.get('SELECT count(*) n FROM companies').n,1);
});
test('server validates cedula RUC and WhatsApp even if browser validation is bypassed',async t=>{
 const w=await world(t);for(const values of [{document:'1712345678'},{ruc:'1791234567002'},{phone:'123'}])assert.equal((await w.session().post('/registro',{...registration(),...values})).status,400);
 assert.equal(w.db.get('SELECT count(*) n FROM companies').n,0);
});
test('cedula or business RUC plus password open the same owner and emails never log in a new account',async t=>{
 const w=await world(t),o=await signup(w);for(const document of [o.data.document,o.data.ruc])assert.equal((await w.session().post('/entrar',{document,password})).location,'/bienvenida');
 assert.equal((await w.session().post('/entrar',{document:o.data.document,password:'wrong'})).status,401);assert.equal((await w.session().post('/entrar',{email:'new@example.test',password})).status,400);
 assert.equal((await w.session().post('/acceso-anterior',{email:'new@example.test',password})).status,401);
});
test('collaborator sees one welcome with assigned active services and cannot activate other modules',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/bienvenida',{service:'SOCIAL'});await o.client.get('/equipo');
 const data={name:'Colaboradora',document:documentFor('team-onboarding'),'SOCIAL.VIEW':'yes','WEB.VIEW':'yes'};
 const r=await o.client.post('/equipo',data);assert.equal(r.status,201,r.body);const code=r.body.match(/<code class="secret">([^<]+)/)[1],member=w.session();assert.equal((await member.post('/activar',{code,password,phone:'0991234567'})).location,'/bienvenida');
 const welcome=await member.get('/bienvenida');assert.match(welcome.body,/Contenido/);assert.doesNotMatch(welcome.body,/Acceso asignado<\/span>.*Web|name="service"/);
 assert.equal((await member.post('/servicios/activar',{service:'WEB'})).status,403);assert.equal((await member.post('/bienvenida',{service:'WEB'})).status,403);assert.equal((await member.post('/bienvenida',{})).location,'/inicio');assert.equal((await member.get('/contenido')).status,200);assert.equal((await member.get('/servicios/web')).status,409);
 const login=w.session();assert.equal((await login.post('/entrar',{document:data.document,password})).location,'/inicio');
});
test('Wallet selection stays pending until owner consent and never grants an operational session first',async t=>{
 let active=false;const calls=[];const w=await world(t,{subscription:async call=>{calls.push(call);if(call.path.endsWith('/offer'))return {body:{hash:'offer',paidFrom:'2027-01-01',trialUntil:'2026-12-31',cycle:'MONTHLY',unitMinor:499,totalMinor:499,branches:[{name:'Principal'}],terms:'Terms'}};if(call.path.endsWith('/accept')){if(!call.payload.accepted)return {status:400,body:{message:'Accept required'}};active=true;return {body:{accepted:true}};}return {body:{accepted:active,recurring:active,legacy:false,version:0,monthlyMinor:499,branches:[]}};}}),o=await signup(w);
 await w.admin.post('/cuenta/proveedor',legal);const chosen=await o.client.post('/bienvenida',{service:'WALLET'});assert.equal(chosen.location,'/planes/wallet');assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');assert.equal(w.native.registrations.size,0);
 const offer=await o.client.get('/planes/wallet');assert.equal(offer.status,200,offer.body);assert.equal(w.native.registrations.size,1);assert.equal((await o.client.get('/wallet')).status,409);assert.equal(calls.filter(c=>c.path.endsWith('/accept')).length,0);
 assert.equal((await o.client.post('/planes/wallet/aceptar',{requestKey:randomUUID(),hash:'offer'})).status,400);assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');
 assert.equal((await o.client.post('/planes/wallet/aceptar',{requestKey:randomUUID(),hash:'offer',accept:'yes'})).location,'/wallet');assert.equal(serviceState(w.db,o.id,'WALLET'),'ACTIVE');assert.equal((await o.client.get('/wallet')).status,200);
 const payload=calls.find(c=>c.path.endsWith('/accept')&&c.payload.accepted).payload;assert.equal(payload.offer.ownerDocument,o.data.document);assert.equal(payload.offer.ownerEmail,'');
});
test('missing provider information never changes pending Wallet into an active service',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/servicios/activar',{service:'WALLET'});const r=await o.client.get('/planes/wallet');assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');assert.doesNotMatch(r.body,/action="\/planes\/wallet\/aceptar"/);assert.equal((await o.client.get('/wallet')).status,409);
});
test('Wallet outage and repeated activation preserve the same company and never select the demo',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/servicios/activar',{service:'WALLET'});w.native.loseRegistrationResponse();assert.equal((await o.client.get('/planes/wallet')).status,503);const tenant=w.native.registrations.get(o.id).id;
 await o.client.post('/servicios/activar',{service:'WALLET'});await o.client.get('/planes/wallet');assert.equal(w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);assert.equal(w.native.registrations.size,1);assert.notEqual(tenant,w.native.business.id);assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');
});
test('administration can pause and resume a content-only business without preparing any Wallet',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/bienvenida',{service:'SOCIAL'});const base='/administracion/negocios/'+o.id;
 for(const [state,revision] of [['PAUSED',0],['ACTIVE',1]]){const r=await w.admin.post(base+'/estado',{state,revision:String(revision),requestKey:randomUUID(),reason:'Revisión administrativa',confirm:'yes'});assert.equal(r.status,303,r.body);if(state==='PAUSED')assert.equal((await o.client.post('/servicios/activar',{service:'WEB'})).status,423);}
 assert.equal(w.native.registrations.size,0);assert.equal((await o.client.get('/contenido')).status,200);
});
test('legacy email migration requires password proof preserves memberships and closes old sessions',async t=>{
 const w=await world(t),existing=await owner(w,'Anterior','legacy');const before=w.db.get('SELECT * FROM companies WHERE id=?',existing.id),acc=w.db.get('SELECT * FROM accounts WHERE company_id=?',existing.id);
 w.db.run("UPDATE accounts SET document=NULL,email='previous@example.test' WHERE id=?",acc.id);w.db.run('UPDATE companies SET ruc=NULL WHERE id=?',existing.id);
 const client=w.session();assert.equal((await client.post('/acceso-anterior',{email:'previous@example.test',password})).location,'/cuenta/identificacion');await client.get('/cuenta/identificacion');
 const data={document:documentFor('claim'),ruc:'1791234567001',phone:'0991234567',current:'wrong'};assert.equal((await client.post('/cuenta/identificacion',data)).status,403);assert.equal(w.db.get('SELECT document FROM accounts WHERE id=?',acc.id).document,null);
 assert.equal((await client.post('/cuenta/identificacion',{...data,current:password})).status,303);const after=w.db.get('SELECT * FROM companies WHERE id=?',existing.id);for(const key of ['id','registration_key','loyalty_tenant','loyalty_name'])assert.equal(after[key],before[key],key);
 assert.equal((await existing.client.get('/cuenta')).location,'/');assert.equal((await w.session().post('/acceso-anterior',{email:'previous@example.test',password})).status,401);assert.equal((await w.session().post('/entrar',{document:data.document,password})).status,303);
});
test('legacy claim rejects duplicate cedula and RUC without changing existing access',async t=>{
 const w=await world(t),o=await owner(w,'Viejo','claim-a'),other=await signup(w,'claim-b');w.db.run('UPDATE accounts SET document=NULL WHERE company_id=?',o.id);await o.client.get('/cuenta');
 for(const data of [{document:other.data.document,ruc:'1791234567001'},{document:documentFor('unused'),ruc:other.data.ruc}])assert.equal((await o.client.post('/cuenta/identificacion',{...data,phone:'0991234567',current:password})).status,409);
 assert.equal(w.db.get('SELECT document FROM accounts WHERE company_id=?',o.id).document,null);assert.equal((await o.client.get('/wallet')).status,200);
});
test('version 8 migration preserves sessions credentials links and grants without fabricating identities',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'lumina-v9-')),path=join(folder,'agency.sqlite');t.after(()=>rmSync(folder,{recursive:true,force:true}));const source=relative=>readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/'+relative,import.meta.url),'utf8');let raw=new DatabaseSync(path);
 for(const file of ['schema.sql','002_unified.sql','003_onboarding.sql','004_packages.sql','005_request_contact.sql','006_black_friday.sql','007_wallet_onboarding.sql','008_business_control.sql'])raw.exec(source(file==='schema.sql'?file:'migrations/'+file));raw.exec('PRAGMA user_version=8');
 const company=randomUUID(),account=randomUUID(),tenant=randomUUID(),session='x'.repeat(43);raw.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,loyalty_tenant) VALUES(?,?,?,?,?,?,?)').run(company,'Legacy','hash','1234','0991234567','2026-01-01',tenant);raw.prepare("INSERT INTO accounts(id,company_id,name,email,kind,password) VALUES(?,?,?,?,'OWNER',?)").run(account,company,'Owner','old@example.test',await hashPassword(password));raw.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(session),account,'csrf','2099-01-01');const initial=raw.prepare('SELECT * FROM accounts').get();raw.close();
 let db=openDatabase(path);assert.equal(db.get('PRAGMA user_version').user_version,10);const after=db.get('SELECT * FROM accounts');for(const key of Object.keys(initial))assert.equal(after[key],initial[key]);assert.equal(after.document,null);assert.equal(after.welcome_done,1);assert.equal(serviceState(db,company,'WALLET'),'ACTIVE');assert.equal(db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);assert.equal(db.get('SELECT digest FROM sessions').digest,digest(session));assert.equal(db.get('SELECT ruc FROM companies').ruc,null);db.close();db=openDatabase(path);assert.equal(db.get('SELECT count(*) n FROM company_services').n,5);db.close();assert.equal(readdirSync(join(folder,'migrations')).length,1);
});
test('accepting content packages works without a Wallet and does not silently enable one',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/bienvenida',{service:'SOCIAL'});await w.admin.post('/agencia/clientes/verificar?empresa='+o.id);await w.admin.post('/planes',{name:'Video simple',term:'MONTHLY',price:'20',VIDEO:'1',wallet:'NONE'});const plan=w.db.get('SELECT id FROM plans').id;await acceptedContract(w,w.admin,o.client,o.id,plan);assert.equal(w.native.registrations.size,0);assert.equal(serviceState(w.db,o.id,'WALLET'),'INACTIVE');
});
test('a contracted Wallet activates explicitly without accepting another subscription',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/bienvenida',{service:'SOCIAL'});await w.admin.post('/agencia/clientes/verificar?empresa='+o.id);await w.admin.post('/planes',{name:'Video con Wallet',term:'MONTHLY',price:'50',VIDEO:'1',wallet:'GIFT'});const plan=w.db.get('SELECT id FROM plans').id;await acceptedContract(w,w.admin,o.client,o.id,plan);assert.equal(serviceState(w.db,o.id,'WALLET'),'INACTIVE');await o.client.post('/servicios/activar',{service:'WALLET'});const r=await o.client.get('/planes/wallet');assert.equal(r.location,'/wallet',r.body);assert.equal(serviceState(w.db,o.id,'WALLET'),'ACTIVE');
});
test('a confirmed manual service charge may prepare billing infrastructure but never enables Wallet',async t=>{
 const w=await world(t,{administration:async call=>({body:call.method==='POST'?{id:randomUUID()}:{today:'2026-11-14',business:{id:call.path.split('/')[4],name:'Prueba'},membership:null,summary:{balanceMinor:0,overdueMinor:0,invoiceCount:0},invoices:[],payments:[],paymentCount:0}})}),o=await signup(w);const base='/administracion/negocios/'+o.id;
 assert.equal((await w.admin.get(base+'?vista=cargos')).status,200);assert.equal(w.native.registrations.size,0);assert.equal((await w.admin.post(base+'/cargo',{requestKey:randomUUID(),description:'Video acordado con el negocio',amount:'20',dueOn:'2026-12-01',confirm:'yes'})).status,303);assert.equal(w.native.registrations.size,1);assert.equal(serviceState(w.db,o.id,'WALLET'),'INACTIVE');assert.equal((await o.client.get('/wallet')).status,409);
});
