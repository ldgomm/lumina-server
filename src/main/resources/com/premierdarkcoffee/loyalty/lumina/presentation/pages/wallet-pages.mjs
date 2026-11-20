import { brandSocial } from './brand-social.mjs';
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
      ${contact?`<p>${esc(contact.name)} · ${esc(contact.phone)}</p>`:''}
      ${error?`<p class="notice" role="status">${esc(error)}</p>`:''}
      ${data?.health?.summary?table(['Seguimiento','Registros'],[['Registros por proveedor',number(data.health.summary.total??0)],['Actualizaciones pendientes',number(data.health.summary.pending??0)],['Requieren atención',number(data.health.summary.attention??0)]]):''}`:
      table(['Negocio','Consulta'],companies.map(item=>[esc(item.name),localLink('/wallet?company='+item.id,'Consultar Wallet','btn secondary')]),'Los negocios aparecerán aquí al crear su cuenta.'),
    'Acceso de agencia · Solo lectura');
  return `${error?card('No pudimos abrir Wallet',`<p role="alert">${esc(error)}</p><div class="actions">${localLink('/wallet','Volver a intentar','btn')}${localLink('/home','Volver a Lúmina','btn secondary')}</div>`):''}
    ${actor.kind==='OWNER'?card('Accesos del equipo',blocked.length?blocked.map(row=>form('/wallet/repair',actor,`<h3>${esc(row.name)}</h3>${hidden('account',row.account_id)}${hidden('account_revision',row.revision)}${input('reason','Motivo de la reparación','text','required minlength="5" maxlength="500"')}${check('confirm','Confirmo que esta persona debe recuperar su acceso a Wallet.',false,true)}${button('Reparar acceso interno','secondary')}`)).join(''):`<p>No hay accesos bloqueados.</p>${localLink('/wallet','Abrir Wallet','btn')}`):''}
    ${actor.kind==='COLLABORATOR'&&!walletSections(actor).length?card('Falta asignarte compras o canjes',`<p>Tu cuenta puede consultar solicitudes de fidelización, pero aún no tiene acceso a Caja.</p><p>El dueño puede habilitarlo en <strong>Equipos y roles → tu nombre → Wallet → Atención en Caja</strong>, eligiendo tu sucursal y guardando las operaciones que podrás realizar.</p>${localLink('/requests?channel=WALLET','Ver solicitudes','btn secondary')}`):''}`;
}
export function cashierHtml(actor,company,grant) {
  const names=Object.keys(cashierAssets);
  const sections=walletSections(actor);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="application-name" content="Lúmina 2.0"><meta name="lumina-csrf" content="${esc(actor.csrf)}"><meta name="lumina-wallet-sections" content="${esc(JSON.stringify(sections))}"><title>Caja · Wallet de Lúmina</title>
    ${names.filter(name=>name.endsWith('.css')).map(name=>`<link rel="stylesheet" href="/cashier-assets/${name}">`).join('')}<link rel="stylesheet" href="/assets/loyalty-workspace.css"><link rel="stylesheet" href="/assets/central.css"><link rel="stylesheet" href="/assets/practical.css"><link rel="stylesheet" href="/assets/black-friday.css"><link rel="stylesheet" href="/assets/lumina-2.css"><link rel="icon" href="/assets/lumina-symbol.png">
    ${names.filter(name=>name.endsWith('.js')).map(name=>`<script defer src="/cashier-assets/${name}"></script>`).join('')}<script defer src="/assets/wallet-campaigns.js"></script><script defer src="/assets/cashier.js"></script></head>
    <body class="lumina-loyalty lumina-cashier"><header><a class="brand" data-lumina-back href="/home" aria-label="Volver a Lúmina"><img class="lumina-symbol" src="/assets/lumina-symbol.png" width="38" height="38" alt=""> Wallet <span>de Lúmina</span></a><span class="pill">Caja</span><a class="wallet-account" data-lumina-account href="/account">Mi cuenta</a><button id="exit" type="button" class="quiet" hidden>Volver a Lúmina</button></header>
    <div class="loyalty-breadcrumb"><a data-lumina-back href="/home">Lúmina Digital</a><span>/</span><strong>${esc(company.name)}</strong><span>/</span><span>${esc(grant.branch_name)}</span></div>
    <main id="app"><p>Abriendo Caja…</p></main><p id="notice" role="status" aria-live="polite"></p><footer><span>Wallet · Lúmina Digital</span>${brandSocial()}</footer></body></html>`;
}
export function loyaltyWorkspaceHtml(actor,section='design',sections=null,company=null,cash=null) {
  if(actor.kind==='AGENCY')throw new Error('Agency cannot render an owner workspace.');
  const platform=false;
  const back='/home';
  const scripts=Object.keys(cashierAssets).filter(name=>name.endsWith('.js'));
  const editable=actor.kind==='OWNER'?sections:Object.entries({design:'WALLET_DESIGN',programs:'WALLET_PROGRAMS',rewards:'WALLET_PROGRAMS',customers:'WALLET_CUSTOMERS'}).filter(([,scope])=>can(actor,scope,'EDIT')).map(([section])=>section);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="application-name" content="Lúmina 2.0">
    <meta name="lumina-wallet-owner" content="${actor.kind==='OWNER'?'yes':'no'}"><meta name="lumina-wallet-agency" content="${actor.kind==='AGENCY'?'yes':'no'}"><meta name="lumina-wallet-team" content="${actor.kind==='OWNER'?'/team':esc(back)}"><meta name="lumina-wallet-company" content="${esc(company?.id||actor.company_id||'')}"><meta name="lumina-wallet-back" content="${esc(back)}"><meta name="lumina-csrf" content="${esc(actor.csrf)}"><meta name="lumina-wallet-mode" content="${platform?'platform':'owner'}"><meta name="lumina-wallet-section" content="${esc(section)}">
    <meta name="lumina-wallet-cash" content="${cash?'yes':'no'}"><meta name="lumina-wallet-editable" content="${esc(JSON.stringify(editable))}"><meta name="lumina-wallet-sections" content="${esc(JSON.stringify(sections))}"><title>Wallet · Lúmina Digital</title><link rel="stylesheet" href="/loyalty-assets/style.css"><link rel="stylesheet" href="/loyalty-assets/commercial.css"><link rel="stylesheet" href="/assets/loyalty-workspace.css"><link rel="stylesheet" href="/assets/central.css"><link rel="stylesheet" href="/assets/practical.css"><link rel="stylesheet" href="/assets/black-friday.css"><link rel="stylesheet" href="/assets/lumina-2.css"><link rel="icon" href="/assets/lumina-symbol.png">
    <script src="/assets/loyalty-context.js"></script>${scripts.map(name=>`<script defer src="/loyalty-assets/${name}"></script>`).join('')}<script defer src="/assets/wallet-campaigns.js"></script><script defer src="/assets/wallet-season.js"></script>${actor.kind==='OWNER'?'<script defer src="/assets/wallet-subscription.js"></script>':''}<script defer src="/assets/loyalty-launch.js"></script></head>
    <body class="lumina-loyalty"><header><a class="brand" data-lumina-back href="${esc(back)}" aria-label="Volver a Lúmina"><img class="lumina-symbol" src="/assets/lumina-symbol.png" width="38" height="38" alt=""> Wallet <span>de Lúmina</span></a><span class="pill">Fidelización digital</span><a class="wallet-account" data-lumina-account href="/account">Mi cuenta</a><button id="exit" class="quiet" hidden>Volver a Lúmina</button></header><div class="loyalty-breadcrumb"><a data-lumina-back href="/home">Lúmina Digital</a><span>/</span><a href="/wallet">Wallet</a><span>/</span><strong>${platform?'Administración':company?esc(company.name):'Mis áreas de Wallet'}</strong>${actor.kind==='OWNER'?'<a class="wallet-plan-link" href="/plans/wallet">Mi suscripción</a>':''}</div>
    ${actor.kind==='OWNER'?'<aside class="wallet-subscription-note" data-wallet-reminder="overview" role="status" aria-label="Aviso de Wallet" hidden></aside>':''}
    <main id="app"><p>Abriendo tu espacio de Wallet…</p><noscript>Activa JavaScript en tu navegador para abrir las herramientas de Wallet.</noscript></main><p id="notice" role="status" aria-live="polite"></p><footer><span>Wallet · Lúmina Digital</span>${brandSocial()}</footer></body></html>`;
}

export function walletReportPage(data) {
 const items=[['Clientes registrados',data.totalClients],['Nuevos en el período',data.newClients],['Clientes con compras',data.activeClients],['Clientes con dos o más compras',data.repeatClients],['Compras',data.purchases],['Premios canjeados',data.redemptions]];
 return `<p>${localLink('/home','← Volver a Lúmina')}</p><form class="filter" method="get" action="/management/reports">${hidden('section','reports')}${select('days','Período',[7,30,90,365].map(n=>[String(n),n+' días']),String(data.days))}${button('Consultar','secondary')}</form>
  <p class="muted">${esc(data.fromDate)} → ${esc(data.throughDate)} · Compras y canjes registrados en Loyalty.</p>
  <section class="metric-grid">${items.map(([title,value])=>`<article class="metric-card"><span>${title}</span><strong>${number(value??0)}</strong></article>`).join('')}<article class="metric-card"><span>Total pagado</span><strong>${esc(displayAmount(data.salesMinor))}</strong></article></section>
  ${card('Resultados por sucursal',table(['Sucursal','Compras','Total pagado','Clientes','Canjes'],(data.branches||[]).map(b=>[esc(b.name),number(b.purchases),esc(displayAmount(b.salesMinor)),number(b.clients),number(b.redemptions)])), 'Los clientes pueden comprar en varias sucursales. No sumes estas columnas para obtener personas únicas.')}
  ${card('Actividad diaria',table(['Día','Compras','Clientes','Total pagado'],(data.daily||[]).map(d=>[esc(d.day),number(d.purchases),number(d.clients),esc(displayAmount(d.salesMinor))])))}
  ${card('Premios canjeados',table(['Premio','Canjes'],(data.topRewards||[]).map(r=>[esc(r.name),number(r.claims)])))}`;
}
