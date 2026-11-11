import { areas, formats, localDay, services } from '../shared/domain.mjs';
import { compatibleContentQuota, contentName } from '../content/service-options.mjs';

export function serviceArea(service) {
  if(service==='WALLET'||service==='LOYALTY_PROGRAM'||service==='WALLET_DESIGN')return 'WALLET';
  if(service==='POST')return 'SOCIAL'; // Legacy POST quotas do not identify a Maps service.
  return Object.keys(areas).find(area=>formats[area].includes(service))||'';
}
export const serviceName=service=>serviceArea(service)==='SOCIAL'?contentName(service):services[service]||service;
export function describeOffer(plan) {
  const individual=plan.items.length===1&&plan.items[0].quantity===1;
  const single=plan.items.length===1?plan.items[0]:null;
  return {kind:individual?'individual':'paquete',areas:[...new Set(plan.items.map(i=>serviceArea(i.service)))],
    // A reference average is never used for billing, mixed bundles or savings claims.
    unitMinor:single&&single.quantity>1&&plan.price_minor!==null?plan.price_minor/single.quantity:null,
    unitService:single?.service,quantity:single?.quantity};
}
export function requestCommercial(plans=[],contracts=[],area='SOCIAL') {
  const today=localDay();
  return (area==='SOCIAL'?['VIDEO','PHOTO','GRAPHIC']:formats[area]||[]).map(service=>({service,
    offers:plans.filter(p=>p.published&&p.items.length===1&&p.items[0].service===service).map(p=>({
      id:p.id,name:p.name,term:p.term,price:p.price_minor,quantity:p.items[0].quantity
    })),
    available:contracts.filter(c=>!c.cancelled_at&&c.starts_on<=today&&c.ends_before>today)
      .flatMap(c=>c.items.filter(i=>area==='SOCIAL'?compatibleContentQuota(service,i.service):service===i.service)
        .map(i=>({name:c.name,service:i.service,remaining:Math.max(0,i.quantity-i.used-i.reserved)})))
  }));
}
