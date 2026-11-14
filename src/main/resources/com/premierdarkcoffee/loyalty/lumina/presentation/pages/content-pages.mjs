import { workdayAgenda, paging } from './workday-pages.mjs';
import { priceGuide } from './request-composer.mjs';
import { requestCards, pieceCards } from './work-progress.mjs';
import { can } from '../../access/accounts.mjs';
import { contentViews } from '../../content/workspace.mjs';
import { badge, button, card, esc, external, hidden, input, label, localLink, select, table, timestamp } from './components.mjs';
import { requestForm } from './production-pages.mjs';
import { icon } from './icons.mjs';

export function contentNav(url,view='overview') {
  return `<nav class="module-tabs" aria-label="Módulo de contenido">${Object.entries(contentViews).map(([key,title])=>
    `<a href="${esc(url('/content',{view:key}))}"${key===view?' aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
}
function emptyContent(view,q,url) {
  const copy={production:['Tu producción está al día','Aquí aparecerán las piezas que Lúmina esté preparando.'],reviews:['Sin entregas en revisión','Las piezas listas para revisar aparecerán aquí.'],deliveries:['Tus entregas, en este espacio','Aquí encontrarás los archivos de los trabajos entregados.'],publications:['Aún no hay publicaciones','Las publicaciones y sus mediciones aparecen cuando se registran.'],requests:['Todavía no hay solicitudes en esta vista','Puedes consultar todas o enviar una nueva idea.'],overview:['Tu próxima idea empieza aquí','Solicita contenido y sigue su avance en este espacio.']};
  const [title,hint]=q?['Sin coincidencias','Busca por el nombre de la solicitud o de la pieza.']:(copy[view]||copy.requests);
  return `<div class="workday-empty">${icon(q?'content':view==='reviews'?'check':'social')}<h3>${title}</h3><p>${hint}</p>${q?localLink(url('/content',{view}),'Limpiar búsqueda','btn secondary'):view==='requests'?localLink(url('/content',{view:'requests',filter:'all'}),'Ver todas las solicitudes','btn secondary'):''}</div>`;
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
  const listFilter=data.filter||'all';
  const filter=`<form action="${esc(url('/content').split('?')[0])}" class="workspace-filter content-filter">${context}${hidden('view',view)}${view==='requests'?hidden('filter',listFilter):''}
    ${input('q','Buscar contenido','search','maxlength="100" placeholder="Nombre de la solicitud o de la pieza…"',data.q)}
    ${view==='publications'?select('network','Plataforma',[['','Todas las autorizadas'],...data.platforms.map(p=>[p,label(p)])],data.platform):''}
    ${button('Buscar','secondary')}${data.q?localLink(url('/content',{view,filter:listFilter,network:data.platform}),'Limpiar','btn secondary'):''}</form>`;
  const pagination=paging({url,path:'/content',params:{view,q:data.q,filter:listFilter,network:data.platform},page:data.page,total:data.total});
  const requestTabs=view==='requests'?`<nav class="workday-tabs" aria-label="Estado de solicitudes">${[['all','Todas',counts.requests],['open','En curso',counts.open],['closed','Cerradas',counts.requests-counts.open]].map(([key,title,count])=>`<a href="${esc(url('/content',{view,q:data.q,filter:key}))}"${key===listFilter?' aria-current="page"':''}>${title}<span>${count}</span></a>`).join('')}</nav>`:'';
  let body='';
  if(view==='metrics')body=metricsHtml||card('Elige un negocio',`<p>Abre su espacio para consultar las métricas de sus publicaciones.</p>${localLink('/businesses','Ver clientes','btn')}`);
  else if(['production','reviews','deliveries'].includes(view))body=card({production:'Trabajos en marcha',reviews:'Entregas en revisión',deliveries:'Archivos entregados'}[view],rows.length?pieceCards(rows,actor,requestLink,{showCompany:actor.kind==='AGENCY'}):emptyContent(view,data.q,url))+pagination;
  else if(view==='publications')body=card(data.title,rows.length?table(['Pieza',...(actor.kind==='AGENCY'?['Negocio']:[]),'Red','Publicación','Última medición','Registro'],rows.map(row=>[
    esc(row.title),...(actor.kind==='AGENCY'?[esc(row.company_name)]:[]),esc(label(row.channel)),external(row.url,timestamp(row.published_at)),esc(timestamp(row.measured_at)),localLink(requestLink(row)+'#piece-'+row.piece_id,'Abrir publicaciones y métricas →'),
  ])):emptyContent(view,data.q,url))+pagination;
  else if(view==='calendar')body=card(data.title,table(['Fecha programada','Solicitud','Negocio','Lugar','Estado','Grabación real'],rows.map(row=>[
    esc(timestamp(row.starts_at)),localLink(requestLink(row)+'#visits',row.title),esc(row.company_name),esc(row.place),badge(row.status),esc(timestamp(row.recorded_at)),
  ])))+pagination;
  else body=card(view==='overview'?'Solicitudes recientes':'Solicitudes de contenido',rows.length?requestCards(rows,url,{actor,showCompany:actor.kind==='AGENCY',resolveLink:requestLink}):emptyContent(view,data.q,url))+pagination;
  const stats=view==='overview'?`<div class="metric-grid content-overview">${[['Solicitudes abiertas',counts.open,'requests'],['En producción',counts.production,'production'],['En revisión',counts.review,'reviews'],['Piezas entregadas',counts.delivered,'deliveries']].map(([caption,value,target])=>
    `<a class="metric-card${target==='reviews'&&value?' metric-pending':''}" href="${esc(url('/content',{view:target,q:data.q,...(target==='requests'?{filter:'open'}:{})}))}"><span>${caption}</span><strong>${value}</strong><small>${target==='reviews'?'Ver entregas en revisión':'Ver '+contentViews[target].toLowerCase()} ${icon('arrow')}</small></a>`).join('')}</div>`:'';
  const create=view==='requests'&&company&&can(actor,'SOCIAL','REQUEST')?'<details class="disclosure content-create"'+(!counts.requests&&!data.q?' open':'')+'><summary>Nueva solicitud de contenido</summary><div class="request-workspace">'+card('Cuéntanos tu idea',requestForm(actor,url,false,'SOCIAL',true,{phone:company.phone}),'')+priceGuide(actor,url,'SOCIAL',plans,contracts)+'</div></details>' : '';
  return stats+create+(view==='metrics'?'':requestTabs+filter)+(data.q?`<p class="filter-result">Resultados para «${esc(data.q)}»</p>`:'')+`<div data-content-list>${body}</div>`;
}
