import { button, card, check, esc, external, form, hidden, input, localLink, timestamp } from './components.mjs';
import { requestForm } from './production-pages.mjs';
import { icon } from './icons.mjs';

const states = {
  available: {
    summary: 'Video gratis', title: 'Un video gratis para tus redes',
    detail: 'Tu video de cortesía está incluido desde el registro, incluso sin un plan de Contenido.',
    next: 'Cuéntanos qué quieres mostrar y confirma tu teléfono para que Lúmina te contacte.',
    action: 'Solicitar mi video'
  },
  requested: {
    summary: 'Video solicitado', title: 'Recibimos tu solicitud de video',
    detail: 'Abre tu solicitud para seguir el avance y revisar el video cuando esté listo.',
    action: 'Ver mi solicitud'
  },
  cancelled: {
    summary: 'Video gratis', title: 'Tu video de cortesía sigue disponible',
    detail: 'La solicitud anterior se canceló. Puedes volver a pedir el video gratis para tu negocio.',
    action: 'Volver a solicitar'
  },
  delivered: {
    summary: 'Video entregado', title: 'Tu video de cortesía ya se entregó',
    detail: 'Puedes consultar el registro de entrega desde tu cuenta.',
    action: 'Ver entrega'
  }
};

export function courtesyNotice(actor, state, returnTo) {
  const {compact, status} = state;
  const copy = states[status];
  const toggle = form('/courtesy/display', actor, hidden('compact', compact ? '0' : '1') + hidden('return_to', returnTo) +
    `<button type="submit" class="courtesy-toggle" aria-expanded="${!compact}" aria-controls="courtesy-description">
      <span class="courtesy-summary">${esc(copy.summary)}<span class="sr-only">. Mostrar detalles del video de cortesía</span></span>
      <span class="courtesy-minimize">Minimizar<span class="sr-only"> aviso del video de cortesía</span></span>
      <span class="courtesy-chevron" aria-hidden="true"></span>
    </button>`, 'courtesy-display');
  return `<aside class="courtesy-notice" aria-label="Video de cortesía" data-compact="${compact}" data-status="${status}">
    <div class="courtesy-details" id="courtesy-description"${compact ? ' hidden' : ''}>
      <span class="courtesy-symbol" aria-hidden="true">${icon(status === 'delivered' ? 'check' : 'social')}</span>
      <div><h2>${esc(copy.title)}</h2><p>${esc(copy.detail)}</p>${copy.next ? `<p>${esc(copy.next)}</p>` : ''}</div>
    </div>
    ${toggle}${localLink('/courtesy', copy.action, 'btn courtesy-action')}
    <span class="courtesy-error" role="status"></span></aside>`;
}

export function courtesyOwnerPage(actor,company,state,values={},error='') {
  const back=localLink(actor.welcome_done?'/home':'/welcome',actor.welcome_done?'← Volver a mi negocio':'← Volver a la bienvenida');
  const alert=error?`<p class="notice" role="alert">${esc(error)}</p>`:'';
  if(state.status==='delivered') {
    const receipt=state.delivery;
    const details=receipt?`<p>Entrega registrada el ${esc(timestamp(receipt.delivered_at))}.</p>`:'';
    return {title:'Tu video de cortesía',omitCourtesy:true,body:card('Video entregado',details+
      (receipt?.video_url?`<p>${external(receipt.video_url,'Abrir mi video')}</p>`:'')+
      (state.request?localLink('/requests/'+state.request.id+'#deliverables','Consultar entrega y archivos','btn'):'')+
      ' <p>'+back+'</p>')};
  }
  return {title:'Solicita tu video de cortesía',omitCourtesy:true,body:card('Un video gratis para tus redes',
    alert+requestForm(actor,path=>path,true,'',false,{phone:company.phone,...values,courtesy_revision:state.request?.revision})+'<p>'+back+'</p>',
    'Cuéntanos qué quieres mostrar. Lúmina te contactará para coordinar el video. Puedes pedirlo sin contratar un plan.')};
}

export function courtesyAdminSummary(company,state) {
  const copy={available:'El negocio todavía puede solicitar su video gratis.',cancelled:'Solicitud cancelada. La cortesía sigue disponible.',requested:'El negocio ya solicitó su video.',delivered:'Video entregado.'}[state.status];
  return card('Video de cortesía','<p>'+esc(copy)+'</p>'+localLink('/admin/businesses/'+company.id+'/courtesy',state.status==='delivered'?'Consultar entrega':'Gestionar cortesía','btn secondary'));
}

export function courtesyAdminPage(actor,company,state,operating,values={},error='') {
  const base='/admin/businesses/'+company.id, back=localLink(base,'← Volver al negocio');
  const reqLink=state.request?localLink('/agency/requests/'+state.request.id+'?company='+company.id,'Ver solicitud'):'';
  const delivered=state.status==='delivered', receipt=state.delivery;
  let body;
  if(delivered) {
    body='<p>El video de cortesía de '+esc(company.name)+' figura como entregado.</p>'+
      (receipt?'<p>'+esc(timestamp(receipt.delivered_at))+'</p>':'')+
      (receipt?.video_url?external(receipt.video_url,'Ver video'):'');
  } else {
    const current={available:'Este negocio todavía no ha solicitado el video.',requested:'El negocio ya solicitó su video.',cancelled:'La solicitud anterior está cancelada.'}[state.status];
    body='<p>'+esc(current)+'</p>';
    if(operating)body+=form(base+'/courtesy',actor,hidden('request_id',state.request?.id||'')+hidden('revision',state.request?.revision||0)+
      '<p>Registra la entrega cuando el negocio ya haya recibido el video, incluso si se lo enviaste por otro medio.</p>'+
      (['SCHEDULED','PRODUCTION'].includes(state.request?.status)?'<p>Al confirmar, se cierra esta solicitud y se cancelan los borradores y grabaciones pendientes. El historial se conserva.</p>':'')+
      input('video_url','Enlace al video (opcional)','url','maxlength="1500" placeholder="https://…"',values.video_url||'')+
      check('confirm','Confirmo que '+company.name+' ya recibió su video gratis.',false,true)+button('Marcar como entregado'));
    else body+='<p>El negocio debe estar activo para registrar una entrega.</p>';
  }
  return {title:'Video de cortesía · '+company.name,body:card(delivered?'Video entregado':'Entrega del video de cortesía',
    (error?`<p role="alert" class="notice">${esc(error)}</p>`:'')+body+'<div class="actions">'+reqLink+back+'</div>')};
}
