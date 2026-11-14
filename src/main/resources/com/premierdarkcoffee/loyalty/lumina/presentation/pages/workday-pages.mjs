import { can } from '../../access/accounts.mjs';
import { agendaViews } from '../../production/agenda.mjs';
import { notificationKinds as attentionKinds } from '../../production/notifications.mjs';
import { badge, button, card, displayAmount, esc, form, hidden, input, localLink, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

export function paging({url,path,params,page,total,size=20}) {
  if(!total)return '';
  return `<div class="workday-paging"><p>${page*size+1}–${Math.min(total,(page+1)*size)} de ${total}</p><nav aria-label="Páginas">${page?localLink(url(path,{...params,page:page-1}),'← Anterior','btn secondary'):''}${(page+1)*size<total?localLink(url(path,{...params,page:page+1}),'Siguiente →','btn secondary'):''}</nav></div>`;
}
function tabs(url,path,values,active,counts,params={}) {
  return `<nav class="workday-tabs" aria-label="Filtrar vista">${Object.entries(values).map(([key,name])=>`<a href="${esc(url(path,{...params,view:key}))}"${active===key?' aria-current="page"':''}>${esc(name)} <span>${counts[key]||0}</span></a>`).join('')}</nav>`;
}
function search(url,path,q,view,caption,viewKey='view') {
  const action=new URL(url(path),'http://localhost');
  return `<form class="workday-search" method="get" action="${esc(action.pathname)}">${[...action.searchParams].map(([k,v])=>hidden(k,v)).join('')}${hidden(viewKey,view)}${input('q',caption,'search','maxlength="100"',q)}${button('Buscar','secondary')}${q?localLink(url(path,{view:view}),'Limpiar búsqueda','btn secondary'):''}</form>`;
}
export function attentionPage({actor,data,url}) {
  const {view,q,rows,counts,total,page,state='all',newCount=0,billingUnavailable=false}=data;
  const searchForm=search(url,'/attention',q,view,'Buscar pendiente').replace('<form ',`<form `).replace(hidden('view',view),hidden('view',view)+hidden('state',state));
  return `<div class="workday-heading"><p><strong>${newCount}</strong> ${newCount===1?'aviso nuevo':'avisos nuevos'}</p><nav class="actions" aria-label="Estado del aviso">${[['all','Todos'],['new','Nuevos'],['seen','Vistos']].map(([key,name])=>localLink(url('/attention',{view,q,state:key}),name,key===state?'btn':'btn secondary')).join('')}</nav></div>`+
    tabs(url,'/attention',{all:'Todo',...attentionKinds},view,counts,{q,state})+
    (billingUnavailable?'<p class="notice">Los avisos de pago no están disponibles ahora. <a href="/billing">Consultar cuenta</a></p>':'')+
    card('Necesita tu atención',searchForm+
    (rows.length?`<div class="notification-list">${rows.map(row=>`<article class="notification-card${row.seen?' is-seen':''}"><div><small>${esc(attentionKinds[row.kind])} · ${row.seen?'Visto':'Nuevo'}</small><h3>${esc(row.title)}</h3>${row.amount?`<strong>${esc(displayAmount(row.amount))}</strong>`:''}<p>${esc(timestamp(row.created_at))}${row.detail?' · '+esc(row.detail):''}</p></div><div class="actions">${localLink(url(row.path),row.kind==='visits'?'Ver grabación':row.kind==='payments'?'Ver cuenta':'Revisar','btn secondary')}${!row.seen&&actor?form(url('/attention/seen'),actor,hidden('key',row.key)+hidden('fingerprint',row.fingerprint)+button('Marcar como visto','secondary')):''}</div></article>`).join('')}</div>`:
      `<div class="workday-empty">${icon('check')}<h3>${q?'Sin coincidencias':state==='new'?'Sin avisos nuevos':'Todo al día'}</h3><p>${q?'Prueba con otro nombre o limpia la búsqueda.':'No hay pendientes en esta vista.'}</p></div>`)+paging({url,path:'/attention',params:{view,q,state},page,total}));
}
export function workdayAgenda({actor,data,url,global=false,viewKey='view'}) {
  const {view,q,rows,counts,page,total}=data,path=global?'/agency-calendar':'/calendar';
  const note=view==='pending'?'La fecha ya pasó y aún falta registrar el resultado de la visita.':view==='history'?'Grabaciones realizadas y visitas canceladas.':'Fechas confirmadas · Hora de Ecuador continental';
  return `<div class="workday-heading"><p>${note}</p>${actor.kind!=='AGENCY'&&can(actor,'SOCIAL','REQUEST')?localLink('/content/recording','Solicitar grabación','btn'):''}</div>`+
    tabs(url,path,agendaViews,view,counts,{q})+card('Agenda de grabaciones',search(url,path,q,view,global?'Buscar negocio, solicitud o lugar':'Buscar solicitud o lugar',viewKey)+
    (rows.length?`<div class="visit-cards">${rows.map(row=>{
      const target=global?'/agency/requests/'+row.request_id+'?company='+row.company_id:url('/requests/'+row.request_id);
      const status=row.request_status==='CANCELLED'?'CANCELLED':row.status;
      return `<article class="visit-card"><div class="visit-date">${icon('calendar')}<time datetime="${esc(row.starts_at)}">${esc(timestamp(row.starts_at))}</time></div><div class="visit-content">${global?`<p class="eyebrow">${esc(row.company_name)}</p>`:''}<h3>${esc(row.title)}</h3><p>${esc(row.place)||'Lugar por confirmar'}</p>${row.recorded_at?`<small>Realizada: ${esc(timestamp(row.recorded_at))}</small>`:''}</div><div class="visit-actions">${badge(status)}${localLink(target,'Ver solicitud →','btn secondary')}</div></article>`;
    }).join('')}</div>`:`<div class="workday-empty">${icon('calendar')}<h3>${q?'Sin coincidencias':view==='upcoming'?'Sin grabaciones próximas':view==='pending'?'Agenda al día':'Todavía no hay historial'}</h3><p>${q?'Prueba con otro nombre o lugar.':'Las visitas aparecen cuando Lúmina confirma la fecha.'}</p></div>`)+
    paging({url,path,params:{view:view,q},page,total}));
}
