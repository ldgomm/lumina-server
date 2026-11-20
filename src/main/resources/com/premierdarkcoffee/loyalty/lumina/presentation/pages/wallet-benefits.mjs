import { inTrial } from '../../memberships/trial.mjs';
import { card, esc, external, localLink, table } from './components.mjs';
export function walletBenefits() {
  return card('Qué incluye Wallet','<div class="benefit-grid"><div><strong>Tarjetas y clientes ilimitados</strong><p>Tus clientes escanean el QR y guardan su tarjeta en Apple Wallet o Google Wallet.</p></div><div><strong>Fidelización en caja</strong><p>Tu equipo registra compras y canjes. Los puntos, sellos y premios funcionan en las sucursales de tu negocio.</p></div><div><strong>Administración del negocio</strong><p>Configura las tarjetas, los permisos del equipo y las recompensas. Consulta el historial y los informes.</p></div></div>');
}
const competitors=[
 ['Loopy Loyalty','USD 25/mes o 250/año','Starter: 1 local, 3 accesos de personal; clientes ilimitados.','https://loopyloyalty.com/pricing/'],
 ['PassKit','Desde USD 39,50/mes','1 usuario y 250 pases de cada tipo incluidos; cobra por volumen adicional y más usuarios.','https://passkit.com/legal/rate-card/'],
 ['Loyalzoo','Desde USD 77/mes','Grow: clientes ilimitados, fidelización y membresías; dispone de planes superiores.','https://loyalzoo.com/pricing/'],
 ['Boomerangme','Desde USD 199/mes','Business incluye 10 promociones, 10 ubicaciones y 50 gestores; alcance diferente.','https://boomerangme.com/pricing'],
 ['Stamp Me','Desde USD 49/mes','Lite: una ubicación y usuarios ilimitados; ofrece su aplicación de fidelización.','https://www.stampme.com/pricing'],
 ['BonusQR','Gratis; Basic USD 60/trimestre','Basic equivale a USD 20/mes. Ofrece clientes y escaneos ilimitados, incluso en el plan gratuito.','https://bonusqr.com/pricing'],
 ['FaveCard','Plan gratuito y planes de pago','Las funciones y condiciones dependen del plan. Consulta el precio vigente en su página.','https://www.favecard.co/en/pricing/'],
 ['Square Loyalty','Según mercado y plan','Integrado con el ecosistema Square; no se presupone disponibilidad comercial en Ecuador.','https://squareup.com/us/en/software/loyalty'],
];
export function walletComparison(actor) {
  const trial=inTrial();
  const decision=trial?'La prueba gratuita termina el 31 de diciembre de 2026. Desde enero, el dueño elige si desea continuar.':
    'El dueño puede elegir una suscripción mensual o anual. Antes de confirmar verá el total y la fecha del primer cargo.';
  const action=actor?.kind==='OWNER'&&!actor.businessBlocked?localLink('/plans/wallet',trial?'Ver mi prueba gratuita':'Ver mi suscripción','btn'):'';
  return walletBenefits()+card('Tu suscripción','<p>'+decision+'</p>'+action)+
    '<details class="disclosure"><summary>Comparar con otros servicios</summary><div><p>Precios consultados el 13 de noviembre de 2026. Revisa las condiciones actuales y la disponibilidad en cada país.</p>'+
    table(['Servicio','Precio publicado','Qué comparar','Fuente'],competitors.map(([name,price,note,url])=>[esc(name),esc(price),esc(note),external(url,'Ver precios')]))+'</div></details>';
}
