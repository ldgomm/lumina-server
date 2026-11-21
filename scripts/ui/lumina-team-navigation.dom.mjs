import {documentFor} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
// Navigation and read-only DOM checks with fictional accounts, not visual/device validation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { agency, owner, colleague, portal } from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanups=[],errors=[],t={after:f=>cleanups.push(f)};
function dom(html){
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
  const d=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console});
  cleanups.push(()=>d.window.close());
  Object.defineProperty(d.window,'innerWidth',{value:390});
  for(const name of ['lumina.js','team.js']){
    const s=d.window.document.createElement('script');s.textContent=readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+name,import.meta.url),'utf8');d.window.document.head.append(s);
  }
  return d.window;
}
try{
  const w=await portal(t),admin=await agency(w),business=await owner(w,'Negocio de prueba','1');
  const member=await colleague(w,business.client,{name:'Persona de prueba',document:documentFor('persona@example.test'),'SOCIAL.VIEW':'yes','SOCIAL.REQUEST':'yes'});
  for(const [client,path,index] of [[business.client,'/home',1],[admin,'/dashboard',2]]){
    const view=dom((await client.get(path)).body),d=view.document,menu=d.querySelector('#workspace-nav');
    const links=[...menu.querySelectorAll(':scope > a')],team=links[index];
    assert.equal(team.textContent.trim(),'Equipos y roles');assert.equal(team.hidden,false);assert.equal(team.closest('details,[hidden]'),null);
    assert.equal((await client.get(team.getAttribute('href'))).status,200);
    const trigger=d.querySelector('.menu-toggle');trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(d.querySelector('main').inert,true);
    team.focus();assert.equal(d.activeElement,team);d.dispatchEvent(new view.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,trigger);
  }
  const home=dom((await business.client.get('/home')).body);
  const teamShortcut=home.document.querySelector('nav[aria-label="Acciones frecuentes"] a[href="/team"]');
  assert.equal(teamShortcut.textContent.trim(),'Equipos y roles');
  const own=dom((await business.client.get('/team/'+member.id)).body);
  assert.equal(own.document.querySelectorAll('[data-module="WALLET"]').length,1);assert.ok(own.document.querySelector('form[action$="/access"] button[type="submit"]'));
  const directory=dom((await admin.get('/teams')).body),link=directory.document.querySelector('.team-company-card');assert.ok(link);
  assert.equal(link.getAttribute('href'),'/admin/businesses/'+business.id+'/team');
  const managed=dom((await admin.get(link.getAttribute('href'))).body);assert.ok(managed.document.querySelector('a[href$="/team/new"]'));
  const selected=dom((await admin.get('/teams?company='+business.id)).body),d=selected.document;
  assert.equal(d.querySelector('main form').method,'get');assert.equal(d.querySelector('main [name="company"]').value,business.id);
  assert.equal(d.querySelector('main form[method="post"]'),null);assert.equal(d.querySelector('main input[type="checkbox"]'),null);assert.equal(d.querySelector('main input[type="password"]'),null);
  const tasks=d.querySelector('main details');assert.equal(tasks.open,false);tasks.querySelector('summary').click();assert.equal(tasks.open,true);assert.match(tasks.textContent,/consultar, solicitar/);
  assert.equal(d.querySelector('#workspace-nav a[aria-current="page"]').textContent.trim(),'Equipos y roles');
  assert.deepEqual(errors,[]);
  console.log('LUMINA_TEAM_NAVIGATION_DOM_PASS');
}finally{for(const close of cleanups.reverse())await close();}
