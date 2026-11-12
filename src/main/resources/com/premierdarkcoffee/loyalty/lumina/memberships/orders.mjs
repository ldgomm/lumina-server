import { requestPhone } from '../shared/contact.mjs';
import { requireAgency, requireOwner } from '../access/accounts.mjs';
import { dateOnly, event, integer, isId, localDay, money, now, requireThat, text, uuid } from '../shared/domain.mjs';
import { getPlan } from './billing.mjs';

const commercial = (actor,company) => {
  requireThat(actor.kind==='AGENCY'||actor.kind==='OWNER'&&actor.company_id===company.id,'Tu acceso no incluye contrataciones.',403);
};
export const inclusiveEnd = end => new Date(Date.parse(end+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const afterDay = day => new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export function monthlyEnd(start,anchor=start) {
  const [year,month]=start.split('-').map(Number),day=Number(anchor.slice(-2));
  return new Date(Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate()))).toISOString().slice(0,10);
}
export function orderTotals(lines) {
  const totals={MONTHLY:{amount:0,pending:0},ONE_OFF:{amount:0,pending:0}};
  for(const line of lines) {
    if(line.unit_minor===null)totals[line.term].pending++;
    else totals[line.term].amount+=line.unit_minor*line.units;
  }
  requireThat(Object.values(totals).every(t=>Number.isSafeInteger(t.amount)&&t.amount<=9999999999),'La combinación excede el importe permitido.');
  return totals;
}
export function getOrder(db,actor,company,id) {
  commercial(actor,company);
  const order=db.get('SELECT * FROM package_orders WHERE company_id=? AND id=?',company.id,id||'');
  requireThat(order,'Contratación no encontrada.',404);
  const lines=db.all('SELECT * FROM package_order_lines WHERE company_id=? AND order_id=? ORDER BY term,name,id',company.id,id)
    .map(line=>({...line,items:JSON.parse(line.items_json)}));
  return {...order,lines,totals:orderTotals(lines)};
}
export function ordersFor(db,actor,company,page=0) {
  requireThat(actor.kind!=='COLLABORATOR','Tu acceso no incluye contrataciones.',403);
  if(company)commercial(actor,company);else requireAgency(actor);
  const rows=db.all(`SELECT o.*,c.name AS company_name FROM package_orders o JOIN companies c ON c.id=o.company_id
    WHERE (? IS NULL OR o.company_id=?) ORDER BY o.created_at DESC,o.id DESC LIMIT 21 OFFSET ?`,company?.id||null,company?.id||null,page*20);
  return {rows:rows.slice(0,20),more:rows.length>20,page};
}
function renewable(db,company,id) {
  const contract=db.get(`SELECT c.*,p.name,p.term,p.wallet FROM contracts c JOIN plans p ON p.id=c.plan_id
    WHERE c.id=? AND c.company_id=?`,id||'',company.id);
  requireThat(contract&&!contract.cancelled_at&&contract.term==='MONTHLY','Este acuerdo no admite renovación.',409);
  requireThat(contract.ends_before>=localDay(),'Este período ya terminó. Selecciona una nueva contratación con fechas actuales.',409);
  requireThat(!db.get('SELECT id FROM contracts WHERE renewal_of=?',id),'Ya existe el siguiente período.',409);
  return contract;
}
export function submitOrder(db,actor,company,data) {
  requireOwner(actor);commercial(actor,company);
  requireThat(isId(data.key),'Vuelve a abrir el catálogo antes de enviar.',400);
  const notes=text(data.notes||'','indicaciones',0,2000);
  return db.transaction(()=>{
    const replay=db.get('SELECT id FROM package_orders WHERE company_id=? AND submission_key=?',company.id,data.key);
    if(replay)return replay.id;
    const phone=requestPhone(data,company);
    let selections=[];
    if(data.renewal) {
      const previous=renewable(db,company,data.renewal);
      requireThat(!db.get(`SELECT l.id FROM package_order_lines l JOIN package_orders o ON o.id=l.order_id
        WHERE l.renewal_of=? AND o.status<>'CANCELLED'`,previous.id),'Ya solicitaste renovar este período.',409);
      selections=[{plan:getPlan(db,previous.plan_id),units:previous.units,previous}];
    } else {
      for(const [key,value] of Object.entries(data).filter(([key])=>key.startsWith('qty_'))) {
        const units=integer(value,'cantidad de paquetes',{min:0,max:10});
        if(!units)continue;
        const plan=getPlan(db,key.slice(4));
        requireThat(plan.published,'Una oferta fue retirada. Actualiza el catálogo.',409);
        selections.push({plan,units});
      }
    }
    requireThat(selections.length>0&&selections.length<=30,'Selecciona entre 1 y 30 ofertas. Puedes combinarlas libremente.');
    const id=uuid();
    db.run(`INSERT INTO package_orders(id,company_id,submitted_by,submission_key,status,notes,created_at,contact_phone)
      VALUES(?,?,?,?,'REQUESTED',?,?,?)`,id,company.id,actor.id,data.key,notes,now(),phone);
    for(const {plan,units,previous} of selections) {
      const price=previous?previous.agreed_minor/previous.units:plan.price_minor;
      requireThat(price===null||Number.isSafeInteger(price),'Revisa el precio unitario del acuerdo.');
      db.run(`INSERT INTO package_order_lines(id,company_id,order_id,plan_id,name,term,wallet,units,items_json,catalog_minor,unit_minor,renewal_of)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,uuid(),company.id,id,plan.id,plan.name,plan.term,plan.wallet,units,JSON.stringify(plan.items),price,price,previous?.id||null);
    }
    orderTotals(getOrder(db,actor,company,id).lines);
    event(db,actor,company.id,'ORDER',id,'COMBINACIÓN_SOLICITADA',notes);
    return id;
  });
}
const checkVersion = (order,data) => requireThat(order.revision===integer(data.revision,'versión',{min:1}),
  'La propuesta cambió. Revisa la versión actual antes de continuar.',409);
export function offerOrder(db,actor,company,id,data) {
  requireAgency(actor);
  return db.transaction(()=>{
    const order=getOrder(db,actor,company,id);checkVersion(order,data);
    requireThat(['REQUESTED','QUOTED'].includes(order.status),'La propuesta ya fue aceptada o cerrada.',409);
    const terms=text(data.terms,'alcance y condiciones',5,4000);
    const lines=order.lines.map(line=>{
      const previous=line.renewal_of?renewable(db,company,line.renewal_of):null;
      const starts=previous?.ends_before||dateOnly(data['start_'+line.id],'fecha de inicio');
      requireThat(starts>=localDay(),'El inicio no puede ser anterior a hoy.');
      const end=line.term==='MONTHLY'?monthlyEnd(starts,previous?.renewal_anchor||previous?.starts_on||starts):
        afterDay(dateOnly(data['end_'+line.id],'último día del trabajo puntual'));
      requireThat(end>starts,'El último día debe ser igual o posterior al inicio.');
      const amount=money(data['price_'+line.id]);
      return {...line,starts_on:starts,ends_before:end,unit_minor:amount};
    });
    orderTotals(lines);
    for(const line of lines)db.run('UPDATE package_order_lines SET unit_minor=?,starts_on=?,ends_before=? WHERE id=?',line.unit_minor,line.starts_on,line.ends_before,line.id);
    db.run("UPDATE package_orders SET status='QUOTED',terms=?,revision=revision+1 WHERE id=?",terms,id);
    event(db,actor,company.id,'ORDER',id,'PROPUESTA_PREPARADA',JSON.stringify({revision:order.revision+1,terms,lines:lines.map(l=>({id:l.id,price:l.unit_minor,units:l.units,start:l.starts_on,end:l.ends_before}))}));
  });
}
export function acceptOrder(db,actor,company,id,data) {
  requireOwner(actor);
  return db.transaction(()=>{
    const order=getOrder(db,actor,company,id);checkVersion(order,data);
    if(['ACCEPTED','ACTIVE'].includes(order.status))return;
    requireThat(order.status==='QUOTED','La agencia debe preparar la propuesta primero.',409);
    requireThat(data.confirm==='yes','Confirma los importes, fechas y condiciones.');
    requireThat(order.lines.every(l=>l.starts_on>=localDay()),'Las fechas vencieron. Solicita a Lúmina una propuesta actualizada.',409);
    db.run("UPDATE package_orders SET status='ACCEPTED',accepted_at=? WHERE id=?",now(),id);
    event(db,actor,company.id,'ORDER',id,'PROPUESTA_ACEPTADA','Versión '+order.revision);
  });
}
export function activateOrder(db,actor,company,id,data) {
  requireAgency(actor);
  requireThat(company.approved,'Verifica el negocio antes de activar los servicios.',409);
  return db.transaction(()=>{
    const order=getOrder(db,actor,company,id);checkVersion(order,data);
    if(order.status==='ACTIVE')return;
    requireThat(order.status==='ACCEPTED','El dueño debe aceptar esta propuesta antes de activarla.',409);
    requireThat(order.lines.every(l=>l.starts_on>=localDay()),'Las fechas vencieron. Cierra esta propuesta y prepara una nueva.',409);
    for(const line of order.lines) {
      const previous=line.renewal_of?renewable(db,company,line.renewal_of):null;
      const contract=uuid();
      db.run(`INSERT INTO contracts(id,company_id,plan_id,agreed_minor,starts_on,ends_before,created_at,units,order_line_id,renewal_of,renewal_anchor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,contract,company.id,line.plan_id,line.unit_minor*line.units,line.starts_on,line.ends_before,now(),line.units,line.id,line.renewal_of,
        line.term==='MONTHLY'?(previous?.renewal_anchor||previous?.starts_on||line.starts_on):null);
      event(db,actor,company.id,'CONTRACT',contract,'PAQUETE_ACTIVADO',line.name+' · '+line.units+' unidad(es)');
    }
    db.run("UPDATE package_orders SET status='ACTIVE',activated_at=? WHERE id=?",now(),id);
    event(db,actor,company.id,'ORDER',id,'COMBINACIÓN_ACTIVADA','Versión '+order.revision);
  });
}
export function cancelOrder(db,actor,company,id,data) {
  commercial(actor,company);
  return db.transaction(()=>{
    const order=getOrder(db,actor,company,id);checkVersion(order,data);
    if(order.status==='CANCELLED')return;
    requireThat(order.status!=='ACTIVE','Gestiona cada acuerdo activo por separado.',409);
    const reason=text(data.reason,'motivo',5,500);
    db.run("UPDATE package_orders SET status='CANCELLED' WHERE id=?",id);
    event(db,actor,company.id,'ORDER',id,'PROPUESTA_CANCELADA',reason);
  });
}
