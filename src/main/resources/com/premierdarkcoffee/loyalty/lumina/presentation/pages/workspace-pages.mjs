import { areas, channels } from '../../shared/domain.mjs';
import { badge, card, esc, hidden, select, button, localLink, number, table, timestamp } from './components.mjs';
import { icon } from './icons.mjs';

const stat=(name,value,note,mark)=>`<article class="metric-card"><div>${icon(mark)}<span>${esc(name)}</span></div><strong>${number(value)}</strong><p>${esc(note)}</p></article>`;
const statusName={NEW:'Por revisar',REVIEW:'En revisión',QUOTED:'Cotizadas',APPROVED:'Aprobadas',SCHEDULED:'Agendadas',PRODUCTION:'En producción',DELIVERED:'Entregadas',CANCELLED:'Canceladas'};
export function agencyOverview({counts,pipeline,visits,recent}) {
  const total=pipeline.reduce((n,r)=>n+r.count,0);
  return `<section class="workspace-hero"><div><span class="eyebrow">LÚMINA DIGITAL / CENTRO DE TRABAJO</span><h2>Cada cliente.<br>Cada entrega. <em>En orden.</em></h2><p>Un espacio para coordinar la producción, acompañar a tus negocios y hacer crecer su comunidad.</p>
    <div class="actions">${localLink('/clientes','Gestionar clientes →','btn')}${localLink('/produccion','Ver producción','btn secondary')}</div></div>
    <a class="hero-wallet" href="/wallet"><div><span>LOYALTY</span>${icon('wallet')}</div><strong>Wallet</strong><p>Apple + Google</p><div class="card-stamp-row" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><span>Abre tu centro de fidelización ${icon('arrow')}</span></a></section>
    <section class="metric-grid" aria-label="Resumen de la agencia">${stat('Negocios',counts.companies,counts.pending+' pendientes de verificación','clients')}${stat('Solicitudes abiertas',counts.open,'Contenido, servicios y cotizaciones','content')}${stat('Piezas entregadas',counts.delivered,'Entregas registradas en el historial','check')}${stat('Visitas programadas',counts.visits,'Próximas grabaciones por realizar','calendar')}</section>
    <div class="overview-columns"><section class="card"><div class="section-heading"><div><p class="eyebrow">PRODUCCIÓN</p><h2>Del pedido a la entrega</h2></div>${localLink('/produccion','Ver todas →')}</div>
      <div class="pipeline">${Object.entries(statusName).filter(([key])=>!['CANCELLED','DELIVERED'].includes(key)).map(([key,name])=>{const n=pipeline.find(x=>x.status===key)?.count||0;return `<a class="pipeline-stage" href="/produccion?estado=${key}"><div><span>${name}</span><strong>${number(n)}</strong></div><svg viewBox="0 0 240 5" preserveAspectRatio="none" aria-hidden="true"><rect width="240" height="5" rx="2" fill="#edf0f4"/><rect width="${total?Math.round(n/total*240):0}" height="5" rx="2" fill="#213f67"/></svg></a>`;}).join('')}</div>
    </section><section class="card"><div class="section-heading"><div><p class="eyebrow">AGENDA</p><h2>Próximas grabaciones</h2></div>${localLink('/agenda-general','Ver agenda →')}</div>${visitList(visits)}</section></div>
    <section class="card"><div class="section-heading"><div><p class="eyebrow">ACTIVIDAD RECIENTE</p><h2>Últimas solicitudes</h2></div>${localLink('/produccion','Abrir producción →')}</div>${requestTable(recent)}</section>
    <section class="module-grid">${[['/contenido','Contenido para redes','Reels, videos, carruseles y stories.','social'],['/servicios/maps','Google Maps','Ubicaciones, reseñas y seguimiento.','maps'],['/servicios/web','Páginas web','Proyectos, revisiones y entregas.','web'],['/servicios/brand','Diseño de marca','Logos, identidad visual y manual de marca.','content'],['/proximamente','WhatsApp Business e IA','Próximamente.','social'],['/planes','Membresías','Paquetes, servicios y cupos.','plans']].map(([href,title,copy,mark])=>`<a class="module-card" href="${href}">${icon(mark)}<h3>${title}</h3><p>${copy}</p><span>Entrar ${icon('arrow')}</span></a>`).join('')}</section>`;
}
export function requestTable(rows) {
  return table(['Cliente / solicitud','Área','Estado','Cantidad','Registrada'],rows.map(r=>[
    `<strong class="cell-heading">${esc(r.company_name)}</strong>${localLink('/solicitudes/'+r.id+'?empresa='+r.company_id,r.title)}`,
    esc(channels[r.channel]||r.channel),badge(r.status),number(r.quantity),esc(timestamp(r.created_at))]),'Las solicitudes aparecerán aquí cuando tus clientes las registren.');
}
function visitList(rows) {
  return rows.length?`<div class="appointment-list">${rows.map(r=>`<a href="/solicitudes/${r.request_id}?empresa=${r.company_id}"><div class="appointment-icon">${icon('calendar')}</div><div><strong>${esc(r.company_name)}</strong><span>${esc(r.title)}</span><small>${esc(timestamp(r.starts_at))} · ${esc(r.place)}</small></div>${icon('arrow')}</a>`).join('')}</div>`:
    '<div class="empty-state"><span>Tu agenda está al día</span><p>Las visitas programadas aparecerán aquí con su fecha, lugar y negocio.</p></div>';
}
export function agencyProduction(rows,{q='',state='',channel=''}={}) {
  return card('Producción de la agencia',`<form class="filter workspace-filter" method="get"><label>Buscar<input type="search" name="q" value="${esc(q)}" maxlength="100" placeholder="Cliente o solicitud"></label><label>Estado<select name="estado"><option value="">Todos</option>${Object.entries(statusName).map(([v,n])=>`<option value="${v}"${v===state?' selected':''}>${n}</option>`).join('')}</select></label><label>Área<select name="canal"><option value="">Todos</option>${Object.entries(areas).map(([v,n])=>`<option value="${v}"${v===channel?' selected':''}>${n}</option>`).join('')}</select></label><button>Filtrar</button></form>${requestTable(rows)}<p class="muted">Hasta 100 solicitudes, ordenadas de la más reciente a la más antigua. Los filtros se aplican a todos los registros.</p>`);
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
export function channelWorkspace(channel,rows,url,canCreate) {
  const open=rows.filter(r=>!['DELIVERED','CANCELLED'].includes(r.status)).length;
  const social=channel==='SOCIAL';
  return `<section class="service-intro"><span class="eyebrow">${channel==='BRAND'?'PROYECTOS / CONTRATACIÓN INDIVIDUAL':'SERVICIOS DE LÚMINA'}</span><h2>${social?'Una pieza. Todas tus redes.':esc(areas[channel])}</h2><p>${esc(descriptions[channel]||'')}</p>
    <div class="actions">${canCreate?localLink(url('/solicitudes',{canal:channel}),channel==='BRAND'?'Solicitar un proyecto':'Nueva solicitud','btn'):''}
    ${channel==='MAPS'?localLink(url('/mapas'),'Reseñas y rendimiento','btn secondary'):''}
    ${social?localLink(url('/reportes'),'Ver métricas por plataforma','btn secondary'):''}</div></section>
    <div class="metric-grid compact"><div class="metric-card"><span>Solicitudes en esta vista</span><strong>${number(rows.length)}</strong></div><div class="metric-card"><span>Trabajos abiertos</span><strong>${number(open)}</strong></div></div>
    ${card(social?'Contenido y entregables':'Proyectos y servicios',table(['Trabajo','Negocio','Estado','Cantidad','Registro'],rows.map(r=>[
      localLink(url('/solicitudes/'+r.id,{empresa:r.company_id}),r.title),esc(r.company_name),badge(r.status),number(r.quantity),esc(timestamp(r.created_at))])), 'Hasta 100 solicitudes visibles según tus permisos. Abre el trabajo para consultar los archivos, las revisiones y las evidencias.')}`;
}
export function comingSoonPage(){return `<section class="service-intro"><span class="badge">Próximamente</span><h2>WhatsApp Business y asistentes con IA</h2><p>Un nuevo servicio de Lúmina Digital para la atención de tus clientes.</p><p class="muted">Todavía no está disponible para contratar ni activar. Aparecerá aquí cuando el servicio esté habilitado.</p></section>`;}
