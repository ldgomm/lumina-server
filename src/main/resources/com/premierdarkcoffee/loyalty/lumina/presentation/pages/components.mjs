import { operationLabels, workHold } from '../../businesses/operation-state.mjs';
import { brandSocial } from './brand-social.mjs';
import { icon } from './icons.mjs';
import { can } from '../../access/accounts.mjs';
import { channels, areas, walletScopes, labels, services, socialChannels, zone } from '../../shared/domain.mjs';

export const esc = value => String(value ?? '').replace(/[&<>"']/g,ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[ch]);
export const label = value => labels[value] || channels[value] || walletScopes[value] || services[value] || value;
export const displayAmount = minor => minor == null ? 'A medida' :
  new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(minor / 100);
export const number = value => new Intl.NumberFormat('es-EC').format(value);
const shortDate = new Intl.DateTimeFormat('es-EC',{timeZone:zone,dateStyle:'medium',timeStyle:'short'});
const localDateInput = new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const timestamp = value => value ? shortDate.format(new Date(value)) : '—';
export const localValue = value => value ? localDateInput.format(new Date(value)).replace(' ','T') : '';
export const badge = (value, variant = '') => `<span class="badge ${variant}">${esc(label(value))}</span>`;
export const message = (copy) => `<div class="empty">${esc(copy)}</div>`;
export const hidden = (name,value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
export const input = (name,caption,type='text',extra='',value='') =>
  `<label><span>${esc(caption)}</span><input type="${esc(type)}" name="${esc(name)}" ${extra} value="${esc(value)}"></label>`;
export const textarea = (name,caption,extra='',value='') =>
  `<label><span>${esc(caption)}</span><textarea name="${esc(name)}" ${extra}>${esc(value)}</textarea></label>`;
export const options = (values, selected) => values.map(([key,caption]) =>
  `<option value="${esc(key)}"${key === selected ? ' selected' : ''}>${esc(caption)}</option>`).join('');
export const select = (name,caption,values,selected,extra='') =>
  `<label><span>${esc(caption)}</span><select name="${esc(name)}" ${extra}>${options(values,selected)}</select></label>`;
export const check = (name,caption,checked = false,required = false) =>
  `<label class="check"><input type="checkbox" name="${esc(name)}" value="yes" ${checked ? 'checked' : ''} ${required ? 'required' : ''}><span>${esc(caption)}</span></label>`;
export const form = (action,actor,body,css='') =>
  `<form method="post" action="${esc(action)}" class="${css}">${actor ? hidden('_csrf',actor.csrf) : ''}${body}</form>`;
export const passwordField = (name,caption,extra='',id='password-'+name) => `<div class="password-field"><label for="${esc(id)}">${esc(caption)}</label><div class="password-control"><input id="${esc(id)}" name="${esc(name)}" type="password" ${extra || 'required minlength="12" maxlength="128" autocomplete="new-password"'}><button type="button" class="secondary" data-password-toggle aria-controls="${esc(id)}" aria-label="Mostrar ${esc(caption.toLowerCase().replace(/^crea (?:una |tu )/,''))}" aria-pressed="false" hidden>Mostrar</button></div></div>`;
export const button = (caption,css='') => `<button type="submit" class="${css}">${esc(caption)}</button>`;
export const localLink = (url,caption,css='') => `<a class="${css}" href="${esc(url)}">${esc(caption)}</a>`;
export const external = (url,caption) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(caption)} ↗</a>`;
export const card = (heading,body,description='') =>
  `<section class="card"><h2>${esc(heading)}</h2>${description ? `<p class="muted">${esc(description)}</p>` : ''}${body}</section>`;
export const disclosure = (heading,body) => `<details class="disclosure"><summary>${esc(heading)}</summary><div>${body}</div></details>`;
export const table = (headers,rows,empty='Todavía no hay registros.') => rows.length ?
  `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(headers.join(', '))}"><table><thead><tr>${headers.map(col=>`<th scope="col">${esc(col)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : message(empty);
export function pathFor(actor,company) {
  return (path, query = {}) => {
    const params = new URLSearchParams(query);
    if (actor?.kind === 'AGENCY' && company) params.set('company',company.id);
    const provider=actor?.kind==='AGENCY'&&actor.agencyWork&&/^\/(home|content|requests|calendar|plans|maps|businesses\/verify)(\/|$)/.test(path);
    return (provider?'/agency':'') + path + (params.size ? '?' + params : '');
  };
}
function navLinks(actor,company,url,cash) {
  const items=[];
  if(actor.businessBlocked&&actor.kind!=='AGENCY')return [
    ['/home','Mi negocio','home','Mi espacio'],['/services','Estado de mis servicios','plans'],
    ...(actor.kind==='OWNER'?[['/billing','Mi cuenta y pagos','plans','Gestión']]:[]),
    ['/help','Ayuda','content'],['/account','Mi cuenta','settings'],
  ];
  if(actor.kind==='AGENCY')items.push(['/dashboard','Vista general','home','Agencia'],['/businesses','Clientes','clients'],[company?'/admin/businesses/'+company.id+'/team':'/teams','Equipos y roles','clients'],['/production','Producción','content'],['/agency-calendar','Agenda','calendar']);
  if(actor.kind!=='AGENCY'||company){
    items.push([url('/home'),company&&actor.kind==='AGENCY'?'Resumen del negocio':'Mi negocio','home',company&&actor.kind==='AGENCY'?'Negocio seleccionado':'Mi espacio']);
    if(actor.kind==='OWNER')items.push(['/team','Equipos y roles','clients']);
    if(actor.kind==='AGENCY'&&company)items.push(['/admin/businesses/'+company.id,'Estado y pagos','plans']);
    if(Object.keys(channels).some(scope=>can(actor,scope)))items.push([url('/requests'),'Solicitudes','content'],[url('/calendar'),'Grabaciones','calendar']);
    if(actor.kind!=='AGENCY'&&(actor.kind==='OWNER'||Object.keys(areas).some(scope=>can(actor,scope,'APPROVE'))))items.push([url('/attention'),'Pendientes','check']);
  }
  if(actor.kind!=='AGENCY')items.push(['/services','Mis servicios','plans','Servicios']);
  if(can(actor,'WALLET')||cash)items.push([url('/wallet'),'Fidelización digital · Wallet','wallet',actor.kind==='OWNER'?undefined:'Servicios']);
  for(const [scope,route,mark] of [['SOCIAL','/content','social'],['MAPS','/services/maps','maps'],['WEB','/services/web','web'],['BRAND','/services/brand','content']])if(can(actor,scope))items.push([url(route),areas[scope],mark]);
  if(actor.kind!=='COLLABORATOR')items.push([url('/plans'),'Paquetes y servicios','plans','Gestión']);
  if((actor.kind!=='AGENCY'||company)&&socialChannels.some(scope=>can(actor,scope)))items.push([url('/reports'),'Estadísticas','metrics']);
  if((actor.kind!=='AGENCY'||company)&&can(actor,'MAPS'))items.push([url('/maps'),'Reseñas y ubicaciones','maps']);
  if(actor.kind==='OWNER')items.push(['/management','Administración','settings']);
  if(actor.kind==='OWNER'&&can(actor,'WALLET')||actor.kind==='COLLABORATOR'&&can(actor,'WALLET')&&can(actor,'WALLET_REPORTS'))items.push(['/management/reports','Informes de fidelización','metrics']);
  if(actor.kind==='OWNER')items.push(['/billing','Mi cuenta y pagos','plans']);
  items.push(['/help','Ayuda','content'],['/account','Mi cuenta','settings']);
  return items;
}
export function mobileShortcuts(items,current) {
  return `<nav class="mobile-shortcuts" aria-label="Accesos rápidos">${items.map(([href,name,mark])=>
    `<a href="${esc(href)}"${href===current?' aria-current="page"':''}>${icon(mark)}<span>${esc(name)}</span></a>`).join('')}</nav>`;
}
export function navigationSearch(placeholder='Equipo, pagos…') {
  return `<div class="navigation-find" hidden><label>Buscar sección<input type="search" data-nav-search autocomplete="off" placeholder="${esc(placeholder)}"></label><button type="button" data-nav-clear hidden>Limpiar</button><p data-nav-result role="status" aria-live="polite"></p></div>`;
}
const mark = `<img class="lumina-symbol" src="/assets/lumina-symbol.png" width="44" height="44" alt=""><span>Lúmina <strong>Digital</strong></span>`;
export function page({actor,company,path='/',title,description='',body,cash=false,notice=''}) {
  const url=pathFor(actor,company);
  const links=actor?navLinks(actor,company,url,cash):[];
  const navBase=href=>href.split('?')[0].replace(/^\/agency(?=\/)/,'');
  const activePath=actor?.kind==='AGENCY'&&company&&path==='/teams'?'/admin/businesses/'+company.id+'/team':path;
  const activeBase=links.map(([href])=>navBase(href)).filter(base=>activePath===base||activePath.startsWith(base+'/')).sort((a,b)=>b.length-a.length)[0];
  const shortcutPages=['/home','/dashboard','/services','/services/web','/services/maps','/services/brand'];
  let shortcuts='';
  if(actor&&shortcutPages.includes(path)) {
    const routes=actor.kind==='AGENCY'?['/dashboard','/businesses','/production','/agency-calendar']:['/home','/wallet','/content','/services'];
    const names={'/dashboard':'Inicio','/home':'Inicio','/businesses':'Clientes','/production':'Producción','/agency-calendar':'Agenda','/wallet':'Wallet','/content':'Contenido','/services':'Servicios'};
    const items=routes.map(route=>links.find(([href])=>navBase(href)===route)).filter(Boolean);
    shortcuts=mobileShortcuts(items.map(([href,,mark])=>[href,names[navBase(href)],mark]),items.find(([href])=>navBase(href)===path)?.[0]);
  }
  const menu=actor?links.map(([href,name,mark,group])=>{
    const base=navBase(href),active=base===activeBase;
    return `${group?`<p class="nav-label">${esc(group)}</p>`:''}<a href="${esc(href)}"${active?' aria-current="page"':''}>${icon(mark)}<span>${esc(name)}</span>${mark==='wallet'?'<span class="nav-dot" aria-hidden="true"></span>':''}</a>`;
  }).join(''):'';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="application-name" content="Lúmina 2.0"><meta name="theme-color" content="#0b1f3a">${actor?`<meta name="lumina-csrf" content="${esc(actor.csrf)}">`:""}
    <title>${esc(title)} · Lúmina Digital</title><link rel="stylesheet" href="/assets/lumina.css"><link rel="stylesheet" href="/assets/workspace.css"><link rel="stylesheet" href="/assets/modules.css"><link rel="stylesheet" href="/assets/experience.css"><script defer src="/assets/lumina.js"></script><script defer src="/assets/requests.js"></script><script defer src="/assets/packages.js"></script><script defer src="/assets/offers.js"></script><script defer src="/assets/management-frame.js"></script><link rel="stylesheet" href="/assets/central.css"><link rel="stylesheet" href="/assets/practical.css"><link rel="stylesheet" href="/assets/deliveries.css"><script defer src="/assets/deliveries.js"></script><link rel="stylesheet" href="/assets/black-friday.css"><link rel="stylesheet" href="/assets/team.css"><link rel="stylesheet" href="/assets/account.css"><link rel="stylesheet" href="/assets/billing-workspace.css"><script defer src="/assets/billing-workspace.js"></script><script defer src="/assets/team.js"></script><script defer src="/assets/black-friday.js"></script><link rel="stylesheet" href="/assets/welcome.css"><script type="module" src="/assets/identity.js"></script><link rel="stylesheet" href="/assets/lumina-2.css"><link rel="icon" href="/assets/lumina-symbol.png"></head>
    <body class="${actor?'signed-in':'signed-out'}"><a class="skip" href="#content">Saltar al contenido</a>
    <header class="site-header"><div class="top"><a class="brand" href="${actor?esc(actor.kind==='AGENCY'?'/dashboard':'/home'):'/'}">${mark}</a>
    ${actor?`<button class="menu-toggle quiet" type="button" aria-label="Abrir navegación" aria-controls="workspace-nav" aria-expanded="false">${icon('menu')}</button>`:`<div class="top-links">${localLink('/login','Ingresar')}${localLink('/register','Registrar negocio cliente')}</div>`}</div>
    ${actor?`<nav class="lumina-sidebar-nav" id="workspace-nav" aria-label="Área de trabajo"><button class="navigation-close" type="button" aria-label="Cerrar navegación">Cerrar menú ×</button><div class="workspace-context"><small>ESPACIO DE TRABAJO</small><strong>${esc(company?.name||actor.company_name||(actor.kind==='AGENCY'?'Lúmina Digital':'Mi negocio'))}</strong><span>${esc(label(actor.kind))}</span></div>${navigationSearch()}${menu}<div class="nav-foot"><p>Lúmina Digital <small>Versión 2.0</small></p></div></nav>`:''}</header>
    ${actor?`<div class="workspace-topbar"><span>${esc(company?.name||actor.company_name||'Lúmina Digital')}<small>${actor.kind==='AGENCY'&&company?(path.startsWith('/admin/businesses/')?'Administración del negocio':'Consulta de cliente'):'Tu centro de trabajo'}</small></span><div class="identity"><span class="avatar" aria-hidden="true">${esc(actor.name.trim().charAt(0).toUpperCase())}</span><span>${esc(actor.name)}<small>${esc(label(actor.kind))}</small></span>${localLink('/account','Mi cuenta','account-link')}</div></div>`:''}
    <button class="navigation-backdrop" type="button" aria-label="Cerrar navegación" hidden></button><main id="content"><header class="page-title"><p class="eyebrow">${esc(company?.name||actor?.company_name||(actor?'LÚMINA / ESPACIO PRIVADO':'LÚMINA DIGITAL'))}</p><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</header>
    ${actor?.kind==='AGENCY'&&company&&actor.businessBlocked&&!path.startsWith('/admin/businesses/')?businessNotice(actor,company):actor?.kind==='AGENCY'&&company&&!path.startsWith('/admin/businesses/')?`<aside class="consultation-notice" role="note"><strong>${actor.agencyWork?'Trabajo de Lúmina':'Consulta del negocio · Solo lectura'}</strong><p>${actor.agencyWork?'Las acciones se registran a nombre de la agencia. Las solicitudes y aprobaciones corresponden al negocio.':'Estás consultando '+esc(company.name)+' como administrador de Lúmina. Conservas tu identidad de agencia.'}</p></aside>`:''}
    ${notice?`<p class="notice" role="status">${esc(notice)}</p>`:''}${body}${shortcuts}</main><footer><div><span>Lúmina Digital <span class="footer-dot">·</span> Marketing y fidelización</span>${brandSocial()}<span>Ecuador continental · UTC−5</span></div></footer></body></html>`;
}

export function businessNotice(actor,company) {
  return `<aside class="business-operation-notice" data-business-state="${esc(actor.businessState)}" role="note"><div><span class="eyebrow">HISTORIAL · SOLO LECTURA</span><h2>Negocio ${esc((operationLabels[actor.businessState]||'no disponible').toLowerCase())}</h2><p>Sus servicios y trabajos están detenidos. Las solicitudes, entregas y registros se conservan para consulta.</p></div>${localLink('/admin/businesses/'+company.id,'Administrar estado','btn secondary')}</aside>`;
}
export function workBadge(row) {
  const hold=workHold(row);
  return hold?`<span class="badge warning" data-work-state="${esc(hold.state)}">${esc(hold.title)}</span><small class="work-last-state">Última etapa: ${esc(label(row.status))}</small>`:badge(row.status,row.status==='DELIVERED'?'success':'');
}
