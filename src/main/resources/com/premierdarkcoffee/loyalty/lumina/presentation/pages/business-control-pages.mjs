import { serviceImpact } from './service-status-pages.mjs';
import { randomUUID } from 'node:crypto';
import { businessStates } from '../../businesses/control.mjs';
import { accountPage, billingDraft } from './billing-account-pages.mjs';
import { badge, button, card, check, esc, form, hidden, localLink, number, table, textarea, input, timestamp } from './components.mjs';
export { accountPage } from './billing-account-pages.mjs';
export function businessWorkPanel(company, work) {
 if(!work)return '';
 const blocked=work.state!=='ACTIVE',companyQuery='company='+encodeURIComponent(company.id);
 const requests=localLink('/requests?'+companyQuery+'&view='+(blocked?'blocked':'open'),blocked?'Consultar solicitudes detenidas →':'Ver solicitudes en curso →');
 const agenda=blocked?localLink('/calendar?'+companyQuery+'&view=blocked','Consultar visitas detenidas →'):
   (work.upcoming?localLink('/calendar?'+companyQuery+'&view=upcoming',number(work.upcoming)+(work.upcoming===1?' próxima →':' próximas →')):'')+
   (work.overdue?localLink('/calendar?'+companyQuery+'&view=pending',number(work.overdue)+' por actualizar →'):'');
 return `<section class="business-work-summary" aria-label="Trabajo y accesos del negocio"><h3>Trabajo y accesos</h3><div class="business-work-grid">
  <div><span>Solicitudes sin terminar</span><strong>${number(work.requests)}</strong>${work.requests?requests:'<small>Sin solicitudes pendientes</small>'}</div>
  <div><span>Visitas sin completar</span><strong>${number(work.upcoming+work.overdue)}</strong><div class="business-work-agenda">${work.upcoming+work.overdue?agenda:'<small>Sin visitas pendientes</small>'}</div></div>
  <div><span>${blocked?'Accesos conservados':'Colaboradores habilitados'}</span><strong>${number(work.collaborators)}</strong>${localLink('/admin/businesses/'+company.id+'/team','Revisar equipo y permisos →')}</div>
 </div>${blocked?'<p class="directory-caption">El estado del negocio mantiene detenidos este trabajo y los accesos de sus colaboradores. Sus permisos se conservan.</p>':''}</section>`;
}

export function controlPage(actor,company,control,commands,account,error='',values={},options={}) {
 const base='/admin/businesses/'+company.id;
 const editing=options.action==='state',pending=control.pending_id;
 const lifecycle=(action,title,copy)=>`<details class="control-state-editor"${options.action===action?' open':''}><summary>${title}</summary>${form(base+'/'+action,actor,hidden('revision',options.action===action?values.revision??control.revision:control.revision)+hidden('requestKey',options.action===action&&values.requestKey?values.requestKey:randomUUID())+`<p>${copy}</p>`+textarea('reason','Motivo','required minlength="5" maxlength="500" rows="2"',options.action===action?values.reason||'':'')+(action==='delete'?input('name','Escribe el nombre: '+company.name,'text','required autocomplete="off"',options.action===action?values.name||'':''):'')+check('confirm','Confirmo el cambio.',false,true)+button(title,action==='delete'?'danger':'secondary'))}</details>`;
 const target=commands.find(row=>row.id===pending)?.state;
 const effects={
  PAUSED:'Se detienen nuevas solicitudes, compras y canjes. Los acuerdos y cargos vigentes continúan.',
  SUSPENDED:'Se bloquean las operaciones de los servicios. Los acuerdos y cargos vigentes continúan.',
  CLOSED:'Se bloquean los servicios y se detienen los próximos cargos de Wallet. La deuda y el historial se conservan.',
  ACTIVE:'El negocio recupera el acceso después de confirmar el cambio. Conserva sus servicios y permisos anteriores. Una suscripción cancelada requiere aceptación del dueño.',
 };
 return `<div class="actions">${localLink('/businesses','← Negocios')}${localLink('/home?company='+company.id,'Consultar negocio')}${localLink(base+'/team','Equipo y permisos','btn secondary')}</div>
 <section class="card business-control"><div class="split"><div><p class="eyebrow">ADMINISTRACIÓN DEL NEGOCIO</p><h2>${esc(company.name)}</h2><p>${esc(company.phone)}</p>${company.ruc?`<p>RUC ${esc(company.ruc)} · <a href="https://srienlinea.sri.gob.ec/facturacion-internet/consultas/publico/ruc-datos1.jspa" target="_blank" rel="noopener noreferrer">Consultar en el SRI</a></p>`:''}</div>${badge(pending?'Cambio pendiente':control.archived_at?'Eliminado':businessStates[control.state],control.state==='ACTIVE'&&!pending?'success':'warning')}</div>
 ${options.notice?`<p class="notice" role="status">${esc(options.notice)}</p>`:''}${error?`<p role="alert" class="notice">${esc(error)}</p>`:''}
 ${control.reason?`<p><strong>Último motivo:</strong> ${esc(control.reason)}</p>`:''}
 ${businessWorkPanel(company,options.work)}
 ${pending?`<div class="control-pending"><strong>${target?'Cambio a '+esc(businessStates[target]):'Actualización de estado'} pendiente</strong><p>Los servicios permanecen bloqueados mientras se confirma el cambio en Wallet.</p>${form(base+'/retry',actor,check('confirm','Revisé el estado y quiero aplicar el cambio pendiente.',false,true)+button('Reintentar sincronización','secondary'))}</div>`:
 `${control.archived_at?'':`<details class="control-state-editor"${editing?' open':''}><summary>Cambiar estado del negocio</summary>${form(base+'/state',actor,hidden('revision',values.revision??control.revision)+hidden('requestKey',editing&&values.requestKey?values.requestKey:randomUUID())+`<fieldset class="business-state-choices"><legend>¿Qué necesitas hacer?</legend>${Object.entries(effects).filter(([key])=>key!==control.state).map(([key,copy])=>`<label class="business-state-option"><input type="radio" name="state" value="${key}" required${editing&&values.state===key?' checked':''}><span><strong>${{ACTIVE:'Reactivar',PAUSED:'Pausar',SUSPENDED:'Suspender',CLOSED:'Cerrar'}[key]}</strong><span data-state-effect="${key}">${esc(copy)}</span></span></label>`).join('')}</fieldset>`+textarea('reason','Motivo visible para el negocio','required minlength="5" maxlength="500" rows="3"',editing?values.reason||'':'')+`<p class="muted">Las tarjetas conservan sus saldos e identidad. Apple y Google deciden cuándo reflejar el cambio en el teléfono.</p>`+check('confirm','Confirmo el cambio y su efecto en los servicios.',false,true)+button('Aplicar cambio'))}</details>`}${lifecycle(control.archived_at?'restore':'delete',control.archived_at?'Restaurar negocio':'Eliminar negocio',control.archived_at?'Recupera el negocio con sus mismos datos y tarjetas. No reinicia automáticamente una suscripción cancelada.':'Se bloquean los servicios y se retira del listado habitual. Se detienen los próximos cargos de Wallet; las deudas e historial se conservan. Esta eliminación es recuperable.')}`}</section>
 ${options.serviceStatus?serviceImpact(options.serviceStatus,{admin:true}):''}
 ${account?accountPage(actor,account,base,'',values,options):`${billingDraft(actor,null,base,options.action,values)}${card('Cuenta no disponible',`<p>No pudimos consultar los cargos y pagos. Tus registros se conservan.</p>${localLink(base+'?view='+encodeURIComponent(options.view||'overview'),'Reintentar consulta','btn secondary')}`)}`}
 <details class="card control-history"><summary>Historial de estados</summary>${table(['Fecha','Estado solicitado','Motivo','Resultado'],commands.map(row=>[esc(timestamp(row.created_at)),esc(row.operation==='DELETE'?'Eliminado':row.operation==='RESTORE'?'Restaurado':businessStates[row.state]),esc(row.reason),row.completed_at?'Aplicado':'Pendiente']),'Aún no hay cambios de estado.')}<p class="muted">Últimos 50 cambios. Los registros anteriores se conservan.</p></details>`;
}
