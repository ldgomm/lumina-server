import { areas, formats, localDay, services, uuid } from '../../shared/domain.mjs';
import { inclusiveEnd } from '../../memberships/orders.mjs';
import { badge, button, card, check, disclosure, displayAmount, esc, form, hidden, input, label, localLink, message, select, table, textarea, timestamp } from './components.mjs';

const termName=term=>term==='MONTHLY'?'Mensual':'Trabajo puntual';
const stateName=state=>({REQUESTED:'Por cotizar',QUOTED:'Propuesta lista',ACCEPTED:'Aceptada · por activar',ACTIVE:'Activada',CANCELLED:'Cancelada'}[state]||state);
const walletNote=wallet=>wallet==='NONE'?'':`<p class="commercial-wallet">${wallet==='GIFT'?'Servicio de Wallet de cortesía, sin recargo en este paquete.':'Incluye servicio de Wallet dentro del precio del paquete.'}</p>`;
const itemsList=(items,units=1)=>`<ul class="package-items">${items.map(i=>`<li><strong>${i.quantity*units}</strong> ${esc(i.service==='WALLET'?'servicio de fidelización':label(i.service))}</li>`).join('')}</ul>`;
export function packageNav(url,active='catalogo') {
  return `<nav class="module-tabs" aria-label="Paquetes y servicios">${[['catalogo','Catálogo'],['acuerdos','Mis acuerdos'],['contrataciones','Propuestas']].map(([key,title])=>
    `<a href="${esc(url('/planes',{vista:key}))}"${active===key?' aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
}
export function totalsPanel(totals) {
  return `<div class="commercial-totals">${[['MONTHLY','Por mes'],['ONE_OFF','Una sola vez']].map(([term,name])=>{
    const value=totals[term];
    return `<div><span>${name}</span><strong>${esc(displayAmount(value.amount))}</strong><small>${value.pending?`${value.pending} oferta(s) por cotizar; aún no hay total definitivo.`:'Importe total de esta modalidad.'}</small></div>`;
  }).join('')}</div>`;
}
function catalog(actor,company,url,plans) {
  const selectable=actor.kind==='OWNER'&&Boolean(company),active=plans.filter(p=>p.published);
  const cards=active.map(plan=>`<article class="package-card" data-package data-term="${plan.term}" data-price="${plan.price_minor??''}">
    <div class="split">${badge(termName(plan.term))}<span class="muted">${plan.items.length===1?'Servicio individual':'Paquete combinado'}</span></div>
    <h3>${esc(plan.name)}</h3><p class="package-price">${plan.price_minor===null?'Por cotizar':esc(displayAmount(plan.price_minor))}<small>${plan.term==='MONTHLY'?' / mes':' · pago único'}</small></p>
    <p class="prewrap">${esc(plan.description)}</p>${itemsList(plan.items)}${walletNote(plan.wallet)}
    ${selectable?input('qty_'+plan.id,'Cantidad de este paquete','number','min="0" max="10" step="1" data-package-quantity','0'):''}</article>`).join('');
  const selection=`<div class="package-grid">${cards||message('Todavía no hay ofertas publicadas. Puedes pedir una cotización a medida desde Solicitudes.')}</div>`;
  const summary=selectable&&active.length?`<section class="selection-summary"><h3>Tu combinación</h3><p>Elige la cantidad de cada oferta que quieras contratar. Puedes mezclar áreas, paquetes mensuales y trabajos puntuales.</p>
    <div data-package-totals aria-live="polite"><p>Los importes y servicios se revisan en la propuesta antes de aceptar.</p></div>
    ${textarea('notes','¿Necesitas algún ajuste?','maxlength="2000" rows="3"')}
    <p class="muted">Enviar esta selección solicita una propuesta. No activa servicios de pago ni realiza cobros.</p>${hidden('key',uuid())}${button('Solicitar propuesta de mi combinación')}</section>`:'';
  return `${!company?message('Las combinaciones las solicita el dueño del negocio desde su cuenta.'):''}
    ${selectable&&active.length?form(url('/planes/solicitar'),actor,selection+summary,'package-selection'):selection}`;
}
function publishForm(actor,url) {
  const seen=new Set(['WALLET']);
  const groups=Object.entries(areas).map(([area,title])=>{
    const codes=formats[area].filter(code=>{if(seen.has(code))return false;seen.add(code);return true;});
    return disclosure(title,`<div class="fields three">${codes.map(code=>input(code,services[code],'number','min="0" max="100"','0')).join('')}</div>`);
  }).join('');
  return disclosure('Publicar un servicio o paquete',form(url('/planes'),actor,`
    <div class="fields three">${input('name','Nombre de la oferta','text','required maxlength="100"')}
    ${select('term','Cómo se contrata',[['MONTHLY','Mensual'],['ONE_OFF','Trabajo puntual']])}
    ${input('price','Precio total por paquete en USD','text','inputmode="decimal" placeholder="Vacío: por cotizar"')}</div>
    ${textarea('description','Alcance del servicio','maxlength="1200" rows="3"')}
    <p>Indica las unidades incluidas. Una sola categoría crea un servicio individual; varias crean un paquete. El precio es por todo el paquete, no por cada pieza.</p>
    <p class="muted">Logo, identidad y manual de marca se ofrecen como trabajo puntual. Las unidades de un paquete mensual corresponden a cada período.</p>${groups}
    ${select('wallet','Servicio de fidelización en este paquete',[['NONE','Sin servicio adicional de Wallet'],['INCLUDED','Servicio de Wallet incluido'],['GIFT','Servicio de Wallet de cortesía']])}
    <p class="muted">Todos los negocios ya tienen su espacio Wallet. Estas opciones describen el servicio comercial de configuración o gestión; no crean ni bloquean tarjetas.</p>${button('Publicar oferta')}`));
}
function contractsPanel(actor,company,url,contracts) {
  if(!company)return message('Selecciona un negocio para consultar sus acuerdos.');
  const current=contracts.filter(c=>!c.cancelled_at&&c.starts_on<=localDay()&&c.ends_before>localDay());
  const monthly=current.filter(c=>c.term==='MONTHLY').reduce((s,c)=>s+c.agreed_minor,0);
  return `<section class="agreement-summary"><span>Mensualidad de los acuerdos vigentes hoy</span><strong>${esc(displayAmount(monthly))}</strong><p>No incluye trabajos puntuales, acuerdos futuros ni períodos finalizados. No es un saldo de deuda.</p></section>
    <p>Los cupos se reservan al iniciar una pieza y se usan al entregarla. Publicarla en varias redes consume una sola pieza. Los cupos no utilizados no se acumulan al siguiente período.</p>
    <p>La renovación mensual se confirma para cada período; no se cobra ni se renueva automáticamente. Un trabajo puntual tiene una fecha acordada de finalización. Para cambiar o cancelar un acuerdo vigente, coordina con Lúmina.</p>
    ${contracts.map(c=>{
      const status=c.cancelled_at?'Cancelado':c.starts_on>localDay()?'Programado':c.ends_before<=localDay()?'Finalizado':'Vigente';
      const renew=actor.kind==='OWNER'&&!c.cancelled_at&&c.term==='MONTHLY'&&c.ends_before>=localDay()&&!contracts.some(n=>n.renewal_of===c.id);
      return `<article class="card"><div class="split"><h2>${esc(c.name)}${c.units>1?' × '+c.units:''}</h2>${badge(status)}</div>
        <p class="agreement-price">${esc(displayAmount(c.agreed_minor))} <small>${c.term==='MONTHLY'?'por este período mensual':'por este trabajo puntual'}</small></p>
        <p>Desde <strong>${esc(c.starts_on)}</strong> hasta <strong>${esc(inclusiveEnd(c.ends_before))}</strong>, ambos días incluidos.</p>${walletNote(c.wallet)}
        ${table(['Servicio','Incluidos','Entregados','Reservados','Disponibles'],c.items.map(i=>[esc(i.service==='WALLET'?'Servicio de fidelización':label(i.service)),i.quantity,i.used,i.reserved,Math.max(0,i.quantity-i.used-i.reserved)]))}
        ${renew?form(url('/planes/solicitar'),actor,hidden('key',uuid())+hidden('renewal',c.id)+button('Solicitar siguiente período','secondary'),'inline'):''}
        ${actor.kind==='AGENCY'&&!actor.readOnlyCompany&&!c.cancelled_at&&c.ends_before>localDay()?disclosure('Cancelar este acuerdo',form(url('/planes/cancelar'),actor,
          hidden('contract',c.id)+input('reason','Motivo','text','required minlength="5" maxlength="500"')+
          '<p>Conserva entregas e historial. Detiene nuevas reservas de este acuerdo. Los demás acuerdos y el espacio Wallet continúan.</p>'+button('Cancelar este acuerdo','danger'))):''}
      </article>`;
    }).join('')||message('Todavía no hay acuerdos. Puedes comenzar por el catálogo.')}`;
}
function ordersPanel(actor,company,url,orders) {
  const link=row=>actor.kind==='AGENCY'?(actor.agencyWork||!company?'/agencia':'')+'/planes/pedidos/'+row.id+'?empresa='+row.company_id:'/planes/pedidos/'+row.id;
  return card('Propuestas de contratación',table(['Registro','Negocio','Estado','Versión','Propuesta'],orders.rows.map(o=>[
    esc(timestamp(o.created_at)),esc(o.company_name),badge(stateName(o.status)),o.revision,localLink(link(o),'Revisar combinación →'),
  ]),'Tus combinaciones solicitadas aparecerán aquí.')+`<div class="actions">${orders.page>0?localLink(url('/planes',{vista:'contrataciones',pagina:orders.page-1}),'← Anterior','btn secondary'):''}${orders.more?localLink(url('/planes',{vista:'contrataciones',pagina:orders.page+1}),'Siguiente →','btn secondary'):''}</div>`);
}
export function packagesPage({actor,company,url,plans,contracts,orders,view}) {
  const intro=`<section class="module-lead"><p class="eyebrow">A TU MEDIDA</p><h2>Elige lo que tu negocio necesita.</h2><p>Un servicio por separado o varios en un paquete. Combina las áreas que quieras y revisa cada precio antes de confirmar.</p>
    <div class="purchase-options"><div><strong>Mensual</strong><span>Servicios y cupos para cada período de un mes.</span></div><div><strong>Trabajo puntual</strong><span>Un proyecto o una cantidad concreta, con inicio y cierre.</span></div></div></section>`;
  return packageNav(url,view)+(view==='catalogo'?intro+catalog(actor,company,url,plans)+(actor.kind==='AGENCY'&&!actor.readOnlyCompany?publishForm(actor,url)+disclosure('Retirar ofertas del catálogo',
    plans.filter(p=>p.published).map(p=>form(url('/planes/retirar'),actor,hidden('plan',p.id)+`<p>${esc(p.name)}</p>`+button('Retirar oferta','secondary'))).join('')):''):
    view==='acuerdos'?contractsPanel(actor,company,url,contracts):ordersPanel(actor,company,url,orders));
}
export function orderPage({actor,company,url,order,audit}) {
  const base='/planes/pedidos/'+order.id;
  const version=hidden('revision',order.revision);
  const confirmed=order.status!=='REQUESTED';
  const lines=order.lines.map(line=>`<article class="package-card"><div class="split">${badge(termName(line.term))}<span>${line.units} paquete(s)</span></div><h3>${esc(line.name)}</h3>
    <p><strong>${line.unit_minor===null?'Por cotizar':esc(displayAmount(line.unit_minor*line.units))}</strong> ${line.term==='MONTHLY'?'por mes':'una sola vez'}${line.units>1&&line.unit_minor!==null?' · '+esc(displayAmount(line.unit_minor))+' por paquete':''}</p>
    ${itemsList(line.items,line.units)}${walletNote(line.wallet)}${line.starts_on?`<p>${esc(line.starts_on)} al ${esc(inclusiveEnd(line.ends_before))}, ambos incluidos.</p>`:''}</article>`).join('');
  const editor=actor.kind==='AGENCY'&&!actor.readOnlyCompany&&['REQUESTED','QUOTED'].includes(order.status)?card('Preparar propuesta',form(url(base+'/cotizar'),actor,version+order.lines.map(line=>`
    <fieldset><legend>${esc(line.name)} × ${line.units}</legend><div class="fields three">
      ${input('price_'+line.id,'Precio por paquete en USD','text','required inputmode="decimal"',line.unit_minor===null?'':(line.unit_minor/100).toFixed(2))}
      ${line.renewal_of?'<p>Renovación: conserva el inicio del siguiente período y su día de corte.</p>':input('start_'+line.id,'Fecha de inicio','date','required',line.starts_on||localDay())}
      ${line.term==='ONE_OFF'?input('end_'+line.id,'Último día del trabajo puntual','date','required',line.ends_before?inclusiveEnd(line.ends_before):''):'<p>Duración: un mes. Los cupos corresponden a ese período.</p>'}</div></fieldset>`).join('')+
    textarea('terms','Alcance, plazos, revisiones y condiciones de pago','required minlength="5" maxlength="4000" rows="5"',order.terms)+
    '<p class="muted">El cliente debe aceptar esta versión. Prepararla no envía correos ni realiza cobros.</p>'+button('Dejar propuesta lista para el cliente'))):'';
  const accept=actor.kind==='OWNER'&&order.status==='QUOTED'?card('Confirma tu combinación',form(url(base+'/aceptar'),actor,version+
    check('confirm','Revisé los servicios, precios, fechas y condiciones de esta propuesta.',false,true)+button('Aceptar esta propuesta')),
    'Lúmina activará los acuerdos después de tu aceptación. Este botón no debita dinero.') : '';
  const activate=actor.kind==='AGENCY'&&!actor.readOnlyCompany&&order.status==='ACCEPTED'?card('Aceptada por el dueño',form(url(base+'/activar'),actor,version+button('Activar todos los acuerdos aceptados')),
    'Cada oferta mantiene sus fechas y cupos. La activación es conjunta y no ejecuta un cobro bancario.') : '';
  const cancel=!actor.readOnlyCompany&&!['ACTIVE','CANCELLED'].includes(order.status)?disclosure('Cancelar esta propuesta',form(url(base+'/cancelar'),actor,version+
    input('reason','Motivo','text','required minlength="5" maxlength="500"')+button('Cancelar propuesta','danger'))):'';
  return packageNav(url,'contrataciones')+`<div class="split"><p>${badge(stateName(order.status))} · Versión ${order.revision}</p>${localLink(url('/planes',{vista:'acuerdos'}),'Ver acuerdos','btn secondary')}</div>
    ${totalsPanel(order.totals)}<p>${confirmed?'Importes de esta propuesta.':'Importes de referencia del catálogo, sujetos a la propuesta final.'} El total mensual y el pago único se muestran por separado.</p>
    <div class="package-grid">${lines}</div>${order.notes?card('Tus indicaciones',`<p class="prewrap">${esc(order.notes)}</p>`):''}
    ${order.terms?card('Condiciones de la propuesta',`<p class="prewrap">${esc(order.terms)}</p>`):''}
    <p class="muted">Una pieza cuenta una sola vez aunque se publique en varias redes. Los cupos no usados no se acumulan. Las renovaciones requieren una nueva confirmación. El espacio Wallet permanece disponible con tu cuenta.</p>
    ${editor}${accept}${activate}${cancel}${disclosure('Historial de esta contratación',table(['Fecha','Responsable','Acción'],audit.map(row=>[esc(timestamp(row.happened_at)),esc(row.actor_name),esc(row.action.replaceAll('_',' '))])))}`;
}
