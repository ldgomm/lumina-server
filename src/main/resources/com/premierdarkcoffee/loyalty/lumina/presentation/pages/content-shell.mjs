import { contentViews } from '../../content/workspace.mjs';
import { can } from '../../access/accounts.mjs';
import { esc, label, localLink, pathFor, form, button } from './components.mjs';
import { icon } from './icons.mjs';

const marks={resumen:'home',solicitudes:'content',produccion:'social',revisiones:'check',entregas:'plans',publicaciones:'web',metricas:'metrics',agenda:'calendar'};
export function contentShell({actor,company,title,description='',body,contentView='resumen'}) {
  const url=pathFor(actor,company);
  const back=actor.kind==='AGENCY'?(company?'/inicio?empresa='+company.id:'/resumen'):'/inicio';
  const context=company?.name||(actor.kind==='AGENCY'?'Producción de Lúmina':'Mi negocio');
  const mode=actor.readOnlyCompany?'Consulta del negocio · Solo lectura':actor.kind==='AGENCY'?'Producción de la agencia':label(actor.kind);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1f3a">
    <title>${esc(title)} · Contenido · Lúmina Digital</title><link rel="stylesheet" href="/assets/lumina.css"><link rel="stylesheet" href="/assets/modules.css"><link rel="stylesheet" href="/assets/content.css"><script defer src="/assets/lumina.js"></script></head>
    <body class="content-app"><a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="content-header"><a class="content-brand" href="${esc(url('/contenido'))}"><span aria-hidden="true">L<span>+</span></span><strong>Contenido<small>Un módulo de Lúmina Digital</small></strong></a>
      <div class="content-header-actions">${localLink(back,'Volver a Lúmina','btn secondary')}<button class="menu-toggle secondary" type="button" aria-label="Abrir menú de Contenido" aria-controls="workspace-nav" aria-expanded="false">${icon('menu')}</button></div></header>
    <aside class="content-sidebar" id="workspace-nav"><div class="content-context"><span class="eyebrow">${actor.kind==='AGENCY'?'AGENCIA':'ESPACIO DE CONTENIDO'}</span><strong>${esc(context)}</strong><span>${esc(mode)}</span></div>
      <nav aria-label="Módulo de contenido">${Object.entries(contentViews).map(([key,title])=>`<a href="${esc(url('/contenido',{vista:key}))}"${key===contentView?' aria-current="page"':''}>${icon(marks[key])}<span>${esc(title)}</span></a>`).join('')}</nav>
      <div class="content-person"><strong>${esc(actor.name)}</strong><span>${esc(label(actor.kind))}</span>${form('/salir',actor,button('Cerrar sesión','quiet'))}</div></aside>
    <main id="contenido"><div class="content-breadcrumb">${esc(context)}<span>/</span>Contenido<span>/</span>${esc(title)}</div>
      <header class="content-title"><div><p class="eyebrow">${esc(mode)}</p><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>
        ${can(actor,'SOCIAL','REQUEST')&&contentView!=='solicitudes'?localLink(url('/contenido',{vista:'solicitudes'}),'Solicitar contenido','btn'):''}</header>
      ${actor.readOnlyCompany?`<aside class="consultation-notice" role="note"><strong>Estás consultando como agencia.</strong><p>Las solicitudes y aprobaciones pertenecen al negocio. Desde aquí solo puedes consultar su información.</p>${localLink('/agencia/contenido?empresa='+company.id,'Ir al trabajo de Lúmina →')}</aside>`:actor.kind==='AGENCY'?'<aside class="consultation-notice" role="note"><strong>Trabajo de Lúmina</strong><p>Registra producción, entregas y resultados a nombre de la agencia. El negocio realiza sus propias solicitudes y aprobaciones.</p></aside>':''}
      ${body}</main><footer class="content-footer">Contenido · Lúmina Digital<span>Ecuador continental · UTC−5</span></footer></body></html>`;
}
