import { attentionRows, attentionKinds } from '../../production/overview.mjs';
import { can } from '../../access/accounts.mjs';
import { areas } from '../../shared/domain.mjs';
import { badge, card, disclosure, esc, localLink, timestamp } from './components.mjs';
import { requestCards } from './request-composer.mjs';
import { icon } from './icons.mjs';

export function businessHome({actor,url,groups,upcoming,videoRequested,videoDelivered,cash,courtesy,overview,giftForm}) {
  const requestable=Object.keys(areas).filter(scope=>can(actor,scope,'REQUEST'));
  const accessible=Object.keys(areas).some(scope=>can(actor,scope));
  const open=groups.filter(g=>!['CANCELLED','DELIVERED'].includes(g.status)).reduce((n,g)=>n+g.count,0);
  const actions=attentionRows(overview);
  const modules=[...(can(actor,'WALLET')||cash?[['wallet',cash?'Wallet · Caja':'Wallet',cash?'Atender en '+cash.branch_name+'.':'Tarjetas, promociones y clientes.','/wallet']]:[]),
    ...(can(actor,'SOCIAL')?[['social','Contenido','Producción, entregas y resultados.','/content']]:[]),
    ...['MAPS','WEB','BRAND'].filter(scope=>can(actor,scope)).map(scope=>({MAPS:['maps','Google Maps','Ubicaciones, reseñas y proyectos.','/services/maps'],WEB:['web','Web','Proyectos y entregas de tu sitio.','/services/web'],BRAND:['content','Diseño de marca','Logo e identidad de tu negocio.','/services/brand']}[scope])),
    ...(actor.kind==='OWNER'?[['plans','Paquetes y servicios','Precios, acuerdos y cupos disponibles.','/plans']]:[])];
  const gift=actor.kind==='OWNER'&&can(actor,'SOCIAL')?`<section class="welcome-gift"><span class="service-symbol">${icon('social')}</span><div><h2>Tu video de cortesía</h2>${courtesy?`<p>${badge(courtesy.status)} ${localLink(url('/requests/'+courtesy.id),'Ver solicitud de cortesía →')}</p>`:`<p>Tu primer video es gratis. Cuéntanos qué te gustaría mostrar.</p>${disclosure('Solicitar mi video gratis',giftForm)}`}</div></section>`:'';
  const pending=`<section class="card attention-card"><div class="split"><h2>Necesita tu atención</h2>${actions.length?`<span class="attention-count">${actions.length}</span>`:''}</div>${actions.length?`<div class="attention-list">${actions.slice(0,5).map(a=>`<a href="${esc(url(a.path))}"><span><small>${esc(attentionKinds[a.kind])}</small><strong>${esc(a.title)}</strong></span>${icon('arrow')}</a>`).join('')}</div>${actions.length>5?`<p class="muted">Mostrando 5 de ${actions.length} pendientes. ${localLink(url('/attention'),'Ver todos los pendientes →')}</p>`:''}`:'<div class="all-clear">'+icon('check')+'<div><strong>Todo al día</strong><p>No tienes aprobaciones pendientes.</p></div></div>'}</section>`;
  const visit=overview.nextVisit;
  const schedule=card('Próxima grabación',visit?`<div class="next-visit"><span class="service-symbol">${icon('calendar')}</span><div><strong>${esc(timestamp(visit.starts_at))}</strong><p>${esc(visit.title)}</p><small>${esc(visit.place)}</small></div></div><div class="actions">${localLink(url('/requests/'+visit.id),'Ver detalles →')}${localLink(url('/calendar'),'Ver agenda','btn secondary')}</div>`:'<p class="muted">Las grabaciones confirmadas aparecerán aquí.</p>'+localLink(url('/calendar'),'Ver agenda →'));
  return `<section class="home-intro"><div><h2>Tu día de trabajo</h2><p>Accede a tus servicios y revisa lo pendiente.</p></div><div class="actions">${actor.kind==='OWNER'?localLink('/team','Equipos y roles','btn secondary'):''}${requestable.length?localLink(url('/requests/new',requestable.length===1?{area:requestable[0]}:{}),'Solicitar un servicio','btn'):''}</div></section>
    ${actor.kind==='OWNER'?`<div class="service-manage-link"><span>Servicios elegidos por ti</span>${localLink('/services','Activar o ver servicios →','btn secondary')}</div>`:''}
    ${accessible&&(actions.length||visit)?`<div class="home-overview">${pending}${can(actor,'SOCIAL')?schedule:''}</div>`:''}
    ${modules.length?`<div class="home-modules">${modules.map(([mark,title,hint,path])=>`<a class="home-module" aria-label="Abrir ${esc(title)}" href="${esc(url(path))}"><span class="service-symbol">${icon(mark)}</span><div><h2>${title}</h2><p>${esc(hint)}</p></div>${icon('arrow')}</a>`).join('')}</div>`:''}
    ${accessible?`<section class="home-activity" aria-label="Resumen de actividad">${[['Solicitudes abiertas',open],...(can(actor,'SOCIAL')?[['Videos solicitados',videoRequested],['Videos entregados',videoDelivered],['Próximas visitas',upcoming]]:[])].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}</section>`:''}
    ${gift}${accessible?`<section class="card"><div class="split"><h2>Solicitudes recientes</h2>${localLink(url('/requests'),'Ver todas →')}</div>${requestCards(overview.recent,url,{actor})}</section>`:''}
    ${!accessible&&!cash?card(actor.kind==='OWNER'?'¿Con qué quieres empezar?':'Acceso pendiente',actor.kind==='OWNER'?'<p>Elige un servicio para comenzar. Tu video de cortesía sigue disponible.</p>'+localLink('/services','Elegir mis servicios','btn'):'<p>El dueño debe asignarte una tarea en un servicio activo.</p>'):''}`;
}
