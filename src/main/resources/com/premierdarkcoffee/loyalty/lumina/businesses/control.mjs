import { event, isId, now, requireThat, text } from '../shared/domain.mjs';
export const businessStates=Object.freeze({ACTIVE:'Activo',PAUSED:'En pausa',SUSPENDED:'Suspendido',CLOSED:'Cerrado'});
export function businessControl(db,companyId) {
 return db.get('SELECT * FROM business_controls WHERE company_id=?',companyId)||{company_id:companyId,state:'ACTIVE',reason:'',revision:0,pending_id:null,archived_at:null};
}
export function requireOperating(db,companyId) {
 if(!companyId)return;
 const control=businessControl(db,companyId);
 requireThat(control.state==='ACTIVE'&&!control.pending_id&&!control.archived_at,'Los servicios del negocio están pausados. Conservas tu cuenta, tus pagos y el historial. Contacta a Lúmina para revisar el estado.',423);
}
export function requestBusinessChange(db,actor,companyId,data) {
 requireThat(actor.kind==='AGENCY','Acceso exclusivo de administración.',403);
 requireThat(isId(companyId)&&db.get('SELECT id FROM companies WHERE id=?',companyId),'Negocio no encontrado.',404);
 const operation=data.operation||'STATE';
 requireThat(['STATE','DELETE','RESTORE'].includes(operation),'Acción inválida.');
 requireThat(operation==='STATE'||data.state===(operation==='DELETE'?'CLOSED':'ACTIVE'),'Estado incompatible.');
 if(operation==='DELETE')requireThat(data.name===db.get('SELECT name FROM companies WHERE id=?',companyId).name,'Escribe el nombre del negocio para confirmar la eliminación.');
 requireThat(isId(data.requestKey)&&Object.hasOwn(businessStates,data.state),'Revisa la acción solicitada.');
 requireThat(data.confirm==='yes','Confirma el cambio y su efecto en los servicios.');
 const reason=text(data.reason,'motivo',5,500),revision=Number(data.revision);
 requireThat(Number.isSafeInteger(revision)&&revision>=0,'Recarga el estado antes de continuar.');
 return db.transaction(()=>{
  const replay=db.get('SELECT * FROM business_commands WHERE id=?',data.requestKey);
  if(replay){requireThat(replay.company_id===companyId&&replay.actor_id===actor.id&&replay.state===data.state&&replay.operation===operation&&replay.reason===reason&&replay.expected_revision===revision,'La referencia ya se utilizó con otros datos.',409);return replay;}
  const current=businessControl(db,companyId);
  requireThat(current.revision===revision&&!current.pending_id,'El estado cambió o tiene una actualización pendiente. Recarga antes de continuar.',409);
  requireThat(operation==='RESTORE'?Boolean(current.archived_at):!current.archived_at,'Restaura el negocio antes de cambiar su estado.',409);
  requireThat(operation!=='STATE'||current.state!==data.state,'El negocio ya tiene ese estado.',409);
  db.run('INSERT INTO business_commands(id,company_id,actor_id,state,reason,expected_revision,created_at,operation) VALUES(?,?,?,?,?,?,?,?)',data.requestKey,companyId,actor.id,data.state,reason,revision,now(),operation);
  // Block locally before contacting Wallet; reactivation is published only after native acknowledgement.
  db.run(`INSERT INTO business_controls(company_id,state,reason,revision,pending_id,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,revision=excluded.revision,pending_id=excluded.pending_id,updated_at=excluded.updated_at`,companyId,data.state==='ACTIVE'?current.state:data.state,reason,revision+1,data.requestKey,now());
  if(operation==='DELETE'){
   db.run('UPDATE business_controls SET archived_at=? WHERE company_id=?',now(),companyId);
   db.run('DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE company_id=?)',companyId);
   db.run('DELETE FROM codes WHERE account_id IN (SELECT id FROM accounts WHERE company_id=?)',companyId);
  }
  event(db,actor,companyId,'COMPANY',companyId,'CONTROL_SOLICITADO',JSON.stringify({from:current.state,to:data.state,operation,reason,command:data.requestKey}));
  return db.get('SELECT * FROM business_commands WHERE id=?',data.requestKey);
 });
}
export function createBusinessControlSync({db,remote,ensureCompany}) {
 const busy=new Map();
 async function perform(companyId) {
  const control=businessControl(db,companyId);if(!control.pending_id)return control;
  let command=db.get('SELECT * FROM business_commands WHERE id=?',control.pending_id);
  let company=db.get('SELECT * FROM companies WHERE id=?',companyId);
  const requested=db.get("SELECT 1 FROM company_services WHERE company_id=? AND service='WALLET'",companyId);
  if(!company.loyalty_tenant&&requested)company=await ensureCompany(companyId);
  if(company.loyalty_tenant) {
  requireThat(company.loyalty_tenant,'No se pudo localizar Wallet. El bloqueo local sigue activo.',503);
  if(command.native_version===null){
   const access=await remote(company.loyalty_tenant,'access');
   requireThat(Number.isSafeInteger(access.version),'Estado Wallet inválido.',502);
   db.run('UPDATE business_commands SET native_version=? WHERE id=? AND native_version IS NULL',access.version,command.id);
   command=db.get('SELECT * FROM business_commands WHERE id=?',command.id);
  }
  const result=await remote(company.loyalty_tenant,'access',{method:'PUT',body:{state:command.state==='PAUSED'?'SUSPENDED':command.state,reason:command.reason,expectedVersion:command.native_version,commandId:command.id}});
  requireThat(result.state===(command.state==='PAUSED'?'SUSPENDED':command.state)&&result.version===command.native_version+1,'No se pudo confirmar el cambio en Wallet.',502);
  }
  return db.transaction(()=>{
   const current=businessControl(db,companyId);
   requireThat(current.pending_id===command.id,'Hay un cambio posterior pendiente.',409);
   db.run('UPDATE business_commands SET native_done=1,completed_at=? WHERE id=?',now(),command.id);
   db.run('UPDATE business_controls SET state=?,pending_id=NULL,updated_at=? WHERE company_id=?',command.state,now(),companyId);
   if(command.operation==='RESTORE')db.run('UPDATE business_controls SET archived_at=NULL WHERE company_id=?',companyId);
   event(db,db.get('SELECT id,name FROM accounts WHERE id=?',command.actor_id),companyId,'COMPANY',companyId,'CONTROL_APLICADO',JSON.stringify({state:command.state,operation:command.operation,command:command.id}));
   return businessControl(db,companyId);
  });
 }
 function sync(companyId){if(!busy.has(companyId))busy.set(companyId,perform(companyId).finally(()=>busy.delete(companyId)));return busy.get(companyId);}
 async function sweep(){for(const row of db.all('SELECT company_id FROM business_controls WHERE pending_id IS NOT NULL ORDER BY updated_at LIMIT 20'))try{await sync(row.company_id);}catch{ /* Rotate unsuccessful work so one provider outage cannot starve other businesses. */ db.run('UPDATE business_controls SET updated_at=? WHERE company_id=? AND pending_id IS NOT NULL',now(),row.company_id); }}
 async function reconcile(companyId){
  try{return await sync(companyId);}catch(error){
   if(error.code!=='VERSION_CONFLICT')throw error;
   const current=businessControl(db,companyId);if(!current.pending_id)return current;
   const company=await ensureCompany(companyId),access=await remote(company.loyalty_tenant,'access');
   requireThat(Number.isSafeInteger(access.version),'Estado Wallet inválido.',502);
   // Explicit agency retry only. A lost acknowledgement replays successfully above and never rebases.
   db.run('UPDATE business_commands SET native_version=? WHERE id=? AND completed_at IS NULL',access.version,current.pending_id);
   return sync(companyId);
  }
 }
 return {sync,sweep,reconcile};
}
