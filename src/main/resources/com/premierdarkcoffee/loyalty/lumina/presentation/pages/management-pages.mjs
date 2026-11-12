import { managementSections, managementTitles } from '../../wallet/management-policy.mjs';
import { esc, localLink, card } from './components.mjs';
import { loyaltyWorkspaceHtml } from './wallet-pages.mjs';
import { icon } from './icons.mjs';
export function managementPage() {
 const entries=[['/gestion/negocio','Datos del negocio','Contacto, redes e información registrada.','home'],['/gestion/sucursales','Sucursales','Locales del negocio y su actividad.','maps'],['/equipo','Equipos y roles','Una cuenta por persona y permisos para cada módulo.','clients'],['/planes?vista=acuerdos','Paquetes y servicios','Contratar, consultar períodos, cupos y renovaciones.','plans'],['/gestion/informes','Informes de fidelización','Compras, clientes y recompensas.','metrics'],['/gestion/operacion','Operación por sucursal','Resultados por local, horario y responsable.','metrics'],['/gestion/actividad','Actividad','Historial de operaciones y comprobantes.','content'],['/cuenta','Mi cuenta','Tu correo y contraseña de Lúmina.','settings']];
 return `<p>Gestiona el negocio desde Lúmina. Cada módulo conserva las herramientas de su servicio.</p><div class="management-grid">${entries.map(([href,title,help,mark])=>`<a href="${href}" class="management-card">${icon(mark)}<h2>${title}</h2><p>${help}</p><span>Abrir →</span></a>`).join('')}</div>`;
}
export function managementFramePage(slug,params=new URLSearchParams()) {
 const section=Object.entries(managementSections).find(([,value])=>value===slug)?.[0];
 const query=new URLSearchParams({seccion:section});for(const key of ['days','branchId','actorId','fromDate','throughDate','kind']){const value=params.get(key);if(value&&value.length<=80)query.set(key,value);}
 return `<p>${localLink('/gestion','← Administración de Lúmina')}</p>${slug==='historial'?card('Historial conservado',`<p>Estos cargos y pagos pertenecen a acuerdos anteriores de Wallet. Si existe una programación anterior, se muestra aquí; no es una nueva contratación de Lúmina.</p><p>Toda contratación nueva se realiza desde Paquetes y servicios.</p>${localLink('/planes?vista=acuerdos','Ver mis servicios en Lúmina','btn')}`):''}<iframe class="management-frame" title="${esc(managementTitles[slug])}" src="/gestion/vista?${esc(query.toString())}" data-management-frame></iframe><p class="muted" data-frame-status role="status"></p>`;
}
export function managementDocument(actor,company,section) {
 return loyaltyWorkspaceHtml(actor,section,[section],company)
  .replace('name="lumina-wallet-mode"','name="lumina-management" content="yes"><meta name="lumina-wallet-mode"')
  .replace('name="lumina-wallet-back" content="/inicio"','name="lumina-wallet-back" content="/gestion"')
  .replace('<body class="lumina-loyalty">','<body class="lumina-loyalty lumina-embedded">')
  .replace('src="/assets/loyalty-launch.js"','src="/assets/management-launch.js"')
  .replace('</head>','<link rel="stylesheet" href="/assets/central.css"></head>');
}
