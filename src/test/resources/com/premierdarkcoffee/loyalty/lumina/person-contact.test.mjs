import assert from 'node:assert/strict';
import {test} from 'node:test';
import {portal,agency,owner,colleague,password,teamRevision} from './helpers.mjs';
import {contactPhone} from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/identity-rules.mjs';
import {fakeLoyalty} from './loyalty-fixture.mjs';
async function world(t){const native=await fakeLoyalty(t),w=await portal(t,native.origin,{platformToken:native.platformToken}),admin=await agency(w),o=await owner(w,'Contactos','contact');return {...w,...o,admin,native};}
const person=w=>colleague(w,w.client,{name:'Colaboradora',document:'1738277993','SOCIAL.VIEW':'yes'});
const contact=w=>w.db.get('SELECT * FROM accounts WHERE document=?','1738277993');
test('contact normalizes mobile fixed and international numbers without accepting letters or embedded plus',()=>{
 for(const [raw,value] of [['099 123 4567','+593991234567'],['(02) 234-5678','+59322345678'],['593991234567','+593991234567'],['+1 (202) 555-0143','+12025550143']])assert.equal(contactPhone(raw),value);
 for(const raw of ['',null,'099123','09912345678','abc0991234567','09+91234567','+00012345678','+1234567890123456','0991234567\n0'])assert.throws(()=>contactPhone(raw),String(raw));
});
test('activation requires a phone and failure leaves the invitation usable and the account unchanged',async t=>{
 const w=await world(t),invite=await w.client.post('/equipo',{name:'Colaboradora',document:'1738277993'}),code=invite.body.match(/<code class="secret">([^<]+)/)[1],s=w.session();
 for(const phone of ['', 'abc']){const r=await s.post('/activar',{code,password,phone});assert.equal(r.status,400);assert.equal(contact(w).password,null);assert.equal(w.db.get('SELECT count(*) n FROM codes WHERE account_id=?',contact(w).id).n,1);}
 assert.equal((await s.post('/activar',{code,password,phone:'099 123 4567'})).status,303);assert.equal(contact(w).contact_phone,'+593991234567');assert.equal((await w.session().post('/activar',{code,password,phone:'0991234567'})).status,403);
});
test('optional invitation phone is validated and activation confirms the personal number',async t=>{
 const w=await world(t);assert.equal((await w.client.post('/equipo',{name:'Colaboradora',document:'1738277993',phone:'bad'})).status,400);assert.equal(contact(w),undefined);
 const r=await w.client.post('/equipo',{name:'Colaboradora',document:'1738277993',phone:'0981234567'}),code=r.body.match(/<code class="secret">([^<]+)/)[1];assert.equal(contact(w).contact_phone,'+593981234567');
 assert.equal((await w.session().post('/activar',{code,password,phone:'0991234567'})).status,303);assert.equal(contact(w).contact_phone,'+593991234567');
});
test('collaborator can edit their phone without changing identity permissions or business WhatsApp',async t=>{
 const w=await world(t),m=await person(w),before=contact(w),grants=w.db.all('SELECT * FROM grants WHERE account_id=?',m.id),business=w.db.get('SELECT * FROM companies WHERE id=?',w.id);
 await m.session.get('/cuenta');assert.equal((await m.session.post('/cuenta/contacto',{phone:'0981234567',revision:teamRevision(w,m.id),id:business.id,kind:'OWNER'})).status,303);
 const after=contact(w);assert.equal(after.contact_phone,'+593981234567');for(const key of ['id','document','password','company_id','kind'])assert.equal(after[key],before[key]);assert.deepEqual(w.db.all('SELECT * FROM grants WHERE account_id=?',m.id),grants);assert.deepEqual(w.db.get('SELECT * FROM companies WHERE id=?',w.id),business);assert.equal((await m.session.get('/contenido')).status,200);
});
test('contact update rejects stale form and preserves draft and current value',async t=>{
 const w=await world(t),m=await person(w),revision=teamRevision(w,m.id);await m.session.get('/cuenta');await m.session.post('/cuenta/contacto',{phone:'0981234567',revision});
 const r=await m.session.post('/cuenta/contacto',{phone:'0971234567',revision});assert.equal(r.status,409);assert.match(r.body,/value="0971234567"/);assert.equal(contact(w).contact_phone,'+593981234567');
});
test('self contact requires authenticated CSRF and cannot edit another account through ids',async t=>{
 const w=await world(t),m=await person(w),before=contact(w);assert.equal((await w.session().post('/cuenta/contacto',{phone:'0981234567',revision:'0'})).status,401);
 await m.session.get('/cuenta');assert.equal((await m.session.post('/cuenta/contacto',{phone:'0981234567',revision:teamRevision(w,m.id),_csrf:'wrong'})).status,403);assert.equal(contact(w).contact_phone,before.contact_phone);
});
test('owner can correct member phone without revoking their session or disclosing it in audit',async t=>{
 const w=await world(t),m=await person(w);const r=await w.client.post('/equipo/'+m.id+'/datos',{revision:teamRevision(w,m.id),name:'Colaboradora',document:'1738277993',phone:'0981234567'});assert.equal(r.status,303,r.body);assert.equal(contact(w).contact_phone,'+593981234567');assert.equal((await m.session.get('/contenido')).status,200);assert.doesNotMatch(JSON.stringify(w.db.all('SELECT * FROM audit')),/981234567/);
});
test('old active accounts without phone keep access and can add contact later',async t=>{
 const w=await world(t),m=await person(w);w.db.run('UPDATE accounts SET contact_phone=NULL WHERE id=?',m.id);assert.equal((await m.session.get('/contenido')).status,200);const page=await m.session.get('/cuenta');assert.equal(page.status,200);assert.match(page.body,/name="phone"/);assert.equal(contact(w).contact_phone,null);
});
test('team phone search is literal and remains within the owning business',async t=>{
 const w=await world(t),m=await person(w);
 for(const phone of ['991234567','099 123 4567','+593 (99) 123-4567','0991'])assert.match((await w.client.get('/equipo?q='+encodeURIComponent(phone))).body,/Colaboradora/);
 assert.doesNotMatch((await w.client.get('/equipo?q=%25')).body,/Colaboradora<\/a>/);assert.equal((await w.admin.get('/equipo/'+m.id)).status,403);
});
test('agency and owner personal phones are editable separately from business contact',async t=>{
 const w=await world(t);for(const s of [w.admin,w.client]){await s.get('/cuenta');const kind=s===w.admin?'AGENCY':'OWNER',a=w.db.get('SELECT id,revision FROM accounts WHERE kind=?',kind);assert.equal((await s.post('/cuenta/contacto',{phone:'0991234567',revision:String(a.revision)})).status,303);assert.equal(w.db.get('SELECT contact_phone FROM accounts WHERE id=?',a.id).contact_phone,'+593991234567');}
});

test('Wallet contact route needs customer edit permission and never grants cash or design',async()=>{
 const {delegatedRouteAllowed}=await import('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/access-policy.mjs');
 const actor={kind:'COLLABORATOR',grants:[{scope:'WALLET',action:'VIEW'},{scope:'WALLET_CUSTOMERS',action:'VIEW'}]},base='/api/staff/customer-workspace/00000000-0000-4000-8000-000000000001';
 assert.equal(delegatedRouteAllowed(actor,'GET',base),true);assert.equal(delegatedRouteAllowed(actor,'PUT',base+'/contact'),false);
 actor.grants.push({scope:'WALLET_CUSTOMERS',action:'EDIT'});assert.equal(delegatedRouteAllowed(actor,'PUT',base+'/contact'),true);
 for(const [method,path] of [['PUT','/api/staff/wallet-design'],['POST','/api/staff/purchases'],['POST','/api/staff/members/lookup']])assert.equal(delegatedRouteAllowed(actor,method,path),false);
 assert.equal(delegatedRouteAllowed({...actor,kind:'AGENCY'},'PUT',base+'/contact'),false);
 assert.equal(delegatedRouteAllowed({...actor,services:[]},'PUT',base+'/contact'),false);
});
