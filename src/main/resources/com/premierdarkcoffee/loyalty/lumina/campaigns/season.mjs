import { localDay, requireThat } from '../shared/domain.mjs';

export const campaignZone='America/Guayaquil';
export const campaignThemes={GOLD:'Navy y oro',VIOLET:'Navy y violeta',ICE:'Navy y hielo'};
export function campaignDates(year) {
  requireThat(Number.isSafeInteger(year)&&year>=2026&&year<=2199,'Elige un año válido.');
  const last=new Date(Date.UTC(year,10,30));
  last.setUTCDate(30-(last.getUTCDay()+2)%7);
  return {year,first:`${year}-11-01`,last:`${year}-11-30`,until:`${year}-12-01`,friday:last.toISOString().slice(0,10),deadline:`${year}-12-01T05:00:00.000Z`};
}
export function offerAvailable(plan,today=localDay()) {
  return Boolean(plan.published&&(!plan.campaign||plan.campaign.starts_on<=today&&today<plan.campaign.ends_before));
}
export function campaignState(plan,today=localDay()) {
  if(today>=plan.campaign.ends_before)return 'Finalizada';
  if(!plan.published)return 'Retirada';
  return today<plan.campaign.starts_on?'Programada':'Disponible';
}
export function attachCampaign(db,plan) {
  return {...plan,campaign:db.get('SELECT * FROM seasonal_offers WHERE plan_id=?',plan.id)||null};
}
export function requireCampaignOpen(plan) {
  requireThat(!plan.campaign||offerAvailable(plan),'La promoción de Viernes Negro ya no está disponible. Revisa las ofertas vigentes.',409);
}
export const campaignNotice=year=>`Promoción válida hasta el 30 de noviembre de ${year}. Se desactiva automáticamente el 1 de diciembre a las 00:00, hora de Ecuador continental.`;
