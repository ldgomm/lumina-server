import { periodBranchCount, standardIds } from '../../memberships/trial.mjs';
import { serviceName } from '../../memberships/catalog.mjs';
import { inclusiveEnd } from '../../memberships/orders.mjs';
import { firstStatement, nextCut, paidFrom, walletLine } from '../../memberships/calendar.mjs';
import { walletDues } from '../../memberships/wallet-balance.mjs';
import { localDay, uuid } from '../../shared/domain.mjs';
import { button, check, disclosure, displayAmount, esc, form, hidden, localLink } from './components.mjs';
import { contactField } from './contact.mjs';
import { icon } from './icons.mjs';

const dateFormat = new Intl.DateTimeFormat('es-EC', { dateStyle:'long', timeZone:'UTC' });
const dayLabel = day => dateFormat.format(new Date(day+'T12:00:00Z'));
const money = amount => esc(displayAmount(amount));
const branchesLabel = count => count+' '+(count===1?'sucursal':'sucursales');
const bundled = plan => plan.items.some(item=>item.service!=='WALLET');
const standard = plan => standardIds.includes(plan.plan_id||plan.id);
const interval = plan => plan.months===12?'año':plan.term==='MONTHLY'?'mes':'trabajo';
const choiceForm = (actor,choice,title,css='') => form('/plans/wallet/choice',actor,hidden('choice',choice)+button(title,css));
const fact = (label,value) => '<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>';

function trialPage(actor,trial,pending) {
  const end='31 de diciembre de 2026', benefit='Tus clientes guardan su tarjeta en Apple Wallet o Google Wallet y acumulan premios en tu negocio.';
  const first=firstStatement(paidFrom,0);
  const action=trial.enabled
    ? pending?localLink('/plans/wallet','Actualizar estado','btn'):localLink('/wallet','Abrir Wallet','btn')
    : choiceForm(actor,'start','Activar prueba gratuita');
  return `<div class="wallet-flow"><section class="wallet-hero"><div>
    <div class="wallet-symbol">${icon('wallet')}</div><h2>${trial.enabled?'Tu prueba está activa':'Prueba Wallet gratis'}</h2>
    <p>${trial.enabled?'La prueba cubre todas tus sucursales. Si decides continuar, tus clientes conservarán sus tarjetas y sus puntos.':benefit}</p>
    ${pending&&trial.enabled?'<p role="status">Estamos preparando el acceso a tus tarjetas.</p>':''}<div class="actions">${action}</div>
    </div><dl class="wallet-facts">${fact('Precio de la prueba',displayAmount(0))}${fact('Último día de la prueba',end)}</dl></section>
    <section class="wallet-next"><div class="wallet-mark">${icon('calendar')}</div><div><h3>El 1 de enero tú decides</h3>
    <p>Para seguir usando Wallet, tendrás que elegir y confirmar un plan mensual o anual. También puedes dejarlo en pausa y volver más adelante.</p>
    ${disclosure('¿Cuándo se paga el primer mes?','<p>Si activas el plan mensual el '+esc(dayLabel(paidFrom))+', el cargo de enero se registra el '+esc(dayLabel(first.cut))+' y puedes pagarlo hasta el '+esc(dayLabel(first.due))+'. Si empiezas a mitad de mes, el primer cargo se calcula por los días de servicio.</p>')}</div></section>
    ${trial.enabled?disclosure('Desactivar la prueba','<p>Las tarjetas se pausarán. Si vuelves, tus clientes conservarán sus tarjetas y sus puntos.</p>'+choiceForm(actor,'stop','Desactivar prueba','secondary')):''}
    ${localLink('/wallet/benefits','Qué incluye Wallet')}</div>`;
}

function offerCard(actor,company,plan,context) {
  const {current,booked,legacy,branches,annualSavings}=context;
  const present=current.find(c=>c.plan_id===plan.id);
  const future=booked.some(c=>c.plan_id===plan.id);
  const existing=current.length||booked.length||legacy;
  const locked=plan.blockedNow&&plan.blockedNext;
  const state=future?'Cambio programado':present?'Tu plan actual':locked?'Ya incluido o solicitado':'';
  const recurring=present?.schedule_id&&!present.stop_on;
  const unit=standard(plan),unitPrice=plan.price_minor,priced=unitPrice!=null;
  const unknown=unit&&company.loyalty_tenant&&!(Number.isSafeInteger(branches)&&branches>0);
  const total=priced&&unit&&branches>1?unitPrice*branches:unitPrice;
  let description;
  if(unknown)description='Tarifa de '+displayAmount(unitPrice)+' por sucursal. Vuelve a consultar para confirmar cuántas se incluyen.';
  else if(unit && branches>1)description=branchesLabel(branches)+' × '+displayAmount(unitPrice)+' por sucursal.';
  else if(unit)description='Por sucursal.';
  else description=plan.description;
  const explanation=plan.months===12&&unit&&annualSavings>0
    ? '<p class="wallet-saving">Ahorras '+money(annualSavings)+' al año por sucursal frente al plan mensual.</p>':'';
  const period=plan.term==='ONE_OFF'?'una sola vez':'/ '+interval(plan);
  let action='';
  if(!unknown && !future && !recurring && !locked) {
    const when=(existing||plan.blockedNow)&&!plan.blockedNext?'NEXT_MONTH':'TODAY';
    const title=!priced?'Solicitar precio':present?'Revisar renovación':existing&&plan.months===12?'Cambiar a anual':existing?'Revisar cambio':unit?(plan.months===12?'Elegir plan anual':'Elegir plan mensual'):'Elegir este plan';
    action=form('/plans/request',actor,hidden('qty_'+plan.id,'1')+hidden('source','wallet')+hidden('start_when',when)+hidden('key',uuid())+
      (company.phone?hidden('phone',company.phone):contactField(''))+button(title));
  } else if(locked && !future && !present)action='<p class="wallet-explain">'+esc(plan.blockedNext)+'</p>';
  const items=unit?'':'<ul>'+plan.items.map(i=>'<li>'+esc(i.service==='WALLET'?'Tarjetas de fidelización':i.quantity+' × '+serviceName(i.service))+'</li>').join('')+'</ul>';
  return `<article class="wallet-offer${state?' wallet-offer-held':''}"><div class="wallet-offer-head"><h3>${esc(plan.name)}</h3>${state?'<strong class="wallet-state">'+esc(state)+'</strong>':''}</div>
    <p class="wallet-price">${unknown?'Total por confirmar':priced?money(total):'Por cotizar'} ${priced&&!unknown?'<small>'+period+'</small>':''}</p>
    ${description?'<p>'+esc(description)+'</p>':''}${explanation}${items}${action}</article>`;
}

function catalogue(actor,company,plans,filter,context,collapsed) {
  const catalog=plans.filter(walletLine);
  const packs=catalog.filter(bundled);
  const standards=catalog.filter(standard).sort((a,b)=>a.months-b.months);
  const custom=catalog.filter(p=>!bundled(p)&&!standard(p));
  const [monthly,annual]=standards;
  const opts={...context,annualSavings:monthly?.months===1&&annual?.months===12?monthly.price_minor*12-annual.price_minor:0};
  const grid=offers=>'<div class="wallet-offers">'+offers.map(p=>offerCard(actor,company,p,opts)).join('')+'</div>';
  const packages=filter==='packages'&&packs.length>0;
  const nav=packs.length?`<nav class="wallet-tabs" aria-label="Servicios del plan"><a href="/plans/wallet?offers=wallet#planes-wallet"${packages?'':' aria-current="page"'}>Solo Wallet</a>
    <a href="/plans/wallet?offers=packages#planes-wallet"${packages?' aria-current="page"':''}>Wallet con otros servicios</a></nav>`:'';
  const options=packages&&packs.length?grid(packs):grid(standards)+(custom.length?disclosure('Otras ofertas de Wallet',grid(custom)):'');
  const hint=packages?'El precio corresponde al paquete completo.':'El total se calcula por sucursal. Si abres otra durante el período, se incluye en la siguiente renovación de tu plan.';
  const content=nav+'<p>'+hint+'</p>'+options;
  if(collapsed)return `<details class="disclosure wallet-options" id="planes-wallet"${filter==='all'?'':' open'}><summary>Comparar y cambiar de plan</summary><div>${content}</div></details>`;
  return '<section class="wallet-choices" id="planes-wallet"><h2>Elige tu plan de Wallet</h2>'+content+'</section>';
}

function openSelections(rows) {
  if(!rows.length)return '';
  return '<section class="wallet-next"><div class="wallet-mark">'+icon('plans')+'</div><div><h3>Continúa con tu selección</h3>'+
    rows.map(o=>{
      const waiting=o.status==='REQUESTED'&&o.ready===false;
      const message=waiting?'Lúmina está preparando tu cotización.':o.status==='ACCEPTED'?'La propuesta ya está aceptada.':'Puedes revisar el importe y las fechas antes de confirmar.';
      return '<div class="wallet-selection"><strong>'+esc(o.names)+'</strong><p>'+message+'</p>'+localLink('/plans/orders/'+o.id,waiting?'Ver solicitud':'Revisar mi selección','btn secondary')+'</div>';
    }).join('')+'</div></section>';
}

function subscriptionSummary(actor,{current,booked,account,active,legacy,pending,error}) {
  const contract=current[0];
  const {today,cut:open,overdueMinor,hasOverdue:overdue,suspendedForDebt:late,restricted}=walletDues(account);
  const held=Boolean(open||overdue);
  if(!contract&&!booked.length&&!legacy&&!active&&!held&&!restricted&&!pending)return '';
  const dates=booked.map(c=>'<p><strong>'+esc(c.name)+'</strong> comienza el '+esc(dayLabel(c.starts_on))+'.</p>').join('');
  let title=contract?.name||(legacy?'Tu acuerdo de Wallet':booked.length?'Cambio programado':'Tu Wallet');
  let text='';
  let action='';
  if(restricted){
    title='Wallet en pausa';
    text='Consulta el estado de tu cuenta y el detalle de los movimientos.';
    action=localLink('/billing','Ver mi cuenta','btn');
  }else if(held){
    title=late?'Wallet suspendida por pago pendiente':overdue?'Tienes un pago vencido de Wallet':'Tienes un pago de Wallet pendiente';
    text=late?'Para reactivar las tarjetas de tus clientes, Lúmina debe registrar el pago del saldo vencido.':'Consulta el cargo y su fecha límite en tu cuenta.';
    action=localLink('/billing?view=charges#pago-wallet','Ver pago pendiente','btn');
  }else if(error){
    text=contract?'Wallet está incluida en tu plan.':'';
  }else if(pending){
    text='Estamos actualizando el acceso y las fechas de tu suscripción.';
    action=localLink('/plans/wallet','Actualizar estado','btn');
  }else if(!active&&contract&&!error){
    text='Ya tienes un plan. Activa el acceso para usar tus tarjetas.';
    action=form('/plans/wallet/resume',actor,hidden('confirm','yes')+button('Activar mi Wallet'));
  }else if(active){
    text=contract?'Wallet está incluida en tu plan.':legacy?'Tu acuerdo anterior sigue vigente.':'Wallet está activa.';
    action=localLink('/wallet','Abrir Wallet','btn');
  }else if(legacy){
    text='Tu acuerdo anterior sigue disponible.';
    action=localLink('/plans/wallet/legacy','Ver mi acuerdo anterior','btn');
  }else if(booked.length)text='Tu selección está confirmada.';
  const facts=[];
  if(held){
    if(overdueMinor>0)facts.push(fact(late?'Saldo vencido para reactivar Wallet':'Saldo vencido de Wallet',displayAmount(overdueMinor)));
    if(open){
      if(!overdueMinor || overdueMinor!==open.remainingMinor)facts.push(fact('Por pagar en este vencimiento',displayAmount(open.remainingMinor)));
      facts.push(fact(open.dueOn<today?'Venció el':open.dueOn===today?'Vence hoy':'Pagar hasta',dayLabel(open.dueOn)));
    }
  }else if(contract) {
    const price=contract.monthly_minor??contract.agreed_minor;
    if(price!=null){
      const count=standard(contract)?periodBranchCount(contract):1;
      const caption=standard(contract)&&count!==null?'Tarifa para '+branchesLabel(count):'Tarifa del período';
      facts.push(fact(caption,count===null?'Por confirmar':displayAmount(price*count)+' / '+interval(contract)));
    }
    if(account?.nextWalletChargeOn && !pending)facts.push(fact('Próximo cargo de Wallet',dayLabel(account.nextWalletChargeOn)));
  }
  return `<section class="wallet-hero${held?' wallet-payment':''}"><div><div class="wallet-symbol">${icon(held?'clock':'wallet')}</div><h2>${esc(title)}</h2>
    ${text?'<p>'+esc(text)+'</p>':''}${contract?.stop_on&&!booked.length?'<p>La renovación está desactivada. Mantienes el plan hasta el '+esc(dayLabel(inclusiveEnd(contract.stop_on)))+'.</p>':''}${dates}
    <div class="actions">${action}${held&&active&&!late&&!restricted&&!pending?localLink('/wallet','Abrir Wallet','btn secondary'):''}</div></div>
    ${facts.length?'<dl class="wallet-facts">'+facts.join('')+'</dl>':''}</section>`;
}

export function walletCheckoutPage({actor,company,plans=[],contracts=[],orders={rows:[]},active,legacy=false,error='',selectionError='',filter='all',booked=[],account=null,pending=false,trial=null}) {
  if(actor.businessBlocked)return '<div class="wallet-flow"><section class="wallet-next"><div class="wallet-mark">'+icon('wallet')+'</div><div><h2>Wallet en pausa</h2><p>El negocio tiene el acceso restringido. Puedes consultar sus cargos y pagos registrados.</p>'+localLink('/billing?view=charges','Ver cuenta y pagos','btn secondary')+'</div></section></div>';
  if(trial)return (error?'<p class="notice" role="alert">'+esc(error)+'</p>':'')+trialPage(actor,trial,pending);
  const current=contracts.filter(walletLine),schedule=current.find(c=>c.schedule_id);
  const ongoing=orders.rows.filter(o=>['REQUESTED','QUOTED','ACCEPTED'].includes(o.status)&&o.wallet);
  const existing=Boolean(current.length||booked.length||legacy);
  const {restricted,suspendedForDebt}=walletDues(account);
  const blocked=Boolean(pending || restricted || suspendedForDebt || error);
  const sections=[];
  if(selectionError)sections.push('<p class="notice" role="alert">'+esc(selectionError)+'</p>');
  sections.push(subscriptionSummary(actor,{current,booked,account,active,legacy,pending,error}));
  if(error)sections.push('<p class="notice" role="alert">'+esc(error)+' '+localLink('/plans/wallet','Volver a consultar')+'</p>');
  sections.push(openSelections(ongoing));
  if(!blocked)sections.push(catalogue(actor,company,plans,filter,{current,booked,legacy,branches:account?.branchCount},existing||ongoing.length));
  if(!existing&&!ongoing.length&&!blocked)sections.push(choiceForm(actor,'later','Ahora no','secondary'));
  if(schedule&&!schedule.stop_on) {
    const last=dayLabel(inclusiveEnd(schedule.ends_before));
    sections.push(disclosure('Detener la renovación','<p>Podrás usar el plan hasta el '+esc(last)+'. Después podrás volver a activarlo.</p>'+
      form('/plans/wallet/stop',actor,hidden('schedule',schedule.schedule_id)+check('confirm','Quiero detener la renovación de este plan.',false,true)+button('Detener renovación','secondary'))));
  }
  for(const next of booked.filter(c=>c.schedule_id))sections.push(disclosure('Cancelar el cambio a '+next.name,
    '<p>Este cambio está previsto para el '+esc(dayLabel(next.starts_on))+'.</p>'+form('/plans/wallet/stop',actor,hidden('schedule',next.schedule_id)+
      check('confirm','Quiero cancelar este cambio programado.',false,true)+button('Cancelar cambio','secondary'))));
  const links=[];
  if(existing)links.push(localLink('/billing?view=charges','Mi cuenta y pagos'));
  if(legacy&&(active||blocked))links.push(localLink('/plans/wallet/legacy','Ver mi acuerdo anterior'));
  links.push(localLink('/wallet/benefits','Qué incluye Wallet'),localLink('/plans?view=catalog','Agregar otro servicio'));
  return '<div class="wallet-flow">'+sections.join('')+'<nav class="wallet-links" aria-label="Más opciones">'+links.join('')+'</nav></div>';
}

export function walletReviewPage({actor,url,order,line,error,walletAvailable,walletScheduled,comparison=''}) {
  const annual=line.months===12, perBranch=standard(line);
  const count=perBranch?(line.branchCount||order.initial_branches||1):1;
  const price=line.unit_minor*line.units;
  const other=(line.wallet==='GIFT'?line.unit_minor:line.other_minor||0)*line.units;
  const total=price*count;
  const walletBill=firstStatement(line.starts_on,(price-other)*count,line.ends_before,line.months);
  const otherBill=firstStatement(line.starts_on,other,line.ends_before,line.months);
  const firstTotal=walletBill.amount+otherBill.amount;
  const partial=walletBill.days<walletBill.monthDays;
  const today=localDay(),active=order.status==='ACTIVE',previouslyAccepted=order.status==='ACCEPTED',future=line.starts_on>today;
  const historical=active&&(future?!walletScheduled:line.ends_before<=today||!walletAvailable);
  const base='/plans/orders/'+order.id;
  const identity=hidden('revision',order.revision)+hidden('source','wallet');
  const title=historical?'Comprobante del plan':active?(future?'Tu cambio está programado':'Suscripción confirmada'):
    previouslyAccepted?'Tu plan ya está aceptado':'Confirma tu plan de Wallet';
  const rate=(annual?'Precio anual':'Precio mensual')+(perBranch&&count>1?' del negocio':'');
  const description=perBranch?branchesLabel(count)+' × '+displayAmount(line.unit_minor)+' por sucursal.':
    line.items.map(i=>i.service==='WALLET'?'Tarjetas de fidelización':i.quantity*line.units+' × '+serviceName(i.service)).join(' · ');
  const nextYear=annual&&partial?'<p>El cargo de '+money(total)+' por el primer año completo se registra el '+esc(dayLabel(nextCut(walletBill.cut)))+'.</p>':'';
  const breakdown=other>0&&walletBill.amount>0?'<p>Wallet '+money(walletBill.amount)+' y otros servicios '+money(otherBill.amount)+'.</p>':
    other>0&&line.wallet==='GIFT'?'<p>Wallet es de cortesía. El importe corresponde a los demás servicios del paquete.</p>':'';
  const bill=walletBill.cut&&firstTotal>0?'<section class="wallet-review-bill"><div><h3>Primer cargo del plan</h3><p class="wallet-price">'+money(firstTotal)+'</p>'+
    (partial?'<p>Por '+walletBill.days+' de los '+walletBill.monthDays+' días del mes de inicio.</p>':'')+breakdown+nextYear+'</div>'+
    '<dl class="wallet-facts">'+fact('Se registra el',dayLabel(walletBill.cut))+fact('Pagar hasta el',dayLabel(walletBill.due))+'</dl></section>':
    '<section class="wallet-next"><div><h3>Primer cargo del plan</h3><p>El primer período tiene un importe de '+money(0)+'.</p>'+nextYear+'</div></section>';
  const renewal=active?'Al confirmar elegiste una renovación '+(annual?'anual.':'mensual.')+' Puedes consultar su estado actual en Mi suscripción de Wallet.':
    'El plan se renueva cada '+(annual?'año':'mes')+'. '+(perBranch?'El total de cada renovación usa las sucursales registradas al empezar ese período. ':'')+'Puedes detener la renovación desde Mi suscripción de Wallet.';
  const conditions='<details class="disclosure"><summary>Leer las condiciones del plan</summary><div><p class="prewrap">'+esc(order.terms)+'</p></div></details>';
  const cta=previouslyAccepted?'Completar la activación':order.start_when==='NEXT_MONTH'||future?'Confirmar para el próximo período':'Aceptar y activar Wallet';
  let action;
  if(active){
    const mayOpen=!historical&&!future&&walletAvailable&&!actor.businessBlocked;
    action=localLink(mayOpen?'/wallet':'/plans/wallet',mayOpen?'Abrir Wallet':'Ver mi suscripción','btn');
  }else if(actor.businessBlocked){
    action='<p>El negocio puede consultar la propuesta mientras el acceso está restringido.</p>';
  }else{
    action=form(url(base+'/accept'),actor,identity+(order.checkoutHash?hidden('offerHash',order.checkoutHash):'')+
      (previouslyAccepted?hidden('confirm','yes'):check('confirm','Revisé los servicios, precios, fechas y condiciones de esta propuesta.',false,true))+button(cta),'wallet-confirm')+
      form(url(base+'/cancel'),actor,identity+hidden('reason','El dueño decidió no contratar este plan.')+button('Descartar esta selección','secondary'),'wallet-decline');
  }
  return '<div class="wallet-flow wallet-review">'+localLink('/plans/wallet','← Mi suscripción de Wallet')+
    (error?'<p class="notice" role="alert">'+esc(error)+'</p>':'')+
    '<section class="wallet-hero"><div><div class="wallet-symbol">'+icon(active?'check':'wallet')+'</div><h2>'+title+'</h2><p class="wallet-review-name">'+esc(line.name)+'</p><p>'+esc(description)+'</p></div>'+
    '<dl class="wallet-facts">'+fact(rate,displayAmount(total))+fact('Inicio del plan',dayLabel(line.starts_on))+'</dl></section>'+
    (historical?'<p>Estos importes y fechas corresponden al acuerdo original.</p>':'')+bill+comparison+'<p class="wallet-renewal">'+esc(renewal)+' Lúmina registra el pago de tu negocio. No se realiza un débito bancario automático.'+
    (!active&&walletBill.amount>0?' Si queda un saldo vencido de Wallet, las tarjetas se pausan a partir del día 16.':'')+'</p>'+conditions+action+'</div>';
}
