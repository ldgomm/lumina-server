import { taskPanel } from './task-panel.mjs';
import { attentionRows, attentionKinds } from '../../production/overview.mjs';
import { can } from '../../access/accounts.mjs';
import { areas } from '../../shared/domain.mjs';
import { badge, button, card, disclosure, esc, form, hidden, localLink, timestamp } from './components.mjs';
import { requestCards } from './request-composer.mjs';
import { icon } from './icons.mjs';

export function businessHome({actor,url,groups,upcoming,videoRequested,videoDelivered,cash,courtesy,overview,giftForm,walletEntry}) {
  const requestable=Object.keys(areas).filter(scope=>can(actor,scope,'REQUEST'));
  const accessible=Object.keys(areas).some(scope=>can(actor,scope));
  const open=groups.filter(g=>!['CANCELLED','DELIVERED'].includes(g.status)).reduce((n,g)=>n+g.count,0);
  const actions=attentionRows(overview);
  const modules=[...(can(actor,'WALLET')||cash?[['wallet',cash?'Wallet · Caja':'Wallet',cash?'Atender en '+cash.branch_name+'.':walletEntry?.trialEnding?'Tu prueba gratuita termina el 31 de diciembre.':'Tarjetas, promociones y clientes.','/wallet']]:[]),
    ...(can(actor,'SOCIAL')?[['social','Contenido','Producción, entregas y resultados.','/content']]:[]),
    ...['MAPS','WEB','BRAND'].filter(scope=>can(actor,scope)).map(scope=>({MAPS:['maps','Google Maps','Ubicaciones, reseñas y proyectos.','/services/maps'],WEB:['web','Web','Proyectos y entregas de tu sitio.','/services/web'],BRAND:['content','Diseño de marca','Logo e identidad de tu negocio.','/services/brand']}[scope])),
    ...(actor.kind==='OWNER'?[['plans','Paquetes y servicios','Precios, acuerdos y cupos disponibles.','/plans']]:[])];
  const gift=actor.kind==='OWNER'&&can(actor,'SOCIAL')?`<section class="welcome-gift"><span class="service-symbol">${icon('social')}</span><div><h2>Tu video de cortesía</h2>${courtesy?`<p>${badge(courtesy.status)} ${localLink(url('/requests/'+courtesy.id),'Ver solicitud de cortesía →')}</p>`:`<p>Tu primer video es gratis. Cuéntanos qué te gustaría mostrar.</p>${disclosure('Solicitar mi video gratis',giftForm)}`}</div></section>`:'';
  const pending=`<section class="card attention-card"><div class="split"><h2>Necesita tu atención</h2>${actions.length?`<span class="attention-count">${actions.length}</span>`:''}</div>${actions.length?`<div class="attention-list">${actions.slice(0,5).map(a=>`<a href="${esc(url(a.path))}"><span><small>${esc(attentionKinds[a.kind])}</small><strong>${esc(a.title)}</strong></span>${icon('arrow')}</a>`).join('')}</div>${actions.length>5?`<p class="muted">Mostrando 5 de ${actions.length} pendientes. ${localLink(url('/attention'),'Ver todos los pendientes →')}</p>`:''}`:'<div class="all-clear">'+icon('check')+'<div><strong>Todo al día</strong><p>No tienes aprobaciones pendientes.</p></div></div>'}</section>`;
  const visit=overview.nextVisit;
  const schedule=card('Próxima grabación',visit?`<div class="next-visit"><span class="service-symbol">${icon('calendar')}</span><div><strong>${esc(timestamp(visit.starts_at))}</strong><p>${esc(visit.title)}</p><small>${esc(visit.place)}</small></div></div><div class="actions">${localLink(url('/requests/'+visit.id),'Ver detalles →')}${localLink(url('/calendar'),'Ver agenda','btn secondary')}</div>`:'<p class="muted">Las grabaciones confirmadas aparecerán aquí.</p>'+localLink(url('/calendar'),'Ver agenda →'));
  const first=actions[0];
  const counter=cash?'/cashier':actor.kind==='OWNER'&&can(actor,'WALLET')?url('/wallet',{section:'sales'}):null;
  const newRequest=requestable.length?url('/requests/new',requestable.length===1?{area:requestable[0]}:{}):null;
  let focus;
  if(walletEntry?.choosePlan) {
    focus={area:'wallet',mark:'wallet',label:'Fin de la prueba gratuita',title:'¿Quieres continuar con Wallet?',
      description:'Elige mensual o anual para volver a usar tus tarjetas. Puedes decidir más adelante.',href:'/plans/wallet',action:'Elegir mi plan',
      dismissForm:form('/plans/wallet/choice',actor,hidden('choice','later')+button('Ahora no'),'task-dismiss')};
  } else if(first) {
    const caption={deliveries:'Revisar entrega',quotes:'Revisar cotización',proposals:'Ver propuesta'}[first.kind];
    const anchor={deliveries:first.review_piece_id?'#piece-'+first.review_piece_id:'#deliverables',quotes:'#quote',proposals:''}[first.kind];
    focus={area:'review',mark:'check',label:attentionKinds[first.kind],title:first.title,
      description:'Este trabajo espera tu decisión para continuar.',href:url(first.path)+anchor,action:caption};
  } else if(visit&&can(actor,'SOCIAL')) {
    focus={area:'studio',mark:'calendar',label:'Próxima grabación',title:visit.title,
      description:[timestamp(visit.starts_at),visit.place].filter(Boolean).join(' · '),href:url('/requests/'+visit.id)+'#visits',action:'Ver grabación'};
  } else if(counter) {
    focus={area:'wallet',mark:'wallet',label:'Wallet',title:'Atiende tu próxima venta',
      description:cash?'Registra compras y canjes en '+cash.branch_name+'.':'Identifica al cliente por su tarjeta y registra la compra o el canje.',href:counter,action:'Abrir caja'};
  } else if(newRequest) {
    focus={area:'studio',mark:'content',label:'Solicitudes',title:'¿Qué necesitas preparar?',
      description:'Cuéntale a Lúmina tu idea y sigue el trabajo desde aquí.',href:newRequest,action:'Solicitar un servicio'};
  } else if(modules.length && accessible) {
    const [mark,title,description,path]=modules[0];
    focus={area:'work',mark,label:'Tus servicios',title,description,href:url(path),action:'Abrir '+title};
  }
  const showPending=actions.length>(walletEntry?.choosePlan?0:1);
  const showVisit=visit&&can(actor,'SOCIAL')&&(first||walletEntry?.choosePlan);
  return `${walletEntry?.checkPayment?'<aside class="card notice" data-wallet-reminder="home" role="status" aria-label="Pago de Wallet" hidden></aside><script defer src="/assets/wallet-subscription.js"></script>':''}${focus?taskPanel(focus):''}
    ${(actor.kind==='OWNER'||newRequest&&focus?.href!==newRequest)?`<div class="workspace-tools">${newRequest&&focus?.href!==newRequest?localLink(newRequest,'Solicitar un servicio','btn secondary'):''}${actor.kind==='OWNER'?localLink('/team','Equipos y roles','btn secondary'):''}</div>`:''}
    ${accessible&&(showPending||showVisit)?`<div class="home-overview">${showPending?pending:''}${showVisit?schedule:''}</div>`:''}
    ${modules.length?`<section class="service-launcher" aria-label="Accesos a tus servicios"><div class="launcher-heading"><h2>Tu espacio de trabajo</h2>${actor.kind==='OWNER'?localLink('/services','Gestionar servicios →'):''}</div><div class="home-modules">${modules.map(([mark,title,hint,path])=>`<a class="home-module" data-area="${mark}" aria-label="Abrir ${esc(title)}" href="${esc(url(path))}"><span class="service-symbol">${icon(mark)}</span><div><h3>${esc(title)}</h3><p>${esc(hint)}</p></div>${icon('arrow')}</a>`).join('')}</div></section>`:''}
    ${accessible?`<section class="home-activity" aria-label="Resumen de actividad">${[['Solicitudes abiertas',open],...(can(actor,'SOCIAL')?[['Videos solicitados',videoRequested],['Videos entregados',videoDelivered],['Próximas visitas',upcoming]]:[])].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}</section>`:''}
    ${gift}${accessible?`<section class="card"><div class="split"><h2>Solicitudes recientes</h2>${localLink(url('/requests'),'Ver todas →')}</div>${requestCards(overview.recent,url,{actor})}</section>`:''}
    ${!accessible&&!cash?card(actor.kind==='OWNER'?'¿Con qué quieres empezar?':'Acceso pendiente',actor.kind==='OWNER'?'<p>Elige un servicio para comenzar. Tu video de cortesía sigue disponible.</p>'+localLink('/services','Elegir mis servicios','btn'):'<p>El dueño debe asignarte una tarea en un servicio activo.</p>'):''}`;
}
