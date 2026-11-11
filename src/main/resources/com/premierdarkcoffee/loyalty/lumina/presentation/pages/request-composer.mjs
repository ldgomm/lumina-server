import { can } from '../../access/accounts.mjs';
import { areas, formats, services } from '../../shared/domain.mjs';
import { contentOptions } from '../../content/service-options.mjs';
import { requestCommercial, serviceName } from '../../memberships/catalog.mjs';
import { badge, button, card, displayAmount, esc, form, hidden, input, localLink, select, textarea } from './components.mjs';
import { icon } from './icons.mjs';
const details={SOCIAL:['social','Videos, fotografías y diseños para comunicar tu negocio.'],WALLET:['wallet','Diseño de tarjetas, promociones y programa de fidelización.'],MAPS:['maps','Información, fotografías, reseñas y presencia en Google Maps.'],WEB:['web','Páginas, tiendas, catálogos y mantenimiento.'],BRAND:['plans','Logo e identidad visual para tu negocio.']};
export function serviceChoices(actor,url) {
  return `<div class="service-choice-grid">${Object.entries(areas).filter(([scope])=>can(actor,scope,'REQUEST')).map(([scope,name])=>`<a class="service-choice" href="${esc(url('/solicitudes/nueva',{area:scope}))}"><span class="service-symbol">${icon(details[scope][0])}</span><h3>${esc(name)}</h3><p>${details[scope][1]}</p><span class="choice-action">Elegir servicio ${icon('arrow')}</span></a>`).join('')}</div>`;
}
export function priceGuide(actor,url,area,plans=[],contracts=[]) {
  if(actor.kind!=='OWNER')return '';
  const entries=requestCommercial(plans,contracts,area);
  return `<aside class="request-price-guide"><p class="eyebrow">PRECIOS Y CUPOS</p><h2>Antes de solicitar</h2>${entries.map(entry=>{
    const priced=entry.offers.filter(o=>o.price!==null);
    const offers=priced.slice(0,4).map(o=>`<li><span>${esc(o.name)} · ${o.quantity} ${esc(serviceName(entry.service))}</span><strong>${esc(displayAmount(o.price))}<small>${o.term==='MONTHLY'?' / mes':' · pago único'}</small></strong></li>`).join('');
    const quotas=entry.available.filter(i=>i.remaining>0);
    return `<section data-price-service="${esc(entry.service)}"><h3>${esc(serviceName(entry.service))}</h3>${offers?`<ul>${offers}</ul>`:'<p class="muted">Precio a cotizar según lo que necesites.</p>'}${quotas.length?`<p class="available-quota">${quotas.reduce((n,q)=>n+q.remaining,0)} cupo(s) disponibles en tus acuerdos.</p>`:''}</section>`;
  }).join('')}<p class="muted">Precios publicados en USD. Los cupos se asignan al iniciar la producción; enviar la solicitud no los reserva ni realiza un cobro.</p>${localLink(url('/planes'),'Comparar precios y paquetes →')}</aside>`;
}
export function composer(actor,url,{area='SOCIAL',onlySocial=false,values={}}={}) {
  if(actor.kind==='AGENCY'||!can(actor,area,'REQUEST'))return '';
  const choices=area==='SOCIAL'?contentOptions:formats[area].filter(s=>s!=='WEB').map(s=>[s,services[s]]);
  const hints={VIDEO:'Grabación y edición para contar tu idea.',PHOTO:'Imágenes de tus productos o de tu negocio.',GRAPHIC:'Diseños para promociones, novedades y anuncios.'};
  const serviceControl=area==='SOCIAL'?`<fieldset class="choice-field"><legend>¿Qué necesitas?</legend><div class="format-choices">${choices.map(([value,name],i)=>`<label class="format-choice"><input type="radio" name="service" value="${value}"${(values.service?values.service===value:i===0)?' checked':''} required><span><strong>${esc(name)}</strong><small>${hints[value]}</small></span></label>`).join('')}</div></fieldset>`:select('service','Elige el servicio',choices,values.service);
  return form(url('/solicitudes'),actor,`<div data-request-composer>
    ${hidden('channel',area)}${hidden('composer',onlySocial?'content':'service')}${onlySocial?hidden('type','CONTENT'):select('type','¿Cómo quieres empezar?',[
      ['CONTENT','Quiero solicitar el servicio'],...(actor.kind==='OWNER'?[['QUOTE','Quiero una cotización']]:[]),...(area==='SOCIAL'?[['VISIT','Quiero coordinar una grabación']]:[])],values.type)}
    ${serviceControl}
    ${input('title','¿Qué quieres lograr?','text','required minlength="2" maxlength="150" placeholder="Por ejemplo: presentar nuestro nuevo menú"',values.title||'')}
    ${textarea('brief','Cuéntanos tu idea','maxlength="4000" rows="4" placeholder="Describe lo que necesitas. Nosotros te ayudamos con los detalles."',values.brief||'')}
    <div class="composer-details" data-quantity>${input('quantity','Cantidad','number','min="1" max="100" required',values.quantity||'1')}<p>Solicita una pieza o varias. ${area==='SOCIAL'?'La misma pieza puede usarse en todas tus redes.':'Coordinaremos el alcance antes de comenzar.'}</p></div>
    ${!onlySocial&&area==='SOCIAL'?`<div data-visit>${input('preferred','Fecha y hora que te conviene (opcional)','datetime-local','',values.preferred||'')}<p class="muted">Te confirmaremos la disponibilidad. Esta fecha es una sugerencia.</p></div>`:''}
    <div class="request-submit"><p>Revisaremos tu idea y coordinaremos contigo el siguiente paso. Cualquier costo adicional se acuerda antes de comenzar.</p>${button('Enviar solicitud')}</div></div>`,'request-composer');
}
export function newRequestPage({actor,url,area,plans,contracts,values={},error=''}) {
  if(!area)return `<div class="request-intro"><p class="eyebrow">PASO 1 DE 2</p><h2>¿En qué te ayudamos?</h2><p>Elige un servicio. Después cuéntanos tu idea con tus propias palabras.</p></div>${serviceChoices(actor,url)}`;
  return `<div class="request-heading"><div><p class="eyebrow">PASO 2 DE 2</p><h2>${esc(areas[area])}</h2><p>${details[area][1]}</p></div>${localLink(url('/solicitudes/nueva'),'Cambiar servicio','btn secondary')}</div>
    <div class="request-workspace">${card('Cuéntanos qué necesitas',(error?`<p class="notice" role="alert">${esc(error)} Conservamos tu información para que puedas corregirla.</p>`:'')+composer(actor,url,{area,onlySocial:values.composer==='content',values}))}${priceGuide(actor,url,area,plans,contracts)}</div>`;
}
export function requestCards(rows,url) {
  const states={NEW:'Lúmina revisará tu solicitud.',REVIEW:'Estamos revisando los detalles.',QUOTED:'Tu cotización está lista para revisar.',APPROVED:'La solicitud está lista para coordinar.',SCHEDULED:'Revisa la fecha confirmada de tu grabación.',PRODUCTION:'Estamos trabajando en tu contenido.',DELIVERED:'Tus entregas están disponibles.',CANCELLED:'Consulta el historial de esta solicitud.'};
  return `<div class="request-list">${rows.map(row=>`<a class="request-record" href="${esc(url('/solicitudes/'+row.id))}"><span class="service-symbol">${icon(details[row.channel]?.[0]||'content')}</span><div><div class="request-record-meta">${esc(areas[row.channel]||row.channel)} · ${esc(serviceName(row.service))} · ${row.quantity}</div><h3>${esc(row.title)}</h3><p>${states[row.status]||'Consulta los detalles y el avance.'}</p></div><div class="request-record-state">${badge(row.status,row.status==='DELIVERED'?'success':'')}<span>Ver detalle →</span></div></a>`).join('')||'<div class="request-empty"><h3>Tu próxima idea empieza aquí.</h3><p>Cuando envíes una solicitud, podrás seguir su avance y revisar las entregas en este espacio.</p></div>'}</div>`;
}
