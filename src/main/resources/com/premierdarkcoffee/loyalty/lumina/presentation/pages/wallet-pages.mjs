import { can } from '../../access/accounts.mjs';
import { walletSections } from '../../wallet/access-policy.mjs';
import { badge, button, card, check, displayAmount, esc, form, hidden, input, localLink, number, select, table } from './components.mjs';
import { icon } from './icons.mjs';
import { cashierAssets } from '../../wallet/bridge.mjs';
export function walletPage({actor,company,data,error,candidates=[],search='',blocked=[]}) {
  const admin=actor.kind==='AGENCY',enter=admin?'/platform':'/wallet/gestion';
  const names={design:['Diseño de tarjetas','Apple Wallet y Google Wallet, con la identidad de tu negocio.','wallet'],programs:['Promociones y recompensas','Puntos, sellos, beneficios y premios.','plans'],customers:['Clientes','Seguimiento y recuperación de tarjetas.','clients'],reports:['Informes','Actividad y resultados de fidelización.','metrics'],walletHealth:['Estado de tarjetas','Conexión, actualizaciones y seguimiento de Apple y Google.','wallet'],qr:['QR de registro','Un acceso para añadir la tarjeta de tu negocio.','clients'],sales:['Caja','Compras, canjes y recibos.','wallet']};
  const sections=walletSections(actor);
  const shortcuts=admin?[[enter,'Administración de Loyalty','Negocios, tarjetas, cuenta y permisos.','clients']]:Object.entries(names).filter(([key])=>sections.includes(key)).map(([key,[title,copy,mark]])=>[enter+'?seccion='+key,title,copy,mark]);
  const binding=admin&&company&&!company.loyalty_tenant?card('Activar fidelización para '+company.name,
    `<p>Asocia el registro existente de Loyalty. Sus tarjetas, saldos e historial se conservan. La asociación se confirma una sola vez.</p>
    <form method="get" action="/wallet">${hidden('empresa',company.id)}${input('buscar','Buscar negocio de Loyalty','search','maxlength="100"',search)}${button('Buscar','secondary')}</form>
    ${candidates.length?form('/wallet/vincular?empresa='+company.id,actor,select('tenant','Registro de Loyalty',candidates.map(item=>[item.id,`${item.name} · ${item.slug}${item.ruc?' · '+item.ruc:''}`]))+check('confirm','Verifiqué que este registro corresponde al negocio '+company.name+'.',false,true)+button('Asociar negocio')):'<p class="muted">Sin resultados. Si es un negocio nuevo, créalo desde Administración de Loyalty y vuelve a seleccionarlo aquí.</p>'}`):'';
  const health=data?.health;
  return `<section class="wallet-hero"><div><span class="eyebrow">FIDELIZACIÓN DIGITAL / LOYALTY</span><h2>Una cuenta.<br>Todo tu programa.</h2><p>Tarjetas de Apple y Google, puntos, sellos y recompensas, desde tu espacio de Lúmina.</p>${data?badge('Acceso con tu cuenta de Lúmina','success'):''}</div>
    <div class="wallet-visual" aria-hidden="true"><div class="mini-wallet rear"><span>LÚMINA DIGITAL</span><strong>Google Wallet</strong><i>Fidelización</i></div><div class="mini-wallet front"><span>LOYALTY</span><strong>Apple Wallet</strong><i>Tu próxima visita cuenta.</i><div class="wallet-dots"><b></b><b></b><b></b><b></b><b></b></div></div></div></section>
    ${binding}${admin&&company&&blocked.length?card('Accesos retirados en Loyalty',blocked.map(row=>form('/wallet/reparar?empresa='+company.id,actor,`<h3>${esc(row.name)}</h3>${hidden('account',row.account_id)}${input('reason','Motivo de la reparación','text','required minlength="5" maxlength="500"')}${check('confirm','Confirmo que esta persona debe recuperar su acceso a Wallet.',false,true)}${button('Reparar acceso interno','secondary')}`)).join('')):''}${error?`<div class="notice" role="status">${esc(error)}</div>`:''}
    ${data?`<section class="module-grid wallet-shortcuts">${shortcuts.map(([href,title,copy,mark])=>`<a class="module-card" href="${href}">${icon(mark)}<h3>${esc(title)}</h3><p>${esc(copy)}</p><span>Abrir ${icon('arrow')}</span></a>`).join('')}</section>`:''}
    ${health?card('Seguimiento de tarjetas',`<div class="metric-grid compact">${[['Registros por proveedor','total'],['Requieren atención','attention'],['Actualizaciones pendientes','pending'],['Solicitudes procesadas','accepted']].map(([title,key])=>`<div class="metric-card"><span>${title}</span><strong>${number(health.summary?.[key]||0)}</strong></div>`).join('')}</div><p class="muted">Una respuesta procesada por el proveedor no confirma recepción en el teléfono.</p>`):''}
    ${!admin&&company?.loyalty_tenant?`<p class="muted">Fidelización de ${esc(company.loyalty_name||company.name)}. Tus permisos se aplican automáticamente.</p>`:''}
    ${actor.kind==='COLLABORATOR'&&!sections.length?card('Servicios de fidelización',`<p>Tu cuenta permite consultar los trabajos de Wallet. El dueño puede habilitar tareas de operación desde Equipo y permisos.</p>${localLink('/solicitudes?canal=WALLET','Ver solicitudes','btn secondary')}`):''}`;
}
export function loyaltyWorkspaceHtml(actor,section='design',sections=null) {
  const platform=actor.kind==='AGENCY';
  const scripts=Object.keys(cashierAssets).filter(name=>name.endsWith('.js'));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="lumina-csrf" content="${esc(actor.csrf)}"><meta name="lumina-wallet-mode" content="${platform?'platform':'owner'}"><meta name="lumina-wallet-section" content="${esc(section)}">
    <meta name="lumina-wallet-sections" content="${esc(JSON.stringify(sections))}"><title>Wallet · Lúmina Digital</title><link rel="stylesheet" href="/loyalty-assets/style.css"><link rel="stylesheet" href="/loyalty-assets/commercial.css"><link rel="stylesheet" href="/assets/loyalty-workspace.css">
    <script src="/assets/loyalty-context.js"></script>${scripts.map(name=>`<script defer src="/loyalty-assets/${name}"></script>`).join('')}<script defer src="/assets/loyalty-launch.js"></script></head>
    <body class="lumina-loyalty"><header><a class="brand" href="/wallet">Lúmina <span>Digital</span></a><span class="pill">Loyalty · Wallet</span><button id="exit" class="quiet" hidden>Volver a Lúmina</button></header><div class="loyalty-breadcrumb"><a href="/resumen">Lúmina Digital</a><span>/</span><a href="/wallet">Wallet</a><span>/</span><strong>${platform?'Administración':actor.kind==='OWNER'?'Mi negocio':'Mis áreas de Wallet'}</strong></div>
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
