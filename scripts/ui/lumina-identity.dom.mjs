// Real form behavior in DOM; visual rendering and physical Wallet delivery are separate checks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {portal,documentFor,password} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const clean=[],t={after:f=>clean.push(f)},source=name=>readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+name,import.meta.url),'utf8');
function dom(html,origin){const b=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:origin,runScripts:'outside-only'});clean.push(()=>b.window.close());return b.window;}
try{
 const w=await portal(t),client=w.session(),publicForm=await client.get('/registro');
 const b=dom(publicForm.body,w.origin),d=b.document;
 b.eval(source('identity-rules.mjs').replace(/export /g,'')+'\n'+source('identity.js').replace(/^import[^\n]+\n/,''));
 const doc=d.querySelector('[name=document]'),ruc=d.querySelector('[name=ruc]'),phone=d.querySelector('[name=phone]');
 assert.equal(doc.type,'text');assert.equal(doc.required,true);assert.equal(d.querySelector('[name=email]'),null);
 doc.value='1712345678';doc.dispatchEvent(new b.Event('blur'));assert.equal(doc.checkValidity(),false);assert.equal(doc.getAttribute('aria-invalid'),'true');assert.match(d.getElementById(doc.getAttribute('aria-describedby')).textContent,/verificador/);
 doc.value=documentFor('dom-person');doc.dispatchEvent(new b.Event('input'));assert.equal(doc.getAttribute('aria-invalid'),null);doc.dispatchEvent(new b.Event('blur'));assert.equal(doc.checkValidity(),true);
 ruc.value='1791234567001';ruc.dispatchEvent(new b.Event('blur'));assert.equal(ruc.checkValidity(),true);assert.equal(d.getElementById(ruc.getAttribute('aria-describedby')).textContent,'');
 ruc.value='1791234567002';ruc.dispatchEvent(new b.Event('input'));ruc.dispatchEvent(new b.Event('blur'));assert.equal(ruc.checkValidity(),false);
 phone.value='0991234567';phone.dispatchEvent(new b.Event('blur'));assert.equal(phone.checkValidity(),true);assert.equal(phone.value,'0991234567');
 phone.value='09912';phone.dispatchEvent(new b.Event('input'));phone.dispatchEvent(new b.Event('blur'));assert.equal(phone.checkValidity(),false);
 const registered=await client.post('/registro',{company:'Negocio DOM nuevo',name:'Responsable',document:documentFor('dom-new'),ruc:'1791234567001',phone:'0991234567',password,consent:'yes',category:'CAFE'});assert.equal(registered.location,'/bienvenida');
 const welcome=dom((await client.get('/bienvenida')).body,w.origin).document;assert.equal(welcome.querySelectorAll('h1').length,1);assert.equal(welcome.querySelector('form[action="/bienvenida"]').method,'post');assert.equal(welcome.querySelector('input[name=service]:checked').value,'LATER');assert.equal(welcome.querySelectorAll('input[name=service]').length,6);assert.equal(welcome.querySelectorAll('[name=password],[name=email]').length,0);
 const form=welcome.querySelector('form[action="/bienvenida"]');assert.equal(form.checkValidity(),true);assert.ok(form.querySelector('[name=_csrf]'));
 await client.post('/bienvenida',{service:'LATER'});const services=dom((await client.get('/servicios')).body,w.origin).document;assert.equal(services.querySelectorAll('form[action="/servicios/activar"]').length,5);assert.equal(services.querySelector('form [name=service][value=WALLET]').closest('form').method,'post');
 assert.equal(w.db.get('SELECT count(*) n FROM company_services').n,0);
 const reveal=d.querySelector('.password-reveal');assert.equal(reveal.type,'button');reveal.click();assert.equal(d.querySelector('[name=password]').type,'text');reveal.click();assert.equal(d.querySelector('[name=password]').type,'password');
 console.log('LUMINA_IDENTITY_DOM_PASS');
}finally{for(const f of clean.reverse())await f();}
