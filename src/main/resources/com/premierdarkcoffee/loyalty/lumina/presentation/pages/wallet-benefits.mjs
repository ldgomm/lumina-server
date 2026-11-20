import { inTrial } from '../../memberships/trial.mjs';
import { card, esc, external, localLink, table } from './components.mjs';
export function walletBenefits() {
 return card('Crece sin cobrar por cada cliente',`<div class="benefit-grid"><div><strong>Clientes ilimitados</strong><p>Sin tarifa por tarjeta ni por cliente registrado.</p></div><div><strong>Tu equipo, incluido</strong><p>Colaboradores sin cargo por usuario, con permisos y sucursal de trabajo.</p></div><div><strong>Apple y Google Wallet</strong><p>Registro por QR, sin instalar otra aplicación de fidelización.</p></div><div><strong>Tu marca y tus reglas</strong><p>Diseños, puntos, sellos, premios, promociones y cumpleaños.</p></div><div><strong>Control de tu negocio</strong><p>Compras, canjes, historial e informes. Una tarjeta por negocio funciona en sus sucursales.</p></div><div><strong>Soporte prioritario</strong><p>Atención de Lúmina desde Ayuda. Las incidencias de operación tienen prioridad.</p></div></div><p class="muted">Contenido, web, diseño y otros servicios se contratan por separado.</p>`);
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
export function walletComparison() {
 return walletBenefits()+card('Una oferta para tu negocio',`<p>${inTrial()?'Activa la prueba gratuita hasta el 31 de diciembre de 2026. Desde enero podrás elegir si continúas.':'Elige mensual o anual y revisa el importe antes de confirmar.'}</p><details><summary>Comparar alternativas</summary><p>Revisión de páginas oficiales: 13-11-2026. Muestra de ocho alternativas; no es un catálogo exhaustivo. Precios, impuestos, países y funciones pueden diferir.</p>${table(['Servicio','Precio publicado','Qué comparar','Fuente'],competitors.map(([name,price,note,url])=>[esc(name),esc(price),esc(note),external(url,'Ver precios')]))}</details>`);
}
