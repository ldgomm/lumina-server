// Interaction and accessible structure, not browser screenshots or physical Wallet validation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {portal,agency,owner,colleague} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanup=[],errors=[],t={after:f=>cleanup.push(f)};
try{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Cuenta DOM',1),member=await colleague(w,business.client,{name:'Equipo',email:'cuenta-dom@example.test','SOCIAL.VIEW':'yes'});
 for(const client of [admin,business.client,member.session]){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const browser=new JSDOM((await client.get('/cuenta')).body.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:w.origin+'/cuenta',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});cleanup.push(()=>browser.window.close());const d=browser.window.document;
  Object.defineProperty(browser.window,'innerWidth',{value:390});
  browser.window.eval(readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/lumina.js',import.meta.url),'utf8'));
  assert.equal(d.querySelectorAll('h1').length,1);assert.equal(d.querySelector('h1').textContent,'Mi cuenta');assert.equal(d.querySelectorAll('form[action="/salir"]').length,1);assert.equal(d.querySelector('header form[action="/salir"]'),null);
  for(const name of ['current','password','confirmation']){const input=d.querySelector('[name='+name+']');assert.ok(input.closest('label')?.textContent.trim());assert.equal(input.type,'password');assert.equal(input.required,true);assert.equal(input.value,'');}
  assert.equal(d.querySelector('[name=password]').minLength,12);const form=d.querySelector('form[action="/cuenta/clave"]');assert.equal(form.checkValidity(),false);
  d.querySelector('.menu-toggle').click();assert.equal(d.querySelector('.menu-toggle').getAttribute('aria-expanded'),'true');d.querySelector('.navigation-close').click();assert.equal(d.querySelector('.menu-toggle').getAttribute('aria-expanded'),'false');
  assert.ok(d.querySelector('form[action="/salir"] [name="_csrf"]'));assert.equal(d.querySelector('form[action="/salir"]').method,'post');
 }
 assert.deepEqual(errors,[]);console.log('LUMINA_ACCOUNT_DOM_PASS');
}finally{for(const f of cleanup.reverse())await f();}
