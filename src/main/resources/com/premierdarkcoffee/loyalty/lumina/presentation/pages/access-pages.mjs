import { businessCategories } from '../../businesses/categories.mjs';
import { check, esc, form, input, localLink, passwordField as password } from './components.mjs';

const submit = (caption,pending) => `<button type="submit" class="access-submit" data-pending-label="${pending}">${caption}<span aria-hidden="true">→</span></button>`;
const foot = (text,path,caption) => `<p class="access-switch">${text} ${localLink(path,caption)}</p>`;
const group = (title,body,number) => `<fieldset class="access-group"><legend><span aria-hidden="true">${number}</span>${title}</legend><div class="access-fields">${body}</div></fieldset>`;
const hint = text => `<p class="field-hint">${text}</p>`;

export function publicPage(path,setupAvailable,{values={},error=''}={}) {
  let view;
  if(path==='/register') {
    const business=group('Tu negocio',
      input('company','Nombre del negocio','text','required maxlength="100" autocomplete="organization"',values.company||'')+
      `<label><span>Tipo de negocio</span><select name="category" required><option value="">Selecciona una opción</option>${[...new Set(businessCategories.map(c=>c.group))].map(group=>`<optgroup label="${esc(group)}">${businessCategories.filter(c=>c.group===group).map(c=>`<option value="${c.id}"${values.category===c.id?' selected':''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>`+
      input('ruc','RUC del negocio','text','required inputmode="numeric" pattern="[0-9]{13}" maxlength="13" autocomplete="off" data-identity="ruc"',values.ruc||'')+
      input('phone','WhatsApp del negocio','tel','required maxlength="25" autocomplete="tel" placeholder="099 123 4567" data-identity="phone"',values.phone||''),'01');
    const personal=group('Tu acceso personal',
      input('name','Nombre del responsable','text','required maxlength="100" autocomplete="name"',values.name||'')+
      input('document','Tu cédula','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="username" data-identity="document"',values.document||'')+
      `<div class="access-wide">${password('password','Crea una contraseña','required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="password-hint"')}<p class="field-hint" id="password-hint">Usa al menos 12 caracteres.</p></div>`,'02');
    view={title:'Dale espacio a tu negocio.',description:'Crea tu cuenta y elige con qué quieres empezar.',mode:'register',
      body:form('/register',null,business+personal+
        `<p class="registration-note">Tu cédula identifica tu cuenta; el RUC, al negocio. Comprobamos el formato, sin certificar identidad ni estado tributario.</p>`+
        check('consent','Autorizo el registro de estos datos para gestionar mi cuenta.',values.consent==='yes',true)+
        submit('Crear mi cuenta','Creando tu cuenta…'),'access-form')+foot('¿Ya tienes una cuenta?','/login','Ingresar')};
  } else if(path==='/activate') {
    view={title:'Tu equipo te espera.',description:'Usa la cédula y el teléfono que registró el dueño del negocio.',mode:'activate',
      body:form('/activate',null,
        input('code','Código de invitación','password','required minlength="43" maxlength="43" autocomplete="off" aria-describedby="invitation-hint"')+
        '<p class="field-hint" id="invitation-hint">Copia el código completo que te compartió el negocio.</p>'+
        input('document','Tu cédula','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="username" data-identity="document"',values.document||'')+
        input('phone','Tu teléfono','tel','required maxlength="30" autocomplete="tel" placeholder="099 123 4567" data-identity="contact"',values.phone||'')+
        password('password','Crea tu contraseña','required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="password-hint"')+
        '<p class="field-hint" id="password-hint">Al menos 12 caracteres. Después ingresarás con tu cédula y esta contraseña.</p>'+
        submit('Activar y entrar','Activando tu acceso…'),'access-form')+foot('¿Ya activaste tu acceso?','/login','Ingresar')};
  } else if(path==='/legacy-login') {
    view={title:'Conserva tu cuenta.',description:'Para cuentas que antes ingresaban con correo.',mode:'legacy',
      body:form('/legacy-login',null,
        input('email','Correo anterior','email','required maxlength="180" autocomplete="username"',values.email||'')+
        password('password','Contraseña actual','required maxlength="128" autocomplete="current-password"')+
        hint('Ingresa con tu correo y contraseña de siempre para continuar con la misma cuenta, permisos y servicios.')+
        submit('Verificar mi cuenta','Verificando…'),'access-form')+foot('¿Ya usas tu cédula?','/login','Ingresar')};
  } else if(path==='/setup') {
    view={title:'El inicio de Lúmina.',description:'Configura una sola vez la cuenta que administra la agencia.',mode:'setup',
      body:form('/setup',null,
        input('code','Código de configuración','password','required minlength="43" maxlength="43" autocomplete="off"')+
        hint('Usa el código privado de configuración de tu instalación.')+
        input('name','Nombre del administrador','text','required maxlength="100" autocomplete="name"',values.name||'')+
        input('document','Cédula del administrador','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="username" data-identity="document"',values.document||'')+
        password('password','Crea una contraseña')+hint('Usa al menos 12 caracteres.')+
        submit('Crear cuenta de agencia','Configurando la agencia…'),'access-form')+foot('¿Ya configuraste la agencia?','/login','Ingresar')};
  } else {
    view={title:'Qué bueno verte de nuevo.',description:'Ingresa a tu espacio de trabajo.',mode:'login',
      body:form('/login',null,
        input('document','Cédula o RUC','text','required inputmode="numeric" pattern="[0-9]{10}([0-9]{3})?" maxlength="13" autocomplete="username" aria-describedby="document-hint"',values.document||'')+
        '<p class="field-hint" id="document-hint">Usa tu cédula. Si eres dueño, también puedes usar el RUC del negocio.</p>'+
        password('password','Contraseña','required maxlength="128" autocomplete="current-password"')+
        submit('Ingresar','Ingresando…'),'access-form')+
        `<p class="access-switch">${localLink('/legacy-login','Ya tenía una cuenta con correo','legacy-access')}</p>`+
        `<div class="access-help"><details><summary>¿Necesitas ayuda para ingresar?</summary><p>Comprueba tu cédula y contraseña. Si eres colaborador y es tu primera vez, activa el código que te entregó el negocio.</p></details></div>`+
        `<div class="access-choices"><a class="access-choice" href="/register"><span>¿Tienes un negocio?</span><strong>Crear mi cuenta <span aria-hidden="true">→</span></strong></a><a class="access-choice" href="/activate"><span>¿Te invitaron a un equipo?</span><strong>Activar mi acceso <span aria-hidden="true">→</span></strong></a></div>`+
        (setupAvailable?`<div class="agency-setup-link">${localLink('/setup','Configurar la agencia')}</div>`:'')};
  }
  if(error)view.body=`<div class="feedback-error" role="alert"><strong>Revisa estos datos</strong><p>${esc(error)}</p></div>`+view.body;
  return {...view,layout:'access'};
}
