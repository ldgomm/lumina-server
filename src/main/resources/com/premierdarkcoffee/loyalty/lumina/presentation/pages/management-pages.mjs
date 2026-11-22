import { managementSections, managementTitles } from '../../wallet/management-policy.mjs';
import { esc, localLink, card } from './components.mjs';
import { loyaltyWorkspaceHtml } from './wallet-pages.mjs';
import { icon } from './icons.mjs';
export function managementPage() {
 const entries=[['/management/business','Datos del negocio','Contacto, redes e información registrada.','home'],['/management/branches','Sucursales','Locales del negocio y su actividad.','maps'],['/team','Equipos y roles','Una cuenta por persona y permisos para cada módulo.','clients'],['/plans?view=agreements','Paquetes y servicios','Contratar, consultar períodos, cupos y renovaciones.','plans'],['/management/reports','Informes de fidelización','Compras, clientes y recompensas.','metrics'],['/management/operations','Operación por sucursal','Resultados por local, horario y responsable.','metrics'],['/management/activity','Actividad','Historial de operaciones y comprobantes.','content'],['/account','Mi cuenta','Tu correo y contraseña de Lúmina.','settings']];
 return `<p>Gestiona el negocio desde Lúmina. Cada módulo conserva las herramientas de su servicio.</p><div class="management-grid">${entries.map(([href,title,help,mark])=>`<a href="${href}" class="management-card">${icon(mark)}<h2>${title}</h2><p>${help}</p><span>Abrir →</span></a>`).join('')}</div>`;
}
export function managementFramePage(slug,params=new URLSearchParams()) {
 const section=Object.entries(managementSections).find(([,value])=>value===slug)?.[0];
 const query=new URLSearchParams({section:section});for(const key of ['days','branchId','actorId','fromDate','throughDate','kind','q']){const value=params.get(key);if(value&&value.length<=(key==='q'?100:80))query.set(key,value);}
 return `<p>${localLink('/management','← Administración de Lúmina')}</p>${slug==='history'?card('Cargos y pagos de Wallet',`<p>Consulta los cargos de tu suscripción y los acuerdos anteriores de Wallet.</p><p>Toda contratación nueva se realiza desde Paquetes y servicios.</p>${localLink('/plans/wallet','Ver mi suscripción Wallet','btn')}`):''}<iframe class="management-frame" title="${esc(managementTitles[slug])}" src="/management/view?${esc(query.toString())}" data-management-frame></iframe><p class="muted" data-frame-status role="status"></p>`;
}
export function managementDocument(actor,company,section) {
 return loyaltyWorkspaceHtml(actor,section,[section],company)
  .replace('name="lumina-wallet-mode"','name="lumina-management" content="yes"><meta name="lumina-wallet-mode"')
  .replace('name="lumina-wallet-back" content="/home"','name="lumina-wallet-back" content="/management"')
  .replace('<body class="lumina-loyalty">','<body class="lumina-loyalty lumina-embedded">')
  .replace('src="/assets/loyalty-launch.js"','src="/assets/management-launch.js"')
  .replace('</head>','<link rel="stylesheet" href="/assets/central.css"></head>');
}
