import { createHash } from 'node:crypto';
import { requireOwner } from '../access/accounts.mjs';
import { requireOperating } from '../businesses/control.mjs';
import { event, localDay, now, requireThat } from '../shared/domain.mjs';
import { offerAvailable } from '../campaigns/season.mjs';
import { getPlan } from './billing.mjs';
import { serviceArea } from './catalog.mjs';
import { acceptOrder, activateWalletOrder, getOrder, monthlyEnd } from './orders.mjs';

export const includesWallet = order => order.lines.some(line => line.wallet !== 'NONE' || line.items.some(item => item.service === 'WALLET'));

// A read-only preview. No GET grants access, signs an agreement or changes a price.
// Work with unspecified prices/delivery dates still needs a real quotation.
export function walletCheckout(db, order) {
  if (order.status !== 'REQUESTED' || !includesWallet(order) || !order.lines.every(line => line.term === 'MONTHLY' && line.unit_minor !== null)) return null;
  const lines = order.lines.map(line => {
    const plan = getPlan(db, line.plan_id);
    const previous = line.renewal_of ? db.get('SELECT * FROM contracts WHERE id=? AND company_id=? AND cancelled_at IS NULL', line.renewal_of, order.company_id) : null;
    const start = previous?.ends_before || localDay();
    return {...line, starts_on:start, ends_before:monthlyEnd(start, previous?.renewal_anchor || previous?.starts_on || start),
      available:offerAvailable(plan) && (!line.renewal_of || Boolean(previous)), description:plan.description};
  });
  const terms = 'Precio final del catálogo por el período indicado. Wallet queda disponible al confirmar, sin aprobación adicional de Lúmina. '
    + 'La contratación no debita una tarjeta bancaria. El siguiente período requiere una nueva confirmación; no se añade otra tarifa de Wallet. '
    + 'Los cupos no utilizados no se acumulan. ' + lines.map(line => `${line.name}: ${line.description}`).join('\n');
  const hash = createHash('sha256').update(JSON.stringify({id:order.id, revision:order.revision, lines, terms})).digest('hex');
  return {...order, lines, terms, checkoutHash:hash};
}

export function validateWalletCheckout(db, actor, company, id, data) {
  requireOwner(actor);
  requireThat(actor.company_id === company.id && db.get("SELECT id FROM accounts WHERE id=? AND company_id=? AND kind='OWNER' AND active=1 AND revision=?", actor.id, company.id, actor.revision), 'Tu cuenta cambió. Ingresa nuevamente.', 403);
  requireOperating(db, company.id);
  const order = getOrder(db, actor, company, id);
  requireThat(includesWallet(order), 'Esta contratación no incluye Wallet.', 409);
  requireThat(data.confirm === 'yes', 'Confirma el precio, el período y las condiciones.');
  requireThat(String(order.revision) === String(data.revision), 'La propuesta cambió. Revisa la versión actual.', 409);
  if (order.status === 'ACTIVE') return order;
  const preview = walletCheckout(db, order);
  if (order.status === 'REQUESTED') {
    requireThat(preview, 'Esta combinación necesita definir su precio o plazo. Puedes contratar Wallet por separado desde el catálogo.', 409);
    requireThat(data.offerHash === preview.checkoutHash && preview.lines.every(line => line.available && line.starts_on >= localDay()), 'La oferta o las fechas cambiaron. Revisa las condiciones actuales antes de confirmar.', 409);
  } else requireThat(['QUOTED','ACCEPTED'].includes(order.status), 'Esta contratación está cerrada.', 409);
  const proposed = preview || order;
  const walletLines = proposed.lines.filter(line => line.wallet !== 'NONE' || line.items.some(item => item.service === 'WALLET'));
  requireThat(walletLines.length === 1 && walletLines[0].units === 1, 'Elige una sola oferta con Wallet para tu negocio. Puedes combinarla con otros servicios.', 409);
  for (const line of walletLines) {
    const previous=line.renewal_of?db.get('SELECT * FROM contracts WHERE id=? AND company_id=? AND cancelled_at IS NULL',line.renewal_of,company.id):null;
    const continuing=previous&&previous.starts_on<=localDay()&&previous.ends_before>=localDay()&&previous.ends_before===line.starts_on;
    requireThat((line.starts_on <= localDay() || continuing) && line.ends_before > localDay(), 'Este período de Wallet todavía no comienza o ya terminó. Revisa sus fechas.', 409);
    requireThat(!db.get(`SELECT c.id FROM contracts c JOIN plan_items i ON i.plan_id=c.plan_id AND i.service='WALLET'
      WHERE c.company_id=? AND c.cancelled_at IS NULL AND c.starts_on<? AND c.ends_before>?
      AND (c.order_line_id IS NULL OR c.order_line_id NOT IN (SELECT id FROM package_order_lines WHERE order_id=?)) LIMIT 1`, company.id, line.ends_before, line.starts_on, id),
    'Wallet ya está incluida en un acuerdo para ese período. Abre tu Wallet o revisa tus acuerdos para evitar contratarla dos veces.', 409);
  }
  return proposed;
}

// The provider is prepared before this transaction. A failed provider call does not
// create a contract. A lost response can be retried using the same order identity.
export function confirmWalletCheckout(db, actor, company, id, data) {
  return db.transaction(() => {
    const offer = validateWalletCheckout(db, actor, company, id, data);
    if (offer.status === 'ACTIVE') return;
    if (offer.status === 'REQUESTED') {
      for (const line of offer.lines) db.run('UPDATE package_order_lines SET starts_on=?,ends_before=? WHERE id=? AND company_id=?', line.starts_on, line.ends_before, line.id, company.id);
      db.run("UPDATE package_orders SET status='QUOTED',terms=? WHERE id=?", offer.terms, id);
      event(db, actor, company.id, 'ORDER', id, 'OFERTA_PUBLICADA_CONFIRMADA', 'Precio y período revisados por el dueño.');
    }
    const tx = {...db, transaction:work => work()};
    acceptOrder(tx, actor, company, id, data);
    activateWalletOrder(tx, actor, company, id, data);
    const areas = new Set(offer.lines.flatMap(line => line.items.map(item => serviceArea(item.service))).filter(Boolean));
    for (const service of areas) {
      db.run(`INSERT INTO company_services VALUES(?,?,'ACTIVE',?,?) ON CONFLICT(company_id,service) DO UPDATE SET status='ACTIVE'`, company.id, service, actor.id, now());
      event(db, actor, company.id, 'SERVICE', service, 'SERVICIO_ACTIVADO', 'Contratación aceptada: '+id, service);
    }
  });
}
