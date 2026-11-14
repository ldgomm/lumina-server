import { serviceCatalog, serviceState } from '../../businesses/services.mjs';
import { can } from '../../access/accounts.mjs';
import { button, card, esc, form, hidden, localLink } from './components.mjs';
import { icon } from './icons.mjs';

function tiles(actor,states={},welcome=false,cash=false) {
 const owner=actor.kind==='OWNER';
 const list=Object.entries(serviceCatalog).filter(([code])=>owner||can(actor,code)||code==='WALLET'&&cash);
 return `<div class="service-choice-grid activation-services">${list.map(([code,service])=>{
  const status=states[code]||'INACTIVE',active=status==='ACTIVE',pending=status==='SETUP';
  return `<article class="service-choice ${active?'is-active':''}"><div class="service-choice-heading"><span class="service-symbol">${icon(service.icon)}</span><span class="service-state">${active?'Activo':pending?'Falta confirmar':'Disponible'}</span></div><h2>${esc(service.name)}</h2><p>${esc(service.description)}</p>
   ${code==='WALLET'?'<small>$4,99 al mes o $50 al año por sucursal. Revisa la promoción y las condiciones antes de activar.</small>':'<small>Los trabajos se cotizan o se descuentan de tu paquete contratado.</small>'}
   ${active?localLink(service.path,'Abrir '+service.name,'btn secondary'):owner?(pending?localLink('/planes/wallet','Continuar activación','btn'):form('/servicios/activar',actor,hidden('service',code)+button('Activar '+service.name))):''}</article>`;
 }).join('')}</div>`;
}
export function servicesPage(db,actor) {
 const states=Object.fromEntries(Object.keys(serviceCatalog).map(code=>[code,serviceState(db,actor.company_id,code)]));
 return `<section class="services-intro"><p>Activa solo lo que necesitas. Puedes añadir más servicios cuando quieras.</p></section>${tiles(actor,states)}`;
}
export function welcomePage(actor,{cash=false}={}) {
 const owner=actor.kind==='OWNER';
 const options=Object.entries(serviceCatalog).filter(([code])=>can(actor,code)||code==='WALLET'&&cash);
 return `<section class="welcome-panel"><div class="welcome-heading"><span class="eyebrow">${owner?'TU NEGOCIO, A TU RITMO':'TU ESPACIO DE TRABAJO'}</span><h2>Hola, ${esc(actor.name.split(' ')[0])}.</h2><p>${owner?'Elige con qué quieres empezar. Los demás servicios quedan disponibles para después.':'Ya eres parte de '+esc(actor.company_name)+'. Aquí encontrarás las tareas que te asignaron.'}</p></div>
 ${form('/bienvenida',actor,owner?`<fieldset class="welcome-options"><legend>¿Por dónde empezamos?</legend>${Object.entries(serviceCatalog).map(([code,s])=>`<label class="welcome-option"><input type="radio" name="service" value="${code}"><span class="service-symbol">${icon(s.icon)}</span><span><strong>${esc(s.name)}</strong><small>${esc(s.description)}</small></span></label>`).join('')}<label class="welcome-option welcome-later"><input type="radio" name="service" value="LATER" checked><span>Explorar primero</span></label></fieldset><p class="welcome-note">Tienes un video de cortesía. Wallet se activa únicamente si lo eliges y confirmas sus condiciones.</p><div class="welcome-footer">${button('Continuar')}</div>`:`<div class="welcome-access">${options.length?options.map(([code,s])=>`<div>${icon(s.icon)}<strong>${esc(code==='WALLET'&&cash?'Wallet · Caja':s.name)}</strong><span>Acceso asignado</span></div>`).join(''):'<p>Tu cuenta está lista. El dueño todavía debe asignarte una tarea o activar el servicio correspondiente.</p>'}</div><p class="welcome-note">Tu cédula y contraseña sirven en todos tus módulos.</p><div class="welcome-footer">${button('Entrar a mi espacio')}</div>`)}
 </section>`;
}
export function inactiveServicePage(actor,service) {
 const item=serviceCatalog[service];
 return card(item.name,`<p>${actor.kind==='OWNER'?'Este servicio todavía no está activado en tu negocio.':'El dueño todavía no ha activado este servicio para el negocio.'}</p>${actor.kind==='OWNER'?localLink('/servicios','Elegir mis servicios','btn'):localLink('/inicio','Volver al inicio','btn secondary')}`);
}
