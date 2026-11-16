import { can } from '../access/accounts.mjs';
import { requireThat } from '../shared/domain.mjs';
import { serviceCatalog, serviceState } from './services.mjs';
import { businessControl } from './control.mjs';

export const serviceStatusLabels = Object.freeze({
  ACTIVE:'Disponible', SETUP:'Activación pendiente', INACTIVE:'Sin activar',
  PAUSED:'En pausa', SUSPENDED:'Suspendido', CLOSED:'Cerrado', ARCHIVED:'Eliminado', PENDING:'Bloqueado · cambio pendiente',
});

// This is an operational projection, never a replacement for activation or authorization.
// A business block must not overwrite its individual activation choices.
export function serviceStatus(db,actor,companyId,{nativeAccess}={}) {
  requireThat(actor && (actor.kind==='AGENCY'||actor.company_id===companyId),'Acceso de otro negocio.',403);
  const company=db.get('SELECT id,loyalty_tenant FROM companies WHERE id=?',companyId);
  requireThat(company,'Negocio no encontrado.',404);
  const control=businessControl(db,companyId);
  const command=control.pending_id?db.get('SELECT state,operation,created_at FROM business_commands WHERE id=? AND company_id=?',control.pending_id,companyId):null;
  const blocked=control.state!=='ACTIVE'||Boolean(control.pending_id)||Boolean(control.archived_at);
  const state=control.pending_id?'PENDING':control.archived_at?'ARCHIVED':control.state;
  const cash=actor.kind==='COLLABORATOR'&&db.get("SELECT purchases,rewards,branch_name FROM cash_grants WHERE account_id=? AND company_id=? AND status='ACTIVE'",actor.id,companyId);
  const assigned={...actor,services:undefined};
  const rows=Object.entries(serviceCatalog).filter(([code])=>actor.kind!=='COLLABORATOR'||can(assigned,code)||code==='WALLET'&&cash).map(([code,service])=>{
    const activation=serviceState(db,companyId,code);
    const effective=blocked?state:activation;
    return {code,...service,activation,effective,label:serviceStatusLabels[effective],canOpen:!blocked&&activation==='ACTIVE',path:code==='WALLET'&&cash?'/cashier':service.path};
  });
  const latest=db.get('SELECT state,completed_at FROM business_commands WHERE company_id=? AND completed_at IS NOT NULL AND native_done=1 ORDER BY expected_revision DESC LIMIT 1',companyId);
  const requested=serviceState(db,companyId,'WALLET')!=='INACTIVE';
  let wallet;
  if(!requested)wallet={state:'UNUSED',label:'Wallet sin activar',detail:'No hay un programa de Wallet activado desde Mis servicios.'};
  else if(control.pending_id)wallet={state:'PENDING',label:'Wallet: confirmación pendiente',detail:'Lúmina ya bloqueó las operaciones. Falta confirmar el cambio con el servidor de Wallet.'};
  else if(nativeAccess===null)wallet={state:'UNAVAILABLE',label:'Wallet: estado no disponible',detail:'No pudimos consultar el servidor de Wallet. Puedes volver a consultar sin cambiar la configuración.'};
  else if(nativeAccess && ['ACTIVE','SUSPENDED','CLOSED'].includes(nativeAccess.effectiveState))wallet=blocked&&nativeAccess.effectiveState==='ACTIVE'
    ?{state:'REVIEW',label:'Wallet: revisar el estado del servidor',detail:'El bloqueo de Lúmina está activo, pero el servidor de Wallet informa acceso activo. Contacta a soporte antes de dar el cambio por confirmado.'}
    :{state:'OBSERVED',label:'Servidor de Wallet: '+({ACTIVE:'disponible',SUSPENDED:'suspendido',CLOSED:'cerrado'}[nativeAccess.effectiveState]),detail:'Estado consultado al abrir esta pantalla. Las tarjetas del teléfono pueden tardar en actualizarse.'};
  else if(nativeAccess!==undefined)wallet={state:'UNAVAILABLE',label:'Wallet: estado no disponible',detail:'La respuesta del servidor no permite confirmar el estado actual.'};
  else if(latest&&company.loyalty_tenant)wallet={state:'CONFIRMED',label:'Último cambio confirmado en Wallet',detail:'El servidor confirmó el cambio a '+({ACTIVE:'activo',PAUSED:'en pausa',SUSPENDED:'suspendido',CLOSED:'cerrado'}[latest.state])+'. Las tarjetas del teléfono pueden tardar en actualizarse.',at:latest.completed_at};
  else wallet={state:'UNVERIFIED',label:'Wallet conserva su configuración',detail:'El estado de las tarjetas instaladas no se comprueba desde esta pantalla.'};
  return {control,blocked,state,command,rows,wallet};
}
