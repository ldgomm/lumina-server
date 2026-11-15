import { serviceStatusLabels } from '../../businesses/service-status.mjs';
import { esc, localLink, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

export function serviceImpact(status,{admin=false}={}) {
  const {rows,blocked,wallet}=status;
  return `<section class="service-impact" aria-labelledby="service-impact-title"><div class="service-impact-heading"><div><span class="eyebrow">${admin?'ALCANCE DEL ESTADO':'TUS ÁREAS DE TRABAJO'}</span><h2 id="service-impact-title">${blocked?'Servicios detenidos':'Servicios en Lúmina'}</h2></div><span class="service-impact-count">${rows.length} ${rows.length===1?'servicio':'servicios'}</span></div>
    ${rows.length?`<ul class="service-impact-list">${rows.map(row=>`<li data-service="${row.code}" data-effective-state="${row.effective}" data-activation-state="${row.activation}"><span class="service-symbol">${icon(row.icon)}</span><div class="service-impact-name"><h3>${esc(row.name)}</h3><p>${row.activation==='ACTIVE'?'Configuración conservada':row.activation==='SETUP'?'Configuración por terminar':'Todavía sin activar'}</p></div><span class="service-state${blocked?' is-blocked':row.activation==='ACTIVE'?' is-active':row.activation==='SETUP'?' is-pending':''}">${esc(row.label)}</span>${!admin&&row.canOpen?localLink(row.path,'Abrir '+row.name,'btn secondary'):''}</li>`).join('')}</ul>`:'<p class="service-impact-empty">Aún no tienes áreas asignadas. El dueño puede revisarlas en Equipos y roles.</p>'}
    ${rows.some(row=>row.code==='WALLET')?`<div class="service-sync" data-wallet-sync="${wallet.state}"><span class="service-sync-mark" aria-hidden="true">${icon(wallet.state==='PENDING'||wallet.state==='UNAVAILABLE'?'clock':'wallet')}</span><div><strong>${esc(wallet.label)}</strong><p>${esc(wallet.detail)}</p>${wallet.at?`<small>${esc(timestamp(wallet.at))}</small>`:''}</div></div>`:''}
    ${admin?'<p class="service-impact-footnote">Este control bloquea el trabajo dentro de Lúmina. Las webs, publicaciones y fichas de Google Maps ya publicadas conservan su estado externo.</p>':''}</section>`;
}

export function businessStatusPage(actor,status) {
  const {control,state,command}=status,owner=actor.kind==='OWNER';
  const title=state==='PENDING'?'Estamos confirmando el cambio':({PAUSED:'Tu negocio está en pausa',SUSPENDED:'Tu negocio está suspendido',CLOSED:'Tu negocio está cerrado',ARCHIVED:'Tu negocio fue retirado'}[state]||'Estado de tu negocio');
  return `<section class="business-status-banner" aria-labelledby="business-status-title"><div><span class="eyebrow">${state==='PENDING'?'OPERACIONES BLOQUEADAS':esc(serviceStatusLabels[state])}</span><h2 id="business-status-title">${title}</h2><p>${command?.state==='ACTIVE'?'El acceso se recupera cuando se confirme la reactivación.':'Las operaciones de todos los servicios están detenidas.'} Tus datos, archivos y saldos se conservan.</p></div>${icon('shield')}</section>
    ${control.reason?`<div class="business-status-reason"><strong>Motivo del cambio</strong><p>${esc(control.reason)}</p>${control.updated_at?`<small>${esc(timestamp(control.updated_at))}</small>`:''}</div>`:''}
    ${serviceImpact(status)}
    <section class="business-status-next"><div><h2>${owner?'Revisa tu cuenta o solicita ayuda':'Habla con el dueño del negocio'}</h2><p>${owner?(control.state==='CLOSED'?'El cierre conserva la deuda y el historial. Revisa el detalle de tus acuerdos y pagos.':'La pausa o suspensión no cancela los acuerdos ni los cargos vigentes.'):'El dueño puede consultar el motivo y gestionar la reactivación con Lúmina.'}</p></div><div class="actions">${owner?localLink('/billing','Ver cuenta y pagos','btn'):''}${localLink('/help','Contactar a Lúmina',owner?'btn secondary':'btn')}${localLink('/account','Mi cuenta','btn secondary')}${state==='PENDING'?localLink('/services','Actualizar estado','btn secondary'):''}</div></section>`;
}

export function collaboratorServicesPage(status) {
  return `<p class="service-center-intro">Estas son las áreas que te asignó el negocio.</p>${serviceImpact(status)}`;
}
