// Real portal HTML and shipped scripts; layout and device checks are separate.
import assert from 'node:assert/strict';
import {deliveryFiles} from '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/pages/delivery-files.mjs';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {agency,owner,portal} from '../../src/test/resources/com/premierdarkcoffee/loyalty/lumina/helpers.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)(process.env.LOYALTY_TEST_JSDOM||'jsdom');
const cleanup=[],errors=[],checks=[],t={after:f=>cleanup.push(f)},selected=(path,id)=>'/agency'+path+'?company='+id;
function render(html,path){
 const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html.replace(/<script\b[^>]*src[^>]*><\/script>/g,''),{url:'https://lumina.test'+path,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window;cleanup.push(()=>w.close());w.confirm=()=>false;
 for(const file of ['lumina.js','deliveries.js'])w.eval(readFileSync(new URL('../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/'+file,import.meta.url),'utf8'));
 return w;
}
try{
 const world=await portal(t),admin=await agency(world),a=await owner(world,'Entregas accesibles','dom-deliveries');await admin.post(selected('/businesses/verify',a.id));
 const r=await a.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Presentación del producto'}),path=r.location;
 await admin.post(selected(path+'/state',a.id),{status:'APPROVED'});await admin.post(selected(path+'/pieces',a.id),{title:'Video del negocio'});const p=world.db.get('SELECT * FROM pieces'),piecePath=path+'/pieces/'+p.id;
 await admin.post(selected(piecePath+'/edit',a.id),{revision:'1',status:'REVIEW'});
 const w=render((await a.client.get(path)).body,path),d=w.document,decision=d.querySelector('.delivery-decision'),approve=decision.querySelector('.approve-delivery'),change=decision.querySelector('details form');
 assert.equal(approve.elements.status.value,'APPROVED');assert.equal(change.elements.status.value,'PRODUCTION');assert.equal(decision.querySelector('select'),null);assert.equal(change.elements.notes.required,true);assert.equal(change.elements.notes.minLength,5);assert.equal(change.checkValidity(),false);assert.equal(change.closest('details').open,true);assert.equal(approve.checkValidity(),true);
 change.elements.notes.value='Cambiar el texto final';assert.equal(change.checkValidity(),true);change.elements.notes.dispatchEvent(new w.Event('input',{bubbles:true}));
 const leaving=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(leaving);assert.equal(leaving.defaultPrevented,true);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);checks.push('Separate decisions, required change explanation, native invalid-field reveal and memory-only draft protection');
 const jump=d.querySelector('.delivery-next a'),target=d.getElementById(jump.getAttribute('href').slice(1));jump.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(d.activeElement,target);
 const history=d.getElementById('history');history.open=false;d.querySelector('.detail-jumps a[href="#history"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(history.open,true);assert.equal(d.activeElement,history.querySelector('summary'));checks.push('Next-step and history links reveal their destination and transfer keyboard focus');
 const button=approve.querySelector('button'),caption=button.textContent,submit=()=>{const e=new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button});approve.dispatchEvent(e);return e;};assert.equal(submit().defaultPrevented,false);assert.equal(button.disabled,true);assert.equal(submit().defaultPrevented,true);w.dispatchEvent(new w.Event('pageshow'));assert.equal(button.disabled,false);assert.equal(button.textContent,caption);checks.push('Review submission guards double taps and restores the original action on return');
 const failed=await a.client.post(piecePath+'/review',{revision:'2',status:'PRODUCTION',notes:'no'});assert.equal(failed.status,400);const f=render(failed.body,piecePath+'/review'),fd=f.document,alert=fd.querySelector('[data-detail-error]');assert.equal(fd.activeElement,alert);assert.equal(alert.closest('details').open,true);assert.equal(alert.closest('form').elements.notes.value,'no');assert.equal(alert.closest('form').elements.revision.value,'2');assert.equal(fd.querySelectorAll('[data-detail-error]').length,1);checks.push('A validation error reopens and focuses the affected form without replacing its revision or text');
 await admin.post(selected(piecePath+'/evidence',a.id),{label:'Nueva versión',url:'https://example.test/version-2'});
 const stale=await a.client.post(piecePath+'/review',{revision:'2',status:'APPROVED'});assert.equal(stale.status,409);const s=render(stale.body,piecePath+'/review'),sd=s.document;assert.equal(sd.querySelector('.approve-delivery').elements.revision.value,'2');assert.equal(sd.querySelector('.delivery-files strong').textContent,'Nueva versión');assert.equal(new URL(sd.querySelector('[data-detail-error] a').href).pathname,path);checks.push('A changed attachment remains visible, while stale approval keeps its original revision and offers a fresh GET');
 const production=render((await admin.get(selected(path,a.id))).body,selected(path,a.id)+'#edit-'+p.id);assert.equal(production.document.getElementById('edit-'+p.id).open,true);assert.equal(production.document.activeElement,production.document.getElementById('edit-'+p.id).querySelector('summary'));assert.equal(production.document.querySelector('.delivery-decision'),null);checks.push('Agency deep links open the correct operation without customer approval controls');
 const legacy=render((await admin.get(selected(path,a.id))).body,selected(path,a.id)+'#editar-'+p.id);assert.equal(legacy.location.hash,'#edit-'+p.id);assert.equal(legacy.document.getElementById('edit-'+p.id).open,true);assert.equal(legacy.document.activeElement,legacy.document.getElementById('edit-'+p.id).querySelector('summary'));
 await a.client.post(piecePath+'/review',{status:'APPROVED',revision:'3'});
 await admin.post(selected(piecePath+'/publication',a.id),{channel:'TIKTOK',url:'https://example.test/tiktok',published:'2020-01-01T10:00'});const pub=world.db.get('SELECT * FROM publications');
 const invalid=await admin.post(selected(piecePath+'/measure',a.id),{publication:pub.id,observed:'2020-01-02T10:00',views:'-4',likes:'0',notes:'Dato pendiente'});assert.equal(invalid.status,400);const m=render(invalid.body,selected(piecePath+'/measure',a.id)),md=m.document,error=md.querySelector('[data-detail-error]');for(let el=error;el;el=el.parentElement)if(el.tagName==='DETAILS')assert.equal(el.open,true);assert.equal(error.closest('form').elements.likes.value,'0');assert.equal(error.closest('form').elements.notes.value,'Dato pendiente');assert.equal(md.activeElement,error);checks.push('Nested metrics validation preserves zero values and opens every collapsed parent');
 for(const doc of [d,fd,sd,production.document,md])for(const link of doc.querySelectorAll('.detail-jumps a,.delivery-next a'))assert.ok(doc.getElementById(link.getAttribute('href').slice(1)),'Missing target '+link.getAttribute('href'));
 for(const doc of [d,fd,sd])assert.equal(doc.querySelectorAll('.delivery-card form input[name=channel]').length,0);assert.deepEqual(errors,[]);checks.push('Every shortcut has a destination and reviewing content never asks for a social network');
 const file={asset_id:'reel',label:'Reel para redes',media_type:'video/webm',byte_size:3500,created_at:'2027-01-08T16:00:00Z'};
 const earlier={...file,id:'sample-v1',version:1},latest={...file,id:'sample-v2',version:2};
 const timed={actor_name:'Dueña',body:'Corrige este título.',created_at:file.created_at,file_id:earlier.id,file_label:file.label,file_version:1,seconds:12};
 const media=render(deliveryFiles({actor:{kind:'AGENCY',csrf:'test'},request:{status:'PRODUCTION'},piece:{id:'muestra',files:[earlier,latest],comments:[timed]},base:p=>p,route:p=>p}),path);
 const panel=media.document.querySelector('[data-delivery-review]'),form=panel.querySelector('[data-moment-form]'),older=panel.querySelector('#video-sample-v1'),newer=panel.querySelector('#video-sample-v2');
 for(const player of [older,newer]){player.pause=()=>{};player.load=()=>{};player.scrollIntoView=()=>{};}
 const capture=panel.querySelector('[data-capture-moment="sample-v2"]');
 assert.equal(capture.hidden,false);newer.currentTime=18.7;capture.click();
 assert.equal(form.elements.seconds.value,'18');assert.equal(form.elements.file.value,latest.id);assert.equal(media.document.activeElement,form.elements.comment);
 assert.match(form.querySelector('[role=status]').textContent,/00:18/);form.elements.file.value=earlier.id;form.elements.file.dispatchEvent(new media.Event('change'));assert.equal(form.elements.seconds.value,'');
 newer.currentTime=0;capture.click();assert.equal(form.elements.seconds.value,'0');
 form.querySelector('[data-clear-moment]').click();assert.equal(form.elements.seconds.value,'');
 older.closest('details').open=false;panel.querySelector('[data-jump-file]').click();assert.equal(older.closest('details').open,true);assert.equal(older.preload,'metadata');
 older.dispatchEvent(new media.Event('loadedmetadata'));assert.equal(older.currentTime,12);assert.equal(newer.currentTime,0);assert.deepEqual(errors,[]);
 checks.push('Timed comments select their exact video version, retain second zero, clear on a file change, and seek after the old video loads');
 console.log(JSON.stringify({status:'LUMINA_DELIVERIES_DOM_PASS',checks},null,2));
}finally{for(const close of cleanup.reverse())await close();}
