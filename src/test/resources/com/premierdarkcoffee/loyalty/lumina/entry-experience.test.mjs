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

test('owner sees the trial decision once per choice and never again after a signed plan ends',async t=>{
 const { walletHomeEntry,walletTrialReminder }=await import('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-reminders.mjs');
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2027-01-01T05:00:00Z')});
 const w=await portal(t),a=await fresh(w,'owner-wallet-trial');
 w.db.run('INSERT INTO wallet_choices(company_id,trial_active) VALUES(?,1)',a.id);
 const home=await a.client.get('/home');
 assert.equal((home.body.match(/¿Quieres continuar con Wallet\?/g)||[]).length,1);
 assert.doesNotMatch(home.body,/Abrir caja|data-wallet-reminder="home"/);
 assert.match(home.body,/action="\/plans\/wallet\/choice"[^]*?value="later"[^]*?>Ahora no</);
 const member=await colleague(w,a.client,{name:'Colaborador',document:documentFor('wallet-role'),'SOCIAL.VIEW':'yes'});
 assert.doesNotMatch((await member.session.get('/home')).body,/¿Quieres continuar con Wallet|data-wallet-reminder/);
 await a.client.post('/plans/wallet/choice',{choice:'later'});
 assert.doesNotMatch((await a.client.get('/home')).body,/¿Quieres continuar con Wallet/);
 w.db.run("UPDATE wallet_choices SET declined=0,legacy_until='2027-01-18' WHERE company_id=?",a.id);
 assert.equal(walletHomeEntry(w.db,{id:a.id,loyalty_tenant:'linked'},'2027-02-01').choosePlan,false);
 assert.equal(walletHomeEntry(w.db,{id:a.id,loyalty_tenant:'linked'},'2027-02-01').checkPayment,true);
 assert.equal(walletTrialReminder(true,'2026-12-24'),null);
 assert.equal(walletTrialReminder(true,'2026-12-25').type,'trial');
 assert.equal(walletTrialReminder(false,'2026-12-31'),null);
 assert.equal(walletTrialReminder(true,'2027-01-01'),null);
});

test('Wallet entry keeps a quiet owner link and shows only confirmed Wallet debt',async ()=>{
 const { walletPaymentReminder }=await import('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-reminders.mjs');
 const { loyaltyWorkspaceHtml }=await import('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-pages.mjs');
 const active=loyaltyWorkspaceHtml({kind:'OWNER'},'overview',['overview'],{id:'1',name:'Negocio'});
 assert.match(active,/class="wallet-plan-link" href="\/plans\/wallet">Mi suscripción/);
 assert.match(active,/data-wallet-reminder="overview"[^>]+hidden/);
 const team=loyaltyWorkspaceHtml({kind:'COLLABORATOR',grants:[]},'sales',['sales'],{id:'1',name:'Negocio'});
 assert.doesNotMatch(team,/data-wallet-reminder|wallet-plan-link|wallet-subscription\.js/);
 assert.equal(walletPaymentReminder({summary:{balanceMinor:1000},invoices:[{walletDue:false,remainingMinor:1000,dueOn:'2027-02-15'}]}),null);
 const bill={balanceMinor:1497,overdueMinor:0,nextCut:{dueOn:'2027-02-15',remainingMinor:998}};
 const current=walletPaymentReminder({walletBilling:bill});
 assert.equal(current.type,'payment');assert.match(current.description,/9,98/);assert.match(current.description,/15 de febrero/);assert.equal(current.href,'/billing?view=charges#pago-wallet');
 const legacy=walletPaymentReminder({walletBilling:{...bill,overdueMinor:0},access:{overdueSuspension:true}});
 assert.equal(legacy.type,'suspended');assert.doesNotMatch(legacy.description,/pago|vencid/);
 const suspended=walletPaymentReminder({walletBilling:{...bill,overdueMinor:499},access:{overdueSuspension:true}});
 assert.equal(suspended.type,'overdue');assert.match(suspended.description,/4,99/);
});

test('el importe para reactivar Wallet reúne solo saldos vencidos y respeta la fecha del negocio',async()=>{
 const root='../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/';
 const {walletPaymentReminder}=await import(root+'presentation/pages/wallet-reminders.mjs');
 const {walletCheckoutPage}=await import(root+'presentation/pages/wallet-checkout-pages.mjs');
 const {walletDues}=await import(root+'memberships/wallet-balance.mjs');
 const {walletCollections}=await import(root+'presentation/pages/wallet-collections.mjs');
 const account={today:'2027-04-16',access:{effectiveState:'SUSPENDED',overdueSuspension:true},
   walletBilling:{nextCut:{remainingMinor:500,dueOn:'2027-03-15'},overdueMinor:1300,balanceMinor:1600}};
 const banner=walletPaymentReminder(account);assert.equal(banner.type,'overdue');assert.match(banner.description,/13,00/);assert.doesNotMatch(banner.description,/16,00/);
 const page=walletCheckoutPage({actor:{kind:'OWNER'},company:{id:'sample'},account,active:true});
 assert.match(page,/Saldo vencido para reactivar Wallet<\/dt><dd>[^<]*13,00/);assert.match(page,/Por pagar en este vencimiento<\/dt><dd>[^<]*5,00/);assert.doesNotMatch(page,/16,00/);
 const admin=walletCollections({kind:'AGENCY'}, {id:'negocio',name:'Tienda'},account,'',{},{});
 assert.match(admin,/Saldo vencido para reactivar Wallet: <strong>[^<]*13,00/);
 assert.match(admin,/quedarán <strong>[^<]*8,00/);assert.match(admin,/Registrar pago de [^<]*5,00/);
 const future={...account,walletBilling:{nextCut:{remainingMinor:500,dueOn:account.today},overdueMinor:0,balanceMinor:500},access:{effectiveState:'ACTIVE'}};
 assert.match(walletPaymentReminder(future).title,/vence hoy/i);assert.match(walletCheckoutPage({actor:{},company:{},account:future}),/Vence hoy<\/dt>/);
 assert.equal(walletPaymentReminder({...account,access:{effectiveState:'ACTIVE'}}).type,'late');
 const manual=walletPaymentReminder({walletBilling:{overdueMinor:0,nextCut:null},access:{effectiveState:'SUSPENDED'}});
 assert.equal(manual.type,'suspended');assert.doesNotMatch(manual.description,/deuda|vencid|pago/);
 const rows=[
   {walletDue:true,remainingMinor:200,walletCutMinor:500,dueOn:'2027-03-15'},
   {walletDue:true,remainingMinor:300,walletCutMinor:500,dueOn:'2027-03-15'},
   {walletDue:false,remainingMinor:4000,dueOn:'2027-03-10'},
   {walletDue:true,remainingMinor:1000,dueOn:'2027-03-20',status:'VOID'},
   {walletDue:true,remainingMinor:800,dueOn:'2027-04-15'},
   {walletDue:true,remainingMinor:300,dueOn:'2027-05-15'}];
 const legacy={...account,walletBilling:null,invoices:rows,summary:{invoiceCount:rows.length}};
 assert.equal(walletDues(legacy).overdueMinor,1300);assert.equal(walletDues(legacy).cut.remainingMinor,500);
 assert.equal(walletDues({...legacy,offset:100}).overdueMinor,null);
});
