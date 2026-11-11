import { can } from '../../access/accounts.mjs';
import { form,hidden,input,textarea,button } from './components.mjs';
export function recordingForm(actor,url) {
  if(!can(actor,'SOCIAL','REQUEST'))return '';
  return form(url('/solicitudes'),actor,`${hidden('type','VISIT')}${hidden('channel','SOCIAL')}${hidden('service','VIDEO')}
    ${input('title','¿Qué vamos a grabar?','text','required maxlength="150"')}
    ${input('preferred','Fecha y hora sugeridas (Ecuador)','datetime-local')}
    ${textarea('brief','Lugar e indicaciones','maxlength="4000" rows="3"')}
    <p class="muted">Lúmina confirmará contigo el horario de la visita.</p>${button('Solicitar grabación')}`);
}
