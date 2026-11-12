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
export const button = (caption,css='') => `<button type="submit" class="${css}">${esc(caption)}</button>`;
export const localLink = (url,caption,css='') => `<a class="${css}" href="${esc(url)}">${esc(caption)}</a>`;
export const external = (url,caption) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(caption)} ↗</a>`;
export const card = (heading,body,description='') =>
  `<section class="card"><h2>${esc(heading)}</h2>${description ? `<p class="muted">${esc(description)}</p>` : ''}${body}</section>`;
export const disclosure = (heading,body) => `<details class="disclosure"><summary>${esc(heading)}</summary><div>${body}</div></details>`;
export const table = (headers,rows,empty='Todavía no hay registros.') => rows.length ?
  `<div class="table-wrap"><table><thead><tr>${headers.map(col=>`<th scope="col">${esc(col)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : message(empty);
export function pathFor(actor,company) {
  return (path, query = {}) => {
    const params = new URLSearchParams(query);
    if (actor?.kind === 'AGENCY' && company) params.set('empresa',company.id);
    const provider=actor?.kind==='AGENCY'&&actor.agencyWork&&/^\/(inicio|contenido|solicitudes|agenda|planes|mapas|clientes\/verificar)(\/|$)/.test(path);
    return (provider?'/agencia':'') + path + (params.size ? '?' + params : '');
  };
}
function navLinks(actor,company,url,cash) {
  const items=[];
  if(actor.kind==='AGENCY')items.push(['/resumen','Vista general','home','Agencia'],['/clientes','Clientes','clients'],['/produccion','Producción','content'],['/agenda-general','Agenda','calendar']);
  if(actor.kind!=='AGENCY'||company){
    items.push([url('/inicio'),company&&actor.kind==='AGENCY'?'Resumen del negocio':'Mi negocio','home',company&&actor.kind==='AGENCY'?'Negocio seleccionado':'Mi espacio']);
    if(Object.keys(channels).some(scope=>can(actor,scope)))items.push([url('/solicitudes'),'Solicitudes','content'],[url('/agenda'),'Grabaciones','calendar']);
  }
  if(can(actor,'WALLET'))items.push([url('/wallet'),'Fidelización digital · Wallet','wallet','Servicios']);
  for(const [scope,route,mark] of [['SOCIAL','/contenido','social'],['MAPS','/servicios/maps','maps'],['WEB','/servicios/web','web'],['BRAND','/servicios/brand','content']])if(can(actor,scope))items.push([url(route),areas[scope],mark]);
  if(actor.kind!=='COLLABORATOR')items.push([url('/proximamente'),'WhatsApp Business e IA · Próximamente','social']);
  if(actor.kind!=='COLLABORATOR')items.push([url('/planes'),'Paquetes y servicios','plans','Gestión']);
  if((actor.kind!=='AGENCY'||company)&&socialChannels.some(scope=>can(actor,scope)))items.push([url('/reportes'),'Estadísticas','metrics']);
  if((actor.kind!=='AGENCY'||company)&&can(actor,'MAPS'))items.push([url('/mapas'),'Reseñas y ubicaciones','maps']);
  if(actor.kind==='OWNER')items.push(['/gestion','Administración','settings'],['/equipo','Equipo y permisos','clients']);
  if(actor.kind==='OWNER'||actor.kind==='COLLABORATOR'&&can(actor,'WALLET')&&can(actor,'WALLET_REPORTS'))items.push(['/gestion/informes','Informes de fidelización','metrics']);
  if(cash)items.push(['/caja','Loyalty · Caja','wallet']);
  items.push(['/cuenta','Mi cuenta','settings']);
  return items;
}
const mark = `<img class="lumina-symbol" src="/assets/lumina-symbol.png" width="44" height="44" alt=""><span>Lúmina <strong>Digital</strong></span>`;
export function page({actor,company,path='/',title,description='',body,cash=false,notice=''}) {
  const url=pathFor(actor,company);
  const links=actor?navLinks(actor,company,url,cash):[];
  const activeBase=links.map(([href])=>href.split('?')[0]).filter(base=>path===base||path.startsWith(base+'/')).sort((a,b)=>b.length-a.length)[0];
  const menu=actor?links.map(([href,name,mark,group])=>{
    const base=href.split('?')[0],active=base===activeBase;
    return `${group?`<p class="nav-label">${esc(group)}</p>`:''}<a href="${esc(href)}"${active?' aria-current="page"':''}>${icon(mark)}<span>${esc(name)}</span>${mark==='wallet'?'<span class="nav-dot" aria-hidden="true"></span>':''}</a>`;
  }).join(''):'';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1f3a">
    <title>${esc(title)} · Lúmina Digital</title><link rel="stylesheet" href="/assets/lumina.css"><link rel="stylesheet" href="/assets/workspace.css"><link rel="stylesheet" href="/assets/modules.css"><link rel="stylesheet" href="/assets/experience.css"><script defer src="/assets/lumina.js"></script><script defer src="/assets/requests.js"></script><script defer src="/assets/packages.js"></script><script defer src="/assets/offers.js"></script><script defer src="/assets/management-frame.js"></script><link rel="stylesheet" href="/assets/central.css"><link rel="stylesheet" href="/assets/practical.css"><link rel="stylesheet" href="/assets/black-friday.css"><link rel="stylesheet" href="/assets/team.css"><script defer src="/assets/team.js"></script><script defer src="/assets/black-friday.js"></script><link rel="icon" href="/assets/lumina-symbol.png"></head>
    <body class="${actor?'signed-in':'signed-out'}"><a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="site-header"><div class="top"><a class="brand" href="${actor?esc(actor.kind==='AGENCY'?'/resumen':'/inicio'):'/'}">${mark}</a>
    ${actor?`<button class="menu-toggle quiet" type="button" aria-label="Abrir navegación" aria-controls="workspace-nav" aria-expanded="false">${icon('menu')}</button>`:`<div class="top-links">${localLink('/','Ingresar')}${localLink('/registro','Registrar negocio cliente')}</div>`}</div>
    ${actor?`<nav class="lumina-sidebar-nav" id="workspace-nav" aria-label="Área de trabajo"><button class="navigation-close" type="button" aria-label="Cerrar navegación">Cerrar menú ×</button><div class="workspace-context"><small>ESPACIO DE TRABAJO</small><strong>${esc(company?.name||(actor.kind==='AGENCY'?'Lúmina Digital':'Mi negocio'))}</strong><span>${esc(label(actor.kind))}</span></div>${menu}<div class="nav-foot"><img class="lumina-symbol" src="/assets/lumina-symbol.png" alt="" width="28" height="28"><p>Marketing con propósito.<small>Lúmina Digital</small></p></div></nav>`:''}</header>
    ${actor?`<div class="workspace-topbar"><span>${esc(company?.name||'Lúmina Digital')}<small>${actor.kind==='AGENCY'&&company?'Consulta de cliente':'Tu centro de trabajo'}</small></span><div class="identity"><span class="avatar" aria-hidden="true">${esc(actor.name.trim().charAt(0).toUpperCase())}</span><span>${esc(actor.name)}<small>${esc(label(actor.kind))}</small></span>${form('/salir',actor,button('Salir','quiet'),'inline')}</div></div>`:''}
    <button class="navigation-backdrop" type="button" aria-label="Cerrar navegación" hidden></button><main id="contenido"><header class="page-title"><p class="eyebrow">${esc(company?.name||(actor?'LÚMINA / ESPACIO PRIVADO':'LÚMINA DIGITAL'))}</p><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</header>
    ${actor?.kind==='AGENCY'&&company?`<aside class="consultation-notice" role="note"><strong>${actor.agencyWork?'Trabajo de Lúmina':'Consulta del negocio · Solo lectura'}</strong><p>${actor.agencyWork?'Las acciones se registran a nombre de la agencia. Las solicitudes y aprobaciones corresponden al negocio.':'Estás consultando '+esc(company.name)+' como administrador de Lúmina. Conservas tu identidad de agencia.'}</p></aside>`:''}
    ${notice?`<p class="notice" role="status">${esc(notice)}</p>`:''}${body}</main><footer><div><span>Lúmina Digital <span class="footer-dot">·</span> Marketing y fidelización</span>${brandSocial()}<span>Ecuador continental · UTC−5</span></div></footer></body></html>`;
}
