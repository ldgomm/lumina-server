import { esc, hidden, input } from './components.mjs';

export const contactField=phone=>hidden('contact_version','1')+input('phone','Teléfono de contacto','tel',
  'required minlength="7" maxlength="25" autocomplete="tel" inputmode="tel" placeholder="099 123 4567"',phone??'');
export function contactLine(saved,current) {
  const phone=saved||current;
  return phone?`<p class="request-contact"><span>${saved?'Teléfono de contacto':'Teléfono actual del negocio'}</span><a href="tel:${esc(phone.replace(/[^+0-9]/g,''))}">${esc(phone)}</a></p>`:'';
}
