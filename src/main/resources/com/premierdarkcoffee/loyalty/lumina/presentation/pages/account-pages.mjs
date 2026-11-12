import { button, card, check, esc, form, input, label, localLink } from './components.mjs';

const password = (name,caption,extra='') => input(name,caption,'password',extra || 'required minlength="12" maxlength="128" autocomplete="new-password"');
export function publicPage(path,setupAvailable) {
  if (path === '/registro') return {
    title:'Registra tu negocio como cliente', description:'Crea tu espacio de trabajo y recibe un video de cortesía de Lúmina Digital.',
    body:card('Datos del responsable',form('/registro',null,`<div class="fields two">
      ${input('company','Nombre del negocio','text','required maxlength="100" autocomplete="organization"')}
      ${input('name','Nombre del responsable','text','required maxlength="100" autocomplete="name"')}
      ${input('document','Cédula','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="off"')}
      ${input('phone','Teléfono','tel','required maxlength="25" autocomplete="tel"')}
      ${input('email','Correo','email','required maxlength="180" autocomplete="email"')}
      ${password('password','Contraseña')}</div>
      <p class="muted">Usamos tus datos de contacto para administrar los servicios del negocio. Guardamos una huella y los últimos cuatro dígitos de la cédula para identificar el registro.</p>
      ${check('consent','Autorizo el registro de estos datos para gestionar mi cuenta.',false,true)}
      ${button('Crear mi cuenta')}`),'Tu cuenta es personal. Desde Equipos y roles puedes crear las de tus colaboradores.'),
  };
  if (path === '/activar') return {
    title:'Activa tu acceso', description:'Usa el código que te entregó el dueño del negocio y elige tu contraseña.',
    body:card('Activación de colaborador',form('/activar',null,`${input('code','Código de activación','password','required minlength="43" maxlength="43" autocomplete="off"')}
      ${password('password','Nueva contraseña')}${button('Activar y entrar')}`)),
  };
  if (path === '/configurar') return {
    title:'Configura la cuenta de Lúmina', description:'Crea una sola vez el acceso de quien administra Lúmina Digital. El código aparece en la terminal donde iniciaste el portal.',
    body:card('Administrador de agencia',form('/configurar',null,`
      ${input('code','Código de configuración','password','required minlength="43" maxlength="43" autocomplete="off"')}
      ${input('name','Nombre del administrador','text','required maxlength="100" autocomplete="name"')}
      ${input('email','Correo','email','required maxlength="180" autocomplete="email"')}
      ${password('password','Contraseña')}${button('Crear cuenta de agencia')}`)),
  };
  return {
    title:'Tu marketing, en un solo lugar.', description:'Contenido, Wallet, membresías y resultados en el espacio privado de tu negocio.',
    body:`<div class="auth-grid">${card('Ingresa a tu cuenta',form('/entrar',null,`
      ${input('email','Correo','email','required maxlength="180" autocomplete="username"')}
      ${password('password','Contraseña','required maxlength="128" autocomplete="current-password"')}
      ${button('Ingresar')}`))}
      ${card('Empieza aquí',`<img class="auth-logo" src="/assets/lumina-logo.png" alt="Lúmina Digital" width="180" height="180"><p>Si tienes un negocio, crea tu cuenta y solicita un video de cortesía. Si te dieron un acceso de equipo, actívalo con tu código.</p>
      <div class="actions">${localLink('/registro','Registrar mi negocio','btn secondary')}${localLink('/activar','Activar un acceso','btn secondary')}${setupAvailable ? localLink('/configurar','Configurar la agencia','btn secondary') : ''}</div>`)}</div>`,
  };
}
export function accountPage(actor) {
  return card('Cambia tu contraseña',`<p class="muted">${esc(actor.email)} · ${esc(label(actor.kind))}</p>
    ${form('/cuenta/clave',actor,`${password('current','Contraseña actual','required maxlength="128" autocomplete="current-password"')}
    ${password('password','Nueva contraseña')}${button('Actualizar contraseña')}`)}`,
  'Al guardarla se cierran tus otras sesiones.');
}
