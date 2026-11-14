// Combined public scripts: password controls, recoverable forms and service destinations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {portal,owner,documentFor,password} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const clean=[],t={after:f=>clean.push(f)},source=name=>readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+name,import.meta.url),'utf8');
function render(html,origin){const dom=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:origin,runScripts:'outside-only',pretendToBeVisual:true});clean.push(()=>dom.window.close());const w=dom.window;w.eval(source('lumina.js'));w.eval(source('identity-rules.mjs').replace(/export /g,'')+'\n'+source('identity.js').replace(/^import[^\n]+\n/,''));return w;}
try{
 const world=await portal(t),client=world.session();
 for(const path of ['/login','/register','/activate','/setup','/legacy-login']){
  const w=render((await client.get(path)).body,world.origin+path),d=w.document,field=d.querySelector('[name=password]'),toggle=d.querySelector('[data-password-toggle]');
  assert.equal(d.querySelectorAll('.password-control').length,1,path);assert.equal(d.querySelectorAll('[data-password-toggle],.password-reveal').length,1,path);assert.ok(field.labels.length);assert.equal(field.type,'password');assert.equal(toggle.hidden,false);
  toggle.click();assert.equal(field.type,'text');Object.defineProperty(d,'hidden',{value:true,configurable:true});d.dispatchEvent(new w.Event('visibilitychange'));assert.equal(field.type,'password');assert.equal(toggle.getAttribute('aria-pressed'),'false');
  toggle.click();w.dispatchEvent(new w.Event('pageshow'));assert.equal(field.type,'password');assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);
 }
 const w=render((await client.get('/register')).body,world.origin+'/register'),d=w.document,form=d.querySelector('form');
 for(const [key,value] of Object.entries({company:'Negocio de prueba',category:'CAFE',ruc:'1791234567001',phone:'0991234567',name:'Responsable',document:documentFor('entry-dom'),password}))form.elements.namedItem(key).value=value;
 form.elements.namedItem('consent').checked=true;assert.equal(form.checkValidity(),true);form.elements.namedItem('phone').value='123';form.elements.namedItem('phone').dispatchEvent(new w.Event('blur'));assert.equal(form.checkValidity(),false);assert.equal(form.elements.namedItem('password').value,password);assert.equal(form.elements.namedItem('consent').checked,true);
 form.elements.namedItem('phone').value='0991234567';form.elements.namedItem('phone').dispatchEvent(new w.Event('input'));form.elements.namedItem('phone').dispatchEvent(new w.Event('blur'));assert.equal(form.checkValidity(),true);
 const a=await owner(world,'Servicios de prueba',37);world.db.run("UPDATE company_services SET status='SETUP' WHERE company_id=? AND service='WALLET'",a.id);world.db.run("DELETE FROM company_services WHERE company_id=? AND service='WEB'",a.id);
 const service=render((await a.client.get('/services')).body,world.origin+'/services').document;
 assert.equal(service.querySelector('#active-services [data-service=SOCIAL] a').getAttribute('href'),'/content');assert.equal(service.querySelector('#pending-services [data-service=WALLET] a').getAttribute('href'),'/plans/wallet');const web=service.querySelector('#available-services [data-service=WEB] form');assert.equal(web.method,'post');assert.equal(web.getAttribute('action'),'/services/activate');assert.ok(web.elements.namedItem('_csrf').value);assert.equal(web.elements.namedItem('service').value,'WEB');assert.equal(service.querySelectorAll('[data-service=WALLET]').length,1);
 const fallback=render('<form><input name="password" type="password"><button type="submit">Enviar</button></form>',world.origin),fd=fallback.document,reveal=fd.querySelector('.password-reveal');assert.ok(reveal);reveal.click();assert.equal(fd.querySelector('input').type,'text');fallback.dispatchEvent(new fallback.Event('pageshow'));assert.equal(fd.querySelector('input').type,'password');
 console.log('LUMINA_ENTRY_DOM_PASS');
}finally{for(const f of clean.reverse())await f();}
