// Effective business state is read at query time. Historical work is never rewritten.
// SQL expressions below are internal identifiers, never request parameters.
export const operationLabels=Object.freeze({ACTIVE:'Activo',PAUSED:'En pausa',SUSPENDED:'Suspendido',CLOSED:'Cerrado',ARCHIVED:'Eliminado',PENDING:'Cambio pendiente'});
export function businessStateSql(company='r.company_id') {
  return `coalesce((SELECT CASE WHEN bc.pending_id IS NOT NULL THEN 'PENDING' WHEN bc.archived_at IS NOT NULL THEN 'ARCHIVED' ELSE bc.state END FROM business_controls bc WHERE bc.company_id=${company}),'ACTIVE')`;
}
export function operatingSql(company='r.company_id') {
  return `(${businessStateSql(company)}='ACTIVE')`;
}
export const requestBusinessSql=`${businessStateSql()} AS business_state`;
export function operationState(db,companyId) {
  return db.get(`SELECT ${businessStateSql('?')} AS state`,companyId).state;
}
export function workHold(row) {
  const state=row.business_state||'ACTIVE';
  if(state==='ACTIVE')return null;
  const label=operationLabels[state]||'No disponible';
  return {state,label,title:state==='ARCHIVED'?'Archivada · Negocio eliminado':'Detenida · '+label,
    detail:state==='ARCHIVED'?'Registro conservado del negocio eliminado.':'El trabajo está detenido por el estado del negocio.'};
}
