import { esc } from './components.mjs';
import { billingDate, money } from './billing-account-pages.mjs';
import { walletLine } from '../../memberships/trial.mjs';

export function planComparisonPanel(model) {
  const {current,changes,trial,outlook,known,separate,switchAt,rates}=model;
  const currentRows=current.map(c=>{
    const replaced=changes.some(row=>row.replaces===c.id)||Boolean(switchAt&&walletLine(c));
    const stop=replaced&&switchAt&&switchAt<c.ends_before?switchAt:c.ends_before;
    const through=billingDate(new Date(Date.parse(stop)-86400000).toISOString().slice(0,10));
    return `<li><strong>${esc(c.name)}</strong> · ${c.agreed_minor===null?'Importe por confirmar':money(c.agreed_minor)} ${c.months===12?'por año':c.term==='MONTHLY'?'por este período mensual':'por este trabajo'}<small>${replaced?'Cambia al terminar el período':'Período contratado'} hasta el ${esc(through)}.</small></li>`;
  });
  if(trial)currentRows.push('<li><strong>Prueba de Wallet</strong> · $0 hasta el 31 de diciembre de 2026.</li>');
  if(outlook.available&&!trial&&!current.some(walletLine)){
    for(const line of outlook.lines.filter(r=>r.walletMinor>0))currentRows.push(`<li><strong>${esc(line.name)}</strong> · ${money(line.walletMinor)} de Wallet en el próximo corte.</li>`);
  }
  const requested=changes.map(row=>`<li><strong>${esc(row.name)}</strong> · ${row.amount===null?'Por confirmar':money(row.amount)+' '+row.term}<small>${row.requested?'Inicio solicitado para el':'Desde el'} ${esc(billingDate(row.start))}.</small></li>`).join('');
  const pending=separate.length>0;
  const total=outlook.available&&!pending?money(known):'Por confirmar';
  const combined=rates?'<section class="plan-rates"><h3>Tarifas desde el '+esc(billingDate(rates.day))+'</h3><ul>'+rates.groups.map(g=>'<li>'+ (g.pending?'Por confirmar'+(g.amount?' · '+money(g.amount)+' ya definidos':''):money(g.amount))+' '+g.term+'</li>').join('')+'</ul>'+(rates.estimatedBranches?'<p>El cálculo de la renovación usa las sucursales registradas hoy.</p>':'')+'</section>':'';
  return `<section class="card plan-comparison" aria-label="Comparación de servicios"><h2>Así quedaría tu cuenta</h2><div class="plan-compare-columns"><section><h3>Tu plan actual</h3>${currentRows.length?'<ul>'+currentRows.join('')+'</ul>':'<p>'+(!outlook.available?'Consulta pendiente de Wallet.':'Sin acuerdos vigentes.')+'</p>'}</section><section><h3>Con este cambio</h3><ul>${requested}</ul></section></div>
    ${combined}<div class="cut-summary"><h3>Corte del ${esc(billingDate(outlook.cut))}</h3><strong>${total}</strong>
    ${!outlook.available?'<p>El calendario de Wallet está pendiente de verificación. Consulta de nuevo para ver el total.</p>':pending?'<p>Importe con fecha de cargo confirmada · '+money(known)+'.</p>':''}
    ${pending?'<p>'+esc(separate.join(', '))+'. El cobro se acuerda por separado. La cotización indicará el importe y la fecha que correspondan.</p>':''}
    </div></section>`;
}

export function outlookDetail(outlook) {
  if(!outlook.available)return '<p>Por confirmar. Vuelve a consultar cuando Wallet termine de sincronizar.</p>';
  if(!outlook.lines.length)return '<p><strong>'+money(0)+'</strong> de Wallet. Sin períodos de pago confirmados para este corte.</p>';
  const wallet=outlook.lines.reduce((sum,line)=>sum+line.walletMinor,0);
  return '<p class="billing-plan-price">'+money(wallet)+'</p>'+(outlook.due&&wallet>0?'<p>Pagar hasta el '+esc(billingDate(outlook.due))+'.</p>':'')+outlook.lines.map(line=>{
    const branches=line.branchCount===null?'Importe del paquete':line.branchCount+' '+(line.branchCount===1?'sucursal':'sucursales')+' × '+money(line.unitMinor)+' por '+(line.months===12?'año':'mes');
    return `<div class="outlook-line"><strong>${esc(line.name)}</strong><span>${branches}</span><span>Del ${billingDate(line.from)} al ${billingDate(line.through)} · Wallet ${money(line.walletMinor)}</span>${line.otherMinor?'<span>Otros servicios del paquete: '+money(line.otherMinor)+'</span>':''}${line.branchNames?.length?'<small>'+esc(line.branchNames.join(' · '))+'</small>':''}</div>`;
  }).join('');
}
