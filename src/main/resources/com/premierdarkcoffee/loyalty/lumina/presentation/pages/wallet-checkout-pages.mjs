import { serviceName } from '../../memberships/catalog.mjs';
import { inclusiveEnd } from '../../memberships/orders.mjs';
import { paidFrom, nextCut, walletLine } from '../../memberships/calendar.mjs';
import { standardIds } from '../../memberships/trial.mjs';
import { localDay, uuid } from '../../shared/domain.mjs';
import { button, check, displayAmount, esc, form, hidden, localLink } from './components.mjs';
import { contactField } from './contact.mjs';

const shortDay=day=>new Intl.DateTimeFormat('es-EC',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const includesWallet=walletLine;
const bundled=plan=>plan.items.some(i=>i.service!=='WALLET');
function tile(actor,company,plan,current,booked,legacy) {
  const price=plan.price_minor===null?'Por cotizar':esc(displayAmount(plan.price_minor));
  const present=current.find(contract=>contract.plan_id===plan.id);
  const recurring=present?.schedule_id && !present.stop_on;
  const future=booked.some(row=>row.plan_id===plan.id);
  const existing=current.length>0 || booked.length>0 || legacy;
  let action;
  if(plan.blockedNow && plan.blockedNext)action=`<p class="member-selected">${future?'Cambio programado':present?'Tu plan actual':'Ya incluido o solicitado'}</p><p>${esc(plan.blockedNext)}</p>`;
  else if(recurring || future)action=`<p class="member-selected">${future?'Cambio programado':'Tu plan actual'}</p>`;
  else action=form('/plans/request',actor,hidden('qty_'+plan.id,'1')+hidden('start_when',existing||plan.blockedNow?'NEXT_MONTH':'TODAY')
    +hidden('key',uuid())+(company.phone?hidden('phone',company.phone):contactField(''))+button(plan.price_minor===null?'Solicitar precio':present?'Revisar renovación':existing&&plan.months===12?'Cambiar a anual':existing?'Revisar cambio':'Elegir este plan'));
  return `<article class="member-offer${present?' member-current':''}"><h3>${esc(plan.name)}</h3>
    <p class="member-price">${price} ${plan.price_minor===null?'':`<small>${plan.months===12?'/ año':plan.term==='MONTHLY'?'/ mes':'por única vez'}</small>`}</p>
    ${standardIds.includes(plan.id)?'<p>Por sucursal. Verás el total antes de confirmar.</p>':''}${plan.description?`<p>${esc(plan.description)}</p>`:''}<ul>${plan.items.map(i=>`<li>${i.service==='WALLET'?'Tarjetas de fidelización para tus clientes':esc(i.quantity+' × '+serviceName(i.service))}</li>`).join('')}</ul>${action}</article>`;
}
export function walletCheckoutPage({actor,company,plans,contracts,orders,active,legacy=false,error='',filter='all',booked=[],account=null,pending=false,trial=null}) {
  if(trial){
    const action=(choice,title,secondary=false)=>form('/plans/wallet/choice',actor,hidden('choice',choice)+button(title,secondary?'secondary':''));
    return `<div class="member-plans"><section class="member-summary"><div><span>Wallet</span><h2>${trial.enabled?'Tu prueba está activa':'Prueba Wallet gratis'}</h2>
      <p>Usa las tarjetas de fidelización hasta el 31 de diciembre de 2026.</p>
      <p>El 1 de enero te preguntaremos si quieres continuar con un plan mensual o anual. Tú decides cuándo empezar.</p>
      ${pending?'<p role="status">Estamos actualizando el acceso a las tarjetas. Vuelve a consultar en un momento.</p>':''}<div class="actions">${trial.enabled?(pending?'':localLink('/wallet','Abrir Wallet','btn')):action('start','Activar prueba gratuita')}</div></div>
      <dl><div><dt>Precio de la prueba</dt><dd>${esc(displayAmount(0))}</dd></div><div><dt>Renovación automática</dt><dd>Desactivada</dd></div></dl></section>
      ${trial.enabled?`<details class="member-manage"><summary>Desactivar la prueba</summary><p>Se pausarán las tarjetas. Si vuelves, tus clientes conservarán sus puntos y sus tarjetas.</p>${action('stop','Desactivar prueba',true)}</details>`:''}</div>`;
  }
  const today=localDay(),current=contracts.filter(includesWallet);
  const currentTitle=current.map(c=>c.name).join(' + ') || (legacy?'Wallet':'');
  const late=account?.access?.overdueSuspension, balance=account?.summary?.balanceMinor||0;
  const ongoing=orders.rows.filter(o=>['REQUESTED','QUOTED','ACCEPTED'].includes(o.status)&&o.wallet);
  const catalog=plans.filter(includesWallet);
  const offers=catalog.filter(p=>filter==='all'||(filter==='packages')===bundled(p)).sort((a,b)=>Number(bundled(a))-Number(bundled(b))||a.months-b.months);
  const currentSchedule=current.find(c=>c.schedule_id);
  const firstPaid=currentSchedule && (currentSchedule.starts_on<paidFrom?paidFrom:currentSchedule.starts_on);
  const firstCut=firstPaid && nextCut(firstPaid);
  const fallbackCut=firstCut && (firstCut>today?firstCut:currentSchedule.months===12?nextCut(currentSchedule.ends_before):nextCut(today));
  const cuts=account && Object.hasOwn(account,'nextWalletChargeOn') ? account.nextWalletChargeOn : fallbackCut||account?.membership?.nextChargeOn;
  const firstCharge=account?.summary?.nextDueOn;
  return `<div class="member-plans">
    ${!currentTitle&&!booked.length?`<section class="member-heading"><h2>¿Quieres activar Wallet?</h2><p>Elige mensual o anual. El servicio de pago empieza cuando confirmas. Puedes detener la renovación desde aquí.</p></section>`:''}
    ${error?`<p class="notice" role="alert">${esc(error)}</p>`:''}
    ${currentTitle||active||booked.length?`<section class="member-summary"><div><span>Mi suscripción</span><h2>${esc(currentTitle||(booked.length?'Cambio programado':'Wallet del negocio'))}</h2>
       <p>${late?'Wallet está suspendida por un pago pendiente.':currentSchedule?.stop_on?'La renovación se detuvo. Tu plan termina el '+shortDay(inclusiveEnd(currentSchedule.stop_on))+'.':current.length?'Wallet está incluida en tu plan.':legacy?'Tu acuerdo anterior se conserva.':active?'Wallet está activa.':'Tu selección está confirmada.'}</p>
       ${booked.map(c=>`<p><strong>${esc(c.name)}</strong> desde el ${esc(shortDay(c.starts_on))}.</p>`).join('')}
       ${pending?'<p role="status">Estamos actualizando tu calendario de pagos.</p>':''}
       <div class="actions">${active&&!late&&!error?localLink('/wallet','Abrir Wallet','btn'):!active&&!late&&current.length?form('/plans/wallet/resume',actor,hidden('confirm','yes')+button('Activar mi Wallet')):''}${localLink('/billing?view=charges',late?'Ver pago pendiente':'Mi cuenta y pagos','btn secondary')}</div></div>
       <dl>${current.length?`<div><dt>Precio del plan</dt><dd>${esc(displayAmount((current[0].monthly_minor??current[0].agreed_minor)*(standardIds.includes(current[0].plan_id)?current[0].initial_branches||1:1)))}</dd></div>`:''}
       ${cuts?`<div><dt>Próximo cargo</dt><dd>${esc(shortDay(cuts))}</dd></div>`:''}
       ${balance?`<div><dt>Saldo pendiente</dt><dd>${esc(displayAmount(balance))}</dd></div>`:''}
       ${firstCharge?`<div><dt>Pagar hasta</dt><dd>${esc(shortDay(firstCharge))}</dd></div>`:''}</dl></section>`:''}
    ${legacy?localLink('/plans/wallet/legacy','Ver mi acuerdo anterior','btn secondary'):''}
    ${ongoing.length?`<section class="member-pending"><h3>Continúa con tu selección</h3>${ongoing.map(o=>`<p>${esc(o.names)} · ${localLink('/plans/orders/'+o.id,'Revisar y activar')}</p>`).join('')}</section>`:''}
    <section class="member-catalog"><div class="member-heading"><h2>${currentTitle?'Cambiar mi plan':'Elige tu plan de Wallet'}</h2>
    <p>${currentTitle?'El cambio se programa para el siguiente período. Verás la fecha y el precio antes de confirmarlo.':'Elige las tarjetas de fidelización solas o junto con otros servicios de Lúmina.'}</p></div>
    ${catalog.some(bundled)?`<nav class="member-switch" aria-label="Tipo de plan">${[['all','Todos'],['wallet','Solo Wallet'],['packages','Con otros servicios']].map(([key,label])=>`<a href="/plans/wallet?offers=${key}" ${key===filter?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`:''}
    <div class="member-grid">${offers.map(p=>tile(actor,company,p,current,booked,legacy)).join('')||'<p>Todavía no hay ofertas publicadas en esta categoría.</p>'}</div></section>
    ${!currentTitle&&!booked.length?form('/plans/wallet/choice',actor,hidden('choice','later')+button('Ahora no','secondary')):''}
    <section class="member-add"><div><h3>Agregar un servicio</h3><p>Por ejemplo, suma Contenido o Web a tu cuenta y conserva tu Wallet.</p></div>${localLink('/plans?view=catalog','Ver todos los servicios','btn secondary')}</section>
    ${currentSchedule && !currentSchedule.stop_on?`<details class="member-manage"><summary>Detener la renovación</summary>${form('/plans/wallet/stop',actor,hidden('schedule',currentSchedule.schedule_id)+check('confirm','Quiero usar este plan hasta el '+shortDay(inclusiveEnd(currentSchedule.ends_before))+'.',false,true)+button('Detener renovación','secondary'))}</details>`:''}
    ${booked.filter(c=>c.schedule_id).map(c=>`<details class="member-manage"><summary>Cancelar el cambio a ${esc(c.name)}</summary>${form('/plans/wallet/stop',actor,hidden('schedule',c.schedule_id)+check('confirm','Quiero cancelar este cambio programado.',false,true)+button('Cancelar cambio','secondary'))}</details>`).join('')}
    </div>`;
}
