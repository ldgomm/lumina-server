import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createPortal } from '../src/app.mjs';
import { setupCode } from '../src/accounts/accounts.mjs';
import { openDatabase } from '../src/database.mjs';

export const password = 'Pruebas Lúmina 123!';
export async function listen(server) {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
export function close(server) {
  return new Promise((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()));
}
export async function portal(t, loyaltyUrl = 'http://127.0.0.1:65533') {
  const db = openDatabase(':memory:');
  const server = createPortal({db,key:randomBytes(32),loyaltyUrl});
  const origin = await listen(server);
  t.after(async()=>{ await close(server); db.close(); });
  return {db,origin,session:()=>browser(origin)};
}
export function browser(origin) {
  let cookie = '';
  let csrf = '';
  return {
    get cookie() { return cookie; },
    async get(path) {
      const res = await fetch(origin+path,{headers:{Cookie:cookie},redirect:'manual'});
      const body = await res.text();
      const match = body.match(/name="_csrf" value="([^"]+)"/);
      if (match) csrf = match[1];
      return {status:res.status,body,location:res.headers.get('location'),headers:res.headers};
    },
    async post(path,data={},options={}) {
      const form = new URLSearchParams({_csrf:csrf,...data});
      const headers = {Cookie:cookie,Origin:origin,...options.headers};
      const body = options.json === true ? JSON.stringify(data) : form;
      if (options.json === true) headers['Content-Type'] = 'application/json';
      const res = await fetch(origin+path,{method:'POST',headers,body,redirect:'manual'});
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const html = await res.text();
      const match = html.match(/name="_csrf" value="([^"]+)"/);
      if (match) csrf = match[1];
      return {status:res.status,body:html,location:res.headers.get('location'),headers:res.headers};
    },
  };
}
export async function agency(world) {
  const admin = world.session();
  const response = await admin.post('/configurar',{code:setupCode(world.db),name:'Equipo Lúmina',email:'agencia@example.test',password});
  if (response.status!==303) throw new Error('No se creó agencia de prueba.');
  await admin.get('/clientes');
  return admin;
}
export async function owner(world, name, identifier, override = {}) {
  const client = world.session();
  const response = await client.post('/registro',{company:name,name:'Dueño de '+name,document:'123456789'+identifier,
    phone:'0991234567',email:'negocio'+identifier+'@example.test',password,consent:'yes',...override});
  if (response.status!==303) throw new Error('No se creó negocio de prueba.');
  await client.get('/inicio');
  return {client,id:world.db.get('SELECT id FROM companies WHERE name=?',name).id};
}
export async function colleague(world,client,data) {
  const result = await client.post('/equipo',data);
  const code = result.body.match(/<code class="secret">([A-Za-z0-9_-]{43})<\/code>/)?.[1];
  if (!code) throw new Error('No se creó invitación de prueba.');
  const accountId = world.db.get('SELECT id FROM accounts WHERE email=?',data.email).id;
  const session = world.session();
  if ((await session.post('/activar',{code,password})).status!==303) throw new Error('No se activó prueba.');
  await session.get('/inicio');
  return {id:accountId,session,code};
}
