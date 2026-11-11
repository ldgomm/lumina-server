import { can } from '../../access/accounts.mjs';
import { walletSections } from '../../wallet/access-policy.mjs';
import { badge, button, card, check, displayAmount, esc, form, hidden, input, localLink, number, select, table } from './components.mjs';
import { icon } from './icons.mjs';
import { cashierAssets } from '../../wallet/bridge.mjs';
export function walletPage({actor,company,contact,companies=[],data,error,blocked=[]}) {
  const admin=actor.kind==='AGENCY';
  if(admin) return card(company?'Wallet de '+company.name:'Wallet de los negocios',
    company?`<p>${company.loyalty_tenant?badge('Wallet activa','success'):badge('Preparación pendiente')}</p>
      <p>Consulta de fidelización. El dueño y su equipo administran tarjetas, promociones y Caja desde sus propias cuentas.</p>
      ${contact?`<p>${esc(contact.name)} · ${esc(contact.email)} · ${esc(contact.phone)}</p>`:''}
      ${error?`<p class="notice" role="status">${esc(error)}</p>`:''}
      ${data?.health?.summary?table(['Seguimiento','Registros'],[['Registros por proveedor',number(data.health.summary.total??0)],['Actualizaciones pendientes',number(data.health.summary.pending??0)],['Requieren atención',number(data.health.summary.attention??0)]]):''}`:
      table(['Negocio','Consulta'],companies.map(item=>[esc(item.name),localLink('/wallet?empresa='+item.id,'Consultar Wallet','btn secondary')]),'Los negocios aparecerán aquí al crear su cuenta.'),
    'Acceso de agencia · Solo lectura');
  const suffix=admin&&company?'&empresa='+encodeURIComponent(company.id):'';
  const names={design:['Diseño de tarjetas','Personaliza Apple Wallet y Google Wallet con la identidad de tu negocio.','wallet'],programs:['Promociones y recompensas','Configura puntos, sellos, beneficios y premios.','plans'],customers:['Clientes','Seguimiento y recuperación de tarjetas.','clients'],reports:['Informes','Actividad y resultados de fidelización.','metrics'],walletHealth:['Estado de tarjetas','Actualizaciones y seguimiento de Apple y Google.','wallet'],qr:['QR de registro','Comparte el acceso a la tarjeta de tu negocio.','clients'],sales:['Caja','Compras, canjes y recibos.','wallet']};
  const sections=walletSections(actor);
  const shortcuts=Object.entries(names).filter(([key])=>sections.includes(key)).map(([key,[title,copy,mark]])=>['/wallet/gestion?seccion='+key+suffix,title,copy,mark]);
  const health=data?.health;
  const ready=Boolean(company?.loyalty_tenant);
  const heading=company?'Tu Wallet ya tiene un lugar.':'Fidelización de tus negocios.';
  return `<section class="wallet-hero"><div><span class="eyebrow">LÚMINA DIGITAL / FIDELIZACIÓN</span><h2>${heading}</h2><p>${company?'Configura tus promociones, recompensas y tarjetas desde tu cuenta de Lúmina.':'Abre el negocio que quieras gestionar. Cada cuenta tiene su propio espacio de fidelización.'}</p>${ready?badge('Wallet activa','success'):company?badge('Preparando tu Wallet'):''}</div>
    <div class="wallet-visual" aria-hidden="true"><div class="mini-wallet rear"><span>LÚMINA DIGITAL</span><strong>Google Wallet</strong><i>Fidelización</i></div><div class="mini-wallet front"><span>${esc(company?.name||'LÚMINA DIGITAL')}</span><strong>Apple Wallet</strong><i>Tu próxima visita cuenta.</i><div class="wallet-dots"><b></b><b></b><b></b><b></b><b></b></div></div></div></section>
    ${!company&&admin?card('Negocios de Lúmina',table(['Negocio','Fidelización'],companies.map(item=>[esc(item.name),localLink('/wallet?empresa='+item.id,'Abrir Wallet','btn secondary')]),'Los negocios aparecerán aquí al crear su cuenta.')):''}
    ${company&&contact?card(company.name,`<p>${esc(contact.name)} · ${esc(contact.email)} · ${esc(contact.phone)}</p>`,ready?'Wallet se creó con los datos de tu registro. Define tus promociones y recompensas para empezar.':'Tu cuenta está creada. La preparación de Wallet se reintentará al abrir esta página.') : ''}
    ${actor.kind==='OWNER'&&company&&blocked.length?card('Revisar accesos',blocked.map(row=>form('/wallet/reparar',actor,`<h3>${esc(row.name)}</h3>${hidden('account',row.account_id)}${input('reason','Motivo de la reparación','text','required minlength="5" maxlength="500"')}${check('confirm','Confirmo que esta persona debe recuperar su acceso a Wallet.',false,true)}${button('Reparar acceso interno','secondary')}`)).join('')):''}
    ${error?`<div class="notice" role="status">${esc(error)} ${localLink('/wallet'+(admin&&company?'?empresa='+company.id:''),'Volver a intentar')}</div>`:''}
    ${data&&company?`<section class="module-grid wallet-shortcuts">${shortcuts.map(([href,title,copy,mark])=>`<a class="module-card" href="${href}">${icon(mark)}<h3>${esc(title)}</h3><p>${esc(copy)}</p><span>Abrir ${icon('arrow')}</span></a>`).join('')}</section>`:''}
    ${health?card('Seguimiento de tarjetas',`<div class="metric-grid compact">${[['Registros por proveedor','total'],['Requieren atención','attention'],['Actualizaciones pendientes','pending'],['Solicitudes procesadas','accepted']].map(([title,key])=>`<div class="metric-card"><span>${title}</span><strong>${number(health.summary?.[key]||0)}</strong></div>`).join('')}</div><p class="muted">Una respuesta procesada por el proveedor no confirma recepción en el teléfono.</p>`):''}
    ${actor.kind==='COLLABORATOR'&&!sections.length?card('Servicios de fidelización',`<p>Tu cuenta permite consultar los trabajos de Wallet. El dueño puede habilitar tareas de operación desde Equipo y permisos.</p>${localLink('/solicitudes?canal=WALLET','Ver solicitudes','btn secondary')}`):''}`;
}
export function loyaltyWorkspaceHtml(actor,section='design',sections=null,company=null) {
  if(actor.kind==='AGENCY')throw new Error('Agency cannot render an owner workspace.');
  const platform=false;
  const back='/wallet'+(actor.kind==='AGENCY'&&company?'?empresa='+company.id:'');
  const scripts=Object.keys(cashierAssets).filter(name=>name.endsWith('.js'));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="lumina-wallet-agency" content="${actor.kind==='AGENCY'?'yes':'no'}"><meta name="lumina-wallet-team" content="${actor.kind==='OWNER'?'/equipo':esc(back)}"><meta name="lumina-wallet-company" content="${esc(company?.id||actor.company_id||'')}"><meta name="lumina-wallet-back" content="${esc(back)}"><meta name="lumina-csrf" content="${esc(actor.csrf)}"><meta name="lumina-wallet-mode" content="${platform?'platform':'owner'}"><meta name="lumina-wallet-section" content="${esc(section)}">
    <meta name="lumina-wallet-sections" content="${esc(JSON.stringify(sections))}"><title>Wallet · Lúmina Digital</title><link rel="stylesheet" href="/loyalty-assets/style.css"><link rel="stylesheet" href="/loyalty-assets/commercial.css"><link rel="stylesheet" href="/assets/loyalty-workspace.css">
    <script src="/assets/loyalty-context.js"></script>${scripts.map(name=>`<script defer src="/loyalty-assets/${name}"></script>`).join('')}<script defer src="/assets/loyalty-launch.js"></script></head>
    <body class="lumina-loyalty"><header><a class="brand" href="${esc(back)}">Lúmina <span>Digital</span></a><span class="pill">Fidelización digital</span><button id="exit" class="quiet" hidden>Volver a Lúmina</button></header><div class="loyalty-breadcrumb"><a href="/resumen">Lúmina Digital</a><span>/</span><a href="${esc(back)}">Wallet</a><span>/</span><strong>${platform?'Administración':company?esc(company.name):'Mis áreas de Wallet'}</strong></div>
    <main id="app"><p>Abriendo tu espacio de Wallet…</p></main><p id="notice" role="status" aria-live="polite"></p><footer>Loyalty · Un servicio de Lúmina Digital</footer></body></html>`;
}

export function walletReportPage(data) {
 const items=[['Clientes registrados',data.totalClients],['Nuevos en el período',data.newClients],['Clientes con compras',data.activeClients],['Clientes con dos o más compras',data.repeatClients],['Compras',data.purchases],['Premios canjeados',data.redemptions]];
 return `<p>${localLink('/wallet','← Fidelización digital')}</p><form class="filter" method="get" action="/wallet/gestion">${hidden('seccion','reports')}${select('dias','Período',[7,30,90,365].map(n=>[String(n),n+' días']),String(data.days))}${button('Consultar','secondary')}</form>
  <p class="muted">${esc(data.fromDate)} → ${esc(data.throughDate)} · Compras y canjes registrados en Loyalty.</p>
  <section class="metric-grid">${items.map(([title,value])=>`<article class="metric-card"><span>${title}</span><strong>${number(value??0)}</strong></article>`).join('')}<article class="metric-card"><span>Total pagado</span><strong>${esc(displayAmount(data.salesMinor))}</strong></article></section>
  ${card('Resultados por sucursal',table(['Sucursal','Compras','Total pagado','Clientes','Canjes'],(data.branches||[]).map(b=>[esc(b.name),number(b.purchases),esc(displayAmount(b.salesMinor)),number(b.clients),number(b.redemptions)])), 'Los clientes pueden comprar en varias sucursales. No sumes estas columnas para obtener personas únicas.')}
  ${card('Actividad diaria',table(['Día','Compras','Clientes','Total pagado'],(data.daily||[]).map(d=>[esc(d.day),number(d.purchases),number(d.clients),esc(displayAmount(d.salesMinor))])))}
  ${card('Premios canjeados',table(['Premio','Canjes'],(data.topRewards||[]).map(r=>[esc(r.name),number(r.claims)])))}`;
}
