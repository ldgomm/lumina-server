import { can } from '../../access/accounts.mjs';
import { agendaViews } from '../../production/agenda.mjs';
import { attentionKinds } from '../../production/overview.mjs';
import { badge, button, card, esc, hidden, input, localLink, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

export function paging({url,path,params,page,total,size=20}) {
  if(!total)return '';
  return `<div class="workday-paging"><p>${page*size+1}–${Math.min(total,(page+1)*size)} de ${total}</p><nav aria-label="Páginas">${page?localLink(url(path,{...params,pagina:page-1}),'← Anterior','btn secondary'):''}${(page+1)*size<total?localLink(url(path,{...params,pagina:page+1}),'Siguiente →','btn secondary'):''}</nav></div>`;
}
function tabs(url,path,values,active,counts,params={}) {
  return `<nav class="workday-tabs" aria-label="Filtrar vista">${Object.entries(values).map(([key,name])=>`<a href="${esc(url(path,{...params,vista:key}))}"${active===key?' aria-current="page"':''}>${esc(name)} <span>${counts[key]||0}</span></a>`).join('')}</nav>`;
}
function search(url,path,q,view,caption,viewKey='vista') {
  const action=new URL(url(path),'http://localhost');
  return `<form class="workday-search" method="get" action="${esc(action.pathname)}">${[...action.searchParams].map(([k,v])=>hidden(k,v)).join('')}${hidden(viewKey,view)}${input('q',caption,'search','maxlength="100"',q)}${button('Buscar','secondary')}${q?localLink(url(path,{vista:view}),'Limpiar búsqueda','btn secondary'):''}</form>`;
}
export function attentionPage({data,url}) {
  const {view,q,rows,counts,total,page}=data;
  return tabs(url,'/pendientes',{todas:'Todo',...attentionKinds},view,counts,{q})+
    card('Necesita tu atención',search(url,'/pendientes',q,view,'Buscar pendiente')+
    (rows.length?`<div class="attention-list workday-attention">${rows.map(row=>`<a href="${esc(url(row.path))}"><span><small>${esc(attentionKinds[row.kind])}</small><strong>${esc(row.title)}</strong><small>${esc(timestamp(row.created_at))}</small></span><span class="workday-cta">Revisar ${icon('arrow')}</span></a>`).join('')}</div>`:
      `<div class="workday-empty">${icon('check')}<h3>${q?'Sin coincidencias':'Todo al día'}</h3><p>${q?'Prueba con otro nombre o limpia la búsqueda.':'No hay pendientes en esta vista.'}</p></div>`)+paging({url,path:'/pendientes',params:{vista:view,q},page,total}));
}
export function workdayAgenda({actor,data,url,global=false,viewKey='vista'}) {
  const {view,q,rows,counts,page,total}=data,path=global?'/agenda-general':'/agenda';
  const note=view==='pendientes'?'La fecha ya pasó y aún falta registrar el resultado de la visita.':view==='historial'?'Grabaciones realizadas y visitas canceladas.':'Fechas confirmadas · Hora de Ecuador continental';
  return `<div class="workday-heading"><p>${note}</p>${actor.kind!=='AGENCY'&&can(actor,'SOCIAL','REQUEST')?localLink('/contenido/grabacion','Solicitar grabación','btn'):''}</div>`+
    tabs(url,path,agendaViews,view,counts,{q})+card('Agenda de grabaciones',search(url,path,q,view,global?'Buscar negocio, solicitud o lugar':'Buscar solicitud o lugar',viewKey)+
    (rows.length?`<div class="visit-cards">${rows.map(row=>{
      const target=global?'/agencia/solicitudes/'+row.request_id+'?empresa='+row.company_id:url('/solicitudes/'+row.request_id);
      const status=row.request_status==='CANCELLED'?'CANCELLED':row.status;
      return `<article class="visit-card"><div class="visit-date">${icon('calendar')}<time datetime="${esc(row.starts_at)}">${esc(timestamp(row.starts_at))}</time></div><div class="visit-content">${global?`<p class="eyebrow">${esc(row.company_name)}</p>`:''}<h3>${esc(row.title)}</h3><p>${esc(row.place)||'Lugar por confirmar'}</p>${row.recorded_at?`<small>Realizada: ${esc(timestamp(row.recorded_at))}</small>`:''}</div><div class="visit-actions">${badge(status)}${localLink(target,'Ver solicitud →','btn secondary')}</div></article>`;
    }).join('')}</div>`:`<div class="workday-empty">${icon('calendar')}<h3>${q?'Sin coincidencias':view==='proximas'?'Sin grabaciones próximas':view==='pendientes'?'Agenda al día':'Todavía no hay historial'}</h3><p>${q?'Prueba con otro nombre o lugar.':'Las visitas aparecen cuando Lúmina confirma la fecha.'}</p></div>`)+
    paging({url,path,params:{vista:view,q},page,total}));
}
