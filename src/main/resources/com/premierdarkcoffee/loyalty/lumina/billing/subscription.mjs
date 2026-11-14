import { requireAgency, requireOwner } from '../access/accounts.mjs';
import { event, now, localDay, requireThat, text } from '../shared/domain.mjs';
export function legalProfile(db) {
 const row=db.get('SELECT * FROM agency_legal WHERE id=1');
 return row?{legalName:row.legal_name,ruc:row.ruc,address:row.address,email:row.email,phone:row.phone,privacyUrl:row.privacy_url,revision:row.revision}:null;
}
export function saveLegalProfile(db,actor,data) {
 requireAgency(actor);
 const p={legalName:text(data.legalName,'razón social',3,250),ruc:text(data.ruc,'RUC',13,13),address:text(data.address,'domicilio',3,250),email:text(data.email,'correo',5,180),phone:text(data.phone,'teléfono',7,25),privacyUrl:text(data.privacyUrl,'política de privacidad',10,500)};
 requireThat(/^\d{13}$/.test(p.ruc)&&!/^0+$/.test(p.ruc)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)&&/^\+?[0-9() -]+$/.test(p.phone),'Revisa el RUC, correo y teléfono.');
 let url;try{url=new URL(p.privacyUrl);}catch{}
 requireThat(url?.protocol==='https:'&&!url.username&&!url.password,'Usa el enlace HTTPS de la política de privacidad publicada.');
 requireThat(data.confirm==='yes','Confirma que la identificación y la política corresponden a Lúmina.');
 return db.transaction(()=>{
  const current=legalProfile(db);
  requireThat(String(current?.revision||0)===String(data.revision),'Estos datos cambiaron. Recarga antes de guardar.',409);
  db.run(`INSERT INTO agency_legal VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET legal_name=excluded.legal_name,ruc=excluded.ruc,address=excluded.address,email=excluded.email,phone=excluded.phone,privacy_url=excluded.privacy_url,revision=excluded.revision,updated_at=excluded.updated_at`,p.legalName,p.ruc,p.address,p.email,p.phone,p.privacyUrl,(current?.revision||0)+1,now());
  event(db,actor,null,'AGENCY','legal','IDENTIFICACION_LEGAL_ACTUALIZADA','Versión '+((current?.revision||0)+1));
 });
}
export function subscriptionOfferInput(db,actor,cycle="MONTHLY") {
 requireOwner(actor);
 requireThat(["MONTHLY","ANNUAL"].includes(cycle),"Elige mensual o anual.");
 const currentDay=localDay();
 const previous=db.get(`SELECT c.id FROM contracts c JOIN plan_items i ON i.plan_id=c.plan_id AND i.service='WALLET'
   WHERE c.company_id=? AND c.cancelled_at IS NULL AND c.ends_before>? LIMIT 1`,actor.company_id,currentDay);
 const accepted=db.get(`SELECT l.id FROM package_order_lines l JOIN package_orders o ON o.id=l.order_id WHERE o.company_id=? AND o.status='ACCEPTED' AND l.ends_before>? AND (l.wallet<>'NONE' OR EXISTS(SELECT 1 FROM json_each(l.items_json) i WHERE json_extract(i.value,'$.service')='WALLET')) LIMIT 1`,actor.company_id,currentDay);
 requireThat(!previous&&!accepted,'Tienes Wallet incluida en un acuerdo vigente. Lúmina debe revisar ese acuerdo antes de añadir una suscripción para evitar cobrar dos veces.',409);
 const provider=legalProfile(db);
 requireThat(provider,'Lúmina está completando la identificación del proveedor. Aún no se activan cargos automáticos.',409);
 const {revision,...identity}=provider;
 return {companyId:actor.company_id,ownerId:actor.id,ownerName:actor.name,ownerEmail:actor.document?'':actor.email,ownerDocument:actor.document||'',provider:identity,cycle};
}
