// Uses real portal HTML with fictional accounts; no customer or credential storage.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {portal,owner} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanup=[],errors=[],t={after:f=>cleanup.push(f)};
function render(html){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test/login',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
 cleanup.push(()=>dom.window.close());dom.window.eval(readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/lumina.js',import.meta.url),'utf8'));return dom.window;
}
try{
 const w=await portal(t),client=w.session(),login=render((await client.get('/login')).body),d=login.document;
 const field=d.querySelector('[name=password]'),button=d.querySelector('[data-password-toggle]');assert.equal(field.labels[0].textContent,'Contraseña');assert.equal(field.type,'password');assert.equal(button.hidden,false);assert.equal(button.type,'button');
 field.value='Fictional test password';button.click();assert.equal(field.type,'text');assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(field.value,'Fictional test password');
 login.dispatchEvent(new login.Event('pageshow'));assert.equal(field.type,'password');assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(d.querySelectorAll('[data-password-toggle]').length,1);
 button.click();const form=field.form,submit=form.querySelector('[type=submit]');form.addEventListener('submit',e=>e.preventDefault(),{once:true});form.dispatchEvent(new login.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:submit}));assert.equal(field.type,'password');assert.equal(submit.disabled,false);
 assert.equal(login.localStorage.length,0);assert.equal(login.sessionStorage.length,0);
 assert.equal(d.querySelector('.access-choice').getAttribute('href'),'/register');assert.equal(d.querySelectorAll('.access-choice').length,2);
 const a=await owner(w,'Acceso de prueba',1);
 const account=render((await a.client.get('/account')).body),ad=account.document;
 assert.equal(ad.querySelectorAll('[data-password-toggle]').length,3);for(const field of ad.querySelectorAll('.password-control input')){assert.equal(field.type,'password');assert.ok(field.labels.length);}
 const nav=render((await a.client.get('/home')).body),nd=nav.document,input=nd.querySelector('[data-nav-search]');let chosen=null;
 nd.addEventListener('click',event=>{const link=event.target.closest('a');if(link){chosen=link.getAttribute('href');event.preventDefault();}});
 input.value='equipos';input.dispatchEvent(new nav.Event('input'));input.dispatchEvent(new nav.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(nd.activeElement.getAttribute('href'),'/team');input.focus();input.dispatchEvent(new nav.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(chosen,'/team');
 chosen=null;input.value='inexistente';input.dispatchEvent(new nav.Event('input'));input.dispatchEvent(new nav.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(chosen,null);input.dispatchEvent(new nav.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(input.value,'');assert.equal(nd.activeElement,input);
 assert.deepEqual(errors,[]);console.log('LUMINA_NAVIGATION_DOM_PASS');
}finally{for(const close of cleanup.reverse())await close();}
