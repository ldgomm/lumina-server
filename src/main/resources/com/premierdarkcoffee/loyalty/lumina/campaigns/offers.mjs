import { requireAgency } from '../access/accounts.mjs';
import { getPlan, listPlans } from '../memberships/billing.mjs';
import { serviceArea } from '../memberships/catalog.mjs';
import { choice, dateOnly, event, integer, isId, localDay, salePrice, priceFromInput, now, requireThat, text, uuid } from '../shared/domain.mjs';
import { campaignDates, campaignThemes } from './season.mjs';

export const eligibleCampaignBase=plan=>Boolean(plan.published&&!plan.campaign&&plan.price_minor>0&&plan.items.length&&plan.items.every(i=>['SOCIAL','WEB','BRAND'].includes(serviceArea(i.service))));
export const campaignBases=db=>listPlans(db).filter(eligibleCampaignBase);
export function createCampaignOffer(db,actor,data) {
  requireAgency(actor);
  requireThat(!actor.readOnlyCompany,'Publica promociones desde el catálogo de Lúmina.',403);
  requireThat(isId(data.key),'Abre de nuevo el formulario de la promoción.');
  return db.transaction(()=>{
    const replay=db.get('SELECT plan_id FROM seasonal_offers WHERE submission_key=?',data.key);
    if(replay)return replay.plan_id;
    const base=getPlan(db,data.base);
    requireThat(eligibleCampaignBase(base),'Selecciona una oferta vigente de contenido, web o diseño con precio publicado.',409);
    const dates=campaignDates(integer(data.year,'año',{min:2026,max:2199}));
    requireThat(dates.until>localDay(),'La campaña de ese noviembre ya terminó.',409);
    const start=dateOnly(data.starts_on,'inicio de la promoción');
    requireThat(start>=dates.first&&start<dates.until,'El inicio debe estar dentro de noviembre del año elegido.');
    const mode=choice(data.discount_mode,['PERCENT','PRICE'],'forma de descuento');
    const price=mode==='PERCENT'?salePrice(Math.floor(base.price_minor*(100-integer(data.discount,'descuento',{min:1,max:100}))/100)):priceFromInput(data.price);
    requireThat(price>=0&&price<base.price_minor,'El precio promocional debe ser menor al precio habitual.');
    const name=text(data.name,'nombre de la promoción',2,100);
    const description=text(data.description||base.description,'alcance',0,1200);
    const conditions=text(data.conditions,'condiciones de la promoción',5,1200);
    const theme=choice(data.theme,Object.keys(campaignThemes),'estilo');
    requireThat(data.confirm==='yes','Confirma el precio y el cierre automático de noviembre.');
    const id=uuid();
    db.run('INSERT INTO plans(id,name,term,price_minor,wallet,description,created_at) VALUES(?,?,?,?,?,?,?)',id,name,base.term,price,base.wallet,description,now());
    if(base.months===12)db.run('INSERT INTO plan_billing VALUES(?,12,NULL)',id);
    for(const item of base.items)db.run('INSERT INTO plan_items VALUES(?,?,?)',id,item.service,item.quantity);
    db.run('INSERT INTO seasonal_offers VALUES(?,?,?,?,?,?,?,?,?)',id,base.id,dates.year,start,dates.until,base.price_minor,theme,conditions,data.key);
    event(db,actor,null,'PLAN',id,'VIERNES_NEGRO_PUBLICADO',JSON.stringify({base:base.id,regular:base.price_minor,price,start,end:dates.until,year:dates.year}));
    return id;
  });
}
