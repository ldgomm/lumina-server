import test from 'node:test';
import assert from 'node:assert/strict';
import { agency, colleague, documentFor, owner, portal, acceptedContract, teamRevision } from './helpers.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { analytics } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/analytics/reporting.mjs';
import { effectiveAccessSummary } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/access-summary.mjs';
import { accountPage } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/billing-account-pages.mjs';
import { walletCheckoutPage } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-checkout-pages.mjs';
import { walletCollections } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/wallet-collections.mjs';
import { subscriptionPage } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/subscription-pages.mjs';
import { uuid, localDay } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const selected=(path,id)=>'/agency'+path+'?company='+id;
async function setup(t){const w=await portal(t),admin=await agency(w),o=await owner(w,'Cuenta y resultados','insights');await admin.post(selected('/businesses/verify',o.id));const actor={...w.db.get("SELECT * FROM accounts WHERE company_id=? AND kind='OWNER'",o.id),grants:[]};return {...w,...o,admin,actor};}
async function publication(w){
 const r=await w.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Historia de la marca',phone:'0991234567'});const path=r.location;
 await w.admin.post(selected(path+'/state',w.id),{status:'APPROVED'});await w.admin.post(selected(path+'/pieces',w.id),{title:'Video de la marca'});const piece=w.db.get('SELECT * FROM pieces WHERE request_id=?',path.split('/').at(-1));const pp=path+'/pieces/'+piece.id;
 await w.admin.post(selected(pp+'/edit',w.id),{status:'REVIEW',revision:String(piece.revision)});assert.equal((await w.client.post(pp+'/review',{status:'APPROVED',revision:String(piece.revision+1)})).status,303);
 const publicationResult=await w.admin.post(selected(pp+'/publication',w.id),{channel:'INSTAGRAM',url:'https://example.test/video/'+piece.id,published:'2020-01-01T10:00'});assert.equal(publicationResult.status,303,publicationResult.body);
 return {piece,path:pp,pub:w.db.get('SELECT * FROM publications WHERE piece_id=?',piece.id)};
}
const report=w=>analytics(w.db,w.actor,w.id,{from:'2020-01-02',to:'2020-01-10'});
const measure=(w,r,observed,extra={})=>w.admin.post(selected(r.path+'/measure',w.id),{publication:r.pub.id,observed,...extra});

test('dueño y agencia distinguen el proporcional por nuevas sucursales de la tarifa anual y de los cargos ya emitidos', () => {
 const owner={kind:'OWNER'}, agency={kind:'AGENCY'}, company={id:uuid(),name:'Café de prueba'};
 const agreement={activationOn:'2027-01-01',ownerName:'Dueña'};
 const account={today:'2027-06-16', nextWalletChargeOn:'2027-07-01',
   nextBranchCharge:{cutOn:'2027-07-01',dueOn:'2027-07-15',amountMinor:5466,branchCount:2},
   membership:{branchMonthlyMinor:15000,nextChargeOn:'2027-07-01',plan:{walletAgreement:agreement,name:'Wallet anual',recurring:true,feeMinor:5000,intervalMonths:12}},
   summary:{balanceMinor:0,overdueMinor:0,invoiceCount:0},payments:[],invoices:[],
   access:{walletSubscriptionState:'ACTIVE'},walletBilling:{balanceMinor:0,overdueMinor:0,nextCut:null}};
 const renders = [
   a=>accountPage(owner,a), a=>accountPage(agency,a,'/admin/businesses/'+company.id),
   a=>walletCheckoutPage({actor:owner,company,account:a,active:true,legacy:true}),
   a=>walletCollections(agency,company,a,'',{},{}),
   a=>subscriptionPage(owner,{today:a.today,agreement,accepted:true,recurring:true,cycle:'ANNUAL',periodMinor:15000,nextChargeOn:a.nextWalletChargeOn,nextBranchCharge:a.nextBranchCharge})
 ];
 for (const render of renders) {
   const text=render(account).replace(/<[^>]+>/g,'');
   assert.match(text,/El cargo del 1 (?:jul|de julio de) 2027 incluye [^\d]{0,8}54[.,]66 por la apertura de 2 sucursales/);
   assert.match(text,/El plazo de pago termina el 15 (?:jul|de julio de) 2027/);
   const after=render({...account,nextBranchCharge:null,nextWalletChargeOn:'2028-02-01',
     membership:{...account.membership,nextChargeOn:'2028-02-01'}});
   assert.doesNotMatch(after,/54[.,]66|por la apertura de/);
 }
 assert.match(accountPage(owner,account),/150[.,]00/);
 assert.match(accountPage(owner,account),/Tu cuenta está al día/);
});

test('business account lists active combined and individual agreements with actual prices and remaining units',async t=>{
 const w=await setup(t);
 for(const data of [{name:'Videos del mes',term:'MONTHLY',price:'80',VIDEO:'4',wallet:'NONE'},{name:'Identidad visual',term:'ONE_OFF',price:'150',LOGO:'1',wallet:'NONE'}]){
   assert.equal((await w.admin.post('/plans',data)).status,303);const id=w.db.get('SELECT id FROM plans WHERE name=?',data.name).id;await acceptedContract(w,w.admin,w.client,w.id,id);
 }
 const page=await w.client.get('/billing');assert.equal(page.status,200);assert.match(page.body,/Tus servicios contratados/);assert.match(page.body,/Videos del mes/);assert.match(page.body,/Identidad visual/);assert.match(page.body,/4 × Video/);assert.match(page.body,/Disponibles: 4/);assert.match(page.body,/80[.,]00/);assert.match(page.body,/150[.,]00/);assert.match(page.body,/no se debitan de una tarjeta bancaria/);
 assert.equal(w.db.get('SELECT count(*) n FROM contracts').n,2);
});
test('wallet monthly and annual totals show exact per-branch calculation and one annual charge',()=>{
 const actor={kind:'OWNER'},base={today:'2026-11-14',summary:{balanceMinor:0,overdueMinor:0,invoiceCount:0},invoices:[],payments:[],paymentCount:0,offset:0};
 for(const [fee,months,total,word] of [[499,1,1497,'mes'],[5000,12,15000,'año']]){
   const membership={branchMonthlyMinor:total,nextChargeOn:'2027-02-01',plan:{feeMinor:fee,intervalMonths:months,recurring:true,name:'Wallet',walletAgreement:{activationOn:'2027-01-01',ownerName:'Dueño'}}};
   const trial=accountPage(actor,{...base,membership});assert.match(trial,/Prueba gratuita hasta el 31 de diciembre/);assert.doesNotMatch(trial,/Tarifa para el próximo corte|3 sucursales/);
   const page=accountPage(actor,{...base,today:'2027-01-22',membership});
   assert.match(page,/3 sucursales/);assert.match(page,new RegExp('/ '+word));assert.doesNotMatch(page,/Prueba gratuita hasta/);assert.doesNotMatch(page,/cobro bancario automático/);
 }
 const next={today:'2027-01-22',summary:{balanceMinor:0,overdueMinor:0,invoiceCount:0},invoices:[],payments:[],paymentCount:0};
 const scheduled={name:'Fidelidad anual',items:[{service:'WALLET',quantity:1,used:0,reserved:0}],wallet:'INCLUDED',agreed_minor:5000,consent_on:'2027-01-22',starts_on:'2027-02-01',ends_before:'2028-02-01',schedule_id:'planned',months:12,term:'MONTHLY'};
 const booked=accountPage(actor,next,'/billing','',{},{contracts:[scheduled]});
 assert.match(booked,/Fidelidad anual<\/strong> comienza el/);assert.doesNotMatch(booked,/La siguiente renovación se acuerda/);
 assert.doesNotMatch(booked,/Entregados: 0/);
 const balance={...next,today:'2027-02-16',access:{overdueSuspension:true},walletBilling:{overdueMinor:499,nextCut:{invoiceId:'offpage',dueOn:'2027-02-15',remainingMinor:499,invoiceCount:2}},summary:{balanceMinor:20499,overdueMinor:10000,invoiceCount:2},invoices:[
   {id:'other',description:'Otro servicio',dueOn:'2027-02-18',amountMinor:20000,paidMinor:0,remainingMinor:20000,status:'OPEN'},
   {id:'wallet',description:'Tarjetas de enero',walletDue:true,periodStart:'2027-01-22',periodEnd:'2027-02-01',dueOn:'2027-02-15',amountMinor:499,paidMinor:0,remainingMinor:499,status:'OVERDUE'}]};
 const charges=accountPage(actor,balance,'/billing','',{},{view:'charges'});
 const focused=charges.match(/id="pago-wallet"[^>]*>([\s\S]*?)<\/section>/)[1];
 assert.match(focused,/Importe para este vencimiento[^<]*<\/span>\s*<strong>[^<]*4[.,]99/);assert.match(focused,/15 feb 2027/);assert.doesNotMatch(focused,/204[.,]99/);assert.match(charges,/href="\/help\?topic=payment"/);
 assert.ok(charges.indexOf('Tarjetas de enero')<charges.indexOf('Otro servicio'));
 assert.match(charges,/Período del 22 ene 2027 al 31 ene 2027/);
 const offPage=accountPage(actor,{...balance,offset:100,invoices:[balance.invoices[0]]},'/billing','',{},{view:'charges'});
 assert.ok(offPage.includes(focused));assert.doesNotMatch(offPage,/Tarjetas de enero/);
 const unknownDebt=accountPage(actor,{...balance,walletBilling:{balanceMinor:0,overdueMinor:0,nextCut:null}},'/billing','',{},{view:'charges'});
 assert.match(unknownDebt,/Revisa el acceso a Wallet/);assert.doesNotMatch(unknownDebt,/Saldo vencido de Wallet/);
});
test('a failed Wallet account lookup never presents a false zero balance',async t=>{
 const native=await fakeLoyalty(t);
 const w=await portal(t,native.origin,{platformToken:native.platformToken});await agency(w);const o=await owner(w,'Cuenta no disponible','billing-failure');native.unavailable(true);
 const page=await o.client.get('/billing');assert.equal(page.status,503);assert.match(page.body,/Saldo no disponible/);assert.doesNotMatch(page.body,/Tu cuenta está al día/);
});
test('missing metrics stay unknown, a measured zero is real, and freshness is evaluated at the chosen period end',async t=>{
 const w=await setup(t),r=await publication(w);let data=report(w);assert.equal(data.freshness[0].state,'unmeasured');assert.equal(data.rows[0].coverage.views.observed,0);
 await measure(w,r,'2020-01-03T10:00',{views:'0',likes:'0'});data=report(w);const row=data.rows.find(r=>r.channel==='INSTAGRAM');assert.equal(row.values.views,0n);assert.equal(row.coverage.views.observed,1);assert.equal(row.coverage.comments.observed,0);assert.equal(data.freshness[0].state,'stale');
 const historical=analytics(w.db,w.actor,w.id,{from:'2020-01-02',to:'2020-01-04'});assert.equal(historical.freshness[0].state,'fresh');
});
test('comparisons use only matching publication cuts, distinguish declines and avoid a zero denominator',async t=>{
 const w=await setup(t),r=await publication(w);await measure(w,r,'2020-01-01T11:00',{views:'100',likes:'0'});await measure(w,r,'2020-01-06T11:00',{views:'90',likes:'5'});
 const row=report(w).rows.find(r=>r.channel==='INSTAGRAM');assert.equal(row.changes.views,-10n);assert.equal(row.baseline.views,100n);assert.equal(row.changes.likes,5n);assert.equal(row.baseline.likes,0n);
 const page=await w.client.get('/content?view=metrics&from=2020-01-02&to=2020-01-10');assert.equal(page.status,200);assert.match(page.body,/-10%/);assert.match(page.body,/sin base para porcentaje/);assert.doesNotMatch(page.body,/NaN|Infinity/);
});
test('statistics do not expose another company or unassigned social networks',async t=>{
 const w=await setup(t);await publication(w);assert.equal(report(w).freshness.length,1);
 const other=await owner(w,'Otro resultado','insights-other');assert.throws(()=>analytics(w.db,w.actor,other.id,{from:'2020-01-02',to:'2020-01-10'}),/Área no disponible/);
 const collaborator={...w.actor,kind:'COLLABORATOR',grants:[{scope:'TIKTOK',action:'VIEW'}]};assert.equal(analytics(w.db,collaborator,w.id,{from:'2020-01-02',to:'2020-01-10'}).freshness.length,0);
});
test('team summary describes saved cashier abilities, restrictions, pending activation and revocation without granting them',()=>{
 const member={active:1,activated:1,cash_status:'ACTIVE',purchases:1,rewards:1,branch_name:'Centro',grants:[]};
 let text=effectiveAccessSummary(member).join(' ');assert.match(text,/Puede registrar compras y canjear premios y aplicar descuentos en Centro/);assert.match(text,/No puede modificar tarjetas ni promociones/);assert.match(text,/No puede contratar servicios ni administrar al equipo/);
 text=effectiveAccessSummary({...member,cash_status:'REVOKING'}).join(' ');assert.match(text,/Caja bloqueada/);assert.doesNotMatch(text,/Puede registrar compras/);
 assert.deepEqual(effectiveAccessSummary({...member,active:0}),['Acceso desactivado: no puede entrar ni operar.']);
 assert.match(effectiveAccessSummary({...member,activated:0}).join(' '),/Debe activar su cuenta/);
});
test('cashier journey authorizes purchase and redemption only at assigned branch and revoked sessions cannot reuse either operation',async t=>{
 const native=await fakeLoyalty(t),w=await portal(t,native.origin,{platformToken:native.platformToken});await agency(w);const o=await owner(w,'Caja de la tienda','journey');
 const person=await colleague(w,o.client,{name:'Cajera',document:documentFor('journey-person')});const tenant=w.db.get('SELECT loyalty_tenant FROM companies WHERE id=?',o.id).loyalty_tenant,branch=native.branches.get(tenant)[0].id;
 assert.equal((await o.client.post('/team/'+person.id+'/access',{revision:teamRevision(w,person.id),cash_mode:'BOTH',branch})).status,303);
 const page=await o.client.get('/team/'+person.id);assert.match(page.body,/Acceso guardado/);assert.match(page.body,/Puede registrar compras y canjear/);
 assert.equal((await person.session.get('/wallet')).location,'/cashier');
 const body={branchId:branch,memberId:uuid(),amountMinor:1000};
 for(const path of ['/api/staff/purchases','/api/staff/counter-redemptions']){assert.equal((await person.session.post(path,body,{json:true})).status,200);assert.equal((await person.session.post(path,{...body,branchId:uuid()},{json:true})).status,403);}
 assert.equal((await person.session.get('/wallet-api/api/staff/wallet-design')).status,403);
 assert.equal((await o.client.post('/team/'+person.id+'/disable',{revision:teamRevision(w,person.id),confirm:'yes'})).status,303);
 for(const path of ['/api/staff/purchases','/api/staff/counter-redemptions'])assert.equal((await person.session.post(path,body,{json:true})).status,401);
 assert.equal((await person.session.get('/cashier')).location,'/login');
});
