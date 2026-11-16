import { serviceCatalog, serviceState } from '../../businesses/services.mjs';
import { can } from '../../access/accounts.mjs';
import { button, card, esc, form, hidden, localLink } from './components.mjs';
import { icon } from './icons.mjs';

function serviceRows(list,actor) {
 return `<ul class="service-roster">${list.map(([code,service,status])=>{
  const active=status==='ACTIVE',pending=status==='SETUP';
  return `<li class="service-roster-item" data-service="${code}" data-service-state="${status}"><span class="service-symbol">${icon(service.icon)}</span><div class="service-roster-copy"><div><h3>${esc(service.name)}</h3><span class="service-state${active?' is-active':pending?' is-pending':''}">${active?'Activo':pending?'Activación pendiente':'Disponible'}</span></div><p>${esc(service.description)}</p>${code==='WALLET'&&!active?'<small>Elige una oferta publicada y confirma para empezar.</small>':''}</div><div class="service-roster-action">${active?localLink(service.path,'Abrir '+service.name,'btn secondary'):pending?localLink('/plans/wallet','Continuar con Wallet','btn'):form('/services/activate',actor,hidden('service',code)+button(code==='WALLET'?'Elegir Wallet':'Activar '+service.name,'secondary'))}</div></li>`;
 }).join('')}</ul>`;
}
export function servicesPage(db,actor) {
 const all=Object.entries(serviceCatalog).map(([code,service])=>[code,service,serviceState(db,actor.company_id,code)]);
 const active=all.filter(item=>item[2]==='ACTIVE'),pending=all.filter(item=>item[2]==='SETUP'),available=all.filter(item=>item[2]==='INACTIVE');
 const section=(id,title,items)=>items.length?`<section class="service-group" id="${id}" aria-labelledby="${id}-title"><div class="service-group-heading"><h2 id="${id}-title">${title}</h2><span>${items.length}</span></div>${serviceRows(items,actor)}</section>`:'';
 return `<div class="service-center"><div class="service-center-main"><div class="service-center-intro"><p>${active.length?`Tienes ${active.length} ${active.length===1?'servicio activo':'servicios activos'}. Entra directamente o añade otro cuando lo necesites.`:'Empieza por un servicio. Puedes añadir los demás después.'}</p></div>${section('active-services','Listos para trabajar',active)}${section('pending-services','Termina la configuración',pending)}${section('available-services',active.length||pending.length?'Añade otro servicio':'Elige por dónde empezar',available)}</div><aside class="service-center-aside"><span class="eyebrow">TODO, DESDE LÚMINA</span><h2>Tu espacio.<br>Tus decisiones.</h2><p>Activar Contenido, Web, Maps o Marca abre tu espacio de trabajo. Los pedidos y paquetes se contratan por separado.</p><div class="service-price-note"><strong>¿Buscas precios o paquetes?</strong><p>Consulta lo publicado o solicita una propuesta a tu medida.</p>${localLink('/plans','Ver paquetes y servicios →')}</div><p class="service-wallet-note">Wallet requiere aceptar sus condiciones y su tarifa antes de activarse.</p></aside></div>`;
}
export function welcomePage(actor,{cash=false}={}) {
 const owner=actor.kind==='OWNER';
 const options=Object.entries(serviceCatalog).filter(([code])=>can(actor,code)||code==='WALLET'&&cash);
 return `<section class="welcome-panel"><div class="welcome-heading"><span class="eyebrow">${owner?'TU NEGOCIO, A TU RITMO':'TU ESPACIO DE TRABAJO'}</span><h2>Hola, ${esc(actor.name.split(' ')[0])}.</h2><p>${owner?'Elige con qué quieres empezar. Los demás servicios quedan disponibles para después.':'Ya eres parte de '+esc(actor.company_name)+'. Aquí encontrarás las tareas que te asignaron.'}</p></div>
 ${form('/welcome',actor,owner?`<fieldset class="welcome-options"><legend>¿Por dónde empezamos?</legend>${Object.entries(serviceCatalog).map(([code,s])=>`<label class="welcome-option"><input type="radio" name="service" value="${code}"><span class="service-symbol">${icon(s.icon)}</span><span><strong>${esc(s.name)}</strong><small>${esc(s.description)}</small></span></label>`).join('')}<label class="welcome-option welcome-later"><input type="radio" name="service" value="LATER" checked><span>Explorar primero</span></label></fieldset><p class="welcome-note">Tienes un video de cortesía. Wallet se activa únicamente si lo eliges y confirmas sus condiciones.</p><div class="welcome-footer">${button('Continuar')}</div>`:`<div class="welcome-access">${options.length?options.map(([code,s])=>`<div>${icon(s.icon)}<strong>${esc(code==='WALLET'&&cash?'Wallet · Caja':s.name)}</strong><span>Acceso asignado</span></div>`).join(''):'<p>Tu cuenta está lista. El dueño todavía debe asignarte una tarea o activar el servicio correspondiente.</p>'}</div><p class="welcome-note">Tu cédula y contraseña sirven en todos tus módulos.</p><div class="welcome-footer">${button('Entrar a mi espacio')}</div>`)}
 </section>`;
}
export function inactiveServicePage(actor,service) {
 const item=serviceCatalog[service];
 return card(item.name,`<p>${actor.kind==='OWNER'?'Este servicio todavía no está activado en tu negocio.':'El dueño todavía no ha activado este servicio para el negocio.'}</p>${actor.kind==='OWNER'?localLink('/services','Elegir mis servicios','btn'):localLink('/home','Volver al inicio','btn secondary')}`);
}
