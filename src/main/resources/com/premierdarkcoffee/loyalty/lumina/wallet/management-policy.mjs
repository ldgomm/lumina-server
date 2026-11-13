import { can } from '../access/accounts.mjs';
export const managementSections=Object.freeze({business:'negocio',branches:'sucursales',activity:'actividad',operations:'operacion',account:'historial',reports:'informes'});
export const managementTitles=Object.freeze({negocio:'Datos del negocio',sucursales:'Sucursales',actividad:'Actividad',operacion:'Operación por sucursal',historial:'Cargos y pagos de Wallet',informes:'Informes de fidelización'});
export const centralPaths=Object.freeze({administration:'/gestion',business:'/gestion/negocio',branches:'/gestion/sucursales',team:'/equipo',activity:'/gestion/actividad',operations:'/gestion/operacion',account:'/planes?vista=acuerdos',reports:'/gestion/informes'});
export const isManagementPath=path=>/^\/api\/staff\/(administration|branch-directory|branches|business-profile|activity(?:\.csv)?|operations|metrics|account|notices)(?:\/|$)/.test(path);
export function canReadFidelityReport(actor){return actor.kind==='OWNER'||actor.kind==='COLLABORATOR'&&can(actor,'WALLET')&&can(actor,'WALLET_REPORTS');}
export function managementRouteAllowed(actor,method,path) {
  if(actor.kind==='COLLABORATOR')return method==='GET'&&path==='/api/staff/metrics'&&canReadFidelityReport(actor);
  if(actor.kind!=='OWNER')return false;
  if(method==='GET')return /^\/api\/staff\/(dashboard|access|account|branch-directory|business-profile|activity(?:\.csv)?|operations|metrics|return-radar)$/.test(path);
  if(method==='POST')return /^\/api\/staff\/(branch-directory|business-profile\/requests|notices\/[0-9a-f-]{36}\/read)$/.test(path);
  return method==='PUT'&&/^\/api\/staff\/(business-profile|branch-directory\/[0-9a-f-]{36})$/.test(path);
}
