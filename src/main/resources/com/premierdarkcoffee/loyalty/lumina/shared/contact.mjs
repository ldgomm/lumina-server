import { requireThat, text } from './domain.mjs';

export function requestPhone(data,company) {
  // Older clients can still submit using their registered business contact.
  // The current form always sends an explicit phone, including an empty value.
  const value=data.contact_version==='1'||Object.hasOwn(data,'phone')?data.phone:company.phone;
  const phone=text(value,'teléfono de contacto',7,25);
  const digits=phone.replace(/\D/g,'');
  requireThat(/^\+?[0-9() -]+$/.test(phone)&&digits.length>=7&&digits.length<=15,
    'Escribe un teléfono de contacto válido.');
  return phone;
}
