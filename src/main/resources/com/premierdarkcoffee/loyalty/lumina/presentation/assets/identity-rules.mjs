const requireThat=(condition,message)=>{if(!condition)throw new Error(message);};
// Format checks are not an identity, tax status or ownership verification.
export function documentNumber(value) {
  const result = typeof value === 'string' ? value.trim() : '';
  requireThat(/^\d{10}$/.test(result), 'Escribe los 10 dígitos de tu cédula.');
  const province = Number(result.slice(0, 2));
  requireThat(province >= 1 && province <= 24 || province === 30, 'Revisa los dos primeros dígitos de la cédula.');
  const sum = [...result.slice(0, 9)].reduce((total, digit, index) => {
    const product = Number(digit) * (index % 2 === 0 ? 2 : 1);
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  requireThat((10 - sum % 10) % 10 === Number(result[9]), 'La cédula no coincide con su dígito verificador. Revisa el número.');
  // Third-digit restrictions exclude real documents reported by Gob.EC. Use the checksum.
  return result;
}
export function rucNumber(value) {
  const result = typeof value === 'string' ? value.trim() : '';
  requireThat(/^\d{10}001$/.test(result) && /[1-9]/.test(result.slice(0, 10)), 'El RUC debe tener 13 dígitos y terminar en 001.');
  // SRI explicitly says corporate/public/foreign RUCs have no mandatory checksum.
  // Never reject a company using the historical modulo-11 algorithm.
  return result;
}
export function whatsappNumber(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  requireThat(/^\+?[0-9 ()-]+$/.test(raw), 'Escribe un número de WhatsApp válido.');
  let digits = raw.replace(/[^0-9]/g, '');
  if (/^09\d{8}$/.test(digits)) digits = '593' + digits.slice(1);
  requireThat(/^[1-9]\d{7,14}$/.test(digits) && (digits.startsWith('593') ? /^5939\d{8}$/.test(digits) : raw.startsWith('+')), 'Usa un celular ecuatoriano de 10 dígitos o el código internacional, por ejemplo +593.');
  return '+' + digits;
}

// A contact number is not a login, ownership proof or marketing authorization.
export function contactPhone(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  requireThat(raw.length <= 30 && /^\+?[0-9 ()-]+$/.test(raw), 'Escribe tu teléfono, por ejemplo 099 123 4567.');
  let digits = raw.replace(/[^0-9]/g, '');
  if (/^(09\d{8}|0[2-7]\d{7})$/.test(digits)) digits = '593' + digits.slice(1);
  requireThat(/^[1-9]\d{7,14}$/.test(digits) && (digits.startsWith('593') ? /^593(9\d{8}|[2-7]\d{7})$/.test(digits) : raw.startsWith('+')),
    'Revisa el teléfono. Para otro país, incluye + y el código del país.');
  return '+' + digits;
}
