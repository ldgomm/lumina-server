import { can } from '../../access/accounts.mjs';
import { badge, button, card, check, esc, form, input, localLink, number, table, timestamp } from './components.mjs';
import { icon } from './icons.mjs';
import { cashierAssets } from '../../wallet/bridge.mjs';

const stateNames={NOT_ISSUED:'Sin emitir',NOT_CONFIGURED:'Configuración pendiente',NEEDS_CONNECTION:'Conexión pendiente',RETRYING:'Reintento pendiente',PENDING:'Actualización pendiente',PROVIDER_ACCEPTED:'Solicitud procesada'};
export function walletPage({actor,company,connection,data,error}) {
  const admin=actor.kind==='AGENCY',owner=actor.kind==='OWNER',manage=admin||owner;
  const enter=admin?'/platform':'/wallet/gestion';
  const shortcuts=admin?[
    [enter,'Negocios y tarjetas','Consulta negocios, tarjetas, sucursales y actividad.','clients'],
    [enter,'Estado de tarjetas','Revisa Apple y Google dentro de cada negocio.','wallet'],
    [enter,'Membresías de Loyalty','Administra la permanencia y cuenta de los negocios.','plans'],
  ]:[
    [enter+'?seccion=design','Estudio de tarjetas','Diseña Apple y Google, compara y guarda.','wallet'],
    [enter+'?seccion=walletHealth','Estado de tarjetas','Conexión, pendientes e historial de reintentos.','metrics'],
    [enter+'?seccion=programs','Promociones y premios','Configura los beneficios de tu negocio.','plans'],
    [enter+'?seccion=qr','QR de registro','Comparte el acceso para añadir la tarjeta.','clients'],
  ];
  const configuration=data?.health?.configuration||data?.configuration?.configuration||{};
  const platform=(key,title)=>{
    const value=configuration[key];const configured=value===true||value==='CONFIGURED_DEVICE_TEST_REQUIRED';
    return `<article class="provider-card"><div class="provider-monogram">${key==='apple'?'A':'G'}</div><div><h3>${title}</h3><p>${value===undefined?'Estado sin consultar':configured?'Configuración disponible':'Configuración pendiente'}</p></div>${badge(value===undefined?'Por consultar':configured?'Configurado':'Pendiente',configured?'success':'')}</article>`;
  };
  const health=data?.health;
  const detail=health?`${card('Estado de las tarjetas',`<div class="metric-grid compact">${[['Tarjetas / proveedor','total'],['Requieren atención','attention'],['Actualizaciones pendientes','pending'],['Solicitudes procesadas','accepted']].map(([caption,key])=>`<div class="metric-card"><span>${caption}</span><strong>${number(health.summary[key])}</strong></div>`).join('')}</div>
    ${table(['Cliente','Wallet','Estado','Última solicitud procesada'],health.items.map(row=>[esc(row.name),esc(row.provider),badge(stateNames[row.state]||row.state),esc(timestamp(row.lastAcceptedAt))]))}
    <p class="muted">Hasta 25 registros. Una persona puede tener registros de Apple y Google. Procesada indica respuesta del proveedor; no confirma recepción en el teléfono.</p>
    ${localLink(enter+'?seccion=walletHealth','Consultar todas las tarjetas','btn secondary')}`)}`:'';
  const connect=manage?card(admin?'Conecta la administración de Loyalty':'Conecta el Wallet de tu negocio',
    form('/wallet/conectar',actor,`${owner?input('slug','Código del negocio en Loyalty','text','required maxlength="100" placeholder="Ejemplo: mi-negocio"'):''}
      ${input('credential',admin?'Credencial de administrador de Loyalty':'Credencial de dueño de Loyalty','password','required minlength="32" maxlength="128" autocomplete="off"')}
      ${check('confirm','Autorizo usar esta credencial para abrir Loyalty durante mi sesión.',false,true)}
      ${button('Conectar y abrir Wallet')}`),
    'Usa el acceso que ya tienes en Loyalty. La credencial se conserva en el servidor durante esta sesión; al salir o reiniciar tendrás que conectarla nuevamente.'):
    card('Servicios de Wallet',`<p>Puedes consultar los trabajos y solicitar servicios de Wallet con los permisos que te asignó el dueño.</p>${can(actor,'WALLET','REQUEST')?localLink('/solicitudes','Solicitar un servicio','btn'):localLink('/solicitudes','Ver solicitudes','btn secondary')}`,
      'La administración de tarjetas y del negocio corresponde a su dueño. Caja conserva los permisos y la sucursal que te asignaron.');
  return `<section class="wallet-hero"><div><span class="eyebrow">FIDELIZACIÓN / LOYALTY</span><h2>Tu comunidad.<br>Siempre contigo.</h2><p>Tarjetas, beneficios y seguimiento para Apple Wallet y Google Wallet.</p>
    ${connection?`<div class="actions">${localLink(enter,admin?'Abrir administración de Loyalty':'Abrir mi negocio en Loyalty','btn')}${badge('Acceso conectado','success')}</div>`:''}</div>
    <div class="wallet-visual" aria-hidden="true"><div class="mini-wallet rear"><span>LÚMINA DIGITAL</span><strong>Google Wallet</strong><i>Fidelización</i></div><div class="mini-wallet front"><span>LOYALTY</span><strong>Apple Wallet</strong><i>Tu próxima visita cuenta.</i><div class="wallet-dots"><b></b><b></b><b></b><b></b><b></b></div></div></div></section>
    ${error?`<div class="notice" role="alert">${esc(error)}</div>`:''}
    ${connection?`<section class="provider-grid">${platform('apple','Apple Wallet')}${platform('google','Google Wallet')}</section>
      <section class="module-grid wallet-shortcuts">${shortcuts.map(([href,title,copy,mark])=>`<a class="module-card" href="${href}">${icon(mark)}<h3>${title}</h3><p>${copy}</p><span>Abrir ${icon('arrow')}</span></a>`).join('')}</section>${detail}
      ${admin&&data?.overview?card('Negocios de Loyalty',table(['Negocio','Clientes registrados','Sucursales','Estado'],(data.overview.businesses||[]).map(row=>[esc(row.name),row.clients===undefined?'—':number(row.clients),row.branches===undefined?'—':number(row.branches),badge(row.state)])),'Vista de los negocios devuelta por Loyalty. Abre la administración para buscar y consultar las siguientes páginas.'):''}
      <section class="card connection-card"><div>${icon('check')}<div><h3>${esc(connection.name)}</h3><p>Conexión de acceso establecida el ${esc(timestamp(connection.connectedAt))}.</p></div></div>${form('/wallet/desconectar',actor,button('Cerrar acceso a Loyalty','secondary'))}</section>
      <p class="muted">La conexión de acceso al panel es independiente de las tarjetas instaladas. Apple y Google mantienen los identificadores del negocio y de cada tarjeta.</p>`:connect}
    ${owner&&company?.loyalty_tenant?card('Negocio vinculado',`<p><strong>${esc(company.loyalty_name)}</strong></p><p>Esta cuenta corresponde a ese negocio de Loyalty.</p>`):''}`;
}
export function loyaltyWorkspaceHtml(actor,section='design') {
  const platform=actor.kind==='AGENCY';
  const scripts=Object.keys(cashierAssets).filter(name=>name.endsWith('.js'));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="lumina-csrf" content="${esc(actor.csrf)}"><meta name="lumina-wallet-mode" content="${platform?'platform':'owner'}"><meta name="lumina-wallet-section" content="${esc(section)}">
    <title>Wallet · Lúmina Digital</title><link rel="stylesheet" href="/loyalty-assets/style.css"><link rel="stylesheet" href="/loyalty-assets/commercial.css"><link rel="stylesheet" href="/assets/loyalty-workspace.css">
    <script src="/assets/loyalty-context.js"></script>${scripts.map(name=>`<script defer src="/loyalty-assets/${name}"></script>`).join('')}<script defer src="/assets/loyalty-launch.js"></script></head>
    <body class="lumina-loyalty"><header><a class="brand" href="/wallet">Lúmina <span>Digital</span></a><span class="pill">Loyalty · Wallet</span><button id="exit" class="quiet" hidden>Volver a Lúmina</button></header><div class="loyalty-breadcrumb"><a href="/resumen">Lúmina Digital</a><span>/</span><a href="/wallet">Wallet</a><span>/</span><strong>${platform?'Administración':'Mi negocio'}</strong></div>
    <main id="app"><p>Abriendo tu espacio de Wallet…</p></main><p id="notice" role="status" aria-live="polite"></p><footer>Loyalty · Un servicio de Lúmina Digital</footer></body></html>`;
}
