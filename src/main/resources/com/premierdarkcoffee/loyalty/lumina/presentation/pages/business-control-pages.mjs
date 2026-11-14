import { randomUUID } from 'node:crypto';
import { businessStates } from '../../businesses/control.mjs';
import { accountPage, billingDraft } from './billing-account-pages.mjs';
import { badge, button, card, check, esc, form, hidden, localLink, select, table, textarea, timestamp } from './components.mjs';
export { accountPage } from './billing-account-pages.mjs';
export function controlPage(actor,company,control,commands,account,error='',values={},options={}) {
 const base='/administracion/negocios/'+company.id;
 const editing=options.action==='estado',pending=control.pending_id;
 const target=commands.find(row=>row.id===pending)?.state;
 const effects={
  PAUSED:'Se detienen nuevas solicitudes, compras y canjes. Los acuerdos y cargos vigentes continúan.',
  SUSPENDED:'Se bloquean las operaciones de los servicios. Los acuerdos y cargos vigentes continúan.',
  CLOSED:'Se bloquean los servicios y se detienen los próximos cargos nativos de Wallet. La deuda y el historial se conservan.',
  ACTIVE:'El negocio recupera el acceso después de confirmar Wallet. Una renovación terminada requiere aceptación del dueño.',
 };
 return `<div class="actions">${localLink('/clientes','← Negocios')}${localLink('/inicio?empresa='+company.id,'Consultar negocio')}${localLink('/equipos?empresa='+company.id,'Ver equipo')}</div>
 <section class="card business-control"><div class="split"><div><p class="eyebrow">ADMINISTRACIÓN DEL NEGOCIO</p><h2>${esc(company.name)}</h2><p>${esc(company.phone)}</p>${company.ruc?`<p>RUC ${esc(company.ruc)} · <a href="https://srienlinea.sri.gob.ec/facturacion-internet/consultas/publico/ruc-datos1.jspa" target="_blank" rel="noopener noreferrer">Consultar en el SRI</a></p>`:''}</div>${badge(pending?'Cambio pendiente':businessStates[control.state],control.state==='ACTIVE'&&!pending?'success':'warning')}</div>
 ${options.notice?`<p class="notice" role="status">${esc(options.notice)}</p>`:''}${error?`<p role="alert" class="notice">${esc(error)}</p>`:''}
 ${control.reason?`<p><strong>Último motivo:</strong> ${esc(control.reason)}</p>`:''}
 ${pending?`<div class="control-pending"><strong>${target?'Cambio a '+esc(businessStates[target]):'Actualización de estado'} pendiente</strong><p>Los servicios permanecen bloqueados mientras se confirma el cambio en Wallet.</p>${form(base+'/reintentar',actor,check('confirm','Revisé el estado y quiero aplicar el cambio pendiente.',false,true)+button('Reintentar sincronización','secondary'))}</div>`:
 `<details class="control-state-editor"${editing?' open':''}><summary>Cambiar estado del negocio</summary>${form(base+'/estado',actor,hidden('revision',values.revision??control.revision)+hidden('requestKey',editing&&values.requestKey?values.requestKey:randomUUID())+select('state','Nuevo estado',Object.entries(businessStates).filter(([key])=>key!==control.state),editing?values.state||'':'','required')+`<div class="control-effects">${Object.entries(effects).filter(([key])=>key!==control.state).map(([key,copy])=>`<p data-state-effect="${key}"><strong>${esc(businessStates[key])}:</strong> ${esc(copy)}</p>`).join('')}</div>`+textarea('reason','Motivo visible para el negocio','required minlength="5" maxlength="500" rows="3"',editing?values.reason||'':'')+`<p class="muted">Las tarjetas se inactivan conservando saldos e identidad. Apple y Google deciden cuándo reflejarlo en el teléfono.</p>`+check('confirm','Confirmo el cambio y su efecto en los servicios.',false,true)+button('Aplicar cambio'))}</details>`}</section>
 ${account?accountPage(actor,account,base,'',values,options):`${billingDraft(actor,null,base,options.action,values)}${card('Cuenta no disponible',`<p>No pudimos consultar los cargos y pagos. Tus registros se conservan.</p>${localLink(base+'?vista='+encodeURIComponent(options.view||'resumen'),'Reintentar consulta','btn secondary')}`)}`}
 <details class="card control-history"><summary>Historial de estados</summary>${table(['Fecha','Estado solicitado','Motivo','Resultado'],commands.map(row=>[esc(timestamp(row.created_at)),esc(businessStates[row.state]),esc(row.reason),row.completed_at?'Aplicado':'Pendiente']),'Aún no hay cambios de estado.')}<p class="muted">Últimos 50 cambios. Los registros anteriores se conservan.</p></details>`;
}
