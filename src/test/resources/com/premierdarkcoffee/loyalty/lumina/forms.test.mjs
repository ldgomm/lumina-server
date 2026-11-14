import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupCode } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { password, portal } from './helpers.mjs';

// Model the Origin header of a native same-origin form navigation, not fetch's
// default CORS mode. See https://fetch.spec.whatwg.org/#append-a-request-origin-header.
// This is an HTTP regression test; it is not a real browser/device validation.
function nativeForms(origin) {
  let cookie = '';
  return {
    async get(path) {
      const res = await fetch(origin+path,{headers:{Cookie:cookie},redirect:'manual'});
      return {status:res.status,body:await res.text(),headers:res.headers};
    },
    async submit(document,action,fields={},options={}) {
      assert.equal(document.status,200,'The form document must load successfully.');
      assert.ok(document.body.includes(`method="post" action="${action}"`),'The page must actually contain this form.');
      const policy = document.headers.get('referrer-policy');
      const headers = {Cookie:cookie};
      // A no-referrer document yields Origin: null on native POST navigation.
      headers.Origin = policy==='no-referrer' ? 'null' : origin;
      if (Object.hasOwn(options,'origin')) {
        if (options.origin === null) delete headers.Origin;
        else headers.Origin = options.origin;
      }
      const csrf = document.body.match(/name="_csrf" value="([^"]+)"/)?.[1];
      const body = new URLSearchParams({...csrf && {_csrf:csrf},...fields});
      const res = await fetch(origin+action,{method:'POST',headers,body,redirect:'manual'});
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return {status:res.status,body:await res.text(),headers:res.headers};
    },
  };
}

test('formulario nativo: configurar agencia, cierre definitivo de configuración e ingreso',async t=>{
  const world = await portal(t);
  const client = nativeForms(world.origin);
  const code = setupCode(world.db);
  const form = await client.get('/setup');
  const data = {code,name:'Agencia de prueba',document:'1729512507',password};
  const created = await client.submit(form,'/setup',data);
  assert.equal(created.status,303,created.body);
  assert.equal(created.headers.get('location'),'/home');
  assert.equal(world.db.get("SELECT count(*) AS n FROM accounts WHERE kind='AGENCY'").n,1);
  assert.equal(setupCode(world.db),null,'Restarting bootstrap must not create a second administrator.');
  const dashboard = await client.get('/businesses');
  assert.equal(dashboard.status,200);
  assert.equal((await client.submit(await client.get('/account'),'/logout')).status,303);
  assert.equal((await client.get('/setup')).status,404);
  assert.equal((await client.submit(form,'/setup',data)).status,403,'Consumed setup code cannot be reused.');
  assert.equal(world.db.get("SELECT count(*) AS n FROM accounts WHERE kind='AGENCY'").n,1);
  const login = await client.get('/login');
  assert.doesNotMatch(login.body,/href="\/setup"/);
  const entered = await client.submit(login,'/login',{document:data.document,password});
  assert.equal(entered.status,303,entered.body);
  assert.equal((await client.get('/businesses')).status,200);
});

test('formulario nativo: registro, sesión y rechazo de orígenes extraños o CSRF inválido',async t=>{
  const world = await portal(t);
  const client = nativeForms(world.origin);
  const form = await client.get('/register');
  const data = {company:'Cliente de prueba',name:'Responsable de prueba',document:'1747556593',ruc:'1747556593001',
    phone:'0991234567',password,consent:'yes'};
  for (const origin of ['null',null,'https://example.test',world.origin+'.example.test']) {
    assert.equal((await client.submit(form,'/register',data,{origin})).status,403);
  }
  assert.equal(world.db.get('SELECT count(*) AS n FROM companies').n,0);
  const registered = await client.submit(form,'/register',data);
  assert.equal(registered.status,303,registered.body);
  const account = await client.get('/account');
  const changed = {current:password,password:'Otra contraseña de pruebas 456!',confirmation:'Otra contraseña de pruebas 456!'};
  assert.equal((await client.submit(account,'/account/password',{...changed,_csrf:'incorrecto'})).status,403);
  assert.equal((await client.submit(account,'/account/password',changed,{origin:'null'})).status,403);
  assert.equal((await client.submit(account,'/account/password',changed)).status,303);
  const afterChange = await client.get('/account');
  assert.equal((await client.submit(afterChange,'/logout')).status,303);
  assert.equal((await client.get('/home')).status,303);
  const login = await client.get('/login');
  assert.equal((await client.submit(login,'/login',{document:data.document,password:changed.password})).status,303);
});
