import { visibleContracts } from '../../memberships/trial.mjs';
import { inclusiveEnd } from '../../memberships/orders.mjs';
import { badge, card, displayAmount, esc, label, localLink } from './components.mjs';

const contractDate = value => new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));

export function contractSummary(contracts=[],today,owner=true) {
  contracts=visibleContracts(contracts);
  const active=contracts.filter(c=>!c.cancelled_at&&c.starts_on<=today&&c.ends_before>today);
  const upcoming=contracts.filter(c=>!c.cancelled_at&&c.starts_on>today);
  const row=c=>`<article class="contract-account"><div class="split"><div><h3>${esc(c.name)}</h3><p>${esc(contractDate(c.starts_on))} → ${esc(contractDate(inclusiveEnd(c.ends_before)))}</p></div><div><strong>${esc(displayAmount(c.agreed_minor))}</strong><p>${c.months===12?'Por este período anual':c.term==='MONTHLY'?'Por este período mensual':'Por este trabajo'}</p></div></div>
    <ul>${c.items.map(i=>`<li><strong>${i.quantity} × ${esc(label(i.service))}</strong><span>Entregados: ${i.used} · En proceso: ${i.reserved} · Disponibles: ${Math.max(0,i.quantity-i.used-i.reserved)}</span></li>`).join('')}</ul>
    ${['GIFT','INCLUDED'].includes(c.wallet)?`<p>${badge(c.wallet==='GIFT'?'Wallet de cortesía':'Wallet incluido')} Consulta su alcance en el acuerdo.</p>`:''}
    ${c.term==='MONTHLY'?'<p class="muted">La siguiente renovación se acuerda desde Paquetes y servicios.</p>':''}</article>`;
  return card('Tus servicios contratados',active.length?active.map(row).join(''):'<p>No hay paquetes vigentes en este período.</p>')+
    (upcoming.length?`<details class="card"><summary>Próximos servicios · ${upcoming.length}</summary>${upcoming.map(row).join('')}</details>`:'')+
    `<p class="billing-footnote">Los importes de los acuerdos explican lo contratado. El saldo pendiente se calcula únicamente con los cargos y pagos registrados.</p>`+
    (owner?`<div class="actions">${localLink('/plans?view=agreements','Ver todos los acuerdos','btn secondary')}${localLink('/plans','Contratar servicios','btn secondary')}</div>`:'');
}
