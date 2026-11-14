import { identityLabel } from '../../access/identity.mjs';
import { businessCategories } from '../../businesses/categories.mjs';
import { button, card, check, esc, form, hidden, input, label, localLink } from './components.mjs';

const password = (name,caption,extra='') => `<div class="password-field"><label for="password-${esc(name)}">${esc(caption)}</label><div class="password-control"><input id="password-${esc(name)}" name="${esc(name)}" type="password" ${extra || 'required minlength="12" maxlength="128" autocomplete="new-password"'}><button type="button" class="secondary" data-password-toggle aria-controls="password-${esc(name)}" aria-label="Mostrar ${esc(caption.toLowerCase())}" aria-pressed="false" hidden>Mostrar</button></div></div>`;
function publicView(path,setupAvailable,values={}) {
  if (path === '/register') return {
    title:'Tu negocio empieza aquí', description:'Una cuenta. Los servicios que tú elijas.',
    body:card('Crea tu cuenta',form('/register',null,`<div class="fields two">
      ${input('company','Nombre del negocio','text','required maxlength="100" autocomplete="organization"',values.company||'')}
      <label>¿Qué tipo de negocio tienes?<select name="category" required><option value="">Selecciona una opción</option>${[...new Set(businessCategories.map(c=>c.group))].map(group=>`<optgroup label="${esc(group)}">${businessCategories.filter(c=>c.group===group).map(c=>`<option value="${c.id}" ${values.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      ${input('name','Nombre del responsable' ,'text','required maxlength="100" autocomplete="name"',values.name||'')}
      ${input('document','Cédula','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="off" data-identity="document"',values.document||'')}
      ${input('ruc','RUC del negocio','text','required inputmode="numeric" pattern="[0-9]{13}" maxlength="13" data-identity="ruc"',values.ruc||'')}
      ${input('phone','WhatsApp del negocio','tel','required maxlength="25" autocomplete="tel" placeholder="09XXXXXXXX" data-identity="phone"',values.phone||'')}
      ${password('password','Contraseña')}</div><p class="muted">Contraseña: al menos 12 caracteres.</p>
      <p class="muted">Tu cédula identifica tu cuenta; el RUC, al negocio. Validamos el formato, sin certificar identidad ni estado tributario.</p>
      ${check('consent','Autorizo el registro de estos datos para gestionar mi cuenta.',values.consent==='yes',true)}
      ${button('Crear mi cuenta')}`),'Tu cuenta es personal. Desde Equipos y roles puedes crear las de tus colaboradores.'),
  };
  if(path==='/legacy-login')return {
    title:'Actualiza tu acceso', description:'Solo para cuentas creadas antes del cambio a cédula.',
    body:card('Conserva tu cuenta',form('/legacy-login',null,`${input('email','Correo anterior','email','required maxlength="180" autocomplete="username"',values.email||'')}${password('password','Contraseña actual','required maxlength="128" autocomplete="current-password"')}${button('Verificar mi cuenta')}`),'Después registrarás tu cédula una sola vez. Conservas todos tus datos.')
  };
  if (path === '/activate') return {
    title:'Activa tu acceso', description:'Usa el código que te entregó el dueño del negocio y elige tu contraseña.',
    body:card('Activación de colaborador',form('/activate',null,`${input('code','Código de activación','password','required minlength="43" maxlength="43" autocomplete="off"')}
      ${input('phone','Tu teléfono','tel','required maxlength="30" autocomplete="tel" placeholder="099 123 4567" data-identity="contact"',values.phone||'')}${password('password','Nueva contraseña')}<p class="muted">Al menos 12 caracteres.</p>${button('Activar y entrar')}`)),
  };
  if (path === '/setup') return {
    title:'Configura la cuenta de Lúmina', description:'Crea una sola vez el acceso de quien administra Lúmina Digital. El código aparece en la terminal donde iniciaste el portal.',
    body:card('Administrador de agencia',form('/setup',null,`
      ${input('code','Código de configuración','password','required minlength="43" maxlength="43" autocomplete="off"')}
      ${input('name','Nombre del administrador','text','required maxlength="100" autocomplete="name"',values.name||'')}
      ${input('document','Cédula del administrador','text','required inputmode="numeric" maxlength="10" pattern="[0-9]{10}" data-identity="document"',values.document||'')}
      ${password('password','Contraseña')}${button('Crear cuenta de agencia')}`)),
  };
  return {
    title:'Ingresa a Lúmina', description:'Tu negocio, tu equipo y tus servicios en una sola cuenta.',
    body:`<div class="auth-grid">${card('Ingresa a tu cuenta',form('/login',null,`
      ${input('document','Cédula o RUC','text','required inputmode="numeric" pattern="[0-9]{10}([0-9]{3})?" maxlength="13" autocomplete="username"',values.document||'')}
      ${password('password','Contraseña','required maxlength="128" autocomplete="current-password"')}
      <button type="submit" data-pending-label="Ingresando…">Ingresar</button>`)+localLink('/legacy-login','Ya tenía una cuenta con correo','legacy-access'))}
      ${card('¿Es tu primera vez?',`<img class="auth-logo" src="/assets/lumina-logo.png" alt="Lúmina Digital" width="96" height="96"><div class="access-choices"><a class="access-choice" href="/register"><strong>Registrar mi negocio <span aria-hidden="true">→</span></strong><span>Crea tu cuenta y elige tus servicios.</span></a><a class="access-choice" href="/activate"><strong>Activar mi acceso de equipo <span aria-hidden="true">→</span></strong><span>Usa el código que te entregó el negocio.</span></a></div>${setupAvailable ? `<div class="agency-setup-link">${localLink('/setup','Configurar la agencia')}</div>` : ''}`)}</div>`,
  };
}
export function publicPage(path,setupAvailable,{values={},error=''}={}) {
  const result=publicView(path,setupAvailable,values);
  if(error)result.body=`<div class="feedback-error" role="alert"><strong>Revisa estos datos</strong><p>${esc(error)}</p></div>`+result.body;
  return result;
}
export function accountPage(actor,{otherSessions=0,error='',notice='',contactValues={},contactError=''}={}) {
  const workspace=actor.kind==='AGENCY'?'Lúmina Digital':actor.company_name||'Mi negocio';
  return `<div class="account-layout">
    <section class="card account-profile" aria-label="Tu perfil"><span class="account-avatar" aria-hidden="true">${esc(actor.name.trim().charAt(0).toUpperCase())}</span><div><p class="eyebrow">TU PERFIL</p><h2>${esc(actor.name)}</h2><p>${esc(identityLabel(actor))}</p><span class="badge">${esc(label(actor.kind))}</span></div>
    <dl><div><dt>Espacio de trabajo</dt><dd>${esc(workspace)}</dd></div><div><dt>Acceso</dt><dd>Una cuenta para Lúmina y tus módulos</dd></div></dl></section>
    <section class="card account-contact"><p class="eyebrow">CONTACTO</p><h2>Tu teléfono</h2>
    ${actor.contact_phone?`<p class="account-phone">${esc(actor.contact_phone)}</p>`:'<p class="muted">Añade un teléfono para que puedan contactarte.</p>'}
    <details${contactError||!actor.contact_phone?' open':''}><summary>${actor.contact_phone?'Cambiar teléfono':'Añadir teléfono'}</summary>
    ${contactError?`<p class="feedback-error" role="alert">${esc(contactError)}</p>`:''}
    ${form('/account/contact',actor,`${hidden('revision',contactValues.revision??actor.revision)}${input('phone','Teléfono personal','tel','required maxlength="30" autocomplete="tel" placeholder="099 123 4567" data-identity="contact"',contactValues.phone??actor.contact_phone??'')}<p class="muted">Tu acceso sigue siendo con cédula y contraseña.</p>${button('Guardar teléfono')}`)}</details></section>
    ${!actor.document?identityMigrationPage(actor):''}
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
 return card('Ingresa con tu cédula',`${error?`<p class="feedback-error" role="alert">${esc(error)}</p>`:''}<p>Confirma tus datos una sola vez. Tu cuenta y tus servicios se conservan.</p>${form('/account/identity',actor,`${input('document','Tu cédula','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" data-identity="document"',values.document||'')}${actor.kind==='OWNER'?`<div class="fields two">${input('ruc','RUC del negocio','text','required inputmode="numeric" maxlength="13" data-identity="ruc"',values.ruc||actor.ruc||'')}${input('phone','WhatsApp del negocio','tel','required autocomplete="tel" maxlength="25" data-identity="phone"',values.phone||actor.phone||'')}</div>`:''}${password('current','Contraseña actual','required maxlength="128" autocomplete="current-password"')}${button('Guardar y continuar')}`)}`);
}
