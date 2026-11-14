import { identityLabel } from '../../access/identity.mjs';
import { button, card, esc, form, hidden, input, label, passwordField as password } from './components.mjs';

export { publicPage } from './access-pages.mjs';

export function accountPage(actor,{otherSessions=0,error='',notice='',contactValues={},contactError=''}={}) {
  const workspace=actor.kind==='AGENCY'?'Lúmina Digital':actor.company_name||'Mi negocio';
  return `<div class="account-layout">
    <section class="card account-profile" aria-label="Tu perfil"><span class="account-avatar" aria-hidden="true">${esc(actor.name.trim().charAt(0).toUpperCase())}</span><div><p class="eyebrow">TU PERFIL</p><h2>${esc(actor.name)}</h2><p>${esc(identityLabel(actor))}</p><span class="badge">${esc(label(actor.kind))}</span></div>
    <dl><div><dt>Espacio de trabajo</dt><dd>${esc(workspace)}</dd></div><div><dt>Acceso</dt><dd>Una cuenta para Lúmina y tus módulos</dd></div></dl></section>
    ${!actor.document?`<div class="account-identity">${identityMigrationPage(actor)}</div>`:''}
    <section class="card account-contact"><p class="eyebrow">CONTACTO</p><h2>Tu teléfono</h2>
    ${actor.contact_phone?`<p class="account-phone">${esc(actor.contact_phone)}</p>`:actor.kind==='COLLABORATOR'?'<p class="muted">Tu teléfono está pendiente.</p>':'<p class="muted">Añade un teléfono para que puedan contactarte.</p>'}
    ${actor.kind==='COLLABORATOR'?'<p class="muted">Si necesitas corregirlo, solicita el cambio al dueño del negocio.</p>':`<details${contactError||!actor.contact_phone?' open':''}><summary>${actor.contact_phone?'Cambiar teléfono':'Añadir teléfono'}</summary>
    ${contactError?`<p class="feedback-error" role="alert">${esc(contactError)}</p>`:''}
    ${form('/account/contact',actor,`${hidden('revision',contactValues.revision??actor.revision)}${input('phone','Teléfono personal','tel','required maxlength="30" autocomplete="tel" placeholder="099 123 4567" data-identity="contact"',contactValues.phone??actor.contact_phone??'')}<p class="muted">${actor.document?'Tu acceso sigue siendo con cédula y contraseña.':'Tu teléfono no cambia tu forma de ingresar.'}</p>${button('Guardar teléfono')}`)}</details>`}</section>
    ${notice?`<p class="notice account-feedback" role="status">${esc(notice)}</p>`:''}
    <section class="card account-security"><p class="eyebrow">SEGURIDAD</p><h2>Cambiar contraseña</h2>
    ${error?`<p class="error" role="alert">${esc(error)}</p>`:''}
    ${form('/account/password',actor,`${password('current','Contraseña actual','required maxlength="128" autocomplete="current-password"')}
    <div class="fields two">${password('password','Nueva contraseña')}${password('confirmation','Repite la nueva contraseña')}</div>
    <p class="muted">Usa al menos 12 caracteres. Al cambiarla se cierran tus otras sesiones.</p>${button('Guardar contraseña')}`)}</section>
    <section class="card account-session"><p class="eyebrow">TU SESIÓN</p><h2>Acceso a tu cuenta</h2><p class="session-state"><span aria-hidden="true"></span>Sesión actual activa</p>
    ${otherSessions?`<p>${otherSessions===1?'Tienes otra sesión abierta.':'Tienes '+otherSessions+' sesiones más abiertas.'}</p>${form('/account/sessions/close',actor,button('Cerrar las otras sesiones','secondary'))}`:'<p class="muted">No tienes otras sesiones abiertas.</p>'}
    <div class="account-signout"><h3>Terminar esta sesión</h3><p class="muted">Cerrarás tu acceso a Lúmina y sus módulos en este navegador.</p>${form('/logout',actor,button('Cerrar sesión','account-exit'))}</div></section>
    </div>`;
}

export function identityMigrationPage(actor,values={},error='') {
 if(actor.kind==='COLLABORATOR')return card('Tu cédula está pendiente','<p>Solicita al dueño que registre tu cédula y teléfono en Equipo y permisos. Conservas tu cuenta y las tareas asignadas.</p>');
 return card('Ingresa con tu cédula',`${error?`<p class="feedback-error" role="alert">${esc(error)}</p>`:''}<p>Añade tu cédula a esta misma cuenta. Conservas tu contraseña, permisos y servicios; después ingresarás con tu cédula.</p>${form('/account/identity',actor,`${input('document','Tu cédula','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" data-identity="document"',values.document||'')}${actor.kind==='OWNER'?`<div class="fields two">${input('ruc','RUC del negocio','text','required inputmode="numeric" maxlength="13" data-identity="ruc"',values.ruc||actor.ruc||'')}${input('phone','WhatsApp del negocio','tel','required autocomplete="tel" maxlength="25" data-identity="phone"',values.phone||actor.phone||'')}</div>`:''}${password('current','Contraseña actual','required maxlength="128" autocomplete="current-password"','identity-current')}${button('Guardar y continuar')}`)}`);
}
