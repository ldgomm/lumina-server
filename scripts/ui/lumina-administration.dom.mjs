// Administrative team forms use the same UI as owners with an explicit agency scope.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {portal,agency,owner,colleague,documentFor,teamRevision} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const close=[],t={after:f=>close.push(f)};
const dom=html=>{const d=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test',runScripts:'dangerously'});close.push(()=>d.window.close());return d;};
try{
 const w=await portal(t),admin=await agency(w),business=await owner(w,'Negocio de prueba','admin-dom');
 const member=await colleague(w,business.client,{name:'Persona de prueba',document:documentFor('admin-dom-person'),'SOCIAL.VIEW':'yes'});
 const base='/admin/businesses/'+business.id+'/team',path=base+'/'+member.id;
 let d=dom((await admin.get(path)).body).window.document;
 const forms=[...d.querySelectorAll('main form[method="post"]')];assert.ok(forms.length>=5);
 assert.ok(forms.every(form=>form.getAttribute('action').startsWith(path+'/')));
 assert.equal(d.querySelectorAll('[data-module="WALLET"]').length,1);
 assert.equal(d.querySelector('#workspace-nav a[aria-current="page"]').textContent.trim(),'Equipos y roles');
 for(const action of ['suspend','delete']){
  const form=d.querySelector('form[action="'+path+'/'+action+'"]');assert.ok(form.querySelector('[name="confirm"]').required);assert.ok(form.querySelector('[name="reason"]').required);assert.ok(form.querySelector('[name="revision"]'));assert.ok(form.querySelector('[name="_csrf"]'));
 }
 assert.ok(d.querySelector('form[action$="/delete"] [name="name"]').required);
 const editor=d.querySelector('[data-team-editor]'),js=d.createElement('script');js.textContent=readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/team.js',import.meta.url),'utf8');d.head.append(js);
 assert.ok(editor.querySelector('[data-access-level="SOCIAL"]'));
 const removed=await admin.post(path+'/delete',{name:'Persona de prueba',reason:'Fin de colaboración de prueba',confirm:'yes',revision:teamRevision(w,member.id)});assert.equal(removed.status,303);
 d=dom((await admin.get(path)).body).window.document;
 assert.equal(d.querySelector('form[action$="/access"]'),null);assert.equal(d.querySelector('form[action$="/invite"]'),null);
 assert.ok(d.querySelector('form[action$="/restore"]'));assert.match(d.querySelector('main').textContent,/Persona eliminada/);
 const businessPage=dom((await admin.get('/admin/businesses/'+business.id)).body).window.document;
 const deletion=businessPage.querySelector('form[action$="/delete"]');assert.ok(deletion.querySelector('[name="name"]').required);assert.ok(deletion.querySelector('[name="confirm"]').required);
 assert.equal(businessPage.querySelector('main a[href="'+base+'"]').textContent,'Equipo y permisos');
 console.log('LUMINA_ADMINISTRATION_DOM_PASS');
}finally{for(const fn of close.reverse())await fn();}
