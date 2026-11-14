import assert from 'node:assert/strict';
import { localDay, uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
import { once } from 'node:events';
import { randomBytes, createHash } from 'node:crypto';
import { createPortal } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/application/app.mjs';
import { setupCode } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';

export const password = 'Pruebas Lúmina 123!';
export async function listen(server) {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
export function close(server) {
  return new Promise((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()));
}
export async function portal(t, loyaltyUrl = 'http://127.0.0.1:65533', integration = {},options = {}) {
  const db = openDatabase(':memory:');
  const server = createPortal({db,key:randomBytes(32),loyaltyUrl,integration,...options});
  const origin = await listen(server);
  t.after(async()=>{ await close(server); db.close(); });
  return {db,origin,session:()=>browser(origin)};
}
export function browser(origin) {
  let cookie = '';
  let csrf = '';
  return {
    get cookie() { return cookie; },
    get csrf() { return csrf; },
    async get(path,options={}) {
      const res = await fetch(origin+path,{headers:{Cookie:cookie,'X-Lumina-CSRF':csrf,...options.headers},redirect:'manual'});
      const body = await res.text();
      const match = body.match(/name="(?:_csrf|lumina-csrf)" (?:value|content)="([^"]+)"/);
      if (match) csrf = match[1];
      return {status:res.status,body,location:res.headers.get('location'),headers:res.headers};
    },
    async post(path,data={},options={}) {
      const form = new URLSearchParams({_csrf:csrf,...data});
      const headers = {Cookie:cookie,Origin:origin,'X-Lumina-CSRF':csrf,...options.headers};
      const body = options.json === true ? JSON.stringify(data) : form;
      if (options.json === true) headers['Content-Type'] = 'application/json';
      const res = await fetch(origin+path,{method:'POST',headers,body,redirect:'manual'});
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const html = await res.text();
      const match = html.match(/name="(?:_csrf|lumina-csrf)" (?:value|content)="([^"]+)"/);
      if (match) csrf = match[1];
      return {status:res.status,body:html,location:res.headers.get('location'),headers:res.headers};
    },
  };
}
export async function agency(world) {
  const admin = world.session();
  const response = await admin.post('/setup',{code:setupCode(world.db),name:'Equipo Lúmina',document:'1748225842',password});
  if (response.status!==303) throw new Error('No se creó agencia de prueba.');
  await admin.get('/businesses');
  return admin;
}
export function documentFor(alias) {
 const hash=createHash('sha256').update(String(alias)).digest('hex');
 const body='17'+(parseInt(hash.slice(0,12),16)%6)+String(parseInt(hash.slice(12,24),16)%1000000).padStart(6,'0');
 const total=[...body].reduce((n,v,i)=>{const p=Number(v)*(i%2===0?2:1);return n+(p>9?p-9:p);},0);
 return body+(10-total%10)%10;
}
// Existing workflow fixtures explicitly opt into all services. New onboarding is tested separately.
export async function owner(world, name, identifier, override = {}) {
  const client=world.session(),document=documentFor('negocio'+identifier+'@example.test');
  const response=await client.post('/register',{company:name,name:'Dueño de '+name,document,ruc:document+'001',
    phone:'0991234567',password,consent:'yes',...override});
  if(response.status!==303)throw new Error('No se creó negocio de prueba: '+response.body);
  const id=world.db.get('SELECT id FROM companies WHERE name=?',name).id;
  world.db.run('UPDATE accounts SET welcome_done=1 WHERE company_id=?',id);
  for(const service of ['SOCIAL','WALLET','MAPS','WEB','BRAND'])world.db.run("INSERT INTO company_services VALUES(?,?,'ACTIVE',NULL,?)",id,service,new Date().toISOString());
  // Simulate an already opted-in account for historical production/authorization tests.
  await client.get('/wallet');
  await client.get('/home');
  return {client,id};
}
export async function colleague(world,client,data) {
  const result = await client.post('/team',data);
  const code = result.body.match(/<code class="secret">([A-Za-z0-9_-]{43})<\/code>/)?.[1];
  if (!code) throw new Error('No se creó invitación de prueba.');
  const accountId = world.db.get('SELECT id FROM accounts WHERE document=?',data.document).id;
  const session = world.session();
  if ((await session.post('/activate',{code,password,phone:'0991234567'})).status!==303) throw new Error('No se activó prueba.');
  world.db.run('UPDATE accounts SET welcome_done=1 WHERE id=?',accountId);
  await session.get('/home');
  return {id:accountId,session,code};
}

export async function acceptedContract(world,admin,client,company,plan,price) {
  const selected=path=>'/agency'+path+'?company='+company;
  const request=await client.post('/plans/request',{key:uuid(),['qty_'+plan]:'1'});assert.equal(request.status,303,request.body);
  const order=world.db.get('SELECT * FROM package_orders WHERE id=?',request.location.split('/').at(-1));
  const item=world.db.get('SELECT * FROM package_order_lines WHERE order_id=?',order.id);
  const quoted=await admin.post(selected(request.location+'/quote'),{revision:String(order.revision),['price_'+item.id]:price??String(item.catalog_minor/100),['start_'+item.id]:localDay(),['end_'+item.id]:localDay(),terms:'Alcance acordado para esta prueba.'});assert.equal(quoted.status,303,quoted.body);
  const revision=String(order.revision+1);assert.equal((await client.post(request.location+'/accept',{revision,confirm:'yes'})).status,303);
  const activated=await admin.post(selected(request.location+'/activate'),{revision});assert.equal(activated.status,303,activated.body);
  return world.db.get('SELECT * FROM contracts WHERE order_line_id=?',item.id);
}

export const teamRevision = (world,id) => String(world.db.get("SELECT revision FROM accounts WHERE id=?",id).revision);
