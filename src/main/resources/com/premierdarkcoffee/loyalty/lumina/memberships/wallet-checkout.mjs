import { createHash } from 'node:crypto';
import { requireOwner } from '../access/accounts.mjs';
import { requireOperating } from '../businesses/control.mjs';
import { event, localDay, requireThat } from '../shared/domain.mjs';
import { offerAvailable } from '../campaigns/season.mjs';
import { checkSelection } from './coverage.mjs';
import { inTrial, standardIds, trialMessage } from './trial.mjs';
import { getPlan } from './billing.mjs';
import { coveredThrough, firstStatement, nextCut, periodEnd, selectionStart, walletLine } from './calendar.mjs';
import { acceptOrder, activateCatalogOrder, getOrder, monthlyEnd, orderTotals, walletCalendarTerms } from './orders.mjs';

export const includesWallet = order => order.lines.some(walletLine);

// A read-only preview. No GET grants access, signs an agreement or changes a price.
// Work with unspecified prices/delivery dates still needs a real quotation.
export function walletCheckout(db, order, branches=order.initial_branches||1) {
  if(order.trial_archive || inTrial()&&includesWallet(order))return null;
  if(order.status==='QUOTED' && order.lines.some(l=>standardIds.includes(l.plan_id))){
    const lines=order.lines.map(l=>({...l,branchCount:standardIds.includes(l.plan_id)?branches:1}));
    const checkoutHash=createHash('sha256').update(JSON.stringify([order.id,order.revision,lines,order.terms])).digest('hex');
    return {...order,lines,checkoutHash,totals:orderTotals(lines,branches)};
  }
  if (order.status !== 'REQUESTED' || (!includesWallet(order) && order.start_when!=='NEXT_MONTH') || !order.lines.every(line => line.term === 'MONTHLY' && line.unit_minor !== null)) return null;
  const lines = order.lines.map(line => {
    const plan = getPlan(db, line.plan_id);
    const previous = line.renewal_of ? db.get('SELECT * FROM contracts WHERE id=? AND company_id=? AND cancelled_at IS NULL', line.renewal_of, order.company_id) : null;
    const start = selectionStart(db,order,line);
    const branchCount=standardIds.includes(line.plan_id)?branches:1;
    return {...line, branchCount, starts_on:start, ends_before:walletLine(line)?periodEnd(start,line.months):monthlyEnd(start, previous?.renewal_anchor || previous?.starts_on || start,line.months),
      statement:walletLine(line)?firstStatement(start,(line.unit_minor-(line.wallet==='GIFT'?line.unit_minor:line.other_minor||0))*line.units*branchCount,null,line.months):null,
      available:offerAvailable(plan) && (!line.renewal_of || Boolean(previous)), description:plan.description};
  });
  const terms = (includesWallet(order)?'Precio final del catálogo. ':'Precio final por el período indicado. ')
    + (includesWallet(order)?walletCalendarTerms+' Wallet se incluye una sola vez. ':'La renovación de estos servicios se confirma al finalizar el período. ')+'Las promociones terminan en la fecha indicada. '
    + 'Los cupos no utilizados no se acumulan. ' + lines.map(line => `${line.name}: ${line.description}`).join('\n');
  const hash = createHash('sha256').update(JSON.stringify({id:order.id, revision:order.revision, lines, terms})).digest('hex');
  return {...order, lines, terms, totals:orderTotals(lines,branches), checkoutHash:hash};
}

export function validateWalletCheckout(db, actor, company, id, data, branches) {
  requireOwner(actor);
  requireThat(actor.company_id === company.id && db.get("SELECT id FROM accounts WHERE id=? AND company_id=? AND kind='OWNER' AND active=1 AND revision=?", actor.id, company.id, actor.revision), 'Tu cuenta cambió. Ingresa nuevamente.', 403);
  requireOperating(db, company.id);
  const order = getOrder(db, actor, company, id);
  requireThat(!order.trial_archive && !(inTrial()&&includesWallet(order)),trialMessage,409);
  requireThat(includesWallet(order)||order.start_when==='NEXT_MONTH'&&order.lines.every(l=>l.term==='MONTHLY'&&l.unit_minor!==null), 'Esta contratación necesita una propuesta.',409);
  requireThat(data.confirm === 'yes', 'Confirma el precio, el período y las condiciones.');
  requireThat(String(order.revision) === String(data.revision), 'La propuesta cambió. Revisa la versión actual.', 409);
  if (order.status === 'ACTIVE') return order;
  const preview = walletCheckout(db, order,branches);
  if (order.status === 'REQUESTED') {
    requireThat(preview, 'Esta combinación necesita definir su precio o plazo. Puedes contratar Wallet por separado desde el catálogo.', 409);
    requireThat(data.offerHash === preview.checkoutHash && preview.lines.every(line => line.available && line.starts_on >= localDay()), 'La oferta o las fechas cambiaron. Revisa las condiciones actuales antes de confirmar.', 409);
  } else requireThat(['QUOTED','ACCEPTED'].includes(order.status), 'Esta contratación está cerrada.', 409);
  if(order.status==='QUOTED'&&preview)requireThat(data.offerHash===preview.checkoutHash,'Cambió el número de sucursales o la propuesta. Revisa el total antes de confirmar.',409);
  const proposed = preview || order;
  checkSelection(db,order,proposed.lines);
  const walletLines = proposed.lines.filter(walletLine);
  requireThat(walletLines.length===0 || walletLines.length === 1 && walletLines[0].units === 1, 'Elige una sola oferta con Wallet para tu negocio. Puedes combinarla con otros servicios.', 409);
  for (const line of walletLines) {
    const scheduled=db.all('SELECT id,starts_on,plan_id FROM wallet_schedules WHERE company_id=? AND consent_on IS NOT NULL AND (ends_before IS NULL OR starts_on<ends_before AND ends_before>?)',company.id,line.starts_on);
    requireThat(!scheduled.length || (order.start_when==='NEXT_MONTH' && scheduled.length===1 && scheduled[0].starts_on<line.starts_on && scheduled[0].plan_id!==line.plan_id),
      'Wallet ya está incluida. Puedes agregar otro servicio o elegir un paquete distinto desde el próximo mes.',409);
    const previous=line.renewal_of?db.get('SELECT * FROM contracts WHERE id=? AND company_id=? AND cancelled_at IS NULL',line.renewal_of,company.id):null;
    const continuing=previous&&previous.starts_on<=localDay()&&previous.ends_before>=localDay()&&previous.ends_before===line.starts_on;
    requireThat((line.starts_on <= coveredThrough(db,company.id,localDay()) || continuing || order.start_when==='NEXT_MONTH' && line.starts_on>=nextCut(localDay())) && line.ends_before > localDay(), 'Este período de Wallet todavía no comienza o ya terminó. Revisa sus fechas.', 409);
    requireThat(!db.get(`SELECT c.id FROM contracts c JOIN plan_items i ON i.plan_id=c.plan_id AND i.service='WALLET'
      WHERE c.company_id=? AND c.cancelled_at IS NULL AND c.starts_on<? AND c.ends_before>?
      AND EXISTS(SELECT 1 FROM package_order_lines l JOIN package_orders o ON o.id=l.order_id WHERE l.id=c.order_line_id AND date(o.accepted_at,'-5 hours')>='2027-01-01')
      AND (c.order_line_id IS NULL OR c.order_line_id NOT IN (SELECT id FROM package_order_lines WHERE order_id=?)) LIMIT 1`, company.id, line.ends_before, line.starts_on, id),
    'Wallet ya está incluida en un acuerdo para ese período. Abre tu Wallet o revisa tus acuerdos para evitar contratarla dos veces.', 409);
  }
  return proposed;
}

// The provider is prepared before this transaction. A failed provider call does not
// create a contract. A lost response can be retried using the same order identity.
export function confirmWalletCheckout(db, actor, company, id, data, branches) {
  return db.transaction(() => {
    const offer = validateWalletCheckout(db, actor, company, id, data,branches);
    if (offer.status === 'ACTIVE') return;
    if (offer.status === 'REQUESTED') {
      for (const line of offer.lines) db.run('UPDATE package_order_lines SET starts_on=?,ends_before=? WHERE id=? AND company_id=?', line.starts_on, line.ends_before, line.id, company.id);
      db.run("UPDATE package_orders SET status='QUOTED',terms=? WHERE id=?", offer.terms, id);
      event(db, actor, company.id, 'ORDER', id, 'OFERTA_PUBLICADA_CONFIRMADA', 'Precio y período revisados por el dueño.');
    }
    if(offer.lines.some(l=>standardIds.includes(l.plan_id)))db.run('UPDATE package_orders SET initial_branches=? WHERE id=?',branches||1,id);
    const tx = {...db, transaction:work => work()};
    acceptOrder(tx, actor, company, id, data);
    activateCatalogOrder(tx, actor, company, id, data);

  });
}
