import { can } from '../accounts/accounts.mjs';
import { channels, labels, services, socialChannels, zone } from '../domain.mjs';

export const esc = value => String(value ?? '').replace(/[&<>"']/g,ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[ch]);
export const label = value => labels[value] || channels[value] || services[value] || value;
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
    return path + (params.size ? '?' + params : '');
  };
}
function navLinks(actor,company,url,cash) {
  const items = [];
  if (actor.kind === 'AGENCY') items.push(['/clientes','Clientes']);
  if (actor.kind === 'AGENCY' && !company) return [...items,['/planes','Catálogo'],['/cuenta','Mi cuenta']];
  items.push([url('/inicio'),'Inicio']);
  if (Object.keys(channels).some(scope => can(actor,scope))) {
    items.push([url('/solicitudes'),'Solicitudes'],[url('/agenda'),'Agenda']);
  }
  if (actor.kind !== 'COLLABORATOR') items.push([url('/planes'),'Planes']);
  if (socialChannels.some(scope => can(actor,scope))) items.push([url('/reportes'),'Métricas']);
  if (can(actor,'MAPS')) items.push([url('/mapas'),'Google Maps']);
  if (actor.kind === 'OWNER') items.push(['/equipo','Equipo y accesos']);
  if (cash) items.push(['/caja','Loyalty · Caja']);
  items.push(['/cuenta','Mi cuenta']);
  return items;
}
const mark = `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" width="25" height="25"><path d="M7 6v15h14M16 6v7m-3.5-3.5h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Lúmina <strong>Digital</strong></span>`;
export function page({actor,company,path='/',title,description='',body,cash=false,notice=''}) {
  const url = pathFor(actor,company);
  const menu = actor ? navLinks(actor,company,url,cash).map(([href,name]) => {
    const base = href.split('?')[0];
    const active = path === base || path.startsWith(base + '/');
    return `<a href="${esc(href)}"${active ? ' aria-current="page"' : ''}>${esc(name)}</a>`;
  }).join('') : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Lúmina Digital</title>
    <link rel="stylesheet" href="/assets/lumina.css"><script defer src="/assets/lumina.js"></script></head>
    <body class="${actor ? 'signed-in' : 'signed-out'}"><a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="site-header"><div class="top"><a class="brand" href="${actor ? esc(actor.kind === 'AGENCY' && !company ? '/clientes' : url('/inicio')) : '/'}">${mark}</a>
    ${actor ? `<div class="identity"><span>${esc(actor.name)} <small>${esc(label(actor.kind))}</small></span>${form('/salir',actor,button('Salir','quiet'),'inline')}</div>` :
      `<div class="top-links">${localLink('/','Ingresar')}${localLink('/registro','Registrar negocio')}</div>`}</div>
    ${actor ? `<div class="nav-shell"><nav aria-label="Área de trabajo">${menu}</nav></div>` : ''}</header>
    <main id="contenido"><header class="page-title"><p class="eyebrow">${esc(company?.name || 'Portal de agencia')}</p><h1>${esc(title)}</h1>
    ${description ? `<p>${esc(description)}</p>` : ''}</header>
    ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}${body}</main>
    <footer><div><span>Lúmina Digital</span><span>Horario de Ecuador continental · UTC−5</span></div></footer></body></html>`;
}
