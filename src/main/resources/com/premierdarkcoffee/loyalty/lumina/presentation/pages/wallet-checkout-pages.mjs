import { catalog } from './package-pages.mjs';
import { button, card, displayAmount, esc, form, hidden, localLink } from './components.mjs';
import { inclusiveEnd } from '../../memberships/orders.mjs';

export function walletCheckoutPage({actor,company,plans,contracts,orders,active,legacy=false,error=''}) {
  const links=`<div class="actions">${localLink('/plans','Todos los paquetes','btn secondary')}${localLink('/billing','Mi cuenta y pagos','btn secondary')}</div>`;
  const current=contracts.filter(c=>c.items.some(i=>i.service==='WALLET'));
  const ongoing=orders.rows.filter(o=>['REQUESTED','QUOTED','ACCEPTED'].includes(o.status)&&o.wallet);
  return `${error?`<p class="notice" role="alert">${esc(error)}</p>`:''}${active?card('Wallet lista para tu negocio',`<p>Personaliza tu tarjeta, configura tus promociones y empieza a registrar clientes.</p>${localLink('/wallet','Abrir Wallet','btn')}`):''}
    ${current.length?card('Tu Wallet está incluida',current.map(c=>`<h3>${esc(c.name)}</h3><p><strong>${esc(displayAmount(c.agreed_minor))}</strong> por el acuerdo completo · ${esc(c.starts_on)} al ${esc(inclusiveEnd(c.ends_before))}.</p>`).join('')+'<p>No se añade otra tarifa de Wallet.</p>'+(!active?form('/plans/wallet/resume',actor,hidden('confirm','yes')+button('Activar mi Wallet')):'')+links):''}
    ${legacy?card('Tu acuerdo anterior se conserva',`<p>Consulta las condiciones que ya aceptaste y gestiona su renovación.</p>${localLink('/plans/wallet/legacy','Ver mi acuerdo anterior','btn secondary')}`):''}
    ${ongoing.length?card('Continúa con tu selección',ongoing.map(o=>`<div class="split"><p>${esc(o.names)}</p>${localLink('/plans/orders/'+o.id,'Revisar y activar','btn')}</div>`).join('')):''}
    ${!current.length&&!legacy&&!error?`<section class="pricing-intro"><div><p class="eyebrow">WALLET · FIDELIZACIÓN DIGITAL</p><h2>Elige tu oferta. Empieza hoy.</h2><p>Revisa el precio publicado y confirma las condiciones. Tu Wallet se activa sin esperar al administrador.</p></div></section>${catalog(actor,company,path=>path,plans.filter(p=>p.wallet!=='NONE'||p.items.some(i=>i.service==='WALLET')))}`:''}
    ${!current.length?links:''}`;
}
