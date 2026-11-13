import { uuid } from '../../shared/domain.mjs';
import { contactField } from './contact.mjs';
import { can } from '../../access/accounts.mjs';
import { form,hidden,input,textarea,button } from './components.mjs';
export function recordingForm(actor,url,phone='') {
  if(!can(actor,'SOCIAL','REQUEST'))return '';
  return form(url('/solicitudes'),actor,`${hidden('request_key',uuid())}${hidden('type','VISIT')}${hidden('channel','SOCIAL')}${hidden('service','VIDEO')}
    ${input('title','¿Qué vamos a grabar?','text','required maxlength="150"')}
    ${input('preferred','Fecha y hora sugeridas (Ecuador)','datetime-local')}
    ${textarea('brief','Lugar e indicaciones','maxlength="4000" rows="3"')}
    ${contactField(phone)}${button('Solicitar grabación')}`);
}
