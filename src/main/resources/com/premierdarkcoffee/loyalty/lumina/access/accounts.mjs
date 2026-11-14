import { documentNumber, rucNumber, whatsappNumber, contactPhone } from './identity.mjs';
import { activeServices } from '../businesses/services.mjs';
import { businessCategory } from '../businesses/categories.mjs';
import { channels, areas, walletScopes, socialChannels, event, now, requireThat, text, uuid } from '../shared/domain.mjs';
import { parseGrants, grantsSnapshot, permissions } from './team-policy.mjs';
export { permissions };
import { digest, fingerprint, hashPassword, randomCode, verifyPassword } from './security.mjs';

const expires = hours => new Date(Date.now() + hours * 3600000).toISOString();
const codePattern = /^[A-Za-z0-9_-]{43}$/;

export function emailAddress(value) {
  const email = text(value, 'correo', 5, 180).toLowerCase();
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Ingresa un correo válido.');
  return email;
}
export function limit(db, subject, max, minutes = 10) {
  const window = Math.floor(Date.now() / (minutes * 60000));
  const count = db.get(`INSERT INTO rate_limits(subject,window,count) VALUES(?,?,1)
    ON CONFLICT(subject) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,
    window=excluded.window RETURNING count`, digest(subject), window).count;
  requireThat(count <= max, 'Demasiados intentos. Espera unos minutos para volver a probar.', 429);
}
export function setupCode(db) {
  return db.transaction(() => {
    if (db.get("SELECT id FROM accounts WHERE kind='AGENCY'")) return null;
    db.run("DELETE FROM codes WHERE kind='SETUP'");
    const code = randomCode();
    db.run("INSERT INTO codes VALUES(?,'SETUP',NULL,?)", digest(code), expires(2));
    return code;
  });
}
function checkCode(db, raw, kind) {
  requireThat(codePattern.test(raw || ''), 'Código inválido o vencido.', 403);
  const code = db.get('SELECT * FROM codes WHERE digest=? AND kind=? AND expires_at>?', digest(raw), kind, now());
  requireThat(code, 'Código inválido o vencido.', 403);
  return code;
}
export async function createAgency(db, data) {
  checkCode(db, data.code, 'SETUP');
  const name = text(data.name, 'nombre', 2, 100), document=documentNumber(data.document);
  const password = await hashPassword(data.password);
  return db.transaction(() => {
    const code = checkCode(db, data.code, 'SETUP');
    requireThat(!db.get("SELECT id FROM accounts WHERE kind='AGENCY'") && !db.get('SELECT id FROM accounts WHERE document=?',document),
      'Ya existe una cuenta con esos datos.', 409);
    const id = uuid();
    db.run("INSERT INTO accounts(id,name,email,document,kind,password) VALUES(?,?,?,?,'AGENCY',?)", id,name,'account:'+id,document,password);
    db.run('DELETE FROM codes WHERE digest=?', code.digest);
    return id;
  });
}
export async function register(db, key, data) {
  const company = text(data.company, 'negocio', 2, 100), category=businessCategory(data.category);
  const name = text(data.name, 'responsable', 2, 100), document=documentNumber(data.document);
  const ruc=rucNumber(data.ruc),phone=whatsappNumber(data.phone);
  requireThat(data.consent === 'yes', 'Confirma que autorizas el registro de estos datos.');
  const identity=fingerprint(key,'ruc-registration',ruc);
  const normalized=company.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const legacyIdentity=fingerprint(key,'registration',normalized+'\0'+document);
  const password=await hashPassword(data.password);
  return db.transaction(()=>{
    requireThat(!db.get('SELECT id FROM accounts WHERE document=?',document)&&!db.get('SELECT id FROM companies WHERE ruc=? OR registration_key=?',ruc,legacyIdentity),
      'Ya existe una cuenta con esos datos. Ingresa o contacta a Lúmina.',409);
    const companyId=uuid(),accountId=uuid();
    db.run(`INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at,category,ruc) VALUES(?,?,?,?,?,?,?,?)`,
      companyId,company,identity,document.slice(-4),phone,now(),category,ruc);
    // The historical NOT NULL UNIQUE column is an opaque internal value, never a fabricated email.
    db.run(`INSERT INTO accounts(id,company_id,name,email,document,kind,password,welcome_done) VALUES(?,?,?,?,?,'OWNER',?,0)`,
      accountId,companyId,name,'account:'+accountId,document,password);
    event(db,{id:accountId,name},companyId,'COMPANY',companyId,'REGISTRO','Video de cortesía disponible.');
    return accountId;
  });
}
export async function authenticate(db, data) {
  const identifier=typeof data.document==='string'?data.document.trim():'';
  requireThat(/^\d{10}(?:\d{3})?$/.test(identifier),'Escribe tu cédula de 10 dígitos o el RUC de 13 dígitos.');
  limit(db,'login-document:'+identifier,12);
  const account=identifier.length===10?db.get('SELECT * FROM accounts WHERE document=?',identifier):
    db.get("SELECT a.* FROM accounts a JOIN companies c ON c.id=a.company_id WHERE c.ruc=? AND a.kind='OWNER'",identifier);
  const valid=await verifyPassword(data.password,account?.password);
  requireThat(valid&&account?.active,'Identificación o contraseña incorrectas.',401);
  const current=db.get('SELECT * FROM accounts WHERE id=?',account.id);
  requireThat(current?.active&&current.password===account.password&&current.revision===account.revision,'Vuelve a iniciar sesión.',401);
  return current.id;
}
export async function authenticateLegacy(db,data) {
  const email=emailAddress(data.email);limit(db,'login-legacy:'+email,12);
  const account=db.get('SELECT * FROM accounts WHERE email=? AND document IS NULL',email);
  const valid=await verifyPassword(data.password,account?.password);
  requireThat(valid&&account?.active,'Acceso anterior o contraseña incorrectos.',401);
  const current=db.get('SELECT * FROM accounts WHERE id=? AND document IS NULL',account.id);
  requireThat(current?.active&&current.password===account.password&&current.revision===account.revision,'Vuelve a iniciar sesión.',401);
  return current.id;
}
export async function claimIdentity(db,actor,data) {
  requireThat(actor.kind!=='COLLABORATOR','El dueño del negocio debe registrar tu cédula en Equipo y permisos.',403);
  const document=documentNumber(data.document);
  const ruc=actor.kind==='OWNER'?rucNumber(data.ruc):null;
  const phone=actor.kind==='OWNER'?whatsappNumber(data.phone):null;
  const initial=db.get('SELECT password,revision,document FROM accounts WHERE id=? AND active=1',actor.id);
  requireThat(initial&&await verifyPassword(data.current,initial.password),'Contraseña actual incorrecta.',403);
  return db.transaction(()=>{
    const current=db.get('SELECT * FROM accounts WHERE id=? AND active=1',actor.id);
    requireThat(current&&current.revision===initial.revision&&current.password===initial.password&&!current.document,'La identificación ya se actualizó. Recarga tu cuenta.',409);
    requireThat(!db.get('SELECT id FROM accounts WHERE document=?',document),'Esa cédula ya tiene un acceso. Contacta a Lúmina.',409);
    if(ruc){
      requireThat(!db.get('SELECT id FROM companies WHERE ruc=? AND id<>?',ruc,actor.company_id),'Ese RUC ya tiene un negocio.',409);
      db.run('UPDATE companies SET ruc=?,phone=? WHERE id=?',ruc,phone,actor.company_id);
    }
    db.run('UPDATE accounts SET document=?,revision=revision+1 WHERE id=?',document,actor.id);
    db.run('DELETE FROM sessions WHERE account_id=?',actor.id);
    db.run('DELETE FROM codes WHERE account_id=?',actor.id);
    event(db,actor,actor.company_id,'ACCOUNT',actor.id,'IDENTIFICACIÓN_ACTUALIZADA','Acceso con cédula.');
    return actor.id;
  });
}
export function createSession(db, accountId) {
  const session = randomCode();
  db.run('DELETE FROM sessions WHERE expires_at<=?',now());
  db.run('INSERT INTO sessions VALUES(?,?,?,?)', digest(session), accountId, randomCode(), expires(8));
  return session;
}
export function getSession(db, cookie) {
  if (!codePattern.test(cookie || '')) return null;
  const actor = db.get(`SELECT a.id,a.company_id,a.name,a.email,a.document,a.welcome_done,a.kind,a.revision,a.contact_phone,c.ruc,c.phone,
    s.digest AS session_id,s.csrf,c.name AS company_name,c.approved
    FROM sessions s JOIN accounts a ON a.id=s.account_id LEFT JOIN companies c ON c.id=a.company_id
    WHERE s.digest=? AND s.expires_at>? AND a.active=1`, digest(cookie), now());
  if (actor) { actor.grants = db.all('SELECT scope,action FROM grants WHERE account_id=?', actor.id); if(actor.company_id)actor.services=activeServices(db,actor.company_id); }
  return actor || null;
}
export function logout(db, actor) {
  db.run('DELETE FROM sessions WHERE digest=?', actor.session_id);
}
export async function changePassword(db, actor, input) {
  const current = db.get('SELECT password,revision FROM accounts WHERE id=? AND active=1', actor.id);
  requireThat(current && await verifyPassword(input.current, current.password), 'Contraseña actual incorrecta.', 403);
  const password = await hashPassword(input.password);
  db.transaction(() => {
    requireThat(db.run('UPDATE accounts SET password=?,revision=revision+1 WHERE id=? AND revision=? AND active=1',
      password,actor.id,current.revision).changes === 1, 'La cuenta cambió. Inicia sesión de nuevo.', 409);
    db.run('DELETE FROM sessions WHERE account_id=?', actor.id);
    event(db,actor,actor.company_id,'ACCOUNT',actor.id,'CONTRASEÑA_ACTUALIZADA');
  });
}
export function can(actor, scope, action = 'VIEW') {
  if (actor.kind === 'AGENCY') return action === 'VIEW';
  const service=socialChannels.includes(scope)?'SOCIAL':scope.startsWith('WALLET')?'WALLET':scope;
  if(actor.services&&Object.hasOwn(areas,service)&&!actor.services.includes(service))return false;
  return actor.kind === 'OWNER' ||
    actor.grants.some(grant => grant.action === action && (grant.scope === scope || (socialChannels.includes(scope) && grant.scope === 'SOCIAL'))) ||
    (scope === 'SOCIAL' && actor.grants.some(grant => socialChannels.includes(grant.scope) && grant.action === action));
}
export function requireAccess(actor, scope, action = 'VIEW') {
  requireThat(can(actor,scope,action), 'Tu acceso no incluye esta acción o área.', 403);
}
export function requireAgency(actor) {
  requireThat(actor.kind === 'AGENCY', 'Acceso de administración de Lúmina.', 403);
}
export function requireOwner(actor) {
  requireThat(actor.kind === 'OWNER' && actor.company_id, 'Acceso reservado para el dueño del negocio.', 403);
}
export function requireBusinessActor(actor, company) {
  requireThat(['OWNER','COLLABORATOR'].includes(actor.kind) && actor.company_id === company?.id,
    'Solo el negocio puede realizar esta acción. La agencia tiene acceso de consulta.',403);
}
export function companyFor(db, actor, selected) {
  const id = actor.kind === 'AGENCY' ? selected : actor.company_id;
  const company = id && db.get('SELECT * FROM companies WHERE id=?', id);
  requireThat(company, 'Elige un negocio registrado.', 404);
  return company;
}
export function approveCompany(db, actor, company) {
  requireAgency(actor);
  db.transaction(() => {
    const result = db.run('UPDATE companies SET approved=1 WHERE id=? AND approved=0',company.id);
    if (result.changes) event(db,actor,company.id,'COMPANY',company.id,'NEGOCIO_VERIFICADO');
  });
}
export function teamMember(db, actor, id) {
  requireOwner(actor);
  const target = db.get(`SELECT a.id,a.name,a.email,a.document,a.contact_phone,a.revision,a.active,a.password IS NOT NULL AS activated,
    c.status AS cash_status,c.branch_id,c.branch_name,c.purchases,c.rewards,
    (SELECT max(expires_at) FROM codes WHERE account_id=a.id AND kind='ACTIVATE') AS activation_expires,
    (SELECT count(*) FROM sessions WHERE account_id=a.id AND expires_at>?) AS session_count,
    (SELECT status FROM wallet_access WHERE account_id=a.id AND company_id=a.company_id) AS wallet_status
    FROM accounts a LEFT JOIN cash_grants c ON c.account_id=a.id
    WHERE a.id=? AND a.company_id=? AND a.kind='COLLABORATOR'`, now(), id, actor.company_id);
  requireThat(target, 'No se encontró ese colaborador.', 404);
  target.grants = db.all('SELECT scope,action FROM grants WHERE account_id=?',target.id);
  return target;
}
export function teamList(db, actor) {
  requireOwner(actor);
  return db.all("SELECT id FROM accounts WHERE company_id=? AND kind='COLLABORATOR' ORDER BY active DESC,name,id", actor.company_id)
    .map(row => teamMember(db,actor,row.id));
}
function setGrants(db, accountId, values) {
  for (const {scope,action} of parseGrants(values)) db.run('INSERT INTO grants VALUES(?,?,?)',accountId,scope,action);
}
export function requireTeamRevision(member, input) {
  requireThat(typeof input?.revision === 'string' && String(member.revision) === input.revision,
    'Este acceso cambió o el formulario venció. Revisa la versión actual antes de guardar.',409);
}
export function auditTeamChange(db, actor, member, action, before, after) {
  event(db,actor,actor.company_id,'ACCOUNT',member.id,action,JSON.stringify({v:1,before,after}));
}
function issueActivation(db, accountId) {
  const code = randomCode();
  db.run("DELETE FROM codes WHERE account_id=? AND kind='ACTIVATE'",accountId);
  db.run("INSERT INTO codes VALUES(?,'ACTIVATE',?,?)",digest(code),accountId,expires(48));
  return code;
}
export function createTeamMember(db, actor, input) {
  requireOwner(actor);
  const name = text(input.name,'nombre',2,100);
  const document = documentNumber(input.document);
  const phone = contactPhone(input.phone);
  return db.transaction(() => {
    requireThat(!db.get('SELECT id FROM accounts WHERE document=?',document), 'Esa cédula ya tiene un acceso.', 409);
    const id = uuid();
    db.run("INSERT INTO accounts(id,company_id,name,email,document,contact_phone,kind,welcome_done) VALUES(?,?,?,?,?,?,'COLLABORATOR',0)",id,actor.company_id,name,'account:'+id,document,phone);
    setGrants(db,id,input);
    const code = issueActivation(db,id);
    auditTeamChange(db,actor,{id},'ACCESO_CREADO',null,{name,documentHint:document.slice(-4),grants:grantsSnapshot(parseGrants(input))});
    return { id, code };
  });
}
export function updateGrants(db, actor, id, input) {
  return db.transaction(() => {
    const target = teamMember(db,actor,id);
    requireTeamRevision(target,input);
    const next = parseGrants(input);
    if (replaceTeamGrants(db,actor,target,next)) db.run('UPDATE accounts SET revision=revision+1 WHERE id=?',id);
  });
}
// Called only inside a transaction, after validation and revision checks.
export function replaceTeamGrants(db, actor, target, next) {
  const before=grantsSnapshot(target.grants), after=grantsSnapshot(next);
  if (JSON.stringify(before)===JSON.stringify(after)) return false;
  db.run('DELETE FROM grants WHERE account_id=?',target.id);
  for(const grant of next) db.run('INSERT INTO grants VALUES(?,?,?)',target.id,grant.scope,grant.action);
  auditTeamChange(db,actor,target,'PERMISOS_ACTUALIZADOS',{grants:before},{grants:after});
  return true;
}
export function updateMember(db, actor, id, input) {
  const name=text(input.name,'nombre',2,100),document=documentNumber(input.document),phone=contactPhone(input.phone);
  return db.transaction(()=>{
    const target=teamMember(db,actor,id);requireTeamRevision(target,input);
    requireThat(!db.get('SELECT id FROM accounts WHERE document=? AND id<>?',document,id),'Esa cédula ya tiene un acceso.',409);
    if(name===target.name&&document===target.document&&phone===target.contact_phone)return;
    db.run('UPDATE accounts SET name=?,document=?,contact_phone=?,revision=revision+1 WHERE id=?',name,document,phone,id);
    if(document!==target.document){db.run('DELETE FROM sessions WHERE account_id=?',id);db.run('DELETE FROM codes WHERE account_id=?',id);}
    auditTeamChange(db,actor,target,'PERSONA_ACTUALIZADA',{name:target.name,documentHint:target.document?.slice(-4)||null},{name,documentHint:document.slice(-4),contactUpdated:phone!==target.contact_phone});
  });
}
export function manageAccount(db, actor, id, action, input) {
  return db.transaction(() => {
    const target = teamMember(db,actor,id);
    requireTeamRevision(target,input);
    requireThat(['DISABLE','INVITE'].includes(action),'Acción de acceso inválida.');
    requireThat(input.confirm==='yes',action==='DISABLE'?'Confirma la baja del acceso completo.':'Confirma que se cerrarán sus sesiones y deberá elegir una nueva contraseña.');
    if(action==='INVITE') {
      requireThat(target.document&&target.contact_phone,'Completa la cédula y el teléfono en Datos y acceso antes de generar el código.');
      documentNumber(target.document);contactPhone(target.contact_phone);
    }
    db.run('DELETE FROM sessions WHERE account_id=?',id);
    db.run('DELETE FROM codes WHERE account_id=?',id);
    if (action === 'DISABLE') {
      db.run('UPDATE accounts SET active=0,password=NULL,revision=revision+1 WHERE id=?',id);
      db.run("UPDATE cash_grants SET status='REVOKING' WHERE account_id=? AND status='ACTIVE'",id);
      auditTeamChange(db,actor,target,'ACCESO_DESACTIVADO',{active:Boolean(target.active)},{active:false});
      return null;
    }
    db.run('UPDATE accounts SET active=1,password=NULL,revision=revision+1 WHERE id=?',id);
    const code = issueActivation(db,id);
    auditTeamChange(db,actor,target,'ACTIVACIÓN_EMITIDA',{active:Boolean(target.active)},{active:true,grants:grantsSnapshot(target.grants)});
    return code;
  });
}
export async function activate(db, data) {
  const initial = checkCode(db,data.code,'ACTIVATE');
  const document = documentNumber(data.document);
  const phone = contactPhone(data.phone);
  const invited = db.get("SELECT id,document,contact_phone,revision FROM accounts WHERE id=? AND kind='COLLABORATOR' AND company_id IS NOT NULL AND active=1 AND password IS NULL",initial.account_id);
  requireThat(invited, 'El acceso cambió. Solicita un código vigente.', 409);
  requireThat(invited.document&&invited.contact_phone,'El dueño debe completar tu cédula y teléfono en Equipo y permisos y compartirte un código vigente.',409);
  requireThat(invited.document===document&&contactPhone(invited.contact_phone)===phone,'La cédula o el teléfono no coinciden con la invitación. Revisa los datos con el dueño del negocio.',403);
  const password = await hashPassword(data.password);
  return db.transaction(() => {
    const code = checkCode(db,data.code,'ACTIVATE');
    requireThat(code.account_id === initial.account_id, 'El acceso cambió. Solicita un código vigente.', 409);
    requireThat(!db.get('SELECT id FROM accounts WHERE document=? AND id<>?',document,code.account_id), 'Esa cédula ya tiene un acceso. Contacta al dueño del negocio.', 409);
    requireThat(db.run("UPDATE accounts SET password=?,revision=revision+1 WHERE id=? AND revision=? AND kind='COLLABORATOR' AND active=1 AND password IS NULL AND document=? AND contact_phone=?",
      password,code.account_id,invited.revision,document,invited.contact_phone).changes === 1, 'El acceso cambió. Solicita un código vigente.', 409);
    db.run('DELETE FROM sessions WHERE account_id=?',code.account_id);
    db.run('DELETE FROM codes WHERE account_id=?',code.account_id);
    return code.account_id;
  });
}

export function updateContact(db,actor,input) {
  requireThat(actor.kind!=='COLLABORATOR','El dueño del negocio administra tu teléfono en Equipo y permisos.',403);
  const phone=contactPhone(input.phone);
  return db.transaction(()=>{
    const current=db.get('SELECT id,revision,contact_phone FROM accounts WHERE id=? AND active=1',actor.id);
    requireThat(current&&current.revision===actor.revision,'Tu cuenta cambió. Recarga antes de guardar.',409);
    requireTeamRevision(current,input);
    if(current.contact_phone===phone)return;
    db.run('UPDATE accounts SET contact_phone=?,revision=revision+1 WHERE id=?',phone,actor.id);
    event(db,actor,actor.company_id,'ACCOUNT',actor.id,'CONTACTO_ACTUALIZADO','Teléfono de contacto actualizado.');
  });
}
