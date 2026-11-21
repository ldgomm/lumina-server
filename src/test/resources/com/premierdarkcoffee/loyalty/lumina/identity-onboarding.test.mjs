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
async function signup(w,n='fresh'){const data=registration(n),client=w.session(),result=await client.post('/register',data);assert.equal(result.status,303,result.body);await client.get(result.location);return {client,data,id:w.db.get('SELECT id FROM companies WHERE ruc=?',data.ruc).id};}
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
 const w=await world(t);for(const path of ['/register','/setup','/login']){const p=await w.session().get(path);if(path==='/setup')continue;assert.doesNotMatch(p.body,/name="email"/);assert.match(p.body,/name="document"/);}
 const p=await w.session().get('/register');assert.match(p.body,/name="ruc"[^>]+required/);assert.match(p.body,/WhatsApp del negocio/);assert.match(p.body,/data-identity="phone"/);
});
test('fresh signup creates no Wallet no service no charge and returns one-screen welcome',async t=>{
 const w=await world(t),o=await signup(w);assert.equal(w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',o.id).loyalty_tenant,null);assert.equal(w.db.get('SELECT count(*) n FROM company_services').n,0);assert.equal(w.native.registrations.size,0);
 const p=await o.client.get('/welcome');assert.equal(p.status,200);assert.match(p.body,/Explorar primero/);assert.match(p.body,/value="LATER" checked/);assert.doesNotMatch(p.body,/value="WALLET" checked|name="email"/);assert.match(p.body,/video de cortesía/);
 assert.equal((await o.client.get('/home')).location,'/welcome');
});
test('exploring and reading administration or account never activates or provisions a service',async t=>{
 const w=await world(t),o=await signup(w);assert.equal((await o.client.post('/welcome',{service:'LATER'})).status,303);
 const before=w.native.calls.length;for(const path of ['/home','/services','/account','/billing','/plans'])assert.equal((await o.client.get(path)).status,200,path);
 assert.equal((await w.admin.get('/admin/businesses/'+o.id)).status,200);assert.equal(w.native.calls.length,before);assert.equal(w.native.registrations.size,0);
 const page=await o.client.get('/home');assert.doesNotMatch(page.body,/action="\/requests"/);assert.match(page.body,/Mis servicios/);
});
test('choosing Content activates only Content and presents the courtesy without choosing a network',async t=>{
 const w=await world(t),o=await signup(w);const r=await o.client.post('/welcome',{service:'SOCIAL'});assert.equal(r.location,'/content');assert.equal((await o.client.get('/content')).status,200);
 const home=await o.client.get('/home');assert.match(home.body,/Tu video de cortesía/);assert.doesNotMatch(home.body,/Publicar la misma pieza en/);assert.equal(w.db.get('SELECT count(*) n FROM company_services').n,1);assert.equal(w.native.registrations.size,0);
});
test('disabled services reject direct operations and enabled services retain normal permissions',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/welcome',{service:'LATER'});
 assert.equal((await o.client.get('/wallet')).location,'/plans/wallet');
 for(const path of ['/content','/services/maps','/services/web','/services/brand','/wallet-api/api/staff/dashboard'])assert.equal((await o.client.get(path)).status,409,path);
 assert.ok([403,409].includes((await o.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Pedido',brief:'Quiero un video',phone:'0991234567'})).status));assert.equal(w.db.get('SELECT count(*) n FROM requests').n,0);
});
test('service activation is explicit POST CSRF owner-only and replay-safe',async t=>{
 const w=await world(t),o=await signup(w);assert.equal((await o.client.get('/services/activate?service=WEB')).status,404);
 assert.equal((await o.client.post('/services/activate',{service:'WEB',_csrf:'wrong'})).status,403);assert.equal((await w.admin.post('/services/activate?company='+o.id,{service:'WEB'})).status,403);
 for(let i=0;i<2;i++)assert.equal((await o.client.post('/services/activate',{service:'WEB'})).status,303);
 assert.equal(serviceState(w.db,o.id,'WEB'),'ACTIVE');assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE action='SERVICIO_ACTIVADO'").n,1);assert.equal(w.native.registrations.size,0);
});
test('duplicate cedula or RUC cannot create a second owner account or overwrite the first',async t=>{
 const w=await world(t),o=await signup(w);for(const values of [{document:o.data.document},{ruc:o.data.ruc}])assert.equal((await w.session().post('/register',{...registration('duplicate'),...values})).status,409);
 assert.equal(w.db.get('SELECT count(*) n FROM companies').n,1);assert.equal(w.db.get('SELECT phone FROM companies').phone,'+593991234567');
 // A historical account awaiting its first identity update must not be duplicated either.
 const key=Buffer.alloc(32,7),normalized=o.data.company.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
 w.db.run('UPDATE accounts SET document=NULL WHERE company_id=?',o.id);
 w.db.run('UPDATE companies SET ruc=NULL,registration_key=? WHERE id=?',fingerprint(key,'registration',normalized+'\0'+o.data.document),o.id);
 await assert.rejects(register(w.db,key,o.data),e=>e.status===409);
 assert.equal(w.db.get('SELECT count(*) n FROM companies').n,1);
});
test('server validates cedula RUC and WhatsApp even if browser validation is bypassed',async t=>{
 const w=await world(t);for(const values of [{document:'1712345678'},{ruc:'1791234567002'},{phone:'123'}])assert.equal((await w.session().post('/register',{...registration(),...values})).status,400);
 assert.equal(w.db.get('SELECT count(*) n FROM companies').n,0);
});
test('cedula or business RUC plus password open the same owner and emails never log in a new account',async t=>{
 const w=await world(t),o=await signup(w);for(const document of [o.data.document,o.data.ruc])assert.equal((await w.session().post('/login',{document,password})).location,'/welcome');
 assert.equal((await w.session().post('/login',{document:o.data.document,password:'wrong'})).status,401);assert.equal((await w.session().post('/login',{email:'new@example.test',password})).status,400);
 assert.equal((await w.session().post('/legacy-login',{email:'new@example.test',password})).status,401);
});
test('collaborator sees one welcome with assigned active services and cannot activate other modules',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/welcome',{service:'SOCIAL'});await o.client.get('/team');
 const data={phone:'0991234567',name:'Colaboradora',document:documentFor('team-onboarding'),'SOCIAL.VIEW':'yes','WEB.VIEW':'yes'};
 const r=await o.client.post('/team',data);assert.equal(r.status,201,r.body);const code=r.body.match(/<code class="secret">([^<]+)/)[1],member=w.session();assert.equal((await member.post('/activate',{code,document:data.document,password,phone:'0991234567'})).location,'/welcome');
 const welcome=await member.get('/welcome');assert.match(welcome.body,/Contenido/);assert.doesNotMatch(welcome.body,/Acceso asignado<\/span>.*Web|name="service"/);
 assert.equal((await member.post('/services/activate',{service:'WEB'})).status,403);assert.equal((await member.post('/welcome',{service:'WEB'})).status,403);assert.equal((await member.post('/welcome',{})).location,'/home');assert.equal((await member.get('/content')).status,200);assert.equal((await member.get('/services/web')).status,409);
 assert.doesNotMatch(welcome.body,/class="courtesy-notice"/);
 assert.equal((await member.get('/courtesy')).status,403);
 assert.equal((await member.post('/courtesy/display',{compact:'1'})).status,403);
 assert.equal((await member.post('/requests',giftForm())).status,403);
 assert.equal((await member.post('/admin/businesses/'+o.id+'/courtesy',{request_id:'',revision:'0',confirm:'yes'})).status,403);
 const login=w.session();assert.equal((await login.post('/login',{document:data.document,password})).location,'/home');
});
test('Wallet selection stays pending and read-only until a published offer is accepted',async t=>{
 const w=await world(t),o=await signup(w);const chosen=await o.client.post('/welcome',{service:'WALLET'});assert.equal(chosen.location,'/plans/wallet');assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');
 for(const path of ['/plans/wallet','/services','/plans'])assert.equal((await o.client.get(path)).status,200);
 assert.equal(w.native.registrations.size,0);assert.equal((await o.client.get('/wallet')).location,'/plans/wallet');assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');
});
test('missing provider information never blocks the published catalogue or enables Wallet by reading',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/services/activate',{service:'WALLET'});const r=await o.client.get('/plans/wallet');assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');assert.doesNotMatch(r.body,/action="\/plans\/wallet\/accept"|identificación del proveedor/);assert.equal((await o.client.get('/wallet')).location,'/plans/wallet');
});
test('repeated service selection prepares no native business or demo before commercial acceptance',async t=>{
 const w=await world(t),o=await signup(w);w.native.registrationUnavailable(true);
 for(let i=0;i<3;i++){await o.client.post('/services/activate',{service:'WALLET'});assert.equal((await o.client.get('/plans/wallet')).status,200);}
 assert.equal(w.native.registrations.size,0);assert.equal(w.db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,null);assert.equal(serviceState(w.db,o.id,'WALLET'),'SETUP');
});
test('administration can pause and resume a content-only business without preparing any Wallet',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/welcome',{service:'SOCIAL'});const base='/admin/businesses/'+o.id;
 for(const [state,revision] of [['PAUSED',0],['ACTIVE',1]]){const r=await w.admin.post(base+'/state',{state,revision:String(revision),requestKey:randomUUID(),reason:'Revisión administrativa',confirm:'yes'});assert.equal(r.status,303,r.body);if(state==='PAUSED')assert.equal((await o.client.post('/services/activate',{service:'WEB'})).status,423);}
 assert.equal(w.native.registrations.size,0);assert.equal((await o.client.get('/content')).status,200);
});
test('legacy email migration requires password proof preserves memberships and closes old sessions',async t=>{
 const w=await world(t),existing=await owner(w,'Anterior','legacy');const before=w.db.get('SELECT * FROM companies WHERE id=?',existing.id),acc=w.db.get('SELECT * FROM accounts WHERE company_id=?',existing.id);
 w.db.run("UPDATE accounts SET document=NULL,email='previous@example.test' WHERE id=?",acc.id);w.db.run('UPDATE companies SET ruc=NULL WHERE id=?',existing.id);
 const client=w.session();assert.equal((await client.post('/legacy-login',{email:'previous@example.test',password})).location,'/account/identity');await client.get('/account/identity');
 const data={document:documentFor('claim'),ruc:'1791234567001',phone:'0991234567',current:'wrong'};assert.equal((await client.post('/account/identity',data)).status,403);assert.equal(w.db.get('SELECT document FROM accounts WHERE id=?',acc.id).document,null);
 assert.equal((await client.post('/account/identity',{...data,current:password})).status,303);const after=w.db.get('SELECT * FROM companies WHERE id=?',existing.id);for(const key of ['id','registration_key','loyalty_tenant','loyalty_name'])assert.equal(after[key],before[key],key);
 assert.equal((await existing.client.get('/account')).location,'/login');assert.equal((await w.session().post('/legacy-login',{email:'previous@example.test',password})).status,401);assert.equal((await w.session().post('/login',{document:data.document,password})).status,303);
});
test('legacy claim rejects duplicate cedula and RUC without changing existing access',async t=>{
 const w=await world(t),o=await owner(w,'Viejo','claim-a'),other=await signup(w,'claim-b');w.db.run('UPDATE accounts SET document=NULL WHERE company_id=?',o.id);await o.client.get('/account');
 for(const data of [{document:other.data.document,ruc:'1791234567001'},{document:documentFor('unused'),ruc:other.data.ruc}])assert.equal((await o.client.post('/account/identity',{...data,phone:'0991234567',current:password})).status,409);
 assert.equal(w.db.get('SELECT document FROM accounts WHERE company_id=?',o.id).document,null);assert.equal((await o.client.get('/wallet')).status,200);
});
test('version 8 migration preserves sessions credentials links and grants without fabricating identities',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'lumina-v9-')),path=join(folder,'agency.sqlite');t.after(()=>rmSync(folder,{recursive:true,force:true}));const source=relative=>readFileSync(new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/'+relative,import.meta.url),'utf8');let raw=new DatabaseSync(path);
 for(const file of ['schema.sql','002_unified.sql','003_onboarding.sql','004_packages.sql','005_request_contact.sql','006_black_friday.sql','007_wallet_onboarding.sql','008_business_control.sql'])raw.exec(source(file==='schema.sql'?file:'migrations/'+file));raw.exec('PRAGMA user_version=8');
 const company=randomUUID(),account=randomUUID(),tenant=randomUUID(),session='x'.repeat(43);raw.prepare('INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,loyalty_tenant) VALUES(?,?,?,?,?,?,?)').run(company,'Legacy','hash','1234','0991234567','2026-01-01',tenant);raw.prepare("INSERT INTO accounts(id,company_id,name,email,kind,password) VALUES(?,?,?,?,'OWNER',?)").run(account,company,'Owner','old@example.test',await hashPassword(password));raw.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(session),account,'csrf','2099-01-01');const initial=raw.prepare('SELECT * FROM accounts').get();raw.close();
 let db=openDatabase(path);assert.equal(db.get('PRAGMA user_version').user_version,12);const after=db.get('SELECT * FROM accounts');for(const key of Object.keys(initial))assert.equal(after[key],initial[key]);assert.equal(after.document,null);assert.equal(after.welcome_done,1);assert.equal(serviceState(db,company,'WALLET'),'ACTIVE');assert.equal(db.get('SELECT loyalty_tenant FROM companies').loyalty_tenant,tenant);assert.equal(db.get('SELECT digest FROM sessions').digest,digest(session));assert.equal(db.get('SELECT ruc FROM companies').ruc,null);db.close();db=openDatabase(path);assert.equal(db.get('SELECT count(*) n FROM company_services').n,5);db.close();assert.equal(readdirSync(join(folder,'migrations')).length,1);
});
test('accepting content packages works without a Wallet and does not silently enable one',async t=>{
 const w=await world(t),o=await signup(w);await o.client.post('/welcome',{service:'SOCIAL'});await w.admin.post('/agency/businesses/verify?company='+o.id);await w.admin.post('/plans',{name:'Video simple',term:'MONTHLY',price:'20',VIDEO:'1',wallet:'NONE'});const plan=w.db.get('SELECT id FROM plans').id;await acceptedContract(w,w.admin,o.client,o.id,plan);assert.equal(w.native.registrations.size,0);assert.equal(serviceState(w.db,o.id,'WALLET'),'INACTIVE');
});
test('accepting a quoted package activates its Wallet without another subscription or admin confirmation',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2027-01-22T16:00:00Z')});
 const w=await world(t),o=await signup(w);await o.client.post('/welcome',{service:'SOCIAL'});await w.admin.post('/agency/businesses/verify?company='+o.id);await w.admin.post('/plans',{name:'Video con Wallet',term:'MONTHLY',price:'50',VIDEO:'1',wallet:'GIFT'});const plan=w.db.get('SELECT id FROM plans').id;await acceptedContract(w,w.admin,o.client,o.id,plan);assert.equal(serviceState(w.db,o.id,'WALLET'),'ACTIVE');assert.equal((await o.client.get('/wallet')).status,200);assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,1);
});
test('a confirmed manual service charge may prepare billing infrastructure but never enables Wallet',async t=>{
 const w=await world(t,{administration:async call=>({body:call.method==='POST'?{id:randomUUID()}:{today:'2026-11-14',business:{id:call.path.split('/')[4],name:'Prueba'},membership:null,summary:{balanceMinor:0,overdueMinor:0,invoiceCount:0},invoices:[],payments:[],paymentCount:0}})}),o=await signup(w);const base='/admin/businesses/'+o.id;
 assert.equal((await w.admin.get(base+'?view=charges')).status,200);assert.equal(w.native.registrations.size,0);assert.equal((await w.admin.post(base+'/charge',{requestKey:randomUUID(),description:'Video acordado con el negocio',amount:'20',dueOn:'2026-12-01',confirm:'yes'})).status,303);assert.equal(w.native.registrations.size,1);assert.equal(serviceState(w.db,o.id,'WALLET'),'INACTIVE');assert.equal((await o.client.get('/wallet')).location,'/plans/wallet');
});

const giftForm=()=>({type:'COURTESY',channel:'SOCIAL',service:'VIDEO',title:'Mostrar el taller del negocio',phone:'0991234567',request_key:randomUUID()});

test('la bienvenida ofrece el video sin plan y conserva la vista compacta entre sesiones, inicio y Contenido',async t=>{
 const w=await world(t),o=await signup(w),other=await signup(w,'second');
 const first=await o.client.get('/welcome');
 assert.match(first.body,/class="courtesy-notice"[^>]+data-compact="false"[^>]+data-status="available"/);
 assert.match(first.body,/href="\/courtesy">Solicitar mi video/);
 assert.equal((await o.client.post('/courtesy/display',{compact:'1',_csrf:'otra'})).status,403);
 assert.equal((await o.client.post('/courtesy/display',{compact:'oculto'})).status,400);
 for(const destination of ['//example.test','/home/..//example.test','https://example.test'])assert.equal((await o.client.post('/courtesy/display',{compact:'0',return_to:destination})).location,'/home');
 const preference=await o.client.post('/courtesy/display',{compact:'1',return_to:'/welcome'});
 assert.equal(preference.location,'/welcome');
 const another=w.session();await another.post('/login',{document:o.data.document,password});
 assert.match((await another.get('/welcome')).body,/data-compact="true"/);
 assert.match((await other.client.get('/welcome')).body,/data-compact="false"/);
 await o.client.post('/welcome',{service:'LATER'});
 const home=await o.client.get('/home');assert.match(home.body,/id="courtesy-description" hidden/);assert.match(home.body,/href="\/courtesy">Solicitar mi video/);
 assert.equal((await o.client.get('/content')).status,409);
 const data=giftForm();
 const error=await o.client.post('/requests',{...data,phone:'x'});assert.equal(error.status,400);assert.ok(error.body.includes(data.title));assert.ok(error.body.includes(data.request_key));
 assert.equal((await o.client.post('/requests',{...data,service:'PHOTO'})).status,400);
 const copies=await Promise.all([o.client.post('/requests',data),another.post('/requests',giftForm())]);
 assert.equal(copies[0].status,303);assert.equal(copies[1].location,copies[0].location);
 assert.equal(w.db.get('SELECT count(*) n FROM requests').n,1);
 assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,0);assert.equal(w.db.get('SELECT count(*) n FROM company_services').n,0);
 assert.equal((await o.client.get('/courtesy')).location,copies[0].location);
 assert.match((await o.client.get(copies[0].location)).body,/← Volver a mi negocio/);
 await o.client.post('/services/activate',{service:'SOCIAL'});
 const content=await o.client.get('/content');assert.match(content.body,/data-compact="true" data-status="requested"/);assert.match(content.body,/Ver mi solicitud/);
 const expanded=await another.post('/courtesy/display',{compact:'0'},{headers:{Accept:'application/json'}});
 assert.deepEqual(JSON.parse(expanded.body),{compact:false});
 assert.match((await o.client.get('/home')).body,/data-compact="false" data-status="requested"/);
 assert.match((await other.client.get('/welcome')).body,/data-status="available"/);
});

test('solo administración puede registrar una entrega externa sin crear pedidos, activar servicios ni repetirla',async t=>{
 const w=await world(t),o=await signup(w),other=await signup(w,'separate');
 const path='/admin/businesses/'+o.id+'/courtesy',form={request_id:'',revision:'0',confirm:'yes',video_url:'https://video.example.test/cortesia'};
 assert.match((await w.admin.get('/admin/businesses/'+o.id)).body,/Gestionar cortesía/);
 assert.equal((await o.client.post(path,form)).status,403);
 assert.equal((await w.admin.post(path,{...form,confirm:''})).status,400);
 assert.equal((await w.admin.post(path,{...form,video_url:'enlace inválido'})).status,400);
 assert.equal(w.db.get('SELECT count(*) n FROM courtesy_deliveries').n,0);
 assert.equal((await w.admin.post(path,form)).location,path);assert.equal((await w.admin.post(path,form)).location,path);
 assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE action='CORTESIA_ENTREGADA'").n,1);
 assert.match((await w.admin.get(path)).body,/Video entregado/);
 const welcome=await o.client.get('/welcome');assert.match(welcome.body,/data-status="delivered"/);assert.doesNotMatch(welcome.body,/Solicitar mi video/);
 assert.match((await o.client.get('/courtesy')).body,/href="https:\/\/video.example.test\/cortesia"/);
 assert.equal((await o.client.post('/requests',giftForm())).location,'/courtesy');
 assert.equal(w.db.get('SELECT count(*) n FROM requests').n,0);assert.equal(w.db.get('SELECT count(*) n FROM company_services').n,0);
 assert.doesNotMatch((await other.client.get('/welcome')).body,/video.example.test|data-status="delivered"/);
 assert.equal((await other.client.get(path)).status,403);
 await o.client.post('/welcome',{service:'SOCIAL'});
 assert.match((await o.client.get('/home')).body,/<strong>1<\/strong><span>Videos entregados/);
 assert.match((await o.client.get('/content')).body,/<span>Piezas entregadas<\/span><strong>1<\/strong>/);
 const deliveries=await o.client.get('/content?view=deliveries&q=cortes%C3%ADa');
 assert.equal(deliveries.status,200);assert.match(deliveries.body,/class="piece-summary"/);assert.match(deliveries.body,/Consultar entrega →/);
 assert.doesNotMatch((await o.client.get('/content?view=deliveries&q=otra')).body,/class="piece-summary"/);
 assert.match((await w.admin.get('/agency/content?view=deliveries')).body,/Consultar entrega →/);
});

test('una entrega registrada cierra el trabajo de cortesía exacto y conserva archivos e historial de borradores',async t=>{
 const w=await world(t),o=await signup(w),path='/admin/businesses/'+o.id+'/courtesy';
 const claim=await o.client.post('/requests',giftForm()),id=claim.location.split('/').at(-1),scope=q=>'/agency'+claim.location+q+'?company='+o.id;
 const stale=await w.admin.post(path,{request_id:'',revision:'0',confirm:'yes'});
 assert.equal(stale.status,409);assert.equal(w.db.get('SELECT count(*) n FROM courtesy_deliveries').n,0);
 await w.admin.post('/agency/businesses/verify?company='+o.id,{});
 assert.equal((await w.admin.post(scope('/state'),{revision:'1',status:'APPROVED'})).status,303);
 assert.equal((await w.admin.post(scope('/pieces'),{revision:'2',title:'Borrador de la cortesía'})).status,303);
 const draft=w.db.get('SELECT * FROM pieces WHERE request_id=?',id);
 const link='https://media.example.test/borrador';
 assert.equal((await w.admin.post(scope('/pieces/'+draft.id+'/evidence'),{revision:String(draft.revision),label:'Borrador',url:link})).status,303);
 const beforeVisit=w.db.get('SELECT revision FROM requests WHERE id=?',id).revision;
 assert.equal((await w.admin.post(scope('/visits'),{revision:String(beforeVisit),starts:'2099-06-10T10:00',place:'Local del negocio'})).status,303);
 assert.match((await w.admin.get(scope(''))).body,/Registrar entrega del video/);
 const revision=w.db.get('SELECT revision FROM requests WHERE id=?',id).revision;
 const drop=await w.admin.post(path,{request_id:id,revision:String(revision),confirm:'yes',video_url:'https://media.example.test/final'});assert.equal(drop.location,path);
 assert.equal(w.db.get('SELECT status FROM pieces WHERE id=?',draft.id).status,'CANCELLED');
 assert.equal(w.db.get('SELECT url FROM evidence WHERE piece_id=?',draft.id).url,link);
 assert.equal(w.db.get('SELECT status FROM visits WHERE request_id=?',id).status,'CANCELLED');
 assert.equal(w.db.get("SELECT count(*) n FROM pieces WHERE request_id=? AND status='DELIVERED'",id).n,1);
 assert.equal(w.db.get('SELECT status FROM requests WHERE id=?',id).status,'DELIVERED');
 assert.match((await o.client.get(claim.location)).body,/1 de 1 entregados/);assert.match((await o.client.get('/courtesy')).body,/media.example.test\/final/);
 assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE action='PIEZA_APROBADA'").n,0);
});

test('el dueño puede revisar el video gratuito sin contratar Contenido y la entrega normal actualiza el aviso',async t=>{
 const w=await world(t),o=await signup(w),other=await signup(w,'otra cuenta');
 const claim=await o.client.post('/requests',giftForm()),id=claim.location.split('/').at(-1),scope=q=>'/agency'+claim.location+q+'?company='+o.id;
 await w.admin.post('/agency/businesses/verify?company='+o.id,{});
 await w.admin.post(scope('/state'),{revision:'1',status:'APPROVED'});
 await w.admin.post(scope('/pieces'),{revision:'2',title:'Video de bienvenida'});
 const piece=w.db.get('SELECT * FROM pieces WHERE request_id=?',id);
 const revision=()=>String(w.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision);
 assert.equal((await w.admin.post(scope('/pieces/'+piece.id+'/edit'),{revision:revision(),status:'REVIEW'})).status,303);
 assert.equal((await other.client.get(claim.location)).status,404);
 assert.equal((await other.client.post(claim.location+'/pieces/'+piece.id+'/review',{revision:revision(),status:'APPROVED'})).status,404);
 assert.equal((await o.client.post(claim.location+'/pieces/'+piece.id+'/review',{revision:revision(),status:'APPROVED'})).status,303);
 assert.equal((await w.admin.post(scope('/pieces/'+piece.id+'/edit'),{revision:revision(),status:'DELIVERED'})).status,303);
 assert.equal(w.db.get('SELECT count(*) n FROM courtesy_deliveries').n,0);
 assert.match((await o.client.get('/welcome')).body,/data-status="delivered"/);
 assert.match((await o.client.get('/courtesy')).body,/Consultar entrega y archivos/);
 assert.match((await w.admin.get('/admin/businesses/'+o.id+'/courtesy')).body,/Video entregado/);
 assert.equal((await o.client.get('/content')).status,409);
});

test('la cortesía cancelada se puede volver a pedir sin duplicarla ni reabrirla por un reintento antiguo',async t=>{
 const w=await world(t),o=await signup(w),data=giftForm(),claim=await o.client.post('/requests',data),id=claim.location.split('/').at(-1);
 const cancel=await w.admin.post('/agency'+claim.location+'/state?company='+o.id,{revision:'1',status:'CANCELLED',notes:'El negocio pospuso la grabación.'});assert.equal(cancel.status,303);
 assert.equal((await o.client.post('/requests',data)).location,claim.location);assert.equal(w.db.get('SELECT status FROM requests WHERE id=?',id).status,'CANCELLED');
 assert.match((await o.client.get('/welcome')).body,/Volver a solicitar/);
 assert.match((await o.client.get('/courtesy')).body,/name="courtesy_revision" value="2"/);
 const renewed=await o.client.post('/requests',{...giftForm(),courtesy_revision:'2',title:'Idea para otra fecha'});
 assert.equal(renewed.location,claim.location);assert.equal(w.db.get('SELECT count(*) n FROM requests').n,1);
 assert.equal(w.db.get('SELECT status FROM requests WHERE id=?',id).status,'NEW');assert.match((await o.client.get(renewed.location)).body,/Idea para otra fecha/);
});
