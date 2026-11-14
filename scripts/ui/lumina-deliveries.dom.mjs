// Real portal HTML and shipped scripts; layout and device checks are separate.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {agency,owner,portal} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanup=[],errors=[],checks=[],t={after:f=>cleanup.push(f)},selected=(path,id)=>'/agencia'+path+'?empresa='+id;
function render(html,path){
 const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test'+path,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window;cleanup.push(()=>w.close());w.confirm=()=>false;
 for(const file of ['lumina.js','deliveries.js'])w.eval(readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+file,import.meta.url),'utf8'));
 return w;
}
try{
 const world=await portal(t),admin=await agency(world),a=await owner(world,'Entregas accesibles','dom-deliveries');await admin.post(selected('/clientes/verificar',a.id));
 const r=await a.client.post('/solicitudes',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Presentación del producto'}),path=r.location;
 await admin.post(selected(path+'/estado',a.id),{status:'APPROVED'});await admin.post(selected(path+'/piezas',a.id),{title:'Video del negocio'});const p=world.db.get('SELECT * FROM pieces'),piecePath=path+'/piezas/'+p.id;
 await admin.post(selected(piecePath+'/editar',a.id),{revision:'1',status:'REVIEW'});
 const w=render((await a.client.get(path)).body,path),d=w.document,decision=d.querySelector('.delivery-decision'),approve=decision.querySelector('.approve-delivery'),change=decision.querySelector('details form');
 assert.equal(approve.elements.status.value,'APPROVED');assert.equal(change.elements.status.value,'PRODUCTION');assert.equal(decision.querySelector('select'),null);assert.equal(change.elements.notes.required,true);assert.equal(change.elements.notes.minLength,5);assert.equal(change.checkValidity(),false);assert.equal(change.closest('details').open,true);assert.equal(approve.checkValidity(),true);
 change.elements.notes.value='Cambiar el texto final';assert.equal(change.checkValidity(),true);change.elements.notes.dispatchEvent(new w.Event('input',{bubbles:true}));
 const leaving=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(leaving);assert.equal(leaving.defaultPrevented,true);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);checks.push('Separate decisions, required change explanation, native invalid-field reveal and memory-only draft protection');
 const jump=d.querySelector('.delivery-next a'),target=d.getElementById(jump.getAttribute('href').slice(1));jump.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(d.activeElement,target);
 const history=d.getElementById('historial');history.open=false;d.querySelector('.detail-jumps a[href="#historial"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(history.open,true);assert.equal(d.activeElement,history.querySelector('summary'));checks.push('Next-step and history links reveal their destination and transfer keyboard focus');
 const button=approve.querySelector('button'),caption=button.textContent,submit=()=>{const e=new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button});approve.dispatchEvent(e);return e;};assert.equal(submit().defaultPrevented,false);assert.equal(button.disabled,true);assert.equal(submit().defaultPrevented,true);w.dispatchEvent(new w.Event('pageshow'));assert.equal(button.disabled,false);assert.equal(button.textContent,caption);checks.push('Review submission guards double taps and restores the original action on return');
 const failed=await a.client.post(piecePath+'/revisar',{revision:'2',status:'PRODUCTION',notes:'no'});assert.equal(failed.status,400);const f=render(failed.body,piecePath+'/revisar'),fd=f.document,alert=fd.querySelector('[data-detail-error]');assert.equal(fd.activeElement,alert);assert.equal(alert.closest('details').open,true);assert.equal(alert.closest('form').elements.notes.value,'no');assert.equal(alert.closest('form').elements.revision.value,'2');assert.equal(fd.querySelectorAll('[data-detail-error]').length,1);checks.push('A validation error reopens and focuses the affected form without replacing its revision or text');
 await admin.post(selected(piecePath+'/evidencia',a.id),{label:'Nueva versión',url:'https://example.test/version-2'});
 const stale=await a.client.post(piecePath+'/revisar',{revision:'2',status:'APPROVED'});assert.equal(stale.status,409);const s=render(stale.body,piecePath+'/revisar'),sd=s.document;assert.equal(sd.querySelector('.approve-delivery').elements.revision.value,'2');assert.equal(sd.querySelector('.delivery-files strong').textContent,'Nueva versión');assert.equal(new URL(sd.querySelector('[data-detail-error] a').href).pathname,path);checks.push('A changed attachment remains visible, while stale approval keeps its original revision and offers a fresh GET');
 const production=render((await admin.get(selected(path,a.id))).body,selected(path,a.id)+'#editar-'+p.id);assert.equal(production.document.getElementById('editar-'+p.id).open,true);assert.equal(production.document.activeElement,production.document.getElementById('editar-'+p.id).querySelector('summary'));assert.equal(production.document.querySelector('.delivery-decision'),null);checks.push('Agency deep links open the correct operation without customer approval controls');
 await a.client.post(piecePath+'/revisar',{status:'APPROVED',revision:'3'});
 await admin.post(selected(piecePath+'/publicacion',a.id),{channel:'TIKTOK',url:'https://example.test/tiktok',published:'2020-01-01T10:00'});const pub=world.db.get('SELECT * FROM publications');
 const invalid=await admin.post(selected(piecePath+'/medir',a.id),{publication:pub.id,observed:'2020-01-02T10:00',views:'-4',likes:'0',notes:'Dato pendiente'});assert.equal(invalid.status,400);const m=render(invalid.body,selected(piecePath+'/medir',a.id)),md=m.document,error=md.querySelector('[data-detail-error]');for(let el=error;el;el=el.parentElement)if(el.tagName==='DETAILS')assert.equal(el.open,true);assert.equal(error.closest('form').elements.likes.value,'0');assert.equal(error.closest('form').elements.notes.value,'Dato pendiente');assert.equal(md.activeElement,error);checks.push('Nested metrics validation preserves zero values and opens every collapsed parent');
 for(const doc of [d,fd,sd,production.document,md])for(const link of doc.querySelectorAll('.detail-jumps a,.delivery-next a'))assert.ok(doc.getElementById(link.getAttribute('href').slice(1)),'Missing target '+link.getAttribute('href'));
 for(const doc of [d,fd,sd])assert.equal(doc.querySelectorAll('.delivery-card form input[name=channel]').length,0);assert.deepEqual(errors,[]);checks.push('Every shortcut has a destination and reviewing content never asks for a social network');
 console.log(JSON.stringify({status:'LUMINA_DELIVERIES_DOM_PASS',checks},null,2));
}finally{for(const close of cleanup.reverse())await close();}
