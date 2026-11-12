import { can } from '../access/accounts.mjs';
export function walletSections(actor) {
  if(actor.kind==='AGENCY')return [];
  if(actor.kind==='OWNER')return ['overview','sales','customers','radar','programs','rewards','design','walletHealth','events','qr'];
  if(!can(actor,'WALLET'))return [];
  const sections=[];
  if(can(actor,'WALLET_DESIGN'))sections.push('design','qr');
  if(can(actor,'WALLET_PROGRAMS'))sections.push('programs','rewards');
  if(can(actor,'WALLET_CUSTOMERS'))sections.push('customers');
  if(can(actor,'WALLET_REPORTS'))sections.push('walletHealth');
  return sections;
}
const id='[0-9a-fA-F-]{36}';
const paths={
 WALLET_DESIGN:{GET:/^\/api\/staff\/wallet-design$/,PUT:/^\/api\/staff\/wallet-design$/},
 WALLET_PROGRAMS:{GET:new RegExp(`^/api/staff/programs/${id}/deletion-preview$`),POST:/^\/api\/staff\/(programs|promotion-templates|promotion-setups|rewards)$/,PUT:new RegExp(`^/api/staff/(programs|rewards)/${id}$`),DELETE:new RegExp(`^/api/staff/programs/${id}$`)},
 WALLET_CUSTOMERS:{GET:new RegExp(`^/api/staff/(customer-activity|customer-suggestions|customer-events|customer-insights(?:/${id})?|customer-workspace/${id})$`),POST:/^\/api\/staff\/(wallet\/restore|customer-events)$/,PUT:new RegExp(`^/api/staff/customer-insights/${id}/preferences$`),DELETE:new RegExp(`^/api/staff/customer-events/${id}$`)},
 WALLET_REPORTS:{GET:/^\/api\/staff\/(metrics|return-radar|wallet-health)$/},
};
export function delegatedRouteAllowed(actor,method,path) {
  if(actor.kind==='AGENCY')return false;
  if(actor.kind==='OWNER')return true;
  if(!can(actor,'WALLET')||!walletSections(actor).length)return false;
  if(method==='GET'&&['/api/staff/dashboard','/api/staff/access'].includes(path))return true;
  return Object.entries(paths).some(([scope,routes])=>can(actor,scope,method==='GET'?'VIEW':'EDIT')&&routes[method]?.test(path));
}
