import { priceGuide } from './request-composer.mjs';
import { contentName } from '../../content/service-options.mjs';
import { can } from '../../access/accounts.mjs';
import { contentViews } from '../../content/workspace.mjs';
import { badge, button, card, esc, external, hidden, input, label, localLink, message, select, table, timestamp } from './components.mjs';
import { requestForm } from './production-pages.mjs';

export function contentNav(url,view='resumen') {
  return `<nav class="module-tabs" aria-label="Módulo de contenido">${Object.entries(contentViews).map(([key,title])=>
    `<a href="${esc(url('/contenido',{vista:key}))}"${key===view?' aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
}
export function contentPage({actor,company,url,data,metricsHtml='',plans=[],contracts=[]}) {
  const {view,counts,rows}=data;
  const requestLink=row=>actor.kind==='AGENCY'?(actor.agencyWork||!company?'/agencia':'')+'/solicitudes/'+(row.request_id||row.id)+'?empresa='+row.company_id:'/solicitudes/'+(row.request_id||row.id);
  const context=company?hidden('empresa',company.id):'';
  const filter=`<form action="${esc(url('/contenido').split('?')[0])}" class="workspace-filter content-filter">${context}${hidden('vista',view)}
    ${input('q','Buscar contenido','search','maxlength="100"',data.q)}
    ${view==='publicaciones'?select('red','Plataforma',[['','Todas las autorizadas'],...data.platforms.map(p=>[p,label(p)])],data.platform):''}
    ${button('Buscar','secondary')}</form>`;
  const pagination=`<div class="actions">${data.page>0?localLink(url('/contenido',{vista:view,q:data.q,red:data.platform,pagina:data.page-1}),'← Anterior','btn secondary'):''}
    ${data.more?localLink(url('/contenido',{vista:view,q:data.q,red:data.platform,pagina:data.page+1}),'Siguiente →','btn secondary'):''}</div>`;
  let body='';
  if(view==='metricas')body=metricsHtml||card('Elige un negocio',`<p>Abre su espacio para consultar las métricas de sus publicaciones.</p>${localLink('/clientes','Ver clientes','btn')}`);
  else if(['produccion','revisiones','entregas'].includes(view))body=card(data.title,table(['Pieza','Negocio','Estado','Grabación','Acción'],rows.map(row=>[
    `${esc(row.title)}<small class="cell-heading">${esc(row.request_title)}</small>`,esc(row.company_name),badge(row.status),esc(timestamp(row.recorded_at)),
    localLink(requestLink(row),view==='revisiones'?'Revisar pieza →':view==='entregas'?'Ver archivos y evidencias →':'Abrir producción →'),
  ])),view==='revisiones'?'Las aprobaciones y ajustes se registran dentro de cada pieza según los permisos del equipo.':'')+pagination;
  else if(view==='publicaciones')body=card(data.title,table(['Pieza','Negocio','Red','Publicación','Última medición','Registro'],rows.map(row=>[
    esc(row.title),esc(row.company_name),esc(label(row.channel)),external(row.url,timestamp(row.published_at)),esc(timestamp(row.measured_at)),localLink(requestLink(row),'Abrir publicaciones y métricas →'),
  ]))) + pagination;
  else if(view==='agenda')body=card(data.title,table(['Fecha programada','Solicitud','Negocio','Lugar','Estado','Grabación real'],rows.map(row=>[
    esc(timestamp(row.starts_at)),localLink(requestLink(row),row.title),esc(row.company_name),esc(row.place),badge(row.status),esc(timestamp(row.recorded_at)),
  ])),'Grabaciones confirmadas, en hora de Ecuador.')+pagination;
  else body=card(view==='resumen'?'Solicitudes recientes':'Solicitudes de contenido',table(['Solicitud','Negocio','Formato','Cantidad','Estado','Registro'],rows.map(row=>[
    localLink(requestLink(row),row.title),esc(row.company_name),esc(actor.kind==='AGENCY'?label(row.service):contentName(row.service)),row.quantity,badge(row.status),esc(timestamp(row.created_at)),
  ])))+pagination;
  const stats=view==='resumen'?`<div class="metric-grid">${[['Solicitudes abiertas',counts.open,'solicitudes'],['En producción',counts.production,'produccion'],['Por aprobar',counts.review,'revisiones'],['Piezas entregadas',counts.delivered,'entregas']].map(([caption,value,target])=>
    `<a class="metric-card" href="${esc(url('/contenido',{vista:target,q:data.q}))}"><span>${caption}</span><strong>${value}</strong></a>`).join('')}</div>
    <p class="muted">${counts.publications} publicaciones registradas${data.q?' · resultados de la búsqueda':''}.</p>`:'';
  const create=view==='solicitudes'&&company&&can(actor,'SOCIAL','REQUEST')?'<div class="request-workspace">'+card('Nueva solicitud de contenido',requestForm(actor,url,false,'SOCIAL',true,{phone:company.phone}),'')+priceGuide(actor,url,'SOCIAL',plans,contracts)+'</div>' : '';
  const recording=view==='agenda'&&company&&can(actor,'SOCIAL','REQUEST')?`<div class="actions">${localLink(url('/contenido/grabacion'),'Solicitar una grabación','btn')}</div>`:'';
  return stats+create+recording+(view==='metricas'?'':filter)+body;
}
