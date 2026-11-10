import { requireOwner } from '../access/accounts.mjs';
import { isId, Problem, requireThat } from '../shared/domain.mjs';
import { cashierAssets } from './bridge.mjs';

const id = '[0-9a-fA-F-]{36}';
const ownerReads = new RegExp(`^/api/staff/(dashboard|access|administration|branch-directory|team|activity(?:\\.csv)?|operations|wallet-health|wallet-design|business-profile|metrics|return-radar|customer-activity|customer-suggestions|customer-events|customer-insights(?:/${id})?|customer-workspace/${id}|birthday-settings|account|member-suggestions|programs/${id}/deletion-preview)$`);
const ownerWrites = {
  POST:new RegExp(`^/api/staff/(branches|branch-directory|credentials|programs|promotion-templates|promotion-setups|rewards|members/lookup|wallet/restore|purchases(?:/quote)?|counter-redemptions|redemptions/confirm|customer-events|business-profile/requests|team/${id}/actions|wallet-health/${id}/(?:APPLE|GOOGLE)/retry|notices/${id}/read)$`),
  PUT:new RegExp(`^/api/staff/(wallet-design|business-profile|birthday-settings|programs/${id}|rewards/${id}|team/${id}|branch-directory/${id}|customer-insights/${id}/preferences)$`),
  DELETE:new RegExp(`^/api/staff/(programs/${id}|credentials/${id}|customer-events/${id})$`),
};
const adminReads = new RegExp(`^/api/platform/(overview|tenants|tenant-suggestions|business-categories|wallet/status|tenants/${id}/(?:profile|branches|branch-directory|administration|team|activity(?:\\.csv)?|operations|wallet-health|customer-activity|customer-workspace/${id}|account|metrics|return-radar))$`);
const adminWrites = {
  POST:new RegExp(`^/api/platform/(businesses|tenants|tenants/${id}/(?:branches|branch-directory|credentials|team/${id}/actions|wallet-health/${id}/(?:APPLE|GOOGLE)/retry|charges|payments|payments/${id}/reverse|charges/${id}/void|notices))$`),
  PUT:new RegExp(`^/api/platform/tenants/${id}/(?:profile|profile-requests/${id}|team/${id}|branch-directory/${id}|access|membership)$`),
};
const message = 'No tienes permiso para realizar esta operación de Wallet.';
export function walletRouteAllowed(role,method,path) {
  if (!['AGENCY','OWNER'].includes(role)) return false;
  if (method==='GET') return (role==='AGENCY' ? adminReads : ownerReads).test(path);
  return Boolean((role==='AGENCY' ? adminWrites : ownerWrites)[method]?.test(path));
}

export function createWalletWorkspace({db,origin,bridge}) {
  // Existing Loyalty credentials stay server-side and only for this Lúmina session.
  const access = new Map();
  function current(actor) {
    const session = actor && db.get('SELECT expires_at FROM sessions WHERE digest=?',actor.session_id);
    requireThat(session && new Date(session.expires_at)>new Date(), 'Tu sesión terminó. Ingresa nuevamente.',401);
    const fresh = db.get('SELECT kind,company_id,active FROM accounts WHERE id=?',actor.id);
    requireThat(fresh?.active && fresh.kind===actor.kind && fresh.company_id===actor.company_id,message,403);
    requireThat(['AGENCY','OWNER'].includes(actor.kind),message,403);
    if (actor.kind==='OWNER') requireOwner(actor);
    return session;
  }
  function prune() {
    for (const [session,item] of access) if (item.until<=Date.now() || !db.get('SELECT 1 FROM sessions WHERE digest=?',session)) access.delete(session);
  }
  async function remote(path,{method='GET',token,body,key,raw=false}={}) {
    let response;
    try { response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},
      body:body===undefined?undefined:JSON.stringify(body)}); }
    catch { throw new Problem('Loyalty no está disponible. Inicia su servidor y vuelve a intentar.',503); }
    const chunks=[];let length=0;
    for await (const chunk of response.body||[]) {
      length+=chunk.byteLength;requireThat(length<=2_000_000,'La respuesta de Loyalty es demasiado grande.',502);chunks.push(chunk);
    }
    const bytes=Buffer.concat(chunks);
    if (raw) return {status:response.status,bytes,type:response.headers.get('content-type')||'application/octet-stream'};
    let value;try {value=JSON.parse(bytes);} catch {throw new Problem('Loyalty devolvió una respuesta inesperada.',502);}
    if (!response.ok) throw new Problem(response.status===401 ? 'La credencial de Loyalty venció o fue revocada. Vuelve a conectarla.' :
      typeof value.message==='string' && value.message.length<500 ? value.message : 'Loyalty no pudo completar la operación.',
    [400,401,403,404,409,422,429].includes(response.status)?response.status:503);
    return value;
  }
  async function validate(actor,item) {
    current(actor);
    requireThat(item && item.role===actor.kind && item.account===actor.id,'Conecta tu acceso de Loyalty para abrir Wallet.',409);
    try {
      const data=await remote(actor.kind==='AGENCY'?'/api/platform/wallet/status':'/api/staff/dashboard',{token:item.token});
      if (actor.kind==='OWNER') {
        const company=db.get('SELECT loyalty_tenant FROM companies WHERE id=?',actor.company_id);
        requireThat(data.role==='OWNER' && isId(data.business?.id) && company?.loyalty_tenant===data.business.id && item.tenant===data.business.id,
          'La credencial ya no pertenece al dueño de este negocio.',403);
      }
      current(actor);
      requireThat(access.get(actor.session_id)===item,'La conexión de Wallet cambió. Abre de nuevo Wallet.',409);
      return data;
    } catch(error) { if([401,403].includes(error.status))access.delete(actor.session_id);throw error; }
  }
  function info(actor) {
    prune();const item=access.get(actor.session_id);
    return item ? {role:item.role,name:item.name,tenant:item.tenant,connectedAt:item.connectedAt} : null;
  }
  async function connect(actor,data) {
    const session=current(actor);
    requireThat(data.confirm==='yes','Confirma que deseas usar este acceso durante tu sesión.');
    const token=(data.credential||'').trim();
    requireThat(/^[A-Za-z0-9_-]{32,128}$/.test(token),'Ingresa tu credencial vigente de Loyalty.');
    let tenant=null,name='Administración de Loyalty';
    if(actor.kind==='OWNER') {
      await bridge.link(actor,{credential:token,slug:data.slug,confirm:'yes'});
      const company=db.get('SELECT loyalty_tenant,loyalty_name FROM companies WHERE id=?',actor.company_id);
      tenant=company.loyalty_tenant;name=company.loyalty_name;
    } else await remote('/api/platform/wallet/status',{token});
    current(actor);
    prune();requireThat(access.size<1000 || access.has(actor.session_id),'Hay demasiadas conexiones abiertas. Reintenta más tarde.',503);
    access.set(actor.session_id,{account:actor.id,role:actor.kind,token,tenant,name,until:new Date(session.expires_at).getTime(),connectedAt:new Date().toISOString()});
  }
  function disconnect(actor) { current(actor);access.delete(actor.session_id); }
  async function summary(actor,query) {
    prune();const item=access.get(actor.session_id);if(!item)return null;
    const data=await validate(actor,item);
    const result=actor.kind==='AGENCY' ? {configuration:data,overview:await remote('/api/platform/overview',{token:item.token})} :
      {dashboard:data,health:await remote('/api/staff/wallet-health',{token:item.token})};
    current(actor);requireThat(access.get(actor.session_id)===item,'La conexión cambió.',409);return result;
  }
  async function proxy(actor,path,{method='GET',query='',body,key}={}) {
    requireThat(walletRouteAllowed(actor.kind,method,path),message,403);
    const item=access.get(actor.session_id);await validate(actor,item);
    requireThat(!query || (query.startsWith('?') && query.length<=3000),'Filtro inválido.');
    requireThat(!key || /^[A-Za-z0-9_:-]{8,128}$/.test(key),'Referencia de operación inválida.');
    const result=await remote(path+query,{method,body,key,token:item.token,raw:true});
    current(actor);requireThat(access.get(actor.session_id)===item,'La conexión cambió.',409);
    requireThat(/^(application\/json|text\/csv)/i.test(result.type),'Formato de respuesta no permitido.',502);
    return result;
  }
  async function asset(actor,name) {
    current(actor);requireThat(info(actor),'Conecta tu acceso de Loyalty.',409);
    requireThat(Object.hasOwn(cashierAssets,name),'Recurso no encontrado.',404);
    const result=await remote('/'+name,{raw:true});
    requireThat(result.status===200,'No se pudo cargar la interfaz de Loyalty.',503);
    return result.bytes;
  }
  async function artwork(actor,path,query='') {
    const item=access.get(actor.session_id);const dashboard=await validate(actor,item);
    requireThat(/^\/wallet\/art\/v\d+\/[A-Za-z0-9/_.-]+$/.test(path) || /^\/wallet\/brand\/[a-z0-9-]+\/logo\.png$/.test(path) ||
      (actor.kind==='OWNER' && path==='/api/public/'+dashboard.business.slug+'/qr'),'Imagen no disponible.',403);
    requireThat(!path.includes('..') && query.length<=5000,'Imagen no disponible.');
    const result=await remote(path+query,{raw:true});
    requireThat(result.status===200 && result.type.startsWith('image/'),'No se pudo cargar la imagen.',502);
    current(actor);return result;
  }
  return {info,connect,disconnect,forget:actor=>access.delete(actor.session_id),summary,proxy,asset,artwork,validate:actor=>validate(actor,access.get(actor.session_id))};
}
