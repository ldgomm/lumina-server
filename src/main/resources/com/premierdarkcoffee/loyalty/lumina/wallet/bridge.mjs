import { requireOperating } from '../businesses/control.mjs';
import { requireOwner, teamMember, requireTeamRevision, auditTeamChange } from '../access/accounts.mjs';
import { seal, unseal } from '../access/security.mjs';
import { event, isId, now, Problem, requireThat, text, uuid } from '../shared/domain.mjs';

export const cashierAssets = Object.freeze({
  'style.css': 'text/css; charset=utf-8', 'commercial.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8', 'commercial.js': 'text/javascript; charset=utf-8',
  'promotion-editor.js': 'text/javascript; charset=utf-8', 'jsqr.js': 'text/javascript; charset=utf-8',
  'scanner.js': 'text/javascript; charset=utf-8', 'wallet-ui.js': 'text/javascript; charset=utf-8',
  'engagement.js': 'text/javascript; charset=utf-8', 'experience.js': 'text/javascript; charset=utf-8',
});
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const dashboardRoute = '/api/staff/dashboard';
const teamRoute = '/api/staff/team';
const publicError = {
  401: 'La credencial de Loyalty ya no está activa o es incorrecta.',
  403: 'Loyalty rechazó la operación por permisos.',
  404: 'Loyalty no encontró el recurso.',
  409: 'El acceso cambió en Loyalty. Consulta y reintenta.',
  429: 'Espera antes de reintentar en Loyalty.',
};

async function boundedResponse(response, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.byteLength;
    requireThat(size <= maxBytes, 'La respuesta de Loyalty excede el límite.',502);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function loyaltyOrigin(configured = 'http://127.0.0.1:8097') {
  const url = new URL(configured);
  requireThat(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port &&
    Number(url.port) >= 1024 && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password,
  'LUMINA_LOYALTY_URL debe apuntar al HTTP privado de Loyalty en 127.0.0.1 con puerto explícito.');
  return url.origin;
}
function contract(condition) {
  requireThat(condition,'El servidor de Loyalty no respondió con el contrato de equipo esperado.',502);
}
function currentSession(db, actor) {
  requireOperating(db,actor.company_id);
  requireThat(db.get(`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id
    WHERE s.digest=? AND s.expires_at>? AND a.id=? AND a.active=1 AND a.kind=? AND a.company_id=? AND a.revision=?`,actor.session_id,now(),actor.id,actor.kind,actor.company_id,actor.revision),
  'Vuelve a iniciar sesión.',401);
}
function context(grant) {
  return `cashier:${grant.company_id}:${grant.account_id}:${grant.staff_id}`;
}
export function createLoyaltyBridge({ db, key, origin }) {
  const busy = new Set();
  async function request(path, { method = 'GET', token, body, idempotency, asset = false } = {}) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotency) headers['Idempotency-Key'] = idempotency;
    let response;
    let bytes;
    try {
      response = await fetch(origin + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.timeout(7000),
      });
      bytes = await boundedResponse(response,asset ? 1_500_000 : 1_000_000);
    } catch (error) {
      if (error instanceof Problem) throw error;
      throw new Problem('Loyalty no está disponible en su puerto privado. Reintenta cuando responda.',503);
    }
    if (asset) {
      contract(response.ok);
      return bytes;
    }
    let result;
    try { result = JSON.parse(bytes); } catch { throw new Problem('Loyalty devolvió una respuesta inesperada.',502); }
    if (!response.ok) {
      const status = [400,401,403,404,409,413,415,422,429].includes(response.status) ? response.status : 503;
      const error = new Problem(publicError[status] || 'Loyalty rechazó la operación. Revisa los datos e inténtalo de nuevo.',status);
      if (typeof result?.code === 'string' && /^[A-Z0-9_]{1,60}$/.test(result.code)) error.code = result.code;
      if (status < 500 && typeof result?.message === 'string' && result.message.length <= 400) error.counterMessage = result.message;
      throw error;
    }
    return result;
  }
  async function ownerContext(actor, credential, bound = true) {
    requireOwner(actor);
    currentSession(db,actor);
    const company = db.get('SELECT * FROM companies WHERE id=?',actor.company_id);
    if (bound) requireThat(company.loyalty_tenant,'Tu Wallet se está preparando. Abre Fidelización digital para completar la preparación.',409);
    requireThat(tokenPattern.test(credential || ''),'Ingresa tu credencial vigente de dueño de Loyalty.',403);
    const dashboard = await request(dashboardRoute,{token:credential});
    requireThat(dashboard.role === 'OWNER','Usa la credencial de un dueño de Loyalty.',403);
    contract(isId(dashboard.business?.id) && typeof dashboard.business?.slug === 'string' &&
      typeof dashboard.business?.name === 'string');
    requireThat(!company.loyalty_tenant || company.loyalty_tenant === dashboard.business.id,
      'La credencial pertenece a otro negocio de Loyalty.',403);
    const team = await request(teamRoute,{token:credential});
    contract(Array.isArray(team.users) && Array.isArray(team.branches));
    requireThat(team.users.some(user => user.id === team.currentUserId && user.role === 'OWNER' && user.state === 'ACTIVE'),
      'El acceso del dueño cambió en Loyalty.',403);
    currentSession(db,actor);
    return { company, business: dashboard.business, team };
  }
  async function link(actor, data) {
    requireThat(data.confirm === 'yes','Confirma que ambos perfiles pertenecen al mismo negocio.');
    const { business } = await ownerContext(actor,data.credential,false);
    requireThat(business.slug === data.slug,'El código del negocio de Loyalty no coincide con la credencial.',403);
    db.transaction(() => {
      const current = db.get('SELECT loyalty_tenant FROM companies WHERE id=?',actor.company_id);
      requireThat(!current.loyalty_tenant || current.loyalty_tenant === business.id,
        'Este negocio ya está vinculado.',409);
      requireThat(!db.get('SELECT id FROM companies WHERE loyalty_tenant=? AND id<>?',business.id,actor.company_id),
        'Ese negocio de Loyalty ya está vinculado.',409);
      if (!current.loyalty_tenant) {
        db.run('UPDATE companies SET loyalty_tenant=?,loyalty_name=? WHERE id=?',business.id,business.name,actor.company_id);
        event(db,actor,actor.company_id,'COMPANY',actor.company_id,'LOYALTY_VINCULADO',business.name);
      }
    });
  }
  function rowFor(actor, id) {
    return db.get('SELECT * FROM cash_grants WHERE company_id=? AND account_id=?',actor.company_id,id);
  }
  function issued(result) {
    contract(isId(result?.id) && tokenPattern.test(result?.token || '') && result.credentialIssued === true);
    return result.token;
  }
  async function staffAction(credential, staff, action, reason) {
    return request(teamRoute + '/' + staff.id + '/actions', {
      method:'POST', token:credential, body:{expectedVersion:staff.version,action,reason,confirmed:true},
    });
  }
  function staffRow(team,id) {
    const staff = team.users.find(user => user.id === id);
    requireThat(staff?.role === 'CASHIER' && Number.isSafeInteger(staff.version),
      'El acceso delegado ya no es de Caja. Revísalo en Loyalty.',409);
    return staff;
  }
  async function runExclusive(id, work) {
    requireThat(!busy.has(id),'Ya se está modificando ese acceso de Caja.',409);
    busy.add(id);
    try { return await work(); } finally { busy.delete(id); }
  }
  async function configure(actor, id, data, commit = () => false) {
    return runExclusive(id,async () => {
      const target = teamMember(db,actor,id);
      requireTeamRevision(target,data);
      requireThat(target.active,'Reactiva primero el acceso de la persona.',409);
      const credential=typeof data.credential==='function'?await data.credential():data.credential;
      data={...data,credential};
      const { team, company } = await ownerContext(actor,credential);
      const branch = team.branches.find(item => item.id === data.branch && isId(item.id));
      const purchases = data.purchases === 'yes';
      const rewards = data.rewards === 'yes';
      requireThat(branch && (purchases || rewards),'Elige una sucursal y autoriza compras, canjes o ambos.');
      requireThat(teamMember(db,actor,id).active,'El acceso de la persona cambió.',409);
      const permissions = {purchases,rewards};
      let grant = rowFor(actor,id);
      if (!grant) {
        const requestId = uuid();
        db.run(`INSERT INTO cash_grants(account_id,company_id,request_id,branch_id,branch_name,purchases,rewards,status)
          VALUES(?,?,?,?,?,?,?,'PENDING')`,id,company.id,requestId,branch.id,branch.name,Number(purchases),Number(rewards));
        grant = rowFor(actor,id);
      }
      requireThat(grant.status !== 'REVOKING','Completa el retiro pendiente antes de configurar de nuevo.',409);
      let staffId = grant.staff_id;
      let token;
      if (grant.status === 'PENDING') {
        requireThat(grant.branch_id === branch.id && grant.purchases === Number(purchases) && grant.rewards === Number(rewards),
          'Reintenta el alta pendiente con la misma sucursal y permisos.',409);
        const result = await request('/api/staff/credentials', {
          method:'POST', token:data.credential, body:{role:'CASHIER',name:target.name,branchId:branch.id,requestId:grant.request_id,permissions},
        });
        contract(isId(result?.id));
        staffId = result.id;
        if (result.credentialIssued === true) {
          token = issued(result);
        } else {
          contract(result.replayed === true && result.credentialIssued === false);
          const refreshed = await request(teamRoute,{token:data.credential});
          const staff = staffRow(refreshed,staffId);
          requireThat(staff.state === 'ACTIVE' && staff.branchId === branch.id &&
            staff.permissions?.purchases === purchases && staff.permissions?.rewards === rewards,
          'El alta anterior cambió en Loyalty. Revisa el acceso antes de reintentar.',409);
          token = issued(await staffAction(data.credential,staff,'ROTATE','Recuperación de un alta delegada de Lúmina.'));
        }
      } else {
        let staff = staffRow(team,staffId);
        requireThat(staff.state !== 'ARCHIVED','El acceso fue archivado en Loyalty. Crea un colaborador nuevo.',409);
        if (staff.branchId !== branch.id || staff.permissions?.purchases !== purchases || staff.permissions?.rewards !== rewards) {
          const saved = await request(teamRoute + '/' + staffId,{
            method:'PUT',token:data.credential,body:{expectedVersion:staff.version,name:staff.name,contact:staff.contact || '',
              role:'CASHIER',branchId:branch.id,reason:'Actualización de permisos de Caja desde Lúmina.',permissions},
          });
          contract(saved.id === staffId && Number.isSafeInteger(saved.version));
          staff = {...staff,version:saved.version};
        }
        if (staff.state === 'INACTIVE') {
          token = issued(await staffAction(data.credential,staff,'REACTIVATE','Reactivación de Caja desde Lúmina.'));
        } else {
          if (grant.sealed_token) {
            const previous = unseal(key,context(grant),grant.sealed_token);
            try {
              const dashboard = await request(dashboardRoute,{token:previous});
              if (dashboard.role === 'CASHIER' && dashboard.business?.id === company.loyalty_tenant &&
                dashboard.branchId === branch.id) token = previous;
            } catch (error) {
              if (error.status !== 401) throw error;
            }
          }
          if (!token) token = issued(await staffAction(data.credential,staff,'ROTATE','Sincronización de acceso de Caja desde Lúmina.'));
        }
      }
      currentSession(db,actor);
      const current = teamMember(db,actor,id);
      requireThat(current.active && current.revision === target.revision,'El colaborador cambió. Revisa y reintenta la asignación.',409);
      db.transaction(() => {
        commit(current);
        db.run(`UPDATE cash_grants SET branch_id=?,branch_name=?,purchases=?,rewards=?,staff_id=?,
          sealed_token=?,status='ACTIVE' WHERE company_id=? AND account_id=?`,
        branch.id,branch.name,Number(purchases),Number(rewards),staffId,seal(key,context({...grant,staff_id:staffId}),token),company.id,id);
        db.run('UPDATE accounts SET revision=revision+1 WHERE id=?',id);
        auditTeamChange(db,actor,target,'CAJA_AUTORIZADA',grant.status==='ACTIVE'?{branch:grant.branch_name,purchases:Boolean(grant.purchases),rewards:Boolean(grant.rewards)}:null,{branch:branch.name,purchases,rewards});
      });
    });
  }
  async function revoke(actor,id,data,commit = () => false) {
    return runExclusive(id,async () => {
      currentSession(db,actor);
      const target=teamMember(db,actor,id);requireTeamRevision(target,data);
      const reason=text(data.reason,'motivo de retiro',5,500);
      const grant=rowFor(actor,id);
      requireThat(grant && ['ACTIVE','PENDING','REVOKING'].includes(grant.status),'El acceso de Caja ya está inactivo.',409);
      // Deny locally before any network call. An outage never keeps Caja usable.
      db.transaction(()=>{
        const changed=commit(target);
        db.run("UPDATE cash_grants SET status='REVOKING' WHERE company_id=? AND account_id=?",actor.company_id,id);
        if(grant.status!=='REVOKING'||changed)db.run('UPDATE accounts SET revision=revision+1 WHERE id=?',id);
        if(grant.status!=='REVOKING'){
          auditTeamChange(db,actor,target,'CAJA_BLOQUEADA',{branch:grant.branch_name,purchases:Boolean(grant.purchases),rewards:Boolean(grant.rewards)},{status:'REVOKING',reason});
        }
      });
      const committedRevision=teamMember(db,actor,id).revision;
      try {
        const credential=typeof data.credential==='function'?await data.credential():data.credential;
        let {team}=await ownerContext(actor,credential);
        if(!grant.staff_id){
          // Resolve a lost creation response by its existing idempotency key.
          // It stays blocked locally; never publish or retain the issued token.
          const result=await request('/api/staff/credentials',{method:'POST',token:credential,
            body:{role:'CASHIER',name:target.name,branchId:grant.branch_id,requestId:grant.request_id,
              permissions:{purchases:Boolean(grant.purchases),rewards:Boolean(grant.rewards)}}});
          contract(isId(result?.id));
          team=await request(teamRoute,{token:credential});
          const found=staffRow(team,result.id);
          requireThat(found.branchId===grant.branch_id,'La asignación pendiente cambió. Revisa su sucursal.',409);
          grant.staff_id=result.id;
          db.run("UPDATE cash_grants SET staff_id=? WHERE company_id=? AND account_id=? AND status='REVOKING'",result.id,actor.company_id,id);
        }
        const staff=staffRow(team,grant.staff_id);
        if(staff.state==='ACTIVE')await staffAction(credential,staff,'DEACTIVATE',reason);
        currentSession(db,actor);
        db.transaction(()=>{
          db.run("UPDATE cash_grants SET status='INACTIVE',sealed_token=NULL WHERE company_id=? AND account_id=? AND status='REVOKING'",actor.company_id,id);
          auditTeamChange(db,actor,target,'CAJA_REVOCADA',{status:'REVOKING'},{status:'INACTIVE',reason});
        });
      } catch(error) {
        if(error instanceof Problem){const issue=new Problem('Caja ya está bloqueada en Lúmina. Falta confirmar su retiro con Wallet; puedes reintentarlo.',error.status>=500?503:409);issue.localAccessBlocked=true;issue.committedRevision=committedRevision;throw issue;}
        throw error;
      }
    });
  }
  function activeGrant(actor) {
    requireThat(actor.kind === 'COLLABORATOR','Este acceso de Caja requiere una asignación del dueño.',403);
    currentSession(db,actor);
    const grant = db.get(`SELECT g.*,c.loyalty_tenant FROM cash_grants g JOIN companies c ON c.id=g.company_id
      WHERE g.company_id=? AND g.account_id=? AND g.status='ACTIVE'`,actor.company_id,actor.id);
    requireThat(grant && !busy.has(actor.id),'Tu acceso de Caja está inactivo o está cambiando.',403);
    return grant;
  }
  async function proxy(actor,path,{method,body,query,idempotency}) {
    const isGet = method === 'GET';
    const reads = [dashboardRoute,'/api/staff/access','/api/staff/member-suggestions'];
    const buys = ['/api/staff/purchases','/api/staff/purchases/quote'];
    const rewards = ['/api/staff/counter-redemptions','/api/staff/redemptions/confirm'];
    const operations = ['/api/staff/members/lookup',...buys,...rewards];
    requireThat(isGet ? reads.includes(path) : method === 'POST' && operations.includes(path),
      'La operación no pertenece a Caja.',404);
    const grant = activeGrant(actor);
    const token = unseal(key,context(grant),grant.sealed_token);
    const dashboard = await request(dashboardRoute,{token});
    requireThat(dashboard.role === 'CASHIER' && dashboard.business?.id === grant.loyalty_tenant &&
      dashboard.branchId === grant.branch_id,'La asignación cambió en Loyalty. Solicita al dueño que la revise.',403);
    const current = activeGrant(actor);
    requireThat(current.sealed_token === grant.sealed_token,'El acceso cambió. Vuelve a abrir Caja.',409);
    const permissions = {
      purchases: Boolean(grant.purchases && dashboard.permissions?.purchases === true),
      rewards: Boolean(grant.rewards && dashboard.permissions?.rewards === true),
    };
    requireThat(permissions.purchases || permissions.rewards,'Tu acceso ya no tiene operaciones autorizadas.',403);
    if (path === dashboardRoute) return {
      business: dashboard.business, role:'CASHIER', branchId:grant.branch_id, permissions,
      branches: (dashboard.branches || []).filter(branch => branch.id === grant.branch_id),
      programs: dashboard.programs || [], rewards: dashboard.rewards || [],
    };
    if (buys.includes(path) || rewards.includes(path)) {
      requireThat(body.branchId === grant.branch_id,'La operación pertenece a otra sucursal.',403);
      if (buys.includes(path)) requireThat(permissions.purchases,'El acceso no permite registrar compras.',403);
      if (rewards.includes(path) || body.rewardId != null) requireThat(permissions.rewards,'El acceso no permite canjes.',403);
    }
    const queryString = path === '/api/staff/member-suggestions' ? '?' + new URLSearchParams({q:(query.get('q') || '').slice(0,80)}) : '';
    const result = await request(path + queryString,{method,token,body,idempotency});
    const latest=activeGrant(actor);
    requireThat(latest.sealed_token===grant.sealed_token&&latest.branch_id===grant.branch_id&&latest.purchases===grant.purchases&&latest.rewards===grant.rewards,'El acceso cambió durante la operación. Consulta el historial antes de reintentar.',409);
    return path === '/api/staff/access' ? {canOperate:result.canOperate === true} : result;
  }
  return {
    link, configure, revoke, activeGrant, proxy,
    branches: async (actor,credential) => (await ownerContext(actor,credential)).team.branches,
    asset: async (actor,name) => {
      activeGrant(actor);
      requireThat(Object.hasOwn(cashierAssets,name),'Archivo no disponible.',404);
      return request('/' + name,{asset:true});
    },
  };
}
