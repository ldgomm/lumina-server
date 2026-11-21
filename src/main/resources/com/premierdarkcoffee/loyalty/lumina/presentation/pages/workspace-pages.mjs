import { taskPanel } from './task-panel.mjs';
import { paging } from './workday-pages.mjs';
import { visitTime } from './visit-time.mjs';
import { productionStates as statusName } from '../../production/agency-work.mjs';
import { requestCards, requestNextStep } from './work-progress.mjs';
import { areas, channels } from '../../shared/domain.mjs';
import { badge, workBadge, card, esc, hidden, select, button, localLink, number, pathFor, table, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

const stat=(name,value,note,mark)=>`<article class="metric-card"><div>${icon(mark)}<span>${esc(name)}</span></div><strong>${number(value)}</strong><p>${esc(note)}</p></article>`;
export function agencyOverview({counts,pipeline,visits,recent}) {
  const total=counts.open;
  const agenda=visits[0];
  const time=agenda && visitTime(agenda.starts_at);
  const appointment=agenda && {label:'Próxima grabación',mark:'calendar',title:agenda.title,
    description:[agenda.company_name,time.relative?time.relative+' · '+time.time:timestamp(agenda.starts_at),agenda.place].filter(Boolean).join(' · '),
    action:'Abrir grabación',href:'/agency/requests/'+agenda.request_id+'?company='+agenda.company_id+'#visits'};
  const incoming=pipeline.find(r=>r.status==='NEW')?.count||0;
  const queue=[
    time?.relative==='Hoy' && appointment,
    counts.missed>0 && {label:'Agenda',mark:'calendar',title:counts.missed===1?'Una visita por actualizar':counts.missed+' visitas por actualizar',
      description:'La hora programada ya pasó. Revisa la visita y registra lo ocurrido.',action:'Revisar visitas',href:'/agency-calendar?view=pending'},
    counts.pending>0 && {label:'Verificación',mark:'clients',title:counts.pending===1?'Un negocio pendiente de verificación':counts.pending+' negocios pendientes de verificación',
      description:'Abre la ficha del negocio para revisar su registro.',action:'Revisar registros',href:'/businesses?verification=PENDING&state=ACTIVE'},
    incoming>0 && {label:'Producción',mark:'content',title:incoming===1?'Una solicitud nueva':incoming+' solicitudes nuevas',
      description:'Empieza por la solicitud que lleva más tiempo esperando.',action:'Atender solicitudes',href:'/production?state=NEW&sort=oldest'},
    time?.relative!=='Hoy' && appointment,
  ].filter(Boolean);
  const first=queue.shift() || {label:'Producción',mark:'social',title:counts.open?'Trabajos en curso':'La jornada del estudio',description:counts.open?'Consulta el avance de los trabajos del estudio.':'Consulta tu cartera de clientes y sus proyectos.',action:counts.open?'Ver producción':'Gestionar clientes',href:counts.open?'/production':'/businesses'};
  return `<div class="daybook">${taskPanel({area:'work',...first})}${queue.length?`<nav class="daybook-tools" aria-label="También por atender">${queue.map(item=>`<a href="${esc(item.href)}">${icon(item.mark)}<span>${esc(item.title)}</span>${icon('arrow')}</a>`).join('')}</nav>`:''}</div>
    <div class="workspace-tools">${localLink('/businesses','Clientes','btn secondary')}${localLink('/production','Producción','btn secondary')}${localLink('/teams','Equipos y roles','btn secondary')}${localLink('/wallet','Centro de Wallet','btn secondary')}</div>
    <section class="metric-grid" aria-label="Resumen de la agencia">${stat('Negocios en operación',counts.companies,counts.pending+' pendientes de verificación','clients')}${stat('Solicitudes abiertas',counts.open,'Contenido, servicios y cotizaciones','content')}${stat('Piezas entregadas',counts.delivered,'Entregas registradas en el historial','check')}${stat('Visitas programadas',counts.visits,'Próximas grabaciones por realizar','calendar')}</section>
    ${counts.blocked?`<p class="notice">${counts.blocked} solicitudes detenidas por el estado del negocio. ${localLink('/production?scope=blocked','Consultar registros →')}</p>`:''}<div class="overview-columns"><section class="card"><div class="section-heading"><div><p class="eyebrow">PRODUCCIÓN</p><h2>Del pedido a la entrega</h2></div>${localLink('/production','Ver todas →')}</div>
      <div class="pipeline">${Object.entries(statusName).filter(([key])=>!['CANCELLED','DELIVERED'].includes(key)).map(([key,name])=>{const n=pipeline.find(x=>x.status===key)?.count||0;return `<a class="pipeline-stage" href="/production?state=${key}"><div><span>${name}</span><strong>${number(n)}</strong></div><svg viewBox="0 0 240 5" preserveAspectRatio="none" aria-hidden="true"><rect width="240" height="5" rx="2" fill="#edf0f4"/><rect width="${total?Math.round(n/total*240):0}" height="5" rx="2" fill="#213f67"/></svg></a>`;}).join('')}</div>
    </section><section class="card"><div class="section-heading"><div><p class="eyebrow">AGENDA</p><h2>Próximas grabaciones</h2></div>${localLink('/agency-calendar','Ver agenda →')}</div>${visitList(visits)}</section></div>
    <section class="card"><div class="section-heading"><div><p class="eyebrow">ACTIVIDAD RECIENTE</p><h2>Últimas solicitudes</h2></div>${localLink('/production','Abrir producción →')}</div>${requestTable(recent)}</section>
    <section class="module-grid">${[['/content','Contenido para redes','Videos, fotografías y diseños.','social'],['/services/maps','Google Maps','Ubicaciones, reseñas y seguimiento.','maps'],['/services/web','Páginas web','Proyectos, revisiones y entregas.','web'],['/services/brand','Diseño de marca','Logos, identidad visual y manual de marca.','content'],['/plans','Paquetes y servicios','Paquetes, servicios y cupos.','plans']].map(([href,title,copy,mark])=>`<a class="module-card" href="${href}">${icon(mark)}<h3>${title}</h3><p>${copy}</p><span>Entrar ${icon('arrow')}</span></a>`).join('')}</section>`;
}
export function requestTable(rows) {
  return table(['Cliente / solicitud','Área','Estado','Cantidad','Registrada'],rows.map(r=>[
    `<strong class="cell-heading">${esc(r.company_name)}</strong>${localLink('/agency/requests/'+r.id+'?company='+r.company_id,r.title)}`,
    esc(channels[r.channel]||r.channel),workBadge(r),number(r.quantity),esc(timestamp(r.created_at))]),'Las solicitudes aparecerán aquí cuando tus clientes las registren.');
}
function visitList(rows) {
  return rows.length?`<div class="appointment-list">${rows.map(r=>`<a href="/agency/requests/${r.request_id}?company=${r.company_id}"><div class="appointment-icon">${icon('calendar')}</div><div><strong>${esc(r.company_name)}</strong><span>${esc(r.title)}</span><small>${esc(timestamp(r.starts_at))} · ${esc(r.place)}</small></div>${icon('arrow')}</a>`).join('')}</div>`:
    '<div class="empty-state"><span>Tu agenda está al día</span><p>Las visitas programadas aparecerán aquí con su fecha, lugar y negocio.</p></div>';
}
export function agencyProduction({rows,q,state,channel,scope,sort,total,page}) {
  const url=pathFor(null,null),params={q,state,channel,scope,sort};
  const tabs=[['operating','En operación'],['blocked','Negocios detenidos']].map(([key,name])=>
    `<a href="${esc(url('/production',{...params,scope:key}))}"${scope===key?' aria-current="page"':''}>${name}</a>`).join('');
  const reset=q||state||channel||sort!=='recent'?localLink(url('/production',{scope}),'Limpiar filtros','btn secondary'):'';
  const filters=`<form class="filter workspace-filter production-filters" method="get">${hidden('scope',scope)}
    <label>Buscar<input type="search" name="q" value="${esc(q)}" maxlength="100" placeholder="Cliente o solicitud"></label>
    ${select('state','Estado',[['','Todos'],...Object.entries(statusName)],state)}${select('channel','Área',[['','Todas'],...Object.entries(areas)],channel)}
    ${select('sort','Orden',[['recent','Más recientes primero'],['oldest','Más antiguas primero']],sort)}${button('Filtrar')}${reset}</form>`;
  return `<nav class="workday-tabs" aria-label="Estado del negocio">${tabs}</nav>`+
    card(scope==='blocked'?'Historial de negocios detenidos':'Producción de la agencia',filters+
      (total?requestTable(rows):reset?'<p>Sin coincidencias con estos filtros.</p>':requestTable([]))+
      paging({url,path:'/production',params,page,total}),scope==='blocked'?'Consulta los registros conservados. Los cambios se habilitan al reactivar el negocio.':'');
}
export function agencyAgenda(rows) {
  return card('Agenda de grabaciones',visitList(rows), 'Próximas 100 visitas programadas. Abre cada solicitud para consultar indicaciones y registrar la grabación.');
}
const descriptions={
 SOCIAL:'Fotografía, video, edición, piezas gráficas, textos y publicaciones. Una ficha común por trabajo y resultados separados para cada red.',
 WEB:'Páginas empresariales, tiendas en línea, catálogos, menús digitales, reservas, páginas de campaña y mantenimiento.',
 MAPS:'Gestión del Perfil de Empresa, datos actualizados, fotografías, respuestas a reseñas y seguimiento del rendimiento.',
 BRAND:'Logo, identidad visual y manual de marca. Trabajos individuales con propuesta, revisión, entrega y cierre.',
};
export function channelWorkspace(channel,rows,url,canCreate,actor,company) {
  const ongoing=rows.filter(r=>(!r.business_state||r.business_state==='ACTIVE')&&!['DELIVERED','CANCELLED'].includes(r.status));
  const target=r=>actor?.kind==='AGENCY'&&!actor.readOnlyCompany?'/agency/requests/'+r.id+'?company='+r.company_id:url('/requests/'+r.id);
  const service={
    WEB:{mark:'web',title:'Tu sitio web',action:'Solicitar un proyecto web'},
    MAPS:{mark:'maps',title:'Tus ubicaciones en Google',action:'Consultar reseñas'},
    BRAND:{mark:'content',title:'Tu identidad de marca',action:'Solicitar un proyecto'},
    SOCIAL:{mark:'social',title:'Tu contenido para redes',action:'Nueva solicitud'},
  }[channel];
  const next=ongoing[0];
  const step=next&&requestNextStep(next,actor);
  const newUrl=url('/requests/new',{area:channel});
  const global=actor.kind==='AGENCY'&&!company;
  const primary=next?target(next)+step.anchor:global?'/businesses':channel==='MAPS'?url('/maps'):canCreate?newUrl:null;
  const focus=taskPanel({area:channel.toLowerCase(),mark:service.mark,label:next?'Continuar proyecto':areas[channel],
    title:next?.title||service.title,description:next?step.title:descriptions[channel],action:next?step.caption:global?'Elegir un negocio':service.action,href:primary});
  const extra=[];
  if(canCreate&&primary!==newUrl)extra.push(localLink(newUrl,channel==='BRAND'?'Solicitar un proyecto':'Nueva solicitud','btn secondary'));
  if(channel==='MAPS'&&!global&&primary!==url('/maps'))extra.push(localLink(url('/maps'),'Reseñas y rendimiento','btn secondary'));
  if(channel==='SOCIAL')extra.push(localLink(url('/reports'),'Ver métricas por plataforma','btn secondary'));
  return focus+(extra.length?'<div class="workspace-tools">'+extra.join('')+'</div>':'')+
    `<section class="card service-projects"><div class="launcher-heading"><h2>Proyectos y servicios</h2><span>${number(ongoing.length)} en curso</span></div>${
      rows.length?requestCards(rows,url,{actor,showCompany:actor?.kind==='AGENCY',resolveLink:target}):
        '<div class="service-empty"><strong>Aquí aparecerá el primer proyecto</strong><p>Podrás consultar su avance, los archivos y las entregas.</p></div>'}</section>`;
}
