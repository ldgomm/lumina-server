import { campaignDates, campaignNotice, campaignState, campaignThemes, offerAvailable } from '../../campaigns/season.mjs';
import { localDay, uuid } from '../../shared/domain.mjs';
import { badge, button, check, displayAmount, esc, form, hidden, input, localLink, select, textarea } from './components.mjs';
import { catalog, packageNav } from './package-pages.mjs';

export function campaignBanner(plans,url) {
  const current=plans.filter(p=>p.campaign&&offerAvailable(p));
  if(!current.length)return '';
  const year=current[0].campaign.year;
  return `<section class="bf-banner"><div><p class="bf-kicker">LÚMINA / VIERNES NEGRO ${year}</p><h2>Tu próximo gran paso empieza aquí.</h2><p>Contenido, web y diseño con precios especiales hasta el 30 de noviembre.</p><small>Desactivación automática al terminar noviembre · Ecuador continental.</small></div>${localLink(url('/planes/viernes-negro'),'Ver promociones →','bf-button')}</section>`;
}
export function campaignPage({actor,company,url,plans,bases=[],values={},error=''}) {
  const admin=actor.kind==='AGENCY'&&!actor.readOnlyCompany;
  const currentYear=Number(localDay().slice(0,4));
  const year=Number(values.year)||(localDay()>=currentYear+'-12-01'?currentYear+1:currentYear);
  const dates=campaignDates(Math.min(2199,Math.max(2026,year)));
  const chosen=bases.find(p=>p.id===values.base)||bases[0];
  const start=values.starts_on||(localDay()>=dates.first&&localDay()<dates.until?localDay():dates.first);
  const live=plans.filter(p=>p.campaign&&offerAvailable(p));
  const hero=`<section class="bf-hero"><div><p class="bf-kicker">LÚMINA DIGITAL / VIERNES NEGRO</p><h2>Haz que tu negocio<br>se vea a lo grande.</h2><p>Contenido que cuenta tu historia. Una web que te presenta. Una marca que se reconoce.</p><div class="bf-deadline"><strong>Solo durante noviembre</strong><span>Se desactiva el 1 de diciembre, a las 00:00 de Ecuador continental.</span></div></div><div class="bf-art" aria-hidden="true"><span>UNA IDEA.</span><strong>MUCHO<br>POR CRECER.</strong><small>CONTENIDO · WEB · DISEÑO</small></div></section>`;
  if(!admin)return packageNav(url,'campanas',false)+hero+(live.length?catalog(actor,company,url,live):'<section class="card"><h2>Esta campaña no está disponible</h2><p>Las promociones se habilitan durante sus fechas de noviembre.</p>'+localLink(url('/planes'),'Ver servicios y precios','btn')+'</section>');
  const previous=plans.filter(p=>p.campaign).sort((a,b)=>b.campaign.year-a.campaign.year||b.created_at.localeCompare(a.created_at));
  const editor=bases.length?form(url('/planes/viernes-negro'),actor,hidden('key',values.key||uuid())+`<div class="bf-editor" data-bf-editor><div><p class="bf-kicker">1 / OFERTA</p><h2>Una promoción con tu estilo</h2>
    ${select('base','Servicio o paquete habitual',bases.map(p=>[p.id,p.name+' · '+displayAmount(p.price_minor)+(p.term==='MONTHLY'?' / mes':'')]),values.base||chosen.id,'required')}
    <p class="bf-help">Conserva las cantidades de la oferta habitual. Puedes combinar contenido, web y diseño publicando primero el paquete.</p>
    ${input('name','Nombre de la promoción','text','required minlength="2" maxlength="100"',values.name||'')}
    ${textarea('description','Qué incluye','maxlength="1200" rows="3"',values.description??chosen.description)}
    <p class="bf-kicker">2 / PRECIO Y VIGENCIA</p><div class="fields">${select('discount_mode','Descuento',[['PERCENT','Porcentaje'],['PRICE','Precio especial']],values.discount_mode||'PERCENT')}
    <div data-bf-percent>${input('discount','Descuento (%)','number','min="1" max="100" step="1"',values.discount||'')}</div><div data-bf-price>${input('price','Precio promocional en USD','text','inputmode="decimal"',values.price||'')}</div></div>
    <div class="fields">${select('year','Noviembre de',[...new Set([currentYear,currentYear+1,year])].filter(y=>y>=2026&&y<=2199).map(y=>[String(y),String(y)]),String(year))}${input('starts_on','Disponible desde','date','required',start)}</div>
    ${select('theme','Apariencia',Object.entries(campaignThemes),values.theme||'GOLD')}
    ${textarea('conditions','Condiciones de la promoción','required minlength="5" maxlength="1200" rows="3" placeholder="Por ejemplo: alcance, revisiones y plazo para entregar el material."',values.conditions||'')}
    <p class="bf-kicker">3 / CONFIRMACIÓN</p>${check('confirm','Confirmo el precio y que la promoción se desactiva al terminar noviembre.',false,true)}
    <p class="bf-help">En ofertas mensuales, el descuento corresponde al primer período contratado. Las renovaciones usarán la tarifa habitual y requieren otra aceptación.</p><p data-bf-error role="alert"></p>${button('Publicar promoción de noviembre')}
    </div><aside class="bf-preview bf-GOLD" data-bf-preview aria-label="Vista previa de la promoción"><p class="bf-kicker">VIERNES NEGRO <span data-bf-year>${year}</span></p><h3 data-bf-title>Tu promoción</h3><p class="bf-price"><del data-bf-regular>${esc(displayAmount(chosen.price_minor))}</del><strong data-bf-amount>Define tu precio</strong></p><span class="bf-saving" data-bf-saving></span><div data-bf-items></div><p data-bf-description></p><p data-bf-conditions></p><div class="bf-deadline"><strong>Hasta el 30 de noviembre</strong><span>Al finalizar noviembre se desactiva automáticamente.</span></div><p class="bf-help">Vista previa. Publicar requiere confirmar el formulario.</p></aside></div>
    <script type="application/json" id="bf-base-data">${JSON.stringify(bases.map(p=>({id:p.id,name:p.name,price:p.price_minor,term:p.term,items:p.items}))).replaceAll('<','\\u003c')}</script>`,'bf-form'):
    `<section class="card"><h2>Comienza por tu precio habitual</h2><p>Publica una oferta de contenido, web o diseño con su precio. Después podrás preparar su promoción de noviembre.</p>${localLink(url('/planes/nueva'),'Crear oferta habitual','btn')}</section>`;
  const history=previous.length?`<section class="bf-history"><h2>Tus campañas</h2><div class="package-grid">${previous.map(p=>`<article class="package-card bf-${p.campaign.theme}">${badge(campaignState(p))}<p class="bf-kicker">VIERNES NEGRO ${p.campaign.year}</p><h3>${esc(p.name)}</h3><p><del>${esc(displayAmount(p.campaign.regular_minor))}</del> <strong>${esc(displayAmount(p.price_minor))}</strong></p><p>Desde ${esc(p.campaign.starts_on)} hasta el 30 de noviembre.</p><p>${esc(p.campaign.conditions)}</p><div class="actions">${p.published&&campaignState(p)!=='Finalizada'?form(url('/planes/retirar'),actor,hidden('plan',p.id)+button('Retirar promoción','secondary'),'inline'):''}${localLink(url('/planes/viernes-negro',{base:p.campaign.base_plan_id}),'Preparar otra versión','btn secondary')}</div></article>`).join('')}</div></section>`:'';
  return packageNav(url,'campanas',true)+hero+(error?`<p class="notice" role="alert">${esc(error)} Conservamos tu borrador.</p>`:'')+editor+history;
}
export function campaignLabel(plan) {
  if(!plan.campaign)return '';
  return `<div class="bf-offer-note"><span class="bf-kicker">VIERNES NEGRO ${plan.campaign.year}</span><p><del>Precio habitual: ${esc(displayAmount(plan.campaign.regular_minor))}</del> · Ahorras ${esc(displayAmount(plan.campaign.regular_minor-plan.price_minor))}</p><p>${esc(campaignNotice(plan.campaign.year))}</p><p>${esc(plan.campaign.conditions)}</p>${plan.term==='MONTHLY'?'<strong>Precio especial por el primer período. Renovaciones a tarifa habitual, con nueva aceptación.</strong>':''}</div>`;
}
