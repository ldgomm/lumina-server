import { workdayAgenda } from './workday-pages.mjs';
import { priceGuide } from './request-composer.mjs';
import { contentName } from '../../content/service-options.mjs';
import { can } from '../../access/accounts.mjs';
import { contentViews } from '../../content/workspace.mjs';
import { badge, button, card, esc, external, hidden, input, label, localLink, message, select, table, timestamp } from './components.mjs';
import { requestForm } from './production-pages.mjs';

export function contentNav(url,view='overview') {
  return `<nav class="module-tabs" aria-label="Módulo de contenido">${Object.entries(contentViews).map(([key,title])=>
    `<a href="${esc(url('/content',{view:key}))}"${key===view?' aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
}
export function contentPage({actor,company,url,data,metricsHtml='',calendar=null,plans=[],contracts=[]}) {
  const {view,counts,rows}=data;
  if(view==='calendar'&&calendar) {
    const agendaUrl=(path,params={})=>{
      if(path!=='/calendar'&&path!=='/agency-calendar')return url(path,params);
      const {view,...rest}=params;
      return url('/content',{...rest,view:'calendar',...(view?{period:view}:{})});
    };
    return workdayAgenda({actor,data:calendar,url:agendaUrl,global:actor.kind==='AGENCY'&&!company,viewKey:'period'});
  }
  const requestLink=row=>actor.kind==='AGENCY'?(actor.agencyWork||!company?'/agency':'')+'/requests/'+(row.request_id||row.id)+'?company='+row.company_id:'/requests/'+(row.request_id||row.id);
  const context=company?hidden('company',company.id):'';
  const filter=`<form action="${esc(url('/content').split('?')[0])}" class="workspace-filter content-filter">${context}${hidden('view',view)}
    ${input('q','Buscar contenido','search','maxlength="100"',data.q)}
    ${view==='publications'?select('network','Plataforma',[['','Todas las autorizadas'],...data.platforms.map(p=>[p,label(p)])],data.platform):''}
    ${button('Buscar','secondary')}</form>`;
  const pagination=`<div class="actions">${data.page>0?localLink(url('/content',{view:view,q:data.q,network:data.platform,page:data.page-1}),'← Anterior','btn secondary'):''}
    ${data.more?localLink(url('/content',{view:view,q:data.q,network:data.platform,page:data.page+1}),'Siguiente →','btn secondary'):''}</div>`;
  let body='';
  if(view==='metrics')body=metricsHtml||card('Elige un negocio',`<p>Abre su espacio para consultar las métricas de sus publicaciones.</p>${localLink('/businesses','Ver clientes','btn')}`);
  else if(['production','reviews','deliveries'].includes(view))body=card(data.title,table(['Pieza','Negocio','Estado','Grabación','Acción'],rows.map(row=>[
    `${esc(row.title)}<small class="cell-heading">${esc(row.request_title)}</small>`,esc(row.company_name),badge(row.status),esc(timestamp(row.recorded_at)),
    localLink(requestLink(row),view==='reviews'?'Revisar pieza →':view==='deliveries'?'Ver archivos y evidencias →':'Abrir producción →'),
  ])),view==='reviews'?'Las aprobaciones y ajustes se registran dentro de cada pieza según los permisos del equipo.':'')+pagination;
  else if(view==='publications')body=card(data.title,table(['Pieza','Negocio','Red','Publicación','Última medición','Registro'],rows.map(row=>[
    esc(row.title),esc(row.company_name),esc(label(row.channel)),external(row.url,timestamp(row.published_at)),esc(timestamp(row.measured_at)),localLink(requestLink(row),'Abrir publicaciones y métricas →'),
  ]))) + pagination;
  else if(view==='calendar')body=card(data.title,table(['Fecha programada','Solicitud','Negocio','Lugar','Estado','Grabación real'],rows.map(row=>[
    esc(timestamp(row.starts_at)),localLink(requestLink(row),row.title),esc(row.company_name),esc(row.place),badge(row.status),esc(timestamp(row.recorded_at)),
  ])),'Grabaciones confirmadas, en hora de Ecuador.')+pagination;
  else body=card(view==='overview'?'Solicitudes recientes':'Solicitudes de contenido',table(['Solicitud','Negocio','Formato','Cantidad','Estado','Registro'],rows.map(row=>[
    localLink(requestLink(row),row.title),esc(row.company_name),esc(actor.kind==='AGENCY'?label(row.service):contentName(row.service)),row.quantity,badge(row.status),esc(timestamp(row.created_at)),
  ])))+pagination;
  const stats=view==='overview'?`<div class="metric-grid">${[['Solicitudes abiertas',counts.open,'requests'],['En producción',counts.production,'production'],['Por aprobar',counts.review,'reviews'],['Piezas entregadas',counts.delivered,'deliveries']].map(([caption,value,target])=>
    `<a class="metric-card" href="${esc(url('/content',{view:target,q:data.q}))}"><span>${caption}</span><strong>${value}</strong></a>`).join('')}</div>
    <p class="muted">${counts.publications} publicaciones registradas${data.q?' · resultados de la búsqueda':''}.</p>`:'';
  const create=view==='requests'&&company&&can(actor,'SOCIAL','REQUEST')?'<details class="disclosure content-create"'+(!rows.length&&!data.q?' open':'')+'><summary>Nueva solicitud de contenido</summary><div class="request-workspace">'+card('Cuéntanos tu idea',requestForm(actor,url,false,'SOCIAL',true,{phone:company.phone}),'')+priceGuide(actor,url,'SOCIAL',plans,contracts)+'</div></details>' : '';
  const recording=view==='calendar'&&company&&can(actor,'SOCIAL','REQUEST')?`<div class="actions">${localLink(url('/content/recording'),'Solicitar una grabación','btn')}</div>`:'';
  return stats+create+recording+(view==='metrics'?'':filter)+(data.q?`<p class="filter-result">Resultados para «${esc(data.q)}» · ${localLink(url('/content',{view:view}),'Limpiar búsqueda')}</p>`:'')+body;
}
