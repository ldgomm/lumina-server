import { brandSocial } from './brand-social.mjs';
import { contentViews } from '../../content/workspace.mjs';
import { can } from '../../access/accounts.mjs';
import { esc, label, localLink, pathFor } from './components.mjs';
import { icon } from './icons.mjs';

const marks={resumen:'home',solicitudes:'content',produccion:'social',revisiones:'check',entregas:'plans',publicaciones:'web',metricas:'metrics',agenda:'calendar'};
export function contentShell({actor,company,title,description='',body,contentView='resumen'}) {
  const url=pathFor(actor,company);
  const back=actor.kind==='AGENCY'?(company?'/inicio?empresa='+company.id:'/resumen'):'/inicio';
  const context=company?.name||(actor.kind==='AGENCY'?'Producción de Lúmina':'Mi negocio');
  const mode=actor.readOnlyCompany?'Consulta del negocio · Solo lectura':actor.kind==='AGENCY'?'Producción de la agencia':label(actor.kind);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1f3a"><meta name="lumina-csrf" content="${esc(actor.csrf)}">
    <title>${esc(title)} · Contenido · Lúmina Digital</title><link rel="stylesheet" href="/assets/lumina.css"><link rel="stylesheet" href="/assets/modules.css"><link rel="stylesheet" href="/assets/content.css"><link rel="stylesheet" href="/assets/experience.css"><script defer src="/assets/lumina.js"></script><script defer src="/assets/requests.js"></script><link rel="stylesheet" href="/assets/central.css"><link rel="stylesheet" href="/assets/practical.css"><link rel="icon" href="/assets/lumina-symbol.png"></head>
    <body class="content-app"><a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="content-header"><a class="content-brand" href="${esc(url('/contenido'))}"><img class="lumina-symbol" src="/assets/lumina-symbol.png" width="40" height="40" alt=""><strong>Contenido</strong><small class="module-chip">Lúmina Digital</small></a>
      <div class="content-header-actions">${localLink(back,'Volver a Lúmina','btn secondary')}<button class="menu-toggle secondary" type="button" aria-label="Abrir menú de Contenido" aria-controls="workspace-nav" aria-expanded="false">${icon('menu')}</button></div></header>
    <aside class="content-sidebar" id="workspace-nav" aria-label="Área de Contenido"><button class="navigation-close" type="button" aria-label="Cerrar navegación">Cerrar menú ×</button><div class="content-context"><span class="eyebrow">${actor.kind==='AGENCY'?'AGENCIA':'ESPACIO DE CONTENIDO'}</span><div class="content-business"><span class="business-avatar" aria-hidden="true">${esc(context.charAt(0).toUpperCase())}</span><strong>${esc(context)}</strong></div><span>${esc(mode)}</span></div>
      <nav class="lumina-sidebar-nav" aria-label="Módulo de contenido">${Object.entries(contentViews).map(([key,title])=>`${({resumen:'Día a día',produccion:'Tu contenido',publicaciones:'Resultados'}[key])?`<p class="nav-label">${({resumen:'Día a día',produccion:'Tu contenido',publicaciones:'Resultados'}[key])}</p>`:''}<a href="${esc(url('/contenido',{vista:key}))}"${key===contentView?' aria-current="page"':''}>${icon(marks[key])}<span>${esc(title)}</span></a>`).join('')}</nav>
      <div class="content-person">${localLink(back,'← Volver a Lúmina','content-back')}<strong>${esc(actor.name)}</strong><span>${esc(label(actor.kind))}</span>${localLink('/cuenta','Mi cuenta','content-back')}</div></aside>
    <button class="navigation-backdrop" type="button" aria-label="Cerrar navegación" hidden></button><main id="contenido"><div class="content-breadcrumb">${esc(context)}<span>/</span>Contenido<span>/</span>${esc(title)}</div>
      <header class="content-title"><div><p class="eyebrow">${esc(mode)}</p><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>
        ${can(actor,'SOCIAL','REQUEST')&&contentView!=='solicitudes'?localLink(url('/contenido',{vista:'solicitudes'}),'Solicitar contenido','btn'):''}</header>
      ${actor.readOnlyCompany?`<aside class="consultation-notice" role="note"><strong>Estás consultando como agencia.</strong><p>Las solicitudes y aprobaciones pertenecen al negocio. Desde aquí solo puedes consultar su información.</p>${localLink('/agencia/contenido?empresa='+company.id,'Ir al trabajo de Lúmina →')}</aside>`:actor.kind==='AGENCY'?'<aside class="consultation-notice" role="note"><strong>Trabajo de Lúmina</strong><p>Registra producción, entregas y resultados a nombre de la agencia. El negocio realiza sus propias solicitudes y aprobaciones.</p></aside>':''}
      ${body}</main><footer class="content-footer">Contenido · Lúmina Digital${brandSocial()}<span>Ecuador continental · UTC−5</span></footer></body></html>`;
}
