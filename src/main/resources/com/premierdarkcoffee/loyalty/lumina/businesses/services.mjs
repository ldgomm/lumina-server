import { event, now, requireThat } from '../shared/domain.mjs';
import { requireOperating } from './control.mjs';

export const serviceCatalog = Object.freeze({
  SOCIAL: {name:'Contenido', description:'Videos, fotografías y diseños para tus redes.', icon:'social', path:'/content'},
  WALLET: {name:'Wallet', description:'Tarjetas, puntos y premios para tus clientes.', icon:'wallet', path:'/wallet'},
  MAPS: {name:'Google Maps', description:'Tu negocio, sus reseñas y resultados.', icon:'maps', path:'/services/maps'},
  WEB: {name:'Web', description:'Tu página, tienda o menú digital.', icon:'web', path:'/services/web'},
  BRAND: {name:'Diseño de marca', description:'Tu logo e identidad visual.', icon:'content', path:'/services/brand'},
});
export function serviceState(db,companyId,service) {
  return db.get('SELECT status FROM company_services WHERE company_id=? AND service=?',companyId,service)?.status || 'INACTIVE';
}
export function activeServices(db,companyId) {
  return db.all("SELECT service FROM company_services WHERE company_id=? AND status='ACTIVE'",companyId).map(row=>row.service);
}
export function requireService(db,companyId,service,{setup=false}={}) {
  const status=serviceState(db,companyId,service);
  requireThat(status==='ACTIVE'||setup&&status==='SETUP', 'Activa este servicio desde Mis servicios antes de continuar.',409);
}
export function beginService(db,actor,service) {
  requireThat(Object.hasOwn(serviceCatalog,service),'Servicio no disponible.',404);
  return db.transaction(()=>{
    const fresh=db.get("SELECT id,name,company_id FROM accounts WHERE id=? AND kind='OWNER' AND active=1 AND revision=?",actor.id,actor.revision);
    requireThat(fresh&&fresh.company_id===actor.company_id,'Solo el dueño puede activar servicios.',403);
    requireOperating(db,fresh.company_id);
    const result=db.run(`INSERT INTO company_services VALUES(?,?,?,?,?) ON CONFLICT(company_id,service) DO NOTHING`,fresh.company_id,service,service==='WALLET'?'SETUP':'ACTIVE',fresh.id,now());
    if(result.changes)event(db,fresh,fresh.company_id,'SERVICE',service,service==='WALLET'?'ACTIVACIÓN_SOLICITADA':'SERVICIO_ACTIVADO','',service);
    return serviceState(db,fresh.company_id,service);
  });
}
export function completeWalletActivation(db,actor) {
  return db.transaction(()=>{
    requireThat(db.get("SELECT id FROM accounts WHERE id=? AND kind='OWNER' AND active=1 AND revision=?",actor.id,actor.revision),'La cuenta cambió. Inicia sesión nuevamente.',403);
    requireOperating(db,actor.company_id);
    if(db.run("UPDATE company_services SET status='ACTIVE' WHERE company_id=? AND service='WALLET' AND status='SETUP'",actor.company_id).changes)
      event(db,actor,actor.company_id,'SERVICE','WALLET','SERVICIO_ACTIVADO','Condiciones aceptadas por el dueño.','WALLET');
  });
}
export function finishWelcome(db,actor) {
  requireThat(db.run('UPDATE accounts SET welcome_done=1 WHERE id=? AND active=1 AND revision=?',actor.id,actor.revision).changes===1,'Tu cuenta cambió. Inicia sesión nuevamente.',409);
}
export function routeService(path) {
  if(/^\/(wallet(?:-api)?|cashier(?:-assets)?|loyalty-assets|join)(?:\/|$)/.test(path)||path.startsWith('/api/'))return 'WALLET';
  if(/^\/(content|calendar|reports)(?:\/|$)/.test(path))return 'SOCIAL';
  if(path==='/maps'||path.startsWith('/maps/'))return 'MAPS';
  return /^\/services\/(social|maps|web|brand)$/.exec(path)?.[1].toUpperCase()||null;
}
