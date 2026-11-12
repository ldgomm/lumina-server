import { can } from '../../access/accounts.mjs';
import { areas } from '../../shared/domain.mjs';
import { badge, card, disclosure, esc, localLink, timestamp } from './components.mjs';
import { requestCards } from './request-composer.mjs';
import { icon } from './icons.mjs';

export function businessHome({actor,url,groups,upcoming,videoRequested,videoDelivered,cash,courtesy,overview,giftForm}) {
  const requestable=Object.keys(areas).filter(scope=>can(actor,scope,'REQUEST'));
  const accessible=Object.keys(areas).some(scope=>can(actor,scope));
  const open=groups.filter(g=>!['CANCELLED','DELIVERED'].includes(g.status)).reduce((n,g)=>n+g.count,0);
  const actions=[...overview.reviews.map(r=>({title:r.title,kind:'Entrega por revisar',path:'/solicitudes/'+r.id})),
    ...overview.quotes.map(r=>({title:r.title,kind:'Cotización lista',path:'/solicitudes/'+r.id})),
    ...overview.proposals.map(r=>({title:'Revisar propuesta de servicios',kind:'Precio y condiciones listos',path:'/planes/pedidos/'+r.id}))];
  const modules=[...(can(actor,'WALLET')?[['wallet','Wallet','Tarjetas, promociones y clientes.','/wallet']]:[]),
    ...(can(actor,'SOCIAL')?[['social','Contenido','Producción, entregas y resultados.','/contenido']]:[]),
    ...(cash?[['wallet','Caja','Atender en '+cash.branch_name+'.','/caja']]:[]),
    ...(actor.kind==='OWNER'?[['plans','Paquetes y servicios','Precios, acuerdos y cupos disponibles.','/planes']]:[])];
  const gift=actor.kind==='OWNER'?`<section class="welcome-gift"><span class="service-symbol">${icon('social')}</span><div><h2>Tu video de cortesía</h2>${courtesy?`<p>${badge(courtesy.status)} ${localLink(url('/solicitudes/'+courtesy.id),'Ver solicitud de cortesía →')}</p>`:`<p>Tu primer video es gratis. Cuéntanos qué te gustaría mostrar.</p>${disclosure('Solicitar mi video gratis',giftForm)}`}</div></section>`:'';
  const pending=`<section class="card attention-card"><div class="split"><h2>Necesita tu atención</h2>${actions.length?`<span class="attention-count">${actions.length}</span>`:''}</div>${actions.length?`<div class="attention-list">${actions.slice(0,5).map(a=>`<a href="${esc(url(a.path))}"><span><small>${esc(a.kind)}</small><strong>${esc(a.title)}</strong></span>${icon('arrow')}</a>`).join('')}</div>${actions.length>5?`<p class="muted">Mostrando 5 de ${actions.length} pendientes. Revisa los siguientes al completar estos.</p>`:''}`:'<div class="all-clear">'+icon('check')+'<div><strong>Todo al día</strong><p>No tienes aprobaciones pendientes.</p></div></div>'}</section>`;
  const visit=overview.nextVisit;
  const schedule=card('Próxima grabación',visit?`<div class="next-visit"><span class="service-symbol">${icon('calendar')}</span><div><strong>${esc(timestamp(visit.starts_at))}</strong><p>${esc(visit.title)}</p><small>${esc(visit.place)}</small></div></div>${localLink(url('/solicitudes/'+visit.id),'Ver detalles →')}`:'<p class="muted">Las grabaciones confirmadas aparecerán aquí.</p>'+localLink(url('/agenda'),'Ver agenda →'));
  return `<section class="home-intro"><div><h2>Todo listo para avanzar.</h2><p>Lo importante de tu negocio, a mano.</p></div>${requestable.length?localLink(url('/solicitudes/nueva',requestable.length===1?{area:requestable[0]}:{}),'Solicitar un servicio','btn'):''}</section>
    ${modules.length?`<div class="home-modules">${modules.map(([mark,title,hint,path])=>`<a class="home-module" aria-label="Abrir ${esc(title)}" href="${esc(url(path))}"><span class="service-symbol">${icon(mark)}</span><div><h2>${title}</h2><p>${esc(hint)}</p></div>${icon('arrow')}</a>`).join('')}</div>`:''}
    ${accessible?`<div class="home-overview">${pending}${schedule}</div><section class="home-activity" aria-label="Resumen de actividad">${[['Solicitudes abiertas',open],['Videos solicitados',videoRequested],['Videos entregados',videoDelivered],['Próximas visitas',upcoming]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}</section>`:''}
    ${gift}${accessible?`<section class="card"><div class="split"><h2>Solicitudes recientes</h2>${localLink(url('/solicitudes'),'Ver todas →')}</div>${requestCards(overview.recent,url)}</section>`:''}
    ${!accessible&&!cash?card('Acceso pendiente','<p>El dueño del negocio debe asignarte al menos un área.</p>'):''}`;
}
