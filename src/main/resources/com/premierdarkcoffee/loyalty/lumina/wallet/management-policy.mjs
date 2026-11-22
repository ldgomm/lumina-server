import { can } from '../access/accounts.mjs';
export const managementSections=Object.freeze({business:'business',branches:'branches',activity:'activity',operations:'operations',account:'history',reports:'reports'});
export const managementTitles=Object.freeze({business:'Datos del negocio',branches:'Sucursales',activity:'Actividad',operations:'Operación por sucursal',history:'Cargos y pagos de Wallet',reports:'Informes de fidelización'});
export const centralPaths=Object.freeze({administration:'/management',business:'/management/business',branches:'/management/branches',team:'/team',activity:'/management/activity',operations:'/management/operations',account:'/plans?view=agreements',reports:'/management/reports'});
export const isManagementPath=path=>/^\/api\/staff\/(administration|branch-directory|branches|business-profile|activity(?:\.csv)?|operations|metrics|account|notices)(?:\/|$)/.test(path);
export function canReadFidelityReport(actor){return actor.kind==='OWNER'||actor.kind==='COLLABORATOR'&&can(actor,'WALLET')&&can(actor,'WALLET_REPORTS');}
export function managementRouteAllowed(actor,method,path) {
  if(actor.kind==='COLLABORATOR')return method==='GET'&&path==='/api/staff/metrics'&&canReadFidelityReport(actor);
  if(actor.kind!=='OWNER')return false;
  if(method==='GET')return /^\/api\/staff\/(dashboard|access|account|branch-directory|business-profile|activity(?:\.csv)?|operations|metrics|return-radar)$/.test(path);
  if(method==='POST')return /^\/api\/staff\/(branch-directory|business-profile\/requests|activity\/[0-9a-f-]{36}\/correction(?:\/preview)?|notices\/[0-9a-f-]{36}\/read)$/.test(path);
  return method==='PUT'&&/^\/api\/staff\/(business-profile|branch-directory\/[0-9a-f-]{36})$/.test(path);
}
