import test from 'node:test';
import assert from 'node:assert/strict';
import { agency, colleague, documentFor, owner, portal } from './helpers.mjs';
const selected=(path,id)=>'/agencia'+path+'?empresa='+id;
const idea={type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'2',title:'Historia del negocio',brief:'Mostrar la preparación de nuestro producto.',phone:'0991234567'};
async function setup(t){const w=await portal(t),admin=await agency(w),o=await owner(w,'Negocio de entregas','delivery');await admin.post(selected('/clientes/verificar',o.id));return {...w,...o,admin};}
async function request(w,extra={}){const r=await w.client.post('/solicitudes',{...idea,...extra});assert.equal(r.status,303,r.body);return {path:r.location,id:r.location.split('/').at(-1)};}
const req=(w,r)=>w.db.get('SELECT * FROM requests WHERE id=?',r.id);
const piece=(w,p)=>w.db.get('SELECT * FROM pieces WHERE id=?',p.id);
async function production(w,extra={}){const r=await request(w,extra);await w.admin.post(selected(r.path+'/estado',w.id),{status:'APPROVED'});await w.admin.post(selected(r.path+'/piezas',w.id),{title:'Primera entrega'});const p=w.db.get('SELECT * FROM pieces WHERE request_id=?',r.id);return {...r,p,piecePath:r.path+'/piezas/'+p.id};}
async function reviewing(w,extra={}){const r=await production(w,extra);assert.equal((await w.admin.post(selected(r.piecePath+'/editar',w.id),{status:'REVIEW',revision:String(r.p.revision)})).status,303);return r;}
const forms=body=>[...body.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m=>m[0]);
const actionForms=(body,suffix)=>forms(body).filter(f=>f.match(/action="([^"]+)"/)?.[1].split('?')[0].endsWith(suffix));

test('entrega presenta siguiente paso, archivos y decisiones explícitas sin selector de aprobación',async t=>{
 const w=await setup(t),r=await reviewing(w);await w.admin.post(selected(r.piecePath+'/evidencia',w.id),{label:'Video para revisar',url:'https://example.test/video'});
 const page=await w.client.get(r.path);assert.equal(page.status,200);assert.match(page.body,/Tienes una entrega por revisar/);assert.match(page.body,/href="#pieza-/);assert.match(page.body,/class="delivery-files"/);
 const review=actionForms(page.body,'/revisar');assert.equal(review.length,2);assert.match(review[0],/Aprobar entrega/);assert.match(review[1],/Enviar cambios/);assert.match(review[1],/required minlength="5" maxlength="1000"/);assert.doesNotMatch(review.join(''),/<select/);
 assert.match(page.body,/Volver a Lúmina/);assert.doesNotMatch(page.body,/Publicar la misma pieza en/);
});
test('pedir cambios conserva el texto ante un error y permite corregir sin duplicar movimientos',async t=>{
 const w=await setup(t),r=await reviewing(w),version=String(piece(w,r.p).revision),before=w.db.all('SELECT * FROM audit');
 const failed=await w.client.post(r.piecePath+'/revisar',{status:'PRODUCTION',revision:version,notes:'no'});assert.equal(failed.status,400);assert.match(failed.body,/No se guardó este cambio/);assert.match(failed.body,/>no<\/textarea>/);assert.deepEqual(w.db.all('SELECT * FROM audit'),before);
 const retry=await w.client.post(r.piecePath+'/revisar',{status:'PRODUCTION',revision:version,notes:'Cambiar el texto del cierre.'});assert.equal(retry.status,303);assert.equal(retry.location,r.path+'#pieza-'+r.p.id);assert.equal(piece(w,r.p).status,'PRODUCTION');assert.equal(w.db.get("SELECT count(*) n FROM audit WHERE action='CAMBIOS_SOLICITADOS'").n,1);assert.equal(w.db.get("SELECT details FROM audit WHERE action='CAMBIOS_SOLICITADOS'").details,'Primera entrega · Cambiar el texto del cierre.');
 assert.equal((await w.client.post(r.piecePath+'/revisar',{status:'PRODUCTION',revision:version,notes:'Cambiar el texto del cierre.'})).status,409);
});
test('un nuevo archivo invalida una aprobación abierta y la recuperación conserva la revisión antigua',async t=>{
 const w=await setup(t),r=await reviewing(w),old=String(piece(w,r.p).revision);
 await w.admin.post(selected(r.piecePath+'/evidencia',w.id),{revision:old,label:'Versión corregida',url:'https://example.test/corrected'});
 const failed=await w.client.post(r.piecePath+'/revisar',{revision:old,status:'APPROVED'});assert.equal(failed.status,409);assert.equal(piece(w,r.p).status,'REVIEW');
 const approve=actionForms(failed.body,'/revisar').find(f=>f.includes('value="APPROVED"'));assert.match(approve,new RegExp('name="revision" value="'+old+'"'));assert.match(failed.body,/Revisar versión actual/);assert.match(failed.body,/Versión corregida/);
 assert.equal((await w.client.post(r.piecePath+'/revisar',{revision:old,status:'APPROVED'})).status,409);
 const fresh=await w.client.get(r.path);assert.match(actionForms(fresh.body,'/revisar')[0],new RegExp('name="revision" value="'+piece(w,r.p).revision+'"'));
 assert.equal((await w.client.post(r.piecePath+'/revisar',{revision:String(piece(w,r.p).revision),status:'APPROVED'})).status,303);
});
test('lector y agencia no reciben acciones de aprobación; revocar permisos bloquea la misma sesión',async t=>{
 const w=await setup(t),r=await reviewing(w),m=await colleague(w,w.client,{name:'Revisor',document:documentFor('delivery-reviewer'),'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 assert.equal(actionForms((await m.session.get(r.path)).body,'/revisar').length,2);
 await w.client.post('/equipo/'+m.id+'/permisos',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',m.id).revision),'SOCIAL.VIEW':'yes'});
 const read=await m.session.get(r.path);assert.equal(actionForms(read.body,'/revisar').length,0);assert.match(read.body,/El responsable del negocio/);
 for(const client of [m.session,w.admin]){const path=client===w.admin?selected(r.piecePath+'/revisar',w.id):r.piecePath+'/revisar';assert.equal((await client.post(path,{status:'APPROVED',revision:String(piece(w,r.p).revision)})).status,403);}
 for(const path of [r.path+'?empresa='+w.id,selected(r.path,w.id)])assert.equal(actionForms((await w.admin.get(path)).body,'/revisar').length,0);
});
test('errores de otra empresa o de acciones prohibidas no devuelven sus datos',async t=>{
 const w=await setup(t),r=await reviewing(w),other=await owner(w,'Otro negocio privado','delivery-other');
 const before=w.db.all('SELECT * FROM audit');const result=await other.client.post(r.piecePath+'/revisar',{status:'APPROVED',revision:'0'});assert.equal(result.status,404);assert.doesNotMatch(result.body,/Primera entrega|Mostrar la preparación/);
 const forbidden=await w.client.post(r.piecePath+'/evidencia',{label:'No permitido',url:'javascript:alert(1)'});assert.equal(forbidden.status,403);assert.doesNotMatch(forbidden.body,/data-request-detail/);assert.deepEqual(w.db.all('SELECT * FROM audit'),before);
});
test('la agencia consulta sin mutar y solo encuentra formularios en su espacio de trabajo',async t=>{
 const w=await setup(t),r=await production(w),before=w.db.all('SELECT * FROM audit');
 const read=await w.admin.get(r.path+'?empresa='+w.id);assert.equal(forms(read.body).length,0);assert.match(read.body,/Solo lectura/);assert.deepEqual(w.db.all('SELECT * FROM audit'),before);
 const work=await w.admin.get(selected(r.path,w.id));assert.ok(actionForms(work.body,'/editar').length);for(const f of forms(work.body))assert.ok(f.includes('/agencia/solicitudes/'));
 assert.equal((await w.admin.post(r.path+'/piezas?empresa='+w.id,{title:'Suplantación'})).status,403);
});
test('cotización inválida retiene importe y condiciones sin publicarlos',async t=>{
 const w=await setup(t),r=await request(w),version=String(req(w,r).revision);const result=await w.admin.post(selected(r.path+'/cotizar',w.id),{revision:version,amount:'no-es-precio',terms:'Grabación y edición incluidas.'});assert.equal(result.status,400);assert.match(result.body,/value="no-es-precio"/);assert.match(result.body,/Grabación y edición incluidas/);assert.equal(w.db.get('SELECT count(*) n FROM quotes').n,0);
 assert.equal((await w.admin.post(selected(r.path+'/cotizar',w.id),{revision:version,amount:'45',terms:'Grabación y edición incluidas.'})).status,303);
});
test('una cotización reemplazada nunca se acepta automáticamente desde el formulario antiguo',async t=>{
 const w=await setup(t),r=await request(w);await w.admin.post(selected(r.path+'/cotizar',w.id),{amount:'30',terms:'Primera propuesta.'});const first=w.db.get("SELECT * FROM quotes WHERE status='OFFERED'");await w.admin.post(selected(r.path+'/cotizar',w.id),{amount:'45',terms:'Segunda propuesta ampliada.'});
 const result=await w.client.post(r.path+'/aceptar',{quote:first.id});assert.equal(result.status,409);assert.match(result.body,/Segunda propuesta ampliada/);assert.match(actionForms(result.body,'/aceptar')[0],new RegExp('name="quote" value="'+first.id+'"'));assert.equal(w.db.get("SELECT count(*) n FROM quotes WHERE status='ACCEPTED'").n,0);
});
test('crear entregables desde la misma revisión no reserva dos cupos al reenviar',async t=>{
 const w=await setup(t),r=await production(w),version=String(req(w,r).revision);const payload={title:'Segunda entrega',revision:version};assert.equal((await w.admin.post(selected(r.path+'/piezas',w.id),payload)).status,303);const before=w.db.all('SELECT * FROM audit');assert.equal((await w.admin.post(selected(r.path+'/piezas',w.id),payload)).status,409);assert.equal(w.db.get('SELECT count(*) n FROM pieces').n,2);assert.deepEqual(w.db.all('SELECT * FROM audit'),before);
});
test('estado y cotización rechazan una pestaña con revisión anterior',async t=>{
 const w=await setup(t),r=await request(w),version=String(req(w,r).revision);await w.admin.post(selected(r.path+'/estado',w.id),{status:'REVIEW',revision:version});
 for(const [suffix,data] of [['/estado',{status:'CANCELLED',notes:'Solicitud cancelada.'}],['/cotizar',{amount:'40',terms:'Intento de propuesta anterior.'}]]){const result=await w.admin.post(selected(r.path+suffix,w.id),{...data,revision:version});assert.equal(result.status,409);assert.match(result.body,/cambios más recientes/);}
 assert.equal(req(w,r).status,'REVIEW');assert.equal(w.db.get('SELECT count(*) n FROM quotes').n,0);
});
test('programar visita conserva lugar y notas, verifica versión y mantiene el resultado al cerrarla',async t=>{
 const w=await setup(t),r=await production(w),version=String(req(w,r).revision);
 const fail=await w.admin.post(selected(r.path+'/visitas',w.id),{revision:version,starts:'inválida',place:'Terraza principal',notes:'Llevar luces.'});assert.equal(fail.status,400);assert.match(fail.body,/value="Terraza principal"/);assert.match(fail.body,/Llevar luces/);
 assert.equal((await w.admin.post(selected(r.path+'/visitas',w.id),{revision:version,starts:'2020-04-01T10:00',place:'Terraza principal',notes:'Llevar luces.'})).status,303);
 assert.equal((await w.admin.post(selected(r.path+'/visitas',w.id),{revision:version,starts:'2020-04-02T10:00',place:'Otro lugar'})).status,409);
 const v=w.db.get('SELECT * FROM visits');const done={visit:v.id,revision:String(v.revision),status:'DONE',recorded:'2020-04-01T10:15',notes:'Se grabó la preparación completa.'};assert.equal((await w.admin.post(selected(r.path+'/visitas/cerrar',w.id),done)).status,303);
 const saved=w.db.get('SELECT * FROM visits');assert.match(saved.notes,/Llevar luces/);assert.match(saved.notes,/Se grabó la preparación completa/);assert.equal(saved.recorded_at,'2020-04-01T15:15:00.000Z');assert.equal((await w.admin.post(selected(r.path+'/visitas/cerrar',w.id),done)).status,409);
 assert.match((await w.client.get(r.path)).body,/Se grabó la preparación completa/);
});
test('evidencia inválida se recupera escapada y un enlace repetido no duplica archivo ni auditoría',async t=>{
 const w=await setup(t),r=await production(w);const fail=await w.admin.post(selected(r.piecePath+'/evidencia',w.id),{label:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)',revision:String(piece(w,r.p).revision)});assert.equal(fail.status,400);assert.match(fail.body,/&lt;img src=x/);assert.doesNotMatch(fail.body,/<img src=x/);
 await w.admin.post(selected(r.piecePath+'/evidencia',w.id),{label:'Archivo seguro',url:'https://example.test/file'});const before=w.db.all('SELECT * FROM audit');const duplicate=await w.admin.post(selected(r.piecePath+'/evidencia',w.id),{label:'Archivo repetido',url:'https://example.test/file'});assert.equal(duplicate.status,409);assert.equal(w.db.get('SELECT count(*) n FROM evidence').n,1);assert.deepEqual(w.db.all('SELECT * FROM audit'),before);
});
test('publicación y métricas recuperan valores solo en la publicación afectada',async t=>{
 const w=await setup(t),r=await reviewing(w);await w.client.post(r.piecePath+'/revisar',{status:'APPROVED',revision:String(piece(w,r.p).revision)});
 const failed=await w.admin.post(selected(r.piecePath+'/publicacion',w.id),{channel:'TIKTOK',url:'https://example.test/new',published:'2099-01-01T10:00'});assert.equal(failed.status,400);assert.match(actionForms(failed.body,'/publicacion')[0],/value="TIKTOK" selected/);assert.match(failed.body,/value="2099-01-01T10:00"/);
 for(const channel of ['INSTAGRAM','TIKTOK'])await w.admin.post(selected(r.piecePath+'/publicacion',w.id),{channel,url:'https://example.test/'+channel,published:'2020-01-01T10:00'});
 const pubs=w.db.all('SELECT * FROM publications');const res=await w.admin.post(selected(r.piecePath+'/medir',w.id),{publication:pubs[1].id,observed:'2020-01-02T10:00',views:'-5',likes:'0',notes:'Solo datos comprobados.'});assert.equal(res.status,400);
 const measurements=actionForms(res.body,'/medir');assert.equal(measurements.length,2);const target=measurements.find(f=>f.includes(pubs[1].id));assert.match(target,/value="-5"/);assert.match(target,/name="likes"[^>]*value="0"/);assert.match(target,/Solo datos comprobados/);assert.doesNotMatch(measurements.find(f=>f.includes(pubs[0].id)),/Solo datos comprobados/);assert.equal(w.db.get('SELECT count(*) n FROM social_metrics').n,0);
});
test('si la solicitud se cancela mientras se escribe, el texto queda recuperable sin reabrir acciones',async t=>{
 const w=await setup(t),r=await reviewing(w),version=String(piece(w,r.p).revision);await w.admin.post(selected(r.path+'/estado',w.id),{status:'CANCELLED',notes:'No continuar con este trabajo.'});
 const fail=await w.client.post(r.piecePath+'/revisar',{status:'PRODUCTION',revision:version,notes:'Cambiar los colores del cierre.'});assert.equal(fail.status,409);assert.match(fail.body,/Lo que intentaste guardar/);assert.match(fail.body,/Cambiar los colores del cierre/);assert.equal(actionForms(fail.body,'/revisar').length,0);assert.equal(req(w,r).status,'CANCELLED');
});
test('los entregables web y de marca usan la misma revisión sin pedir plataformas ni grabaciones',async t=>{
 const w=await setup(t),r=await reviewing(w,{channel:'BRAND',service:'LOGO'});const page=await w.client.get(r.path);assert.equal(page.status,200);assert.match(page.body,/data-request-detail/);assert.doesNotMatch(page.body,/Publicaciones y métricas|Grabado:|Contenido común|id="visitas"/);assert.match(page.body,/Aprobar entrega/);assert.match(page.body,/href="\/equipo"/);
});
test('activos de entrega se sirven y las visitas se completan sin mostrar entregables inexistentes',async t=>{
 const w=await setup(t),r=await request(w,{type:'VISIT',preferred:'2020-04-01T10:00'});await w.admin.post(selected(r.path+'/visitas',w.id),{starts:'2020-04-01T10:00',place:'Local del negocio'});const v=w.db.get('SELECT * FROM visits');await w.admin.post(selected(r.path+'/visitas/cerrar',w.id),{status:'DONE',visit:v.id,recorded:'2020-04-01T10:00'});assert.equal(req(w,r).status,'DELIVERED');
 const page=await w.client.get(r.path);assert.doesNotMatch(page.body,/href="#entregables"|id="entregables"/);assert.match(page.body,/href="#visitas"/);for(const name of ['deliveries.js','deliveries.css']){const res=await w.client.get('/assets/'+name);assert.equal(res.status,200);assert.ok(res.body.length>100);}
});
