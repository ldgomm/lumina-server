import { randomUUID } from 'node:crypto';

export const uuid = randomUUID;
export const now = () => new Date().toISOString();
export const zone = 'America/Guayaquil';
export const areas = Object.freeze({ SOCIAL: 'Contenido para redes', WALLET: 'Fidelización digital · Wallet', MAPS: 'Google Maps', WEB: 'Web', BRAND: 'Diseño de marca' });
export const walletScopes = Object.freeze({ WALLET_DESIGN: 'Diseño de tarjetas', WALLET_PROGRAMS: 'Promociones y premios', WALLET_CUSTOMERS: 'Clientes y recuperación', WALLET_REPORTS: 'Informes y estado de tarjetas' });
export const channels = Object.freeze({ ...areas,
  INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', FACEBOOK: 'Facebook', YOUTUBE: 'YouTube',
  
});
export const socialChannels = ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'YOUTUBE'];
export const services = Object.freeze({
  VIDEO: 'Video', REEL: 'Reel', POST: 'Post', CAROUSEL: 'Carrusel', STORY: 'Story',
  PHOTO: 'Fotografía', EDITING: 'Edición de video', GRAPHIC: 'Pieza gráfica', COPY: 'Texto para publicación', PUBLICATION: 'Publicación',
  WEBSITE: 'Página empresarial', STORE: 'Tienda en línea', CATALOG: 'Catálogo', MENU: 'Menú digital', BOOKING: 'Reservas', LANDING: 'Página de campaña', MAINTENANCE: 'Mantenimiento web',
  MAPS_PROFILE: 'Gestión del Perfil de Empresa', MAPS_INFO: 'Actualización de información', MAPS_PHOTO: 'Fotografías del negocio', MAPS_RESPONSES: 'Respuestas a reseñas', MAPS_PERFORMANCE: 'Seguimiento del rendimiento',
  LOYALTY_PROGRAM: 'Programa de puntos, sellos y recompensas', WALLET_DESIGN: 'Diseño de tarjeta digital',
  LOGO: 'Diseño de logo', IDENTITY: 'Identidad visual', BRAND_GUIDE: 'Manual de marca',
  SHORT: 'Short', REVIEWS: 'Gestión de reseñas', WEB: 'Página web', WALLET: 'Wallet',
});
export const formats = Object.freeze({
  SOCIAL: ['VIDEO','PHOTO','EDITING','POST','CAROUSEL','STORY','GRAPHIC','COPY','PUBLICATION','REEL','SHORT'],
  BRAND: ['LOGO','IDENTITY','BRAND_GUIDE'],
  INSTAGRAM: ['VIDEO', 'REEL', 'POST', 'CAROUSEL', 'STORY'],
  TIKTOK: ['VIDEO', 'POST', 'CAROUSEL', 'STORY'],
  FACEBOOK: ['VIDEO', 'REEL', 'POST', 'CAROUSEL', 'STORY'],
  YOUTUBE: ['VIDEO', 'SHORT', 'POST'],
  MAPS: ['MAPS_PROFILE','MAPS_INFO','MAPS_PHOTO','REVIEWS','MAPS_RESPONSES','MAPS_PERFORMANCE','POST'],
  WEB: ['WEBSITE','STORE','CATALOG','MENU','BOOKING','LANDING','MAINTENANCE','WEB'], WALLET: ['WALLET','LOYALTY_PROGRAM','WALLET_DESIGN'],
});
export const labels = Object.freeze({
  CONTENT: 'Contenido', QUOTE: 'Cotización', VISIT: 'Visita de grabación',
  COURTESY: 'Video de cortesía', PLAN: 'Contratación', GENERAL: 'General',
  NEW: 'Recibida', REVIEW: 'En revisión', QUOTED: 'Cotizada', APPROVED: 'Aprobada',
  SCHEDULED: 'Programada', PRODUCTION: 'En producción', DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada', DONE: 'Realizada', OFFERED: 'Enviada',
  ACCEPTED: 'Aceptada', SUPERSEDED: 'Reemplazada', MONTHLY: 'Mensual',
  ONE_OFF: 'Individual', NONE: 'Sin Wallet', INCLUDED: 'Wallet incluido',
  GIFT: 'Wallet de cortesía', PENDING: 'Pendiente', DRAFT: 'Borrador',
  ANSWERED: 'Respondida', ACTIVE: 'Activo', INACTIVE: 'Inactivo',
  REVOKING: 'Retiro pendiente', AGENCY: 'Agencia', OWNER: 'Dueño', COLLABORATOR: 'Colaborador',
});
export class Problem extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function requireThat(condition, message, status = 400) {
  if (!condition) throw new Problem(message, status);
}
export function text(value, label, min = 1, max = 150) {
  requireThat(typeof value === 'string', `Revisa el campo ${label}.`);
  const result = value.trim();
  requireThat(result.length >= min && result.length <= max &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(result),
  `Revisa el campo ${label} (${min} a ${max} caracteres).`);
  return result;
}
export function choice(value, allowed, label) {
  requireThat(allowed.includes(value), `Elige una opción válida para ${label}.`);
  return value;
}
export function integer(value, label, { min = 0, max = 1_000_000_000_000, optional = false } = {}) {
  if (optional && (value === '' || value === undefined)) return null;
  requireThat(typeof value === 'string' && /^\d{1,15}$/.test(value), `Escribe un número entero para ${label}.`);
  const result = Number(value);
  requireThat(result >= min && result <= max, `El número de ${label} está fuera del rango permitido.`);
  return result;
}
export function money(value, optional = false) {
  if (optional && (value === '' || value === undefined)) return null;
  requireThat(typeof value === 'string' && /^\d{1,8}(?:[.,]\d{1,2})?$/.test(value),
    'Escribe un valor en USD con hasta dos decimales.');
  const [whole, cents = ''] = value.replace(',', '.').split('.');
  return Number(whole) * 100 + Number(cents.padEnd(2, '0'));
}
export function dateOnly(value, label = 'fecha') {
  requireThat(typeof value === 'string' && /^20\d\d-\d\d-\d\d$/.test(value), `Revisa ${label}.`);
  const date = new Date(value + 'T00:00:00Z');
  requireThat(Number.isFinite(+date) && date.toISOString().slice(0,10) === value, `Revisa ${label}.`);
  return value;
}
export function localInstant(value, label, optional = false) {
  if (optional && !value) return null;
  requireThat(typeof value === 'string' && /^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
    `Ingresa fecha y hora para ${label}.`);
  dateOnly(value.slice(0,10), label);
  return new Date(value + ':00-05:00').toISOString();
}
export function localDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(date);
}
export function nextMonth(value) {
  const [y, m, d] = dateOnly(value).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(lastDay, d))).toISOString().slice(0,10);
}
export const isId = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function httpsUrl(value) {
  let url;
  try { url = new URL(text(value, 'enlace', 8, 1500)); } catch { throw new Problem('Ingresa un enlace HTTPS válido.'); }
  requireThat(url.protocol === 'https:' && !url.username && !url.password, 'Ingresa un enlace HTTPS válido.');
  url.hash = '';
  return url.href;
}
export function event(db, actor, company, subject, subjectId, action, details = '', scope = null) {
  db.run(`INSERT INTO audit(company_id,actor_id,actor_name,subject,subject_id,scope,action,details,happened_at)
          VALUES(?,?,?,?,?,?,?,?,?)`, company, actor.id, actor.name, subject, subjectId, scope, action, details, now());
}
