import { Problem, requireThat } from '../../shared/domain.mjs';

export const cookieName = 'lumina_session';
export function cookieFrom(req) {
  return (req.headers.cookie || '').split(';').map(value=>value.trim()).find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
}
export function sessionCookie(token, secure = false) {
  return `${cookieName}=${token || ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 28800 : 0}${secure ? '; Secure' : ''}`;
}
export function securityHeaders(res, caja = false, management = false) {
  res.setHeader('Cache-Control','no-store');
  // Native POST forms need their same-origin Origin header for the CSRF check.
  // no-referrer changes it to "null" (Fetch Standard, append a request Origin header).
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options',management?'SAMEORIGIN':'DENY');
  res.setHeader('Permissions-Policy',`camera=${caja ? '(self)' : '()'}, microphone=(), geolocation=()`);
  res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; style-src 'self'${caja ? " 'unsafe-inline'" : ""}; img-src 'self' data: blob:; connect-src 'self'; media-src blob:; frame-src ${management?"'self'":"'none'"}; frame-ancestors ${management?"'self'":"'none'"}; base-uri 'none'; form-action 'self'`);
}
export function send(res,status,body,type = 'text/html; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type});
  res.end(body);
}
export function json(res,status,value) {
  send(res,status,JSON.stringify(value),'application/json; charset=utf-8');
}
export function redirect(res,path) {
  res.writeHead(303,{Location:path});
  res.end();
}
async function bytes(req) {
  const maximum = 32768;
  const length = Number(req.headers['content-length'] || 0);
  requireThat(Number.isFinite(length) && length <= maximum,'La solicitud supera el tamaño permitido.',413);
  const chunks = [];
  let count = 0;
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    count += chunk.byteLength;
    if (count > maximum) {
      req.resume();
      throw new Problem('La solicitud supera el tamaño permitido.',413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function readForm(req) {
  requireThat(req.headers['content-type']?.split(';')[0] === 'application/x-www-form-urlencoded',
    'Usa el formulario del portal.',415);
  const pairs = new URLSearchParams(await bytes(req));
  const data = Object.create(null);
  for (const [key,value] of pairs) {
    requireThat(!Object.hasOwn(data,key),'La solicitud tiene campos repetidos.');
    data[key] = value;
  }
  return data;
}
export async function readJson(req) {
  requireThat(req.headers['content-type']?.split(';')[0] === 'application/json','Envía datos JSON.',415);
  let input;
  try { input = JSON.parse(await bytes(req)); }
  catch (error) { if (error instanceof Problem) throw error; throw new Problem('Revisa los datos enviados.'); }
  requireThat(input && typeof input === 'object' && !Array.isArray(input),'Revisa los datos enviados.');
  return input;
}
