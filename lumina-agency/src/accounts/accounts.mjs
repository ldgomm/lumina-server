import { channels, event, now, requireThat, text, uuid } from '../domain.mjs';
import { digest, fingerprint, hashPassword, randomCode, verifyPassword } from './security.mjs';

const expires = hours => new Date(Date.now() + hours * 3600000).toISOString();
export const permissions = Object.freeze({ VIEW: 'Ver', REQUEST: 'Solicitar', APPROVE: 'Aprobar entregas' });
const codePattern = /^[A-Za-z0-9_-]{43}$/;

export function emailAddress(value) {
  const email = text(value, 'correo', 5, 180).toLowerCase();
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Ingresa un correo válido.');
  return email;
}
function accountByEmail(db, email) {
  return db.get('SELECT * FROM accounts WHERE email=?', email);
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
  const name = text(data.name, 'nombre', 2, 100);
  const email = emailAddress(data.email);
  const password = await hashPassword(data.password);
  return db.transaction(() => {
    const code = checkCode(db, data.code, 'SETUP');
    requireThat(!db.get("SELECT id FROM accounts WHERE kind='AGENCY'") && !accountByEmail(db,email),
      'Ya existe una cuenta con ese correo.', 409);
    const id = uuid();
    db.run("INSERT INTO accounts(id,name,email,kind,password) VALUES(?,?,?,'AGENCY',?)", id, name, email, password);
    db.run('DELETE FROM codes WHERE digest=?', code.digest);
    return id;
  });
}
export async function register(db, key, data) {
  const company = text(data.company, 'negocio', 2, 100);
  const name = text(data.name, 'responsable', 2, 100);
  const email = emailAddress(data.email);
  const document = text(data.document, 'cédula', 10, 10);
  const phone = text(data.phone, 'teléfono', 7, 25);
  requireThat(/^\d{10}$/.test(document), 'Escribe los 10 dígitos de la cédula.');
  requireThat(/^\+?[0-9() -]+$/.test(phone) && phone.replace(/\D/g,'').length >= 7, 'Ingresa un teléfono válido.');
  requireThat(data.consent === 'yes', 'Confirma que autorizas el registro de estos datos.');
  const normalized = company.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  requireThat(normalized, 'Escribe un nombre de negocio válido.');
  const identity = fingerprint(key, 'registration', normalized + '\0' + document);
  const password = await hashPassword(data.password);
  return db.transaction(() => {
    requireThat(!accountByEmail(db,email) && !db.get('SELECT id FROM companies WHERE registration_key=?',identity),
      'Ya existe un registro con esos datos. Usa tu cuenta existente o contacta a Lúmina.', 409);
    const companyId = uuid();
    const accountId = uuid();
    db.run(`INSERT INTO companies(id,name,registration_key,document_hint,phone,created_at)
      VALUES(?,?,?,?,?,?)`, companyId, company, identity, document.slice(-4), phone, now());
    db.run(`INSERT INTO accounts(id,company_id,name,email,kind,password) VALUES(?,?,?,?,'OWNER',?)`,
      accountId, companyId, name, email, password);
    event(db, { id: accountId, name }, companyId, 'COMPANY', companyId, 'REGISTRO', 'Video de cortesía disponible.');
    return accountId;
  });
}
export async function authenticate(db, data) {
  const email = emailAddress(data.email);
  limit(db, 'login-email:' + email, 12);
  const account = accountByEmail(db,email);
  const valid = await verifyPassword(data.password, account?.password);
  requireThat(valid && account?.active, 'Correo o contraseña incorrectos.', 401);
  const current = accountByEmail(db,email);
  requireThat(current?.active && current.password === account.password, 'Vuelve a iniciar sesión.', 401);
  return current.id;
}
export function createSession(db, accountId) {
  const session = randomCode();
  db.run('DELETE FROM sessions WHERE expires_at<=?',now());
  db.run('INSERT INTO sessions VALUES(?,?,?,?)', digest(session), accountId, randomCode(), expires(8));
  return session;
}
export function getSession(db, cookie) {
  if (!codePattern.test(cookie || '')) return null;
  const actor = db.get(`SELECT a.id,a.company_id,a.name,a.email,a.kind,a.revision,
    s.digest AS session_id,s.csrf,c.name AS company_name,c.approved
    FROM sessions s JOIN accounts a ON a.id=s.account_id LEFT JOIN companies c ON c.id=a.company_id
    WHERE s.digest=? AND s.expires_at>? AND a.active=1`, digest(cookie), now());
  if (actor) actor.grants = db.all('SELECT scope,action FROM grants WHERE account_id=?', actor.id);
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
  return actor.kind !== 'COLLABORATOR' ||
    actor.grants.some(grant => grant.scope === scope && grant.action === action);
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
  const target = db.get(`SELECT a.id,a.name,a.email,a.revision,a.active,a.password IS NOT NULL AS activated,
    c.status AS cash_status,c.branch_id,c.branch_name,c.purchases,c.rewards
    FROM accounts a LEFT JOIN cash_grants c ON c.account_id=a.id
    WHERE a.id=? AND a.company_id=? AND a.kind='COLLABORATOR'`, id, actor.company_id);
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
  const actions = Object.keys(permissions);
  for (const channel of Object.keys(channels)) {
    const selected = actions.filter(action => values[`${channel}.${action}`] === 'yes');
    requireThat(!selected.length || selected.includes('VIEW'), 'Activa Ver para poder asignar Solicitar o Aprobar.');
    for (const action of selected) db.run('INSERT INTO grants VALUES(?,?,?)',accountId,channel,action);
  }
}
function issueActivation(db, accountId) {
  const code = randomCode();
  db.run("DELETE FROM codes WHERE account_id=? AND kind='ACTIVATE'",accountId);
  db.run("INSERT INTO codes VALUES(?,'ACTIVATE',?,?)",digest(code),accountId,expires(48));
  return code;
}
export function createTeamMember(db, actor, input) {
  requireOwner(actor);
  requireThat(actor.approved, 'Lúmina debe verificar el negocio antes de crear accesos.', 409);
  const name = text(input.name,'nombre',2,100);
  const email = emailAddress(input.email);
  return db.transaction(() => {
    requireThat(!accountByEmail(db,email), 'Ese correo ya tiene un acceso.', 409);
    const id = uuid();
    db.run("INSERT INTO accounts(id,company_id,name,email,kind) VALUES(?,?,?,?,'COLLABORATOR')",id,actor.company_id,name,email);
    setGrants(db,id,input);
    const code = issueActivation(db,id);
    event(db,actor,actor.company_id,'ACCOUNT',id,'ACCESO_CREADO',name);
    return { id, code };
  });
}
export function updateGrants(db, actor, id, input) {
  const target = teamMember(db,actor,id);
  requireThat(String(target.revision) === input.revision, 'El acceso cambió. Recarga el formulario.', 409);
  db.transaction(() => {
    db.run('DELETE FROM grants WHERE account_id=?',id);
    setGrants(db,id,input);
    db.run('UPDATE accounts SET revision=revision+1 WHERE id=?',id);
    event(db,actor,actor.company_id,'ACCOUNT',id,'PERMISOS_ACTUALIZADOS',target.name);
  });
}
export function manageAccount(db, actor, id, action) {
  const target = teamMember(db,actor,id);
  return db.transaction(() => {
    db.run('DELETE FROM sessions WHERE account_id=?',id);
    db.run('DELETE FROM codes WHERE account_id=?',id);
    if (action === 'DISABLE') {
      db.run('UPDATE accounts SET active=0,password=NULL,revision=revision+1 WHERE id=?',id);
      db.run("UPDATE cash_grants SET status='REVOKING' WHERE account_id=? AND status='ACTIVE'",id);
      event(db,actor,actor.company_id,'ACCOUNT',id,'ACCESO_DESACTIVADO',target.name);
      return null;
    }
    requireThat(action === 'INVITE', 'Acción de acceso inválida.');
    db.run('UPDATE accounts SET active=1,password=NULL,revision=revision+1 WHERE id=?',id);
    const code = issueActivation(db,id);
    event(db,actor,actor.company_id,'ACCOUNT',id,'ACTIVACIÓN_EMITIDA',target.name);
    return code;
  });
}
export async function activate(db, data) {
  const initial = checkCode(db,data.code,'ACTIVATE');
  const password = await hashPassword(data.password);
  return db.transaction(() => {
    const code = checkCode(db,data.code,'ACTIVATE');
    requireThat(code.account_id === initial.account_id, 'El acceso cambió. Solicita un código vigente.', 409);
    requireThat(db.run('UPDATE accounts SET password=?,revision=revision+1 WHERE id=? AND active=1 AND password IS NULL',
      password,code.account_id).changes === 1, 'El acceso cambió. Solicita un código vigente.', 409);
    db.run('DELETE FROM codes WHERE digest=?',code.digest);
    return code.account_id;
  });
}
