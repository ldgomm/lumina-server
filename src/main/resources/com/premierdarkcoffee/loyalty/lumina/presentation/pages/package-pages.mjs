import { campaignLabel } from './campaign-pages.mjs';
import { offerAvailable, campaignNotice } from '../../campaigns/season.mjs';
import { contactField, contactLine } from './contact.mjs';
import { describeOffer, serviceName } from '../../memberships/catalog.mjs';
import { contentOptions } from '../../content/service-options.mjs';
import { icon } from './icons.mjs';
import { areas, formats, localDay, services, uuid } from '../../shared/domain.mjs';
import { inclusiveEnd } from '../../memberships/orders.mjs';
import { firstStatement, walletLine } from '../../memberships/calendar.mjs';
import { includesWallet } from '../../memberships/wallet-checkout.mjs';
import { badge, button, card, check, disclosure, displayAmount, esc, form, hidden, input, label, localLink, message, select, table, textarea, timestamp } from './components.mjs';

const termName=plan=>plan.months===12?'Anual':plan.term==='MONTHLY'?'Mensual':'Trabajo puntual';
const stateName=state=>({REQUESTED:'Selección recibida',QUOTED:'Propuesta lista',ACCEPTED:'Aceptada · por activar',ACTIVE:'Activada',CANCELLED:'Cancelada'}[state]||state);
const walletNote=wallet=>wallet==='NONE'?'':`<p class="commercial-wallet">${wallet==='GIFT'?'Servicio de Wallet de cortesía, sin recargo en este paquete.':'Incluye servicio de Wallet dentro del precio del paquete.'}</p>`;
const itemsList=(items,units=1)=>`<ul class="package-items">${items.map(i=>`<li><strong>${i.quantity*units}</strong> ${esc(i.service==='WALLET'?'servicio de fidelización':serviceName(i.service))}</li>`).join('')}</ul>`;
export function packageNav(url,active='catalog',agency=false) {
  return `<nav class="module-tabs" aria-label="Paquetes y servicios">${[['catalog',agency?'Catálogo':'Contratar'],['agreements',agency?'Acuerdos':'Mis servicios'],['orders',agency?'Propuestas':'Solicitudes'],['campaigns','Viernes Negro']].map(([key,title])=>
    `<a href="${esc(key==='campaigns'?url('/plans/black-friday'):url('/plans',{view:key}))}"${active===key?' aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
}
export function totalsPanel(totals,lines=null) {
  return `<div class="commercial-totals">${[['MONTHLY','Por mes'],['ANNUAL','Por año'],['ONE_OFF','Una sola vez']].filter(([term])=>!lines?Boolean(totals[term]):lines.some(line=>(line.months===12?'ANNUAL':line.term)===term)).map(([term,name])=>{
    const value=totals[term];
    return `<div><span>${name}</span><strong>${value.pending?'Por cotizar':esc(displayAmount(value.amount))}</strong><small>${value.pending?`${value.pending} oferta(s) por cotizar; aún no hay total definitivo. Subtotal con precio: ${esc(displayAmount(value.amount))}.`:'Importe total de esta modalidad.'}</small></div>`;
  }).join('')}</div>`;
}
export function catalog(actor,company,url,plans,values={}) {
  const selectable=actor.kind==='OWNER'&&Boolean(company),active=plans.filter(p=>offerAvailable(p)).sort((a,b)=>Number(Boolean(b.campaign))-Number(Boolean(a.campaign)));
  const cards=active.map(plan=>{
    const info=describeOffer(plan);
    return `<article class="package-card price-card ${plan.campaign?'bf-'+plan.campaign.theme:''}" id="offer-${esc(plan.id)}" data-package data-kind="${info.kind}" data-areas="${info.areas.join(' ')}" data-name="${esc(plan.name)}" data-term="${plan.months===12?'ANNUAL':plan.term}" data-price="${plan.price_minor??''}">
      <div class="offer-labels">${badge(info.kind==='individual'?'Individual':'Paquete')}${badge(termName(plan))}</div>
      <h3>${esc(plan.name)}</h3><p class="package-price">${plan.price_minor===null?'Por cotizar':esc(displayAmount(plan.price_minor))}<small>${plan.months===12?'por año':plan.term==='MONTHLY'?(plan.campaign?'primer período mensual':'por mes'):'pago único'}</small></p>
      ${campaignLabel(plan)}${info.unitMinor!==null?`<p class="unit-price">≈ ${esc(displayAmount(info.unitMinor))} por unidad · referencia dentro de este paquete</p>`:''}
      <p class="prewrap">${esc(plan.description)}</p><h4>Incluye${plan.months===12?' cada año':plan.term==='MONTHLY'?(plan.campaign?' este período':' cada mes'):''}</h4>${itemsList(plan.items)}${walletNote(plan.wallet)}
      ${selectable&&plan.blockedNow&&plan.blockedNext?`<p class="member-selected">${esc(plan.blockedNow)}</p>`:selectable?`<div class="offer-selection" data-now="${esc(plan.blockedNow||'')}" data-next="${esc(plan.blockedNext||'')}">${plan.blockedNow||plan.blockedNext?`<p data-period-note>${esc(plan.blockedNow||plan.blockedNext)} ${plan.blockedNow?'Elige el próximo período para revisar un cambio.':''}</p>`:''}<span>${info.kind==='individual'?'Cantidad':'Número de paquetes'}</span><div class="quantity-control"><button type="button" data-quantity-change="-1" aria-label="Quitar una unidad de ${esc(plan.name)}" hidden>−</button><label><span class="sr-only">Cantidad de ${esc(plan.name)}</span><input type="number" name="qty_${plan.id}" min="0" max="${plan.wallet!=='NONE'?1:10}" step="1" value="${esc(values['qty_'+plan.id]??'0')}" data-package-quantity></label><button type="button" data-quantity-change="1" aria-label="Añadir una unidad de ${esc(plan.name)}" hidden>+</button></div></div>`:''}</article>`;
  }).join('');
  const selection=`<div class="catalog-offers"><details class="catalog-filter-options" data-catalog-filters hidden><summary>Filtrar ofertas <span data-active-filters></span></summary><div class="catalog-filters">${select('catalog_kind','Tipo de oferta',[['','Todas'],['individual','Servicios individuales'],['package','Paquetes']])}${select('catalog_area','Servicio',[['','Todos los servicios'],...Object.entries(areas)])}${select('catalog_term','Modalidad',[['','Todas'],['MONTHLY','Mensual'],['ANNUAL','Anual'],['ONE_OFF','Pago único']])}<button type="button" class="secondary" data-clear-filters>Ver todas</button></div></details><p class="muted" data-catalog-count aria-live="polite"></p><div class="package-grid">${cards||message('Todavía no hay precios publicados. Lúmina debe publicar sus servicios y paquetes; mientras tanto, puedes solicitar una cotización.')}</div><p data-catalog-empty hidden>No hay ofertas con estos filtros. Prueba otra modalidad o servicio.</p>${actor.kind==='OWNER'?localLink(url('/requests/new'),'¿Necesitas algo distinto? Pide una cotización →'):''}</div>`;
  const summary=selectable&&active.length?`<aside class="selection-summary" id="your-selection" tabindex="-1"><h3>Tu selección</h3><p>Combina servicios sueltos y paquetes como necesites.</p><div data-package-lines><p>Elige un servicio para ver el total.</p></div><div data-package-totals aria-live="polite"><p>Revisaremos los importes antes de confirmar.</p></div>
    ${select('start_when','¿Cuándo quieres empezar?',[['TODAY','Ahora'],['NEXT_MONTH','El próximo mes']],values.start_when||'TODAY')}${contactField(values.phone??company.phone)}${disclosure('Añadir una indicación (opcional)',textarea('notes','Detalles para tu propuesta','maxlength="2000" rows="3" placeholder="Puedes pedir ajustes o combinar servicios."',values.notes||''))}<p class="purchase-note">Revisa el total y las condiciones antes de contratar. Wallet se activa al confirmar una oferta con precio publicado.</p>${hidden('key',values.key||uuid())}${button('Revisar selección')}</aside>`:'';
  return selectable&&active.length?form(url('/plans/request'),actor,selection+summary+'<a class="selection-jump" href="#your-selection" data-selection-jump hidden><span data-selection-count></span><strong>Revisar selección →</strong></a>','package-selection catalog-layout'):`<div class="catalog-layout catalog-readonly">${selection}</div>`;
}
function publishForm(actor,url) {
  return `<section class="catalog-editor"><div class="split"><div><h2>Tu catálogo</h2><p>Publica un servicio o un paquete en tres pasos: servicios, precio y revisión.</p></div>${localLink(url('/plans/new'),'Crear oferta','btn')}</div></section>`;
}
function contractsPanel(actor,company,url,contracts) {
  if(!company)return message('Selecciona un negocio para consultar sus acuerdos.');
  const current=contracts.filter(c=>!c.cancelled_at&&c.starts_on<=localDay()&&c.ends_before>localDay());
  const monthly=current.filter(c=>c.term==='MONTHLY'&&c.months!==12).reduce((s,c)=>s+c.agreed_minor,0);
  const annual=current.filter(c=>c.months===12).reduce((s,c)=>s+c.agreed_minor,0);
  return `${actor.kind==='OWNER'?localLink('/management/history','Consultar cargos anteriores de Wallet →'):''}<section class="agreement-summary"><span>Mensualidad de los acuerdos vigentes hoy</span><strong>${esc(displayAmount(monthly))}</strong>${annual?`<span>Tarifa anual de los acuerdos vigentes</span><strong>${esc(displayAmount(annual))}</strong>`:''}<p>No incluye trabajos puntuales, acuerdos futuros ni períodos finalizados. No es un saldo de deuda.</p></section>
    <p>Los cupos se reservan al iniciar una pieza y se usan al entregarla. Publicarla en varias redes consume una sola pieza. Los cupos no utilizados no se acumulan al siguiente período.</p>
    <p>Los planes de Wallet se gestionan en Mi suscripción de Wallet. Los demás acuerdos muestran sus fechas y la opción de renovar.</p>
    ${contracts.map(c=>{
      const status=c.cancelled_at?'Cancelado':c.starts_on>localDay()?'Programado':c.ends_before<=localDay()?'Finalizado':'Vigente';
      const renew=actor.kind==='OWNER'&&!c.schedule_id&&!c.cancelled_at&&c.term==='MONTHLY'&&c.ends_before>=localDay()&&!contracts.some(n=>n.renewal_of===c.id);
      return `<article class="card"><div class="split"><h2>${esc(c.name)}${c.units>1?' × '+c.units:''}</h2>${badge(status)}</div>
        <p class="agreement-price">${esc(displayAmount(c.agreed_minor))} <small>${c.months===12?'por este período anual':c.term==='MONTHLY'?'por este período mensual':'por este trabajo puntual'}</small></p>
        <p>Desde <strong>${esc(c.starts_on)}</strong> hasta <strong>${esc(inclusiveEnd(c.ends_before))}</strong>, ambos días incluidos.</p>${walletNote(c.wallet)}
        ${table(['Servicio','Incluidos','Entregados','Reservados','Disponibles'],c.items.map(i=>[esc(i.service==='WALLET'?'Servicio de fidelización':serviceName(i.service)),i.quantity,i.used,i.reserved,Math.max(0,i.quantity-i.used-i.reserved)]))}
        ${c.campaign_year?'<p class="bf-help">Promoción de noviembre '+c.campaign_year+'. Este acuerdo conserva lo aceptado. El siguiente período se solicita a la tarifa habitual vigente.</p>':''}
        ${c.schedule_id&&actor.kind==='OWNER'?localLink('/plans/wallet','Gestionar suscripción','btn secondary'):''}
        ${renew?form(url('/plans/request'),actor,hidden('key',uuid())+hidden('renewal',c.id)+button('Solicitar siguiente período','secondary'),'inline'):''}
        ${actor.kind==='AGENCY'&&!actor.readOnlyCompany&&!c.cancelled_at&&c.ends_before>localDay()?disclosure('Cancelar este acuerdo',form(url('/plans/cancel'),actor,
          hidden('contract',c.id)+input('reason','Motivo','text','required minlength="5" maxlength="500"')+
          '<p>Conserva entregas e historial. Detiene nuevas reservas de este acuerdo. Los demás acuerdos y el espacio Wallet continúan.</p>'+button('Cancelar este acuerdo','danger'))):''}
      </article>`;
    }).join('')||message('Todavía no hay acuerdos. Puedes comenzar por el catálogo.')}`;
}
function ordersPanel(actor,company,url,orders) {
  const link=row=>actor.kind==='AGENCY'?(actor.agencyWork||!company?'/agency':'')+'/plans/orders/'+row.id+'?company='+row.company_id:'/plans/orders/'+row.id;
  return card('Solicitudes de contratación',table(['Registro','Negocio','Estado','Versión','Propuesta'],orders.rows.map(o=>[
    esc(timestamp(o.created_at)),esc(o.company_name),badge(stateName(o.status)),o.revision,localLink(link(o),'Revisar combinación →'),
  ]),'Tus combinaciones solicitadas aparecerán aquí.')+`<div class="actions">${orders.page>0?localLink(url('/plans',{view:'orders',page:orders.page-1}),'← Anterior','btn secondary'):''}${orders.more?localLink(url('/plans',{view:'orders',page:orders.page+1}),'Siguiente →','btn secondary'):''}</div>`);
}
export function packagesPage({actor,company,url,plans,contracts,orders,view,values={},error=''}) {
  const intro=`<section class="pricing-intro"><div><h2>Elige tus servicios</h2><p>Agrega un servicio a tu plan actual o elige un paquete. Puedes empezar ahora o el próximo mes.</p></div><div class="pricing-key"><div><strong>Pago único</strong><span>Un trabajo concreto, con entrega y cierre.</span></div><div><strong>Mensual</strong><span>Consulta el precio y la próxima fecha de pago.</span></div></div></section>`;
  return packageNav(url,view,actor.kind==='AGENCY')+(error?`<p class="notice" role="alert">${esc(error)}</p>`:'')+(view==='catalog'?(actor.kind==='AGENCY'&&!actor.readOnlyCompany?publishForm(actor,url):intro)+catalog(actor,company,url,plans,values)+(actor.kind==='AGENCY'&&!actor.readOnlyCompany?disclosure('Retirar ofertas del catálogo',
    plans.filter(p=>p.published).map(p=>form(url('/plans/withdraw'),actor,hidden('plan',p.id)+`<p>${esc(p.name)}</p>`+button('Retirar oferta','secondary'))).join('')):''):
    view==='agreements'?contractsPanel(actor,company,url,contracts):ordersPanel(actor,company,url,orders));
}
export function orderPage({actor,company,url,order,audit,values={},error=''}) {
  const base='/plans/orders/'+order.id;
  const version=hidden('revision',values.revision??order.revision);
  const value=(key,fallback)=>values[key]??fallback;
  const wallet=includesWallet(order),instant=Boolean(order.checkoutHash);
  const confirmed=instant||order.status!=='REQUESTED';
  const walletPlan=order.lines.find(l=>walletLine(l)&&l.term==='MONTHLY'&&l.starts_on&&l.unit_minor!==null);
  let statement='';
  if(walletPlan){
    const price=walletPlan.unit_minor*walletPlan.units;
    const other=(walletPlan.wallet==='GIFT'?walletPlan.unit_minor:walletPlan.other_minor||0)*walletPlan.units;
    const first=firstStatement(walletPlan.starts_on,price-other,walletPlan.campaign?walletPlan.ends_before:null,walletPlan.months);
    statement=`<section class="member-bill"><h3>Tu primer cargo de Wallet</h3>
      ${walletPlan.starts_on<'2027-01-01'?'<p>Wallet es gratis hasta el 31 de diciembre de 2026 inclusive.</p>':''}
      ${first.days&&first.amount?`<p>Se registra el ${esc(first.cut)}. Puedes pagar hasta el ${esc(first.due)}.</p>
      <dl><div><dt>${first.days!==first.monthDays?first.days+' de '+first.monthDays+' días':walletPlan.months===12?'Tarifa anual':'Mes terminado'}</dt><dd>${esc(displayAmount(first.amount))}</dd></div></dl>`:'<p>Wallet de cortesía para este período.</p>'}
      ${other?`<p>Los otros servicios de este paquete cuestan ${esc(displayAmount(other))} por ${walletPlan.months===12?'año':'mes'}. Se registran por separado.</p>`:''}</section>`;

  }
  const lines=order.lines.map(line=>`<article class="package-card"><div class="split">${badge(termName(line))}<span>${line.units} × oferta</span></div><h3>${esc(line.name)}</h3>
    <p><strong>${line.unit_minor===null?'Por cotizar':esc(displayAmount(line.unit_minor*line.units))}</strong> ${line.months===12?'por año':line.term==='MONTHLY'?'por mes':'una sola vez'}${line.units>1&&line.unit_minor!==null?' · '+esc(displayAmount(line.unit_minor))+' por oferta':''}</p>
    ${line.campaign?`<div class="bf-offer-note"><strong>Viernes Negro ${line.campaign.year}</strong><p>${esc(campaignNotice(line.campaign.year))}</p><p>${esc(line.campaign.conditions)}</p>${line.term==='MONTHLY'?'<p>Descuento por este período. Renovación a tarifa habitual y con nueva aceptación.</p>':''}</div>`:''}${itemsList(line.items,line.units)}${walletNote(line.wallet)}${line.starts_on?`<p>${esc(line.starts_on)} al ${esc(inclusiveEnd(line.ends_before))}, ambos incluidos.</p>`:''}</article>`).join('');
  const expired=order.lines.some(l=>l.campaign&&!l.campaign_available)&&['REQUESTED','QUOTED'].includes(order.status);
  const editor=!expired&&actor.kind==='AGENCY'&&!actor.readOnlyCompany&&['REQUESTED','QUOTED'].includes(order.status)?card('Preparar propuesta',form(url(base+'/quote'),actor,version+order.lines.map(line=>`
    <fieldset><legend>${esc(line.name)} × ${line.units}</legend><div class="fields three">
      ${input('price_'+line.id,'Precio por oferta en USD','text','required inputmode="decimal"',value('price_'+line.id,line.unit_minor===null?'':(line.unit_minor/100).toFixed(2)))}
      ${line.renewal_of?'<p>Renovación: conserva el inicio del siguiente período y su día de corte.</p>':input('start_'+line.id,'Fecha de inicio','date','required',value('start_'+line.id,line.starts_on||localDay()))}
      ${line.term==='ONE_OFF'?input('end_'+line.id,'Último día del trabajo puntual','date','required',value('end_'+line.id,line.ends_before?inclusiveEnd(line.ends_before):'')):line.months===12?'<p>Los cupos corresponden al período anual.</p>':'<p>Los cupos corresponden al período mensual.</p>'}</div></fieldset>`).join('')+
    textarea('terms','Alcance, plazos, revisiones y condiciones de pago','required minlength="5" maxlength="4000" rows="5"',value('terms',order.terms))+
    '<p class="muted">El cliente debe aceptar esta versión. Prepararla no envía correos ni realiza cobros.</p>'+button('Dejar propuesta lista para el cliente'))):'';
  const accept=!expired&&actor.kind==='OWNER'&&(instant||order.status==='QUOTED'||wallet&&order.status==='ACCEPTED')?card('Confirma tu combinación',form(url(base+'/accept'),actor,version+(instant?hidden('offerHash',order.checkoutHash):'')+
    check('confirm','Revisé los servicios, precios, fechas y condiciones de esta propuesta.',false,true)+button(order.start_when==='NEXT_MONTH'?'Confirmar para el próximo período':wallet?'Aceptar y activar Wallet':'Aceptar esta propuesta')),
    order.start_when==='NEXT_MONTH'?'Tus servicios actuales siguen disponibles hasta la fecha del cambio.':wallet?'Wallet estará lista para configurar y usar. Sin esperar aprobación y sin débito bancario.':'Lúmina activará los acuerdos después de tu aceptación. Este botón no debita dinero.') : '';
  const activate=actor.kind==='AGENCY'&&!actor.readOnlyCompany&&order.status==='ACCEPTED'?card('Aceptada por el dueño',form(url(base+'/activate'),actor,version+button('Activar todos los acuerdos aceptados')),
    'Cada oferta mantiene sus fechas y cupos. La activación es conjunta y no ejecuta un cobro bancario.') : '';
  const cancel=!actor.readOnlyCompany&&!['ACTIVE','CANCELLED'].includes(order.status)?disclosure('Cancelar esta propuesta',form(url(base+'/cancel'),actor,version+
    input('reason','Motivo','text','required minlength="5" maxlength="500"')+button('Cancelar propuesta','danger'))):'';
  const next=instant?(order.start_when==='NEXT_MONTH'?'Revisa el precio y la fecha. Al aceptar, tu cambio quedará programado.':'Revisa el precio y las condiciones. Al aceptar podrás entrar a Wallet.'):wallet&&order.status==='ACCEPTED'?'Tu propuesta ya está aceptada. Continúa para abrir Wallet.':{REQUESTED:'Lúmina revisará tu selección y preparará el precio final.',QUOTED:'Revisa el precio, las fechas y las condiciones. El dueño confirma la propuesta.',ACCEPTED:'La propuesta está aceptada. Lúmina debe activar los servicios acordados.',ACTIVE:'Tus servicios están activados. Consulta las fechas y los cupos en Mis servicios.',CANCELLED:'Esta propuesta está cancelada. Puedes elegir otra combinación en el catálogo.'}[order.status];
  return packageNav(url,'orders',actor.kind==='AGENCY')+(error?`<div class="feedback-error" role="alert"><strong>Revisa la propuesta</strong><p>${esc(error)}</p>${localLink(url(base),'Recargar la versión guardada')}</div>`:'')+`<div class="split"><p>${badge(instant?'Lista para activar':stateName(order.status))} · Versión ${order.revision}</p>${localLink(url('/plans',{view:'agreements'}),'Ver acuerdos','btn secondary')}</div>
    <aside class="request-next"><strong>Siguiente paso</strong><p>${esc(next)}</p></aside>${contactLine(order.contact_phone,company.phone)}${statement}${totalsPanel(order.totals,order.lines)}<p>${confirmed?'Precio final de esta contratación.':'Los servicios sin precio o plazo definido necesitan una cotización.'} El total mensual y el pago único se muestran por separado.</p>
    <div class="package-grid">${lines}</div>${order.notes?card('Tus indicaciones',`<p class="prewrap">${esc(order.notes)}</p>`):''}
    ${order.terms?card('Condiciones de la propuesta',`<p class="prewrap">${esc(order.terms)}</p>`):''}
    <p class="muted">Una pieza cuenta una sola vez aunque se publique en varias redes. Los cupos no usados no se acumulan. Consulta las condiciones de renovación y las fechas de cada acuerdo.</p>
    ${wallet&&order.status==='ACTIVE'&&actor.kind==='OWNER'?localLink('/wallet','Abrir Wallet','btn'):''}${expired?card('La promoción ya no está disponible','<p>Esta propuesta no se puede aceptar. Puedes elegir las ofertas vigentes del catálogo.</p>'+localLink(url('/plans'),'Ver servicios y precios','btn')):''}${editor}${accept}${activate}${cancel}${disclosure('Historial de esta contratación',table(['Fecha','Responsable','Acción'],audit.map(row=>[esc(timestamp(row.happened_at)),esc(row.actor_name),esc(row.action.replaceAll('_',' '))])))}`;
}
