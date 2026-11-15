import { can } from '../../access/accounts.mjs';
import { agendaViews } from '../../production/agenda.mjs';
import { notificationKinds as attentionKinds } from '../../production/notifications.mjs';
import { badge, button, card, displayAmount, esc, form, hidden, input, localLink, timestamp } from './components.mjs';
import { icon } from './icons.mjs';
import { visitTime } from './visit-time.mjs';

export function paging({url,path,params,page,total,size=20}) {
  if(!total)return '';
  return `<div class="workday-paging"><p>${page*size+1}–${Math.min(total,(page+1)*size)} de ${total}</p><nav aria-label="Páginas">${page?localLink(url(path,{...params,page:page-1}),'← Anterior','btn secondary'):''}${(page+1)*size<total?localLink(url(path,{...params,page:page+1}),'Siguiente →','btn secondary'):''}</nav></div>`;
}
function tabs(url,path,values,active,counts,params={}) {
  return `<nav class="workday-tabs" aria-label="Filtrar vista">${Object.entries(values).map(([key,name])=>`<a href="${esc(url(path,{...params,view:key}))}"${active===key?' aria-current="page"':''}>${esc(name)} <span>${counts[key]||0}</span></a>`).join('')}</nav>`;
}
function search(url,path,q,view,caption,filters={}) {
  const action=new URL(url(path,{view,...filters}),'http://localhost');
  return `<form class="workday-search" method="get" action="${esc(action.pathname)}">${[...action.searchParams].map(([k,v])=>hidden(k,v)).join('')}${input('q',caption,'search','maxlength="100"',q)}${button('Buscar','secondary')}${q?localLink(url(path,{view,...filters}),'Limpiar búsqueda','btn secondary'):''}</form>`;
}
export function attentionPage({actor,data,url}) {
  const {view,q,rows,counts,total,page,state='all',newCount=0,billingUnavailable=false}=data;
  const searchForm=search(url,'/attention',q,view,'Buscar por solicitud o lugar',{state});
  const context=hidden('view',view)+hidden('state',state)+hidden('q',q)+hidden('page',page);
  const empty=q?'Sin coincidencias':state==='seen'?'Sin avisos vistos':state==='new'?'Sin avisos nuevos':view!=='all'?'Sin pendientes en esta categoría':'Todo al día';
  const filtered=Boolean(q||state!=='all'||view!=='all');
  return `<div class="workday-heading"><p><strong>${newCount}</strong> ${newCount===1?'aviso nuevo':'avisos nuevos'}<span class="workday-hint">Marcar como visto no resuelve la tarea.</span></p><nav class="actions" aria-label="Estado del aviso">${[['all','Todos'],['new','Nuevos'],['seen','Vistos']].map(([key,name])=>`<a class="btn${key===state?'':' secondary'}" href="${esc(url('/attention',{view,q,state:key}))}"${key===state?' aria-current="page"':''}>${name}</a>`).join('')}</nav></div>`+
    tabs(url,'/attention',{all:'Todo',...attentionKinds},view,counts,{q,state})+
    (billingUnavailable?'<p class="notice">Los avisos de pago no están disponibles ahora. <a href="/billing">Consultar cuenta</a></p>':'')+
    card('Necesita tu atención',searchForm+
    (rows.length?`<div class="notification-list">${rows.map(row=>`<article class="notification-card${row.seen?' is-seen':''}"><div><small>${esc(attentionKinds[row.kind])} · ${row.seen?'Visto':'Nuevo'}</small><h3>${esc(row.title)}</h3>${row.amount?`<strong>${esc(displayAmount(row.amount))}</strong>`:''}<p>${esc(timestamp(row.created_at))}${row.detail?' · '+esc(row.detail):''}</p></div><div class="actions">${localLink(url(row.path),row.kind==='visits'?'Ver grabación':row.kind==='payments'?'Ver cuenta':'Revisar','btn')}${actor?form(url(row.seen?'/attention/new':'/attention/seen'),actor,hidden('key',row.key)+hidden('fingerprint',row.fingerprint)+context+button(row.seen?'Marcar como nuevo':'Marcar como visto','secondary')):''}</div></article>`).join('')}</div>`:
      `<div class="workday-empty">${icon(q?'content':'check')}<h3>${empty}</h3><p>${q?'Prueba con otro nombre o lugar.':state==='seen'?'Aquí aparecerán los avisos que marques como vistos.':'No hay pendientes en esta vista.'}</p>${filtered?localLink(url('/attention'),'Ver todos los pendientes','btn secondary'):''}</div>`)+paging({url,path:'/attention',params:{view,q,state},page,total}));
}
export function workdayAgenda({actor,data,url,global=false}) {
  const {view,q,rows,counts,page,total}=data,path=global?'/agency-calendar':'/calendar';
  const note=view==='pending'?'La fecha ya pasó y aún falta registrar el resultado de la visita.':view==='history'?'Grabaciones realizadas y visitas canceladas.':'Fechas confirmadas · Hora de Ecuador continental';
  const days=new Map();
  const current=new Date();
  for(const row of rows){const time=visitTime(row.starts_at,current);if(!days.has(time.day))days.set(time.day,{...time,rows:[]});days.get(time.day).rows.push({...row,time});}
  return `<div class="workday-heading"><p>${note}</p>${actor.kind!=='AGENCY'&&can(actor,'SOCIAL','REQUEST')?localLink('/content/recording','Solicitar grabación','btn'):''}</div>`+
    tabs(url,path,agendaViews,view,counts,{q})+card('Agenda de grabaciones',search(url,path,q,view,global?'Buscar negocio, solicitud o lugar':'Buscar solicitud o lugar')+
    (rows.length?`<div class="agenda-days">${[...days.values()].map(day=>`<section class="agenda-day" aria-labelledby="day-${day.day}"><h3 class="agenda-day-heading" id="day-${day.day}">${day.relative?`<strong>${day.relative}</strong>`:''}<time datetime="${day.day}">${esc(day.date)}</time></h3><div class="visit-cards">${day.rows.map(row=>{
      const target=global?'/agency/requests/'+row.request_id+'?company='+row.company_id:url('/requests/'+row.request_id);
      const status=row.request_status==='CANCELLED'?'CANCELLED':row.status;
      const download=global?'/agency/calendar/visits/'+row.id+'.ics?company='+row.company_id:url('/calendar/visits/'+row.id+'.ics');
      return `<article class="visit-card"><div class="visit-date"><time datetime="${esc(row.starts_at)}" aria-label="${esc(timestamp(row.starts_at))}">${row.time.time}</time><span>Ecuador</span></div><div class="visit-content">${global?`<p class="eyebrow">${esc(row.company_name)}</p>`:''}<h4>${esc(row.title)}</h4><p>${icon('maps')}${esc(row.place)||'Lugar por confirmar'}</p>${row.recorded_at?`<small>Realizada: ${esc(timestamp(row.recorded_at))}</small>`:''}<div class="actions">${localLink(target+'#visits',actor.kind==='AGENCY'&&actor.agencyWork?'Gestionar visita →':'Ver grabación →','agenda-detail')}${view==='upcoming'&&status==='SCHEDULED'?`<a class="calendar-download" href="${esc(download)}" download="recording-${esc(row.id)}.ics">${icon('calendar')}Guardar en calendario</a>`:''}</div></div><div class="visit-actions">${badge(status)}</div></article>`;
    }).join('')}</div></section>`).join('')}</div>${view==='upcoming'?'<p class="calendar-copy-note">La copia no se actualiza sola. Consulta Lúmina si cambia la visita.</p>':''}`:`<div class="workday-empty">${icon('calendar')}<h3>${q?'Sin coincidencias':view==='upcoming'?'Sin grabaciones próximas':view==='pending'?'Agenda al día':'Todavía no hay historial'}</h3><p>${q?'Prueba con otro nombre o lugar.':'Las visitas aparecen cuando Lúmina confirma la fecha.'}</p></div>`)+
    paging({url,path,params:{view:view,q},page,total}));
}
