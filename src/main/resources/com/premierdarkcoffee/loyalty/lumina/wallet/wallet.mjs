import { requireLiveTeamManager } from '../access/team-administration.mjs';
import { requireOperating } from '../businesses/control.mjs';
import { isManagementPath, managementRouteAllowed } from './management-policy.mjs';
import { createWalletOnboarding } from './onboarding.mjs';
import { can, requireOwner } from '../access/accounts.mjs';
import { seal, unseal } from '../access/security.mjs';
import { event, isId, now, Problem, requireThat, uuid } from '../shared/domain.mjs';
import { cashierAssets } from './bridge.mjs';
import { delegatedRouteAllowed, walletSections } from './access-policy.mjs';
const id = '[0-9a-fA-F-]{36}';
const ownerReads = new RegExp(`^/api/staff/(dashboard|access|administration|branch-directory|team|activity(?:\\.csv)?|operations|wallet-health|wallet-design|business-profile|metrics|return-radar|customer-activity|customer-suggestions|customer-events|customer-insights(?:/${id})?|customer-workspace/${id}|birthday-settings|account|member-suggestions|programs/${id}/deletion-preview)$`);
const ownerWrites = {
  POST:new RegExp(`^/api/staff/(branches|branch-directory|credentials|programs|promotion-templates|promotion-setups|rewards|members/lookup|wallet/restore|purchases(?:/quote)?|counter-redemptions|redemptions/confirm|customer-events|business-profile/requests|team/${id}/actions|wallet-health/${id}/(?:APPLE|GOOGLE)/retry|notices/${id}/read)$`),
  PUT:new RegExp(`^/api/staff/(wallet-design|business-profile|birthday-settings|programs/${id}|rewards/${id}|team/${id}|branch-directory/${id}|customer-insights/${id}/preferences|customer-workspace/${id}/contact)$`),
  DELETE:new RegExp(`^/api/staff/(programs/${id}|credentials/${id}|customer-events/${id})$`),
};
const adminReads = new RegExp(`^/api/platform/(wallet/status|tenants/${id}/(?:profile|branches|wallet-health|metrics))$`);
const message = 'No tienes permiso para realizar esta operación de Wallet.';
export function walletRouteAllowed(role,method,path) {
  if (!['AGENCY','OWNER'].includes(role)) return false;
  if (method==='GET') return (role==='AGENCY' ? adminReads : ownerReads).test(path);
  return role==='OWNER' && Boolean(ownerWrites[method]?.test(path));
}

function scopedDashboard(actor,data) {
  if(actor.kind!=='COLLABORATOR')return data;
  const programRead=['WALLET_DESIGN','WALLET_PROGRAMS','WALLET_CUSTOMERS'].some(scope=>can(actor,scope));
  return {business:data.business,role:data.role,branchId:null,permissions:{purchases:false,rewards:false},
    branches:data.branches||[],programs:programRead?data.programs||[]:[],rewards:programRead?data.rewards||[]:[],
    ...(can(actor,'WALLET_PROGRAMS','EDIT')?{promotionSuggestions:data.promotionSuggestions}:{}),wallet:data.wallet};
}
export function createWalletWorkspace({db,key,origin,integration={}}) {
  const busy=new Map();
  const context=row=>`wallet:${row.company_id}:${row.account_id}:${row.tenant_id}:${row.staff_id}`;
  function current(actor) {
    const fresh=db.get(`SELECT a.id,a.name,a.kind,a.company_id,a.revision,c.approved,c.loyalty_tenant,c.loyalty_name
      FROM accounts a JOIN sessions s ON s.account_id=a.id LEFT JOIN companies c ON c.id=a.company_id
      WHERE a.id=? AND a.active=1 AND s.digest=? AND s.expires_at>?`,actor?.id||'',actor?.session_id||'',now());
    requireThat(fresh,'Tu sesión terminó. Ingresa nuevamente.',401);
    requireThat(fresh.kind===actor.kind && fresh.company_id===actor.company_id,message,403);
    if(actor.wallet_company){
      requireThat(isId(actor.wallet_company) && (fresh.kind==='AGENCY'||fresh.company_id===actor.wallet_company),message,403);
      if(fresh.kind==='AGENCY'){
        const selected=db.get('SELECT id,approved,loyalty_tenant,loyalty_name FROM companies WHERE id=?',actor.wallet_company);
        requireThat(selected,'Negocio no encontrado.',404);
        Object.assign(fresh,selected,{id:actor.id,company_id:selected.id});
      }
    }
    fresh.grants=db.all('SELECT scope,action FROM grants WHERE account_id=?',fresh.id);
    if(fresh.kind!=='AGENCY')requireThat(can(fresh,'WALLET') || fresh.kind==='OWNER',message,403);
    return fresh;
  }
  function configured() {
    requireThat(integration.platformToken,'La integración de Loyalty está pendiente de configuración en el servidor de Lúmina.',503);
    return integration.platformToken;
  }
  async function remote(path,{method='GET',token,body,key,raw=false}={}) {
    let response;
    try { response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},
      body:body===undefined?undefined:JSON.stringify(body)}); }
    catch {throw new Problem('El servicio de fidelización no está disponible en este momento. Tu cuenta se conserva; vuelve a abrir Wallet para reintentar.',503);}
    const chunks=[];let length=0;
    for await(const chunk of response.body||[]){length+=chunk.byteLength;requireThat(length<=2_000_000,'La respuesta de Loyalty es demasiado grande.',502);chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);
    if(raw)return {status:response.status,bytes,type:response.headers.get('content-type')||'application/octet-stream'};
    let value;try{value=JSON.parse(bytes);}catch{throw new Problem('Loyalty devolvió una respuesta inesperada.',502);}
    if(!response.ok){const failure=new Problem(response.status===401?'El acceso interno fue retirado en Loyalty. El dueño puede revisar el acceso desde Lúmina.':
      typeof value.message==='string'&&value.message.length<500?value.message:'Loyalty no pudo completar la operación.',
      [400,401,403,404,409,422,423,429].includes(response.status)?response.status:503);failure.code=value.code;throw failure;}
    return value;
  }
  const ensureCompany=createWalletOnboarding({db,remote,configured});
  const ensureBillingAccount=createWalletOnboarding({db,remote,configured,requireWallet:false});
  async function provision(actor) {
    let fresh=current(actor);
    requireThat(fresh.kind!=='AGENCY',message,403);
    requireThat(fresh.kind!=='COLLABORATOR'||walletSections(fresh).length,'El dueño todavía no te ha asignado áreas de Wallet.',403);
    await ensureCompany(fresh.company_id);fresh=current(actor);
    let row=db.get('SELECT * FROM wallet_access WHERE account_id=? AND company_id=?',fresh.id,fresh.company_id);
    if(!row) {
      db.run("INSERT INTO wallet_access(account_id,company_id,tenant_id,request_id,staff_name,status,created_at) VALUES(?,?,?,?,?,'PENDING',?)",
        fresh.id,fresh.company_id,fresh.loyalty_tenant,uuid(),('Lúmina · '+fresh.name).slice(0,80),now());
      row=db.get('SELECT * FROM wallet_access WHERE account_id=? AND company_id=?',fresh.id,fresh.company_id);
    }
    requireThat(row.tenant_id===fresh.loyalty_tenant && row.company_id===fresh.company_id,'La asociación del negocio cambió. Contacta a la agencia.',409);
    requireThat(row.status!=='BLOCKED','Este acceso fue retirado en Loyalty. El dueño puede revisar el acceso desde Lúmina.',403);
    if(row.status==='PENDING') {
      const base='/api/platform/tenants/'+row.tenant_id;
      let issued=await remote(base+'/credentials',{method:'POST',token:configured(),body:{role:'OWNER',name:row.staff_name,contact:'',requestId:row.request_id}});
      requireThat(isId(issued.id),'Respuesta de acceso inválida.',502);
      if(issued.replayed===true && issued.credentialIssued===false) {
        const team=await remote(base+'/team',{token:configured()});
        const staff=team.users?.find(u=>u.id===issued.id);
        requireThat(staff?.role==='OWNER'&&staff.state==='ACTIVE'&&staff.name===row.staff_name&&Number.isSafeInteger(staff.version),'El alta pendiente cambió en Loyalty. Revisa el acceso.',409);
        issued=await remote(base+'/team/'+staff.id+'/actions',{method:'POST',token:configured(),body:{action:'ROTATE',expectedVersion:staff.version,reason:'Recuperación de alta pendiente de acceso único Lúmina.',confirmed:true}});
      }
      requireThat(issued.credentialIssued===true && /^[A-Za-z0-9_-]{43}$/.test(issued.token||''),'No se pudo preparar el acceso interno.',502);
      row.staff_id=issued.id;
      db.transaction(()=>{
        db.run("UPDATE wallet_access SET staff_id=?,sealed_token=?,status='ACTIVE' WHERE account_id=? AND company_id=? AND status='PENDING'",row.staff_id,seal(key,context(row),issued.token),row.account_id,row.company_id);
        event(db,actor,row.company_id,'ACCOUNT',row.account_id,'ACCESO_WALLET_PREPARADO','Acceso interno por cuenta.','WALLET');
      });
      row=db.get('SELECT * FROM wallet_access WHERE account_id=? AND company_id=?',fresh.id,fresh.company_id);
    }
    const latest=current(actor);
    requireThat(latest.loyalty_tenant===row.tenant_id && latest.company_id===row.company_id && (latest.kind!=='COLLABORATOR'||walletSections(latest).length),message,403);
    return {...row,role:fresh.kind,token:unseal(key,context(row),row.sealed_token)};
  }
  async function credential(actor) {
    const fresh=current(actor),slot=fresh.id+':'+(fresh.company_id||'');
    if(!busy.has(slot))busy.set(slot,provision(actor).finally(()=>busy.delete(slot)));
    return busy.get(slot);
  }
  async function validated(actor) {
    const item=await credential(actor);
    let data;
    try{data=await remote('/api/staff/dashboard',{token:item.token});}
    catch(error){if(item.account_id && [401,403].includes(error.status))db.run("UPDATE wallet_access SET status='BLOCKED',sealed_token=NULL WHERE account_id=? AND company_id=?",item.account_id,item.company_id);throw error;}
    const fresh=current(actor);
    requireThat(data.role==='OWNER' && isId(data.business?.id) && data.business.id===fresh.loyalty_tenant && item.tenant_id===fresh.loyalty_tenant,message,403);
    return {item,data,fresh};
  }
  async function summary(actor) {
    const observer=current(actor);
    if(observer.kind==='AGENCY') {
      if(!observer.company_id){const configuration=await remote('/api/platform/wallet/status',{token:configured()});current(actor);return {configuration};}
      if(!observer.loyalty_tenant)return {readOnly:true};
      const health=await remote('/api/platform/tenants/'+observer.loyalty_tenant+'/wallet-health',{token:configured()});
      const latest=current(actor);
      requireThat(latest.revision===observer.revision&&latest.loyalty_tenant===observer.loyalty_tenant,message,403);
      return {readOnly:true,health};
    }
    const {item,data,fresh}=await validated(actor);
    const result={dashboard:scopedDashboard(fresh,data),...(fresh.kind!=='COLLABORATOR'||can(fresh,'WALLET_REPORTS')?{health:await remote('/api/staff/wallet-health',{token:item.token})}:{})};
    const latest=current(actor);requireThat(latest.revision===fresh.revision,message,403);return result;
  }
  async function proxy(actor,path,{method='GET',query='',body,key,surface='wallet'}={}) {
    let fresh=current(actor);
    if(fresh.kind==='AGENCY') {
      requireThat(surface==='wallet',message,403);
      const global=path==='/api/platform/wallet/status'&&!fresh.company_id;
      const selected=fresh.loyalty_tenant && ['/profile','/wallet-health','/metrics','/branches'].some(suffix=>path==='/api/platform/tenants/'+fresh.loyalty_tenant+suffix);
      requireThat(method==='GET'&&(global||selected)&&(!query||/^\?days=(7|30|90|365)$/.test(query)),message,403);
      const result=await remote(path+query,{token:configured(),raw:true});
      const latest=current(actor);
      requireThat(latest.revision===fresh.revision&&latest.loyalty_tenant===fresh.loyalty_tenant,message,403);
      requireThat(/^application\/json/i.test(result.type),'Formato de respuesta no permitido.',502);
      return result;
    }
    const allowed=who=>surface==='management'?managementRouteAllowed(who,method,path):!isManagementPath(path)&&delegatedRouteAllowed(who,method,path);
    requireThat(walletRouteAllowed('OWNER',method,path)&&allowed(fresh),message,403);
    requireThat(!/^\/api\/staff\/(team(?:\/|$)|credentials(?:\/|$))/.test(path),'Administra las personas y sus permisos desde Equipos y roles de Lúmina.',403);
    if(method!=='GET')requireOperating(db,fresh.company_id);
    const {item}=await validated(actor);
    fresh=current(actor);
    if(method!=='GET')requireOperating(db,fresh.company_id);
    requireThat(allowed(fresh),message,403);
    requireThat(!query||(query.startsWith('?')&&query.length<=3000),'Filtro inválido.');
    requireThat(!key||/^[A-Za-z0-9_:-]{8,128}$/.test(key),'Referencia de operación inválida.');
    const result=await remote(path+query,{method,body,key,token:item.token,raw:true});
    const latest=current(actor);
    if(method!=='GET')requireOperating(db,latest.company_id);
    requireThat(latest.revision===fresh.revision && latest.approved===fresh.approved && latest.loyalty_tenant===fresh.loyalty_tenant && allowed(latest),message,403);
    requireThat(/^(application\/json|text\/csv)/i.test(result.type),'Formato de respuesta no permitido.',502);
    if(item.account_id && result.status===401)db.run("UPDATE wallet_access SET status='BLOCKED',sealed_token=NULL WHERE account_id=? AND company_id=?",item.account_id,item.company_id);
    if(method!=='GET')event(db,actor,fresh.company_id,'WALLET_ACCESS',item.staff_id||actor.id,'WALLET_'+method,`${path} · HTTP ${result.status}`,'WALLET');
    if(fresh.kind==='COLLABORATOR'&&path==='/api/staff/dashboard'&&result.status===200)return {...result,bytes:Buffer.from(JSON.stringify(scopedDashboard(fresh,JSON.parse(result.bytes))))};
    return result;
  }
  async function repair(actor,company,input) {
    const owner=current(actor);requireOwner(owner);
    requireThat(owner.company_id===company.id,message,403);
    requireThat(input.confirm==='yes'&&isId(input.account),'Confirma el acceso que deseas reparar.');
    const reason=(input.reason||'').trim();requireThat(reason.length>=5&&reason.length<=500,'Escribe el motivo de la reparación.');
    const row=db.get(`SELECT w.*,a.active,a.kind,a.revision AS account_revision FROM wallet_access w JOIN accounts a ON a.id=w.account_id
      WHERE w.company_id=? AND w.account_id=? AND w.status='BLOCKED' AND a.kind IN ('OWNER','COLLABORATOR')`,company.id,input.account);
    requireThat(row?.active && row.tenant_id===company.loyalty_tenant,'El acceso está inactivo o ya cambió.',409);
    const targetCurrent=()=>{
      const target=db.get('SELECT id,company_id,kind,active,revision FROM accounts WHERE id=?',row.account_id);
      requireThat(target?.active&&target.company_id===company.id&&target.revision===row.account_revision&&String(target.revision)===input.account_revision,'Los permisos de esta persona cambiaron. Revisa el acceso actual.',409);
      target.grants=db.all('SELECT scope,action FROM grants WHERE account_id=?',target.id);
      requireThat(target.kind==='OWNER'||walletSections(target).length,'Esta persona ya no tiene áreas operativas de Wallet.',409);
    };
    targetCurrent();
    const base='/api/platform/tenants/'+row.tenant_id;
    const team=await remote(base+'/team',{token:configured()});
    const staff=team.users?.find(u=>u.id===row.staff_id);
    requireThat(staff?.role==='OWNER'&&staff.name===row.staff_name&&['ACTIVE','INACTIVE'].includes(staff.state),'El acceso interno cambió en Loyalty. Revísalo antes de repararlo.',409);
    const action=staff.state==='INACTIVE'?'REACTIVATE':'ROTATE';
    requireOwner(current(actor));targetCurrent();
    const result=await remote(base+'/team/'+staff.id+'/actions',{method:'POST',token:configured(),body:{action,expectedVersion:staff.version,reason,confirmed:true}});
    requireThat(result.id===row.staff_id && result.credentialIssued===true && /^[A-Za-z0-9_-]{43}$/.test(result.token||''),'Respuesta de reparación inválida.',502);
    requireOwner(current(actor));
    targetCurrent();
    db.transaction(()=>{
      requireThat(db.run("UPDATE wallet_access SET sealed_token=?,status='ACTIVE' WHERE account_id=? AND company_id=? AND status='BLOCKED'",seal(key,context(row),result.token),row.account_id,row.company_id).changes===1,'El acceso cambió durante la reparación.',409);
      event(db,actor,company.id,'ACCOUNT',row.account_id,'ACCESO_WALLET_REPARADO',reason,'WALLET');
    });
  }
  async function asset(actor,name) {
    const fresh=current(actor);requireThat(fresh.kind!=='AGENCY',message,403);requireThat(fresh.kind!=='COLLABORATOR'||walletSections(fresh).length,message,403);
    requireThat(Object.hasOwn(cashierAssets,name),'Recurso no encontrado.',404);
    const result=await remote('/'+name,{raw:true});requireThat(result.status===200,'No se pudo cargar Loyalty.',503);current(actor);return result.bytes;
  }
  async function artwork(actor,path,query='') {
    const {data,fresh}=await validated(actor);
    requireThat(fresh.kind!=='COLLABORATOR'||can(fresh,'WALLET_DESIGN'),message,403);
    requireThat(/^\/wallet\/art\/v\d+\/[A-Za-z0-9/_.-]+$/.test(path)||/^\/wallet\/brand\/[a-z0-9-]+\/logo\.png$/.test(path)||
      (fresh.company_id&&path==='/api/public/'+data.business.slug+'/qr'),'Imagen no disponible.',403);
    requireThat(!path.includes('..')&&query.length<=5000,'Imagen no disponible.');
    const result=await remote(path+query,{raw:true});requireThat(result.status===200&&result.type.startsWith('image/'),'No se pudo cargar la imagen.',502);current(actor);return result;
  }
  async function subscription(actor,action='status',body,key) {
    requireOwner(actor);if(action==='accept')requireOperating(db,actor.company_id);const {item,fresh}=await validated(actor);
    requireThat(['status','offer','accept','cancel'].includes(action),'Acción no encontrada.',404);
    const result=await remote('/api/staff/lumina-subscription'+(action==='status'?'':'/'+action),{method:action==='status'?'GET':'POST',token:item.token,body,key});
    const latest=current(actor);requireThat(latest.revision===fresh.revision&&latest.loyalty_tenant===item.tenant_id,message,403);
    return result;
  }
  async function controlRemote(tenant,action,options={}) {
    requireThat(isId(tenant)&&['access','account','payments','receipt','charges','reverse','void'].includes(action),'Acción inválida.');
    const suffix=action==='receipt'?'/payments/'+options.id:action==='reverse'?'/payments/'+options.id+'/reverse':action==='void'?'/charges/'+options.id+'/void':'/'+action;
    if(['receipt','reverse','void'].includes(action))requireThat(isId(options.id),'Registro inválido.');
    const offset=options.offset??0;requireThat(Number.isSafeInteger(offset)&&offset>=0&&offset<=1_000_000,'Página inválida.');
    return remote('/api/platform/tenants/'+tenant+suffix+(action==='account'?'?offset='+offset:''),{...options,token:configured()});
  }
  async function administration(actor,companyId,action,options={}) {
    const fresh=current(actor);requireThat(fresh.kind==='AGENCY','Acceso exclusivo de administración.',403);
    let company=db.get('SELECT * FROM companies WHERE id=?',companyId);
    requireThat(company,'Negocio no encontrado.',404);
    if(!company.loyalty_tenant&&action==='charges'&&options.method==='POST'){requireOperating(db,company.id);company=await ensureBillingAccount(companyId);requireOperating(db,company.id);}
    requireThat(company.loyalty_tenant,'Este negocio todavía no tiene cargos registrados.',409);
    const result=await controlRemote(company.loyalty_tenant,action,options);
    requireThat(current(actor).revision===fresh.revision,message,403);
    return result;
  }
  // Private team adapter. It never exposes a platform/owner token or enables business operations.
  async function teamAdministration(actor,path,options={}) {
    requireThat(actor.kind==='AGENCY'&&actor.teamAdministration===true,'Acceso exclusivo de administración.',403);
    requireLiveTeamManager(db,actor);
    const company=db.get('SELECT id,loyalty_tenant FROM companies WHERE id=?',actor.company_id);
    requireThat(company?.loyalty_tenant,'Este negocio todavía no tiene Wallet activa.',409);
    const method=options.method||'GET';
    const suffix=path.replace(/^\/api\/staff/, '');
    const memberPath=new RegExp('^/team/'+id+'(?:/actions)?$');
    requireThat(path.startsWith('/api/staff/')&&(
      method==='GET'&&suffix==='/team'||method==='POST'&&suffix==='/credentials'&&options.body?.role==='CASHIER'||
      method==='PUT'&&memberPath.test(suffix)&&!suffix.endsWith('/actions')&&options.body?.role==='CASHIER'||
      method==='POST'&&memberPath.test(suffix)&&suffix.endsWith('/actions')&&['DEACTIVATE','REACTIVATE','ROTATE'].includes(options.body?.action)),
      'Esta operación no pertenece a la administración del equipo.',403);
    const result=await remote('/api/platform/tenants/'+company.loyalty_tenant+suffix,{method,body:options.body,token:configured()});
    requireLiveTeamManager(db,actor);
    requireThat(db.get('SELECT loyalty_tenant FROM companies WHERE id=?',company.id)?.loyalty_tenant===company.loyalty_tenant,'La asociación del negocio cambió.',409);
    return result;
  }
  async function account(actor,offset=0){requireOwner(actor);const {item,fresh}=await validated(actor);const result=await remote('/api/staff/account?offset='+offset,{token:item.token});const latest=current(actor);requireThat(latest.revision===fresh.revision&&latest.loyalty_tenant===item.tenant_id,message,403);return result;}
  async function receipt(actor,id){requireOwner(actor);requireThat(isId(id),'Pago no encontrado.',404);const {item,fresh}=await validated(actor);const result=await remote('/api/staff/payments/'+id,{token:item.token});const latest=current(actor);requireThat(latest.revision===fresh.revision&&latest.loyalty_tenant===item.tenant_id,message,403);return result;}
  return {controlRemote,administration,teamAdministration,account,receipt,subscription,ensureCompany,summary,proxy,asset,artwork,repair,validate:async actor=>(await validated(actor)).data,
    forget:()=>{},ownerCredential:async actor=>{requireOwner(actor);const {item}=await validated(actor);return item.token;}};
}
