import { taskPanel } from './task-panel.mjs';
import { attentionRows, attentionKinds, attentionDestination } from '../../production/overview.mjs';
import { can } from '../../access/accounts.mjs';
import { areas } from '../../shared/domain.mjs';
import { button, card, esc, form, hidden, localLink, timestamp } from './components.mjs';
import { requestCards } from './request-composer.mjs';
import { icon } from './icons.mjs';
import { visitTime } from './visit-time.mjs';


export function businessHome({actor,url,groups,upcoming,videoRequested,videoDelivered,cash,overview,walletEntry}) {
  const requestable=Object.keys(areas).filter(scope=>can(actor,scope,'REQUEST'));
  const accessible=Object.keys(areas).some(scope=>can(actor,scope));
  const open=groups.filter(g=>!['CANCELLED','DELIVERED'].includes(g.status)).reduce((n,g)=>n+g.count,0);
  const actions=attentionRows(overview);
  const modules=[...(can(actor,'WALLET')||cash?[['wallet',cash?'Wallet · Caja':'Wallet',cash?'Atender en '+cash.branch_name+'.':walletEntry?.trialEnding?'Tu prueba gratuita termina el 31 de diciembre.':'Tarjetas, promociones y clientes.','/wallet']]:[]),
    ...(can(actor,'SOCIAL')?[['social','Contenido','Producción, entregas y resultados.','/content']]:[]),
    ...['MAPS','WEB','BRAND'].filter(scope=>can(actor,scope)).map(scope=>({MAPS:['maps','Google Maps','Ubicaciones, reseñas y proyectos.','/services/maps'],WEB:['web','Web','Proyectos y entregas de tu sitio.','/services/web'],BRAND:['content','Diseño de marca','Logo e identidad de tu negocio.','/services/brand']}[scope])),
    ...(actor.kind==='OWNER'?[['plans','Paquetes y servicios','Precios, acuerdos y cupos disponibles.','/plans']]:[])];
  const visit=overview.nextVisit;
  const time=visit && visitTime(visit.starts_at);
  const when=visit && (time.relative?time.relative+' · '+time.time:timestamp(visit.starts_at));
  const visitFocus=visit && {area:'studio',mark:'calendar',label:'Próxima grabación',title:visit.title,
    description:[when,visit.place].filter(Boolean).join(' · '),href:url('/requests/'+visit.id)+'#visits',action:'Ver grabación'};
  const first=actions[0];
  const counter=cash?'/cashier':actor.kind==='OWNER'&&can(actor,'WALLET')&&walletEntry?.counterAvailable?url('/wallet',{section:'sales'}):null;
  const newRequest=requestable.length?url('/requests/new',requestable.length===1?{area:requestable[0]}:{}):null;
  let focus;
  if(walletEntry?.choosePlan) {
    focus={area:'wallet',mark:'wallet',label:'Fin de la prueba gratuita',title:'¿Quieres continuar con Wallet?',
      description:'Elige mensual o anual para volver a usar tus tarjetas. Puedes decidir más adelante.',href:'/plans/wallet',action:'Elegir mi plan',
      dismissForm:form('/plans/wallet/choice',actor,hidden('choice','later')+button('Ahora no'),'task-dismiss')};
  } else if(visitFocus && time.relative==='Hoy') {
    focus=visitFocus;
  } else if(first) {
    const caption={deliveries:'Revisar entrega',quotes:'Revisar cotización',proposals:'Ver propuesta'}[first.kind];
    focus={area:'review',mark:'check',label:attentionKinds[first.kind],title:first.title,
      description:{deliveries:'Abre la pieza para aprobarla o pedir un ajuste.',quotes:'Revisa el precio y las condiciones de este trabajo.',proposals:'Revisa los servicios y el precio antes de decidir.'}[first.kind],
      href:url(attentionDestination(first)),action:caption};
  } else if(visitFocus) {
    focus=visitFocus;
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
  const others=focus?.area==='review'?actions.slice(1):actions;
  const pending=others.length?`<section class="card attention-card"><div class="split"><h2>Necesita tu atención</h2><span class="attention-count">${others.length}</span></div>
    <div class="attention-list">${others.slice(0,4).map(row=>`<a href="${esc(url(attentionDestination(row)))}"><span><small>${esc(attentionKinds[row.kind])}</small><strong>${esc(row.title)}</strong></span>${icon('arrow')}</a>`).join('')}</div>
    ${localLink('/attention','Ver todos los pendientes →')}</section>`:'';
  const schedule=visitFocus && focus!==visitFocus?card('Próxima grabación',`<div class="next-visit"><span class="service-symbol">${icon('calendar')}</span><div><strong>${esc(when)}</strong><p>${esc(visit.title)}</p><small>${esc(visit.place)}</small></div></div>${localLink(visitFocus.href,'Ver grabación →')}`):'';
  const shortcuts=[
    ...(counter && focus?.href!==counter?[[counter,'Abrir caja','wallet','data-wallet-counter']]:[]),
    ...(actor.kind==='OWNER' && (can(actor,'WALLET')||walletEntry?.checkPayment) && !walletEntry?.choosePlan?[['/plans/wallet','Mi suscripción Wallet','plans','']]:[]),
    ...(newRequest && focus?.href!==newRequest?[[newRequest,'Solicitar un servicio','content','']]:[]),
    ...(actor.kind==='OWNER'?[['/team','Equipos y roles','clients','']]:[]),
  ];
  return `${walletEntry?.checkPayment?'<aside class="card notice" data-wallet-reminder="home" role="status" aria-label="Pago de Wallet" hidden></aside><script defer src="/assets/wallet-subscription.js"></script>':''}
    <div class="daybook">${focus?taskPanel(focus):''}${shortcuts.length?`<nav class="daybook-tools" aria-label="Acciones frecuentes">${shortcuts.map(([href,title,mark,attr])=>`<a ${attr} href="${esc(href)}">${icon(mark)}<span>${esc(title)}</span>${icon('arrow')}</a>`).join('')}</nav>`:''}</div>
    ${pending||schedule?`<div class="home-overview">${pending}${schedule}</div>`:''}
    ${modules.length?`<section class="service-launcher" aria-label="Accesos a tus servicios"><div class="launcher-heading"><h2>Tu espacio de trabajo</h2>${actor.kind==='OWNER'?localLink('/services','Gestionar servicios →'):''}</div><div class="home-modules">${modules.map(([mark,title,hint,path])=>`<a class="home-module" data-area="${mark}" aria-label="Abrir ${esc(title)}" href="${esc(url(path))}"><span class="service-symbol">${icon(mark)}</span><div><h3>${esc(title)}</h3><p>${esc(hint)}</p></div>${icon('arrow')}</a>`).join('')}</div></section>`:''}
    ${accessible?`<section class="home-activity" aria-label="Resumen de actividad">${[['Solicitudes abiertas',open],...(can(actor,'SOCIAL')?[['Videos solicitados',videoRequested],['Videos entregados',videoDelivered],['Próximas visitas',upcoming]]:[])].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}</section>`:''}
    ${accessible?`<section class="card"><div class="split"><h2>Solicitudes recientes</h2>${localLink(url('/requests'),'Ver todas →')}</div>${requestCards(overview.recent,url,{actor})}</section>`:''}
    ${!accessible&&!cash?card(actor.kind==='OWNER'?'¿Con qué quieres empezar?':'Acceso pendiente',actor.kind==='OWNER'?'<p>Elige un servicio para comenzar.</p>'+localLink('/services','Elegir mis servicios','btn'):'<p>El dueño debe asignarte una tarea en un servicio activo.</p>'):''}`;
}
