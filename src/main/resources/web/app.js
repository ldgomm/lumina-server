'use strict';
const app = document.querySelector('#app'), exit = document.querySelector('#exit');
const state = {token:'', member:null, data:null, tab:'sales', slug:location.pathname.startsWith('/join/')?location.pathname.split('/')[2]:null};
const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={POINTS:'Puntos',CASHBACK:'Cashback',STAMPS:'Sellos'};
let noticeTimer;
function notice(message){const n=document.querySelector('#notice');n.textContent=message;n.style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.style.display='none',6500)}
async function api(path,body,method='POST',key=null){
 const headers={};if(state.token)headers.Authorization=`Bearer ${state.token}`;
 if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 let response;
 try { response = await fetch(path, {method: body === undefined && method === 'POST' ? 'GET' : method, headers, body: body === undefined ? undefined : JSON.stringify(body)}); }
 catch { throw new Error('No hay conexión con el servidor. Comprueba tu conexión y vuelve a intentarlo; se conservaron los datos del formulario.'); }
 let data;
 try { data = await response.json(); } catch { throw new Error('El servidor no respondió como se esperaba. Vuelve a intentarlo; no cambies el comprobante de una compra ya enviada.'); }
 if (!response.ok) { const issue = new Error(data.message || 'No se pudo completar la operación.'); issue.code = data.code; issue.status = response.status; throw issue; }
 return data;
}
function form(id, handler) {
    const f = document.getElementById(id); if (!f) return;
    f.addEventListener('submit', async e => {
        e.preventDefault();
        const button = e.submitter || f.querySelector('button[type=submit],button:not([type])');
        if (!button || button.disabled || f.getAttribute('aria-busy') === 'true') return;
        if (document.querySelector('form[aria-busy="true"]')) { notice('Espera a que termine la operación anterior.'); return; }
        const values = Object.fromEntries(new FormData(f));
        const controls = [...(f.closest('.customer-counter') || f).querySelectorAll('input,select,textarea,button')].map(node => [node, node.disabled]);
        const label = button.textContent;
        let error = f.querySelector(':scope > .form-feedback');
        if (!error) { error = document.createElement('p'); error.className = 'form-feedback'; error.setAttribute('role', 'alert'); error.tabIndex = -1; f.append(error); }
        error.hidden = true; f.setAttribute('aria-busy', 'true');
        controls.forEach(([node]) => node.disabled = true); button.textContent = 'Procesando…';
        try { await handler(values, f); }
        catch (issue) { if (f.isConnected) { error.textContent = issue.message || 'No se pudo completar la operación. Inténtalo de nuevo.'; error.hidden = false; error.focus(); } }
        finally { f.removeAttribute('aria-busy'); controls.forEach(([node, disabled]) => node.disabled = disabled); button.textContent = label; }
    });
}
function action(id,handler){document.getElementById(id)?.addEventListener('click',async()=>{try{await handler()}catch(e){notice(e.message)}})}
// The key is reused after network errors; edits create a new operation, explicit success clears it.
function operationKey(f,payload){const signature=JSON.stringify(payload);if(f.dataset.payload!==signature){f.dataset.payload=signature;f.dataset.key=crypto.randomUUID()}return f.dataset.key}
function options(items,selected){return items.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('')}
function localDateTime(value){if(!value)return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:state.data.business.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`}
function utcDateTime(local){if(!local)return null;const naive=Date.parse(local+'Z');const offsets=new Set([-36,0,36].map(h=>{const sample=naive+h*3600000;return Date.parse(localDateTime(sample)+'Z')-sample}));const candidates=[...offsets].map(o=>naive-o).filter(t=>localDateTime(t)===local);if(candidates.length!==1)throw new Error('La hora elegida no existe o se repite por un cambio de horario. Elige otra hora.');return new Date(candidates[0]).toISOString()}
function field(name,label,type='text',value='',extra=''){
    const input=`<input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
    if(extra.includes('data-money')) return `<label for="${name}">${label}</label><div class="money-control"><button type="button" data-money-delta="-1" aria-label="Restar 1 al monto">−1</button>${input}<button type="button" data-money-delta="1" aria-label="Sumar 1 al monto">+1</button></div><small class="money-help">Los botones cambian una unidad monetaria. Puedes escribir centavos.</small>`;
    const reference = ['receipt','reference','code','firstBranchCode'].includes(name) && type==='text';
    return `<label for="${name}">${label}</label>${input}${reference ? `<div class="reference-tools" data-reference-for="${name}"><select aria-label="Formato del código"><option value="short">Folio legible</option><option value="uuid">Identificador UUID</option></select><button type="button" data-generate-reference>Generar código</button></div><small>${['receipt','reference'].includes(name) ? 'Usa el comprobante existente o genera una referencia interna. No es una factura tributaria. Conserva el mismo código si reintentas.' : 'El código identifica esta sucursal. Puedes escribir uno propio.'}</small>` : ''}`;
}
function adjustMoney(input,delta){
    if(!input||input.disabled||input.readOnly||input.closest('form[aria-busy="true"]'))return;
    if(input.value && !/^\d+(\.\d{1,2})?$/.test(input.value)){input.setCustomValidity('Escribe un monto positivo con hasta dos decimales.');input.reportValidity();return;}
    const minimum=Math.round(Number(input.min||0)*100),maximum=input.max?Math.round(Number(input.max)*100):1000000000;
    const next=Math.max(minimum,Math.min(maximum,Math.round(Number(input.value||0)*100)+delta*100));
    input.value=(next/100).toFixed(2);input.setCustomValidity('');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
}
function configureMoneyInput(input, enabled){
    input.toggleAttribute('data-money', enabled);
    const wrapper=input.closest('.money-control');
    if(enabled&&!wrapper){
        const holder=document.createElement('div');holder.className='money-control';input.before(holder);holder.append(input);
        for(const delta of [-1,1]){const b=document.createElement('button');b.type='button';b.dataset.moneyDelta=String(delta);b.textContent=delta<0?'−1':'+1';b.setAttribute('aria-label',delta<0?'Restar 1 al monto':'Sumar 1 al monto');if(delta<0)holder.prepend(b);else holder.append(b);}
        const help=document.createElement('small');help.className='money-help';help.textContent='Los botones cambian una unidad monetaria. Puedes escribir centavos.';holder.after(help);
    }else if(!enabled&&wrapper){if(wrapper.nextElementSibling?.classList.contains('money-help'))wrapper.nextElementSibling.remove();wrapper.replaceWith(input);}
    input.setCustomValidity('');
}
document.addEventListener('click',e=>{
    const step=e.target.closest('[data-money-delta]');if(step){adjustMoney(step.parentElement.querySelector('input'),Number(step.dataset.moneyDelta));return;}
    const generate=e.target.closest('[data-generate-reference]');if(!generate)return;
    const controls=generate.parentElement,f=generate.closest('form'),input=f?.elements[controls.dataset.referenceFor];
    if(!input||input.disabled||input.readOnly||f.getAttribute('aria-busy')==='true')return;
    if(input.value.trim()){notice('Conserva el código existente. Para generar otro, borra el campo de forma explícita.');return;}
    const uuid=crypto.randomUUID();input.value=controls.querySelector('select').value==='uuid'?uuid:((input.name==='code'||input.name==='firstBranchCode')?'SUC-':'REF-')+uuid.replaceAll('-','').slice(0,16).toUpperCase();
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();
});
document.addEventListener('keydown',e=>{if(e.target.matches('input[data-money]')&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();adjustMoney(e.target,e.key==='ArrowUp'?1:-1);}});
document.addEventListener('input',e=>{if(e.target.matches('input[data-money]'))e.target.setCustomValidity(!e.target.value||/^\d+(\.\d{1,2})?$/.test(e.target.value)?'':'Escribe un monto positivo con hasta dos decimales.');});
// Read-only suggestions. A result is selected explicitly; no purchase or canje is submitted here.
function attachPredictiveSearch(input, {load, choose, label, description = () => '', enabled = () => true, minimum = 2}) {
    const wrap = document.createElement('div'); wrap.className = 'predictive-search'; input.before(wrap); wrap.append(input);
    const popup = document.createElement('div'); popup.className = 'predictive-results'; popup.id = input.id + '-suggestions'; popup.setAttribute('role', 'listbox'); popup.hidden = true;
    const status = document.createElement('p'); status.className = 'predictive-status'; status.id = input.id + '-search-status'; status.setAttribute('role', 'status');
    wrap.append(popup, status); input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', popup.id); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), status.id].filter(Boolean).join(' ')); input.autocomplete = 'off';
    let revision = 0, timer, rows = [], active = -1, composing = false;
    const busy = () => Boolean(document.querySelector('form[aria-busy="true"]'));
    const clear = () => { revision++; clearTimeout(timer); rows = []; active = -1; popup.replaceChildren(); popup.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); status.textContent = ''; };
    const select = row => {
        if (busy() || !input.isConnected) return;
        clear(); Promise.resolve().then(() => choose(row)).catch(e => notice(e.message || 'No se pudo abrir el resultado.'));
    };
    const highlight = index => {
        active = index; [...popup.children].forEach((node, i) => node.setAttribute('aria-selected', String(i === index)));
        const node = popup.children[index]; if (node) { input.setAttribute('aria-activedescendant', node.id); node.scrollIntoView({block: 'nearest'}); }
    };
    const search = () => {
        clear(); const q = input.value.trim(); if (composing || !enabled() || q.length < minimum || busy()) return;
        const ticket = revision, token = state.token; status.textContent = 'Buscando…';
        timer = setTimeout(async () => {
            try {
                const data = await load(q);
                if (ticket !== revision || token !== state.token || !input.isConnected || !enabled() || busy()) return;
                rows = data.slice(0, 8); popup.replaceChildren();
                rows.forEach((row, index) => {
                    const button = document.createElement('button'); button.type = 'button'; button.id = popup.id + '-' + index; button.tabIndex = -1; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false');
                    const title = document.createElement('strong'); title.textContent = label(row); const detail = document.createElement('small'); detail.textContent = description(row); button.append(title, detail);
                    button.addEventListener('pointerdown', e => e.preventDefault()); button.onclick = () => select(row); popup.append(button);
                });
                popup.hidden = !rows.length; input.setAttribute('aria-expanded', String(Boolean(rows.length)));
                status.textContent = rows.length ? `${rows.length} sugerencias. Elige una o usa las flechas y Enter.` : 'Sin coincidencias. Prueba con otro nombre.';
            } catch {
                if (ticket === revision && token === state.token && input.isConnected) status.textContent = 'No se pudo buscar. Vuelve a escribir para reintentar.';
            }
        }, 280);
    };
    input.addEventListener('input', search); input.addEventListener('compositionstart', () => { composing = true; clear(); }); input.addEventListener('compositionend', () => { composing = false; search(); });
    input.addEventListener('keydown', e => {
        if (e.isComposing) return;
        if (e.key === 'Escape') { clear(); return; }
        if (!rows.length || popup.hidden) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); highlight((active + (e.key === 'ArrowDown' ? 1 : rows.length - 1) + rows.length) % rows.length); }
        if (e.key === 'Enter' && active >= 0) { e.preventDefault(); select(rows[active]); }
        if (e.key === 'Tab') clear();
    });
    wrap.addEventListener('focusout', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) clear(); }, 0));
    input.form?.addEventListener('submit', clear);
    return {clear};
}
// A pending purchase or promotion stays in memory until saved or explicitly discarded.
(() => {
    let draft = null;
    const valid = () => draft && draft.scope.isConnected && draft.token === state.token;
    const track = e => {
        const f=e.target.closest?.('#purchase,#productPurchase,#programV7,#promotionTemplate');
        if (!f || f.getAttribute('aria-busy')==='true') return;
        draft={scope:f.closest('.customer-counter') || f,token:state.token,kind:f.id==='purchase'||f.id==='productPurchase'?'compra':'promoción'};
    };
    document.addEventListener('input',track);document.addEventListener('change',track);
    window.loyaltyOperationLeave = proceed => {
        if (!valid()) { draft=null; return proceed(); }
        if (document.querySelector('form[aria-busy="true"]')) { notice('Espera a que termine la operación.'); return; }
        if (document.querySelector('#operationDraftDialog')) return;
        const trigger=document.activeElement, dialog=document.createElement('dialog');dialog.id='operationDraftDialog';dialog.className='operation-draft-dialog';dialog.setAttribute('aria-labelledby','operationDraftTitle');
        dialog.innerHTML=`<span class="eyebrow">CAMBIOS SIN GUARDAR</span><h2 id="operationDraftTitle">Tu ${draft.kind} sigue en preparación.</h2><p>Si sales ahora, perderás los datos de este formulario. Revisar una compra no la registra.</p><p>Si un envío perdió la conexión, conserva el comprobante y reintenta desde esta misma pantalla para recuperar su resultado.</p><div class="draft-dialog-actions"><button type="button" id="keepOperationDraft">Seguir aquí</button><button type="button" class="quiet" id="discardOperationDraft">Salir y descartar formulario</button></div>`;
        document.body.append(dialog);
        dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus();});
        dialog.querySelector('#keepOperationDraft').onclick=()=>dialog.close();
        dialog.querySelector('#discardOperationDraft').onclick=()=>{draft=null;dialog.close();proceed();};
        dialog.showModal();dialog.querySelector('#keepOperationDraft').focus();
    };
    document.addEventListener('click',e=>{
        const target=e.target.closest?.('[data-tab],#quickCounter,#exit,#changeCustomer,#backToPromotions,#advancedPromotion,a.brand');
        if(!target||!valid())return;
        e.preventDefault();e.stopImmediatePropagation();window.loyaltyOperationLeave(()=>{if(target.isConnected)target.click();});
    },true);
    window.addEventListener('beforeunload',e=>{if(valid()){e.preventDefault();e.returnValue='';}});
})();

exit.onclick=async()=>{if(state.slug){try{await api('/api/me/logout',{})}catch{}}state.token='';state.member=null;state.data=null;state.tab='sales';exit.hidden=true;state.slug?customerStart():welcome()};;
function welcome(){exit.textContent="Salir";app.innerHTML=`<div class="intro"><div class="eyebrow">Fidelización para tu negocio</div><h1>Dales un motivo<br>para volver.</h1><p>Premia cada visita. Reúne puntos, sellos y recompensas en una tarjeta que funciona en todas tus sucursales.</p></div><div class="grid"><section class="panel"><h2>Entrar a mi negocio</h2><p>Usa la credencial de administrador o de caja del piloto.</p><form id="staffLogin">${field('credential','Credencial de acceso','password','','required autocomplete="off"')}<button>Entrar</button></form></section><section class="card"><div class="eyebrow">Una tarjeta, más posibilidades</div><h2>Cada compra cuenta.</h2><p>Tus clientes se registran desde el QR del negocio y conservan su saldo al visitar otra sucursal.</p><p class="small">El cliente guarda su tarjeta en Wallet y la presenta en caja. No necesita contraseña. La activación en teléfonos requiere configurar Apple o Google.</p></section></div>`;
 form('staffLogin',async d=>{state.token=d.credential.trim();try{await merchant()}catch(issue){state.token='';throw issue}})}
async function merchant() {
    const dashboard = await api('/api/staff/dashboard');
    if (!state.data || state.data.business.id !== dashboard.business.id) {
        state.tab = dashboard.role === 'OWNER' ? 'overview' : 'sales'; state.member = null;
    }
    state.data = dashboard; exit.hidden = false; renderMerchant();
}
function renderMerchant(){const d=state.data;app.innerHTML=`<div class="eyebrow">${esc(d.business.name)}</div><h1>Todo listo para recibirlos.</h1><nav><button data-tab="sales">Caja</button>${d.role==='OWNER'?'<button data-tab="programs">Promociones</button><button data-tab="rewards">Premios</button><button data-tab="branches">Sucursales y acceso</button>':''}<button data-tab="qr">QR de registro</button></nav><div id="content"></div>`;document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.onclick=()=>{state.tab=b.dataset.tab;renderMerchant()}});({sales:renderSales,programs:renderPrograms,rewards:renderRewards,branches:renderBranches,team:()=>{},activity:()=>{},qr:renderJoinQR}[state.tab]||renderSales)()}
function counterStep(step) {
    document.querySelectorAll('[data-counter-step]').forEach(node => {
        const current = Number(node.dataset.counterStep) === step;
        node.classList.toggle('current', current); node.classList.toggle('complete', Number(node.dataset.counterStep) < step);
        if (current) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
    });
}
// A recorded purchase and promotional earnings are separate choices.
function selectedPurchasePrograms(f) {
    return [...f.querySelectorAll('[name=program]:checked')].map(n => n.value).sort();
}
function purchasePromotionSelection(selected = []) {
    const programs = state.data.programs.filter(p => p.config.active);
    return `<fieldset class="purchase-promotions"><legend>¿Qué promociones quieres aplicar?</legend><p>Elige una, varias o ninguna. Solo acumularán las seleccionadas si cumplen sus condiciones.</p><div class="purchase-promotion-list">${programs.map(p => `<label class="purchase-promotion-option"><input type="checkbox" name="program" value="${esc(p.id)}" ${selected.includes(p.id) ? 'checked' : ''}><span><strong>${esc(p.config.name)}</strong><small>${esc(p.config.kind === 'STAMPS' ? (p.config.countUnits ? 'Sellos por unidad elegible' : 'Sellos por compra elegible') : kinds[p.config.kind])}${p.config.productGroup ? ' · ' + esc(p.config.productGroup) : ''}</small></span></label>`).join('') || '<p>No hay promociones activas. Puedes guardar la compra sin acumulación.</p>'}</div><div class="purchase-selection-footer"><p data-promotion-selection-status role="status"></p><button type="button" class="quiet" data-clear-promotion-selection>Desmarcar todas</button></div><p class="purchase-selection-help">El comprobante registra una compra en el historial y los informes. Los sellos de visita solo se suman si seleccionas su promoción; escanear la tarjeta no acumula beneficios.</p></fieldset>`;
}
function bindPurchasePromotionSelection(f) {
    const update = () => {
        const count = selectedPurchasePrograms(f).length;
        f.querySelector('[data-promotion-selection-status]').textContent = count ? `${count} promoción${count === 1 ? '' : 'es'} seleccionada${count === 1 ? '' : 's'}` : 'Ninguna seleccionada · Solo registrar compra';
        f.querySelector('[data-clear-promotion-selection]').disabled = count === 0;
    };
    f.addEventListener('change', update);
    f.querySelector('[data-clear-promotion-selection]').onclick = () => {
        if (document.querySelector('form[aria-busy="true"]')) return;
        f.querySelectorAll('[name=program]').forEach(n => n.checked = false);
        f.dispatchEvent(new Event('change', {bubbles: true}));
    };
    update();
}
function purchasePromotionReview(ids) {
    const selected = state.data.programs.filter(p => ids.includes(p.id));
    return `<div class="purchase-earning-review"><h4>${selected.length ? 'Promociones seleccionadas' : 'Solo registrar compra'}</h4>${selected.length ? `<ul>${selected.map(p => `<li>${esc(p.config.name)}</li>`).join('')}</ul><p>Se comprobarán sus productos, fechas, sucursal y demás condiciones al guardar. Las promociones sin marcar no acumulan.</p>` : '<p>Sin puntos, sellos ni cashback. Se guardará el total pagado en el historial y los informes.</p>'}</div>`;
}
function purchaseEarningReview(quote) {
    if (!Array.isArray(quote.earnings)) return '';
    const currency = quote.currency || state.data.business.currency;
    const units = (n, kind) => kind === 'CASHBACK' ? (Number(n) / 100).toFixed(2) + ' ' + currency : n + ' ' + (kind === 'STAMPS' ? (n === 1 ? 'sello' : 'sellos') : (n === 1 ? 'punto' : 'puntos'));
    const reason = row => ({EARNED:'Se añadirá al confirmar',REDEEMED_PROGRAM:'El canje no acumula en esta misma promoción',PRODUCTS_REQUIRED:'Faltan productos de la categoría elegible',OTHER_BRANCH:'Esta sucursal no está incluida',OUTSIDE_WINDOW:'Fuera de las fechas, días u horas de la promoción',MINIMUM_SPEND:'No llega al mínimo elegible de '+(row.minimumSpendMinor/100).toFixed(2)+' '+currency,BELOW_UNIT:'El importe no completa una unidad de acumulación',PAUSED:'Promoción pausada'})[row.reason] || 'Sin acumulación';
    return `<section class="earning-forecast" aria-label="Beneficios de esta compra"><div class="section-heading"><h4>Así cambiará su tarjeta</h4><span class="tag">Revisión del servidor</span></div>${quote.earnings.length ? `<div class="earning-forecast-list">${quote.earnings.map(row=>`<div class="earning-forecast-row ${row.amount>0?'will-earn':'no-earning'}"><div><strong>${esc(row.name)}</strong><small>${esc(reason(row))}</small>${row.eligiblePaidMinor>0?`<small>Importe elegible pagado: ${(row.eligiblePaidMinor/100).toFixed(2)} ${esc(currency)}</small>`:''}</div><b>${row.amount>0?'+':''}${esc(units(row.amount,row.kind))}</b></div>`).join('')}</div>` : '<p>Solo se registra la compra. No se añadirán puntos, sellos ni cashback.</p>'}<p class="small">La compra contará en el historial. Este cálculo no guarda ni canjea nada. Si cambia la tarjeta o una condición, tendrás que revisar otra vez.</p></section>`;
}
// Parse typed currency without floating-point rounding or silently accepting fractions of a cent.
function purchaseMinor(value) {
    const text = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Escribe un monto con hasta dos decimales.');
    const [whole, fraction=''] = text.split('.');
    const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'));
    if (result > 1000000000n) throw new Error('El monto máximo es 10000000.00.');
    return Number(result);
}
function purchaseEarningsReceipt(earned, selected) {
    const amount = x => x.kind === 'CASHBACK' ? `${(x.amount / 100).toFixed(2)} ${esc(state.data.business.currency)} de cashback` : `${x.amount} ${x.kind === 'POINTS' ? (x.amount === 1 ? 'punto' : 'puntos') : (x.amount === 1 ? 'sello' : 'sellos')}`;
    const rows = earned.map(x => `<li><strong>${esc(state.data.programs.find(p => p.id === x.programId)?.config.name || kinds[x.kind])}</strong><span>+${amount(x)}</span></li>`).join('');
    return `<div class="purchase-earning-receipt"><h3>${earned.length ? 'Promociones aplicadas' : 'Compra sin acumulación'}</h3>${earned.length ? `<ul>${rows}</ul>` : `<p>${selected.length ? 'Las promociones elegidas no generaron saldo: revisa sus condiciones. Una promoción canjeada no vuelve a acumular en esa misma compra.' : 'No seleccionaste promociones. No se añadieron puntos, sellos ni cashback.'}</p>`}<p>El comprobante figura una sola vez en el historial y los informes.</p></div>`;
}

function counterReceipt(title, body) {
    const found = document.querySelector('#found'); if (!found) return;
    state.member = null; counterStep(3);
    found.innerHTML = `<section class="panel counter-receipt" tabindex="-1"><span class="receipt-check" aria-hidden="true">✓</span><div class="eyebrow">Operación registrada</div><h2>${esc(title)}</h2>${body}<button type="button" id="nextCustomer">Atender al siguiente cliente</button></section>`;
    action('nextCustomer', () => { renderSales(); document.querySelector('#value')?.focus(); });
    found.firstElementChild.focus();
}
function renderSales() {
    const d = state.data; state.member = null;
    const content = document.querySelector('#content');
    content.innerHTML = `<ol class="counter-steps" aria-label="Pasos de caja"><li data-counter-step="1" class="current" aria-current="step"><span>1</span>Cliente</li><li data-counter-step="2"><span>2</span>Operación</li><li data-counter-step="3"><span>3</span>Recibo</li></ol><section class="panel lookup-panel"><h2>Atender a un cliente</h2><p>Escanea su tarjeta o busca por cédula o nombre.</p><form id="lookup"><div class="row"><div><label for="kind">Buscar por</label><select id="kind" name="kind"><option value="cardCode">QR de Wallet</option><option value="document">Cédula</option><option value="name">Nombre · sugerencias</option></select></div><div>${field('value', 'Código de tarjeta o cédula', 'text', '', 'required autocomplete="off"')}</div></div><button>Buscar cliente</button><button type="button" class="quiet" id="scanWallet">Escanear con cámara</button></form><div id="scannerMount"></div></section><div id="found"></div><details class="panel"><summary>Confirmar un código de canje anterior</summary><p>Solo para reservas creadas antes de esta actualización. Los nuevos canjes se hacen al buscar la tarjeta.</p><form id="confirm">${field('token', 'Código de canje anterior', 'text', '', 'required autocomplete="off"')}<label for="legacyBranch">Sucursal</label><select id="legacyBranch" name="branchId" required>${options(d.branches)}</select><button>Confirmar entrega</button></form><div id="confirmation"></div></details>`;
    const lookupInput = content.querySelector('#value'), lookupKind = content.querySelector('#kind');
    const suggestions = attachPredictiveSearch(lookupInput, {
        enabled: () => lookupKind.value === 'name',
        load: async q => (await api('/api/staff/member-suggestions?q=' + encodeURIComponent(q))).items,
        label: row => row.name, description: row => 'Tarjeta terminada en ' + row.cardCode.slice(-6),
        choose: row => { lookupKind.value = 'cardCode'; lookupInput.value = row.cardCode; content.querySelector('#lookup').requestSubmit(); }
    });
    lookupKind.addEventListener('change', () => { suggestions.clear(); lookupInput.value = ''; content.querySelector('label[for=value]').textContent = lookupKind.value === 'name' ? 'Nombre del cliente' : lookupKind.value === 'document' ? 'Cédula completa' : 'Código de la tarjeta'; lookupInput.placeholder = lookupKind.value === 'name' ? 'Escribe al menos 2 letras' : lookupKind.value === 'document' ? 'Cédula completa' : 'Escanea o pega el código de Wallet'; lookupInput.focus(); });
    action('scanWallet', () => window.startComebackScanner(document.querySelector('#scannerMount'), code => {
        const lookup = document.querySelector('#lookup');
        lookup.elements.kind.value = 'cardCode';
        lookup.elements.value.value = code;
        lookup.requestSubmit();
    }));
    form('lookup', async (data, lookupForm) => {
        if (data.kind === 'name') throw new Error('Elige al cliente de las sugerencias. También puedes buscar su cédula completa o escanear Wallet.');
        window.stopComebackScanner?.();
        state.member = null;
        content.querySelector('#found').replaceChildren();
        const m = await api('/api/staff/members/lookup', {[data.kind]: data.value.trim()});
        if (!content.isConnected || !lookupForm.isConnected) return;
        state.member = m; counterStep(2); content.querySelector('.lookup-panel').hidden = true;
        const availableRewards = m.rewards.filter(r => r.active && !r.benefit);
                const found = document.querySelector('#found');
        found.innerHTML = `<section class="panel customer-counter"><div class="counter-customer-heading"><div><span class="eyebrow">Cliente en caja</span><h2>${esc(m.member.name)}</h2></div><button type="button" class="quiet" id="changeCustomer">Cambiar cliente</button></div><p>${m.balances.map(b => `${esc(b.name)}: ${b.kind === 'CASHBACK' ? (b.available / 100).toFixed(2) + ' ' + esc(d.business.currency) : b.available + ' ' + esc(kinds[b.kind])}`).join(' · ') || 'Su primera compra empieza aquí.'}</p>${d.role === 'OWNER' ? '<div class="wallet-recovery-callout"><div><strong>Apple y Google Wallet</strong><p>¿No se actualiza o cambió de teléfono?</p></div><button type="button" id="openWalletRecovery" aria-expanded="false" aria-controls="walletRecoveryPanel">Actualizar o recuperar esta tarjeta</button></div><section id="walletRecoveryPanel" class="wallet-recovery-panel" aria-labelledby="walletRecoveryTitle" hidden><div class="counter-customer-heading"><h3 id="walletRecoveryTitle">Actualizar o recuperar esta tarjeta</h3><button type="button" class="quiet" id="closeWalletRecovery">Cerrar ayuda</button></div><p>1. Verifica al titular. 2. Genera el enlace. 3. El cliente abre el QR en su teléfono y guarda la misma tarjeta en Apple o Google Wallet.</p><p>Se conservan su tarjeta y sus saldos. No necesita borrarla ni registrarse de nuevo.</p><form id="restoreIssue"><label for="restoreReason">Qué necesita el cliente</label><select id="restoreReason" name="reason"><option value="CONNECTION_REPAIR">Su tarjeta no se actualiza</option><option value="DEVICE_CHANGE">Cambió o perdió el teléfono</option><option value="REMOVED_CARD">Borró la tarjeta</option></select><label class="check"><input name="identityVerified" type="checkbox" required>Verifiqué presencialmente la identidad del titular.</label><button>Generar QR de actualización o recuperación</button></form><div id="restoreResult" aria-live="polite"></div></section>' : ''}<div class="counter-modes" role="group" aria-label="Qué deseas hacer"><button type="button" data-counter-mode="purchase" aria-pressed="true">Registrar compra</button><button type="button" data-counter-mode="redemption" aria-pressed="false">Canjear un premio</button></div><div class="counter-operation"><section id="counterPurchase"><h3>Registrar compra</h3><form id="purchase"><label for="purchaseBranch">Sucursal</label><select id="purchaseBranch" name="branchId" required>${options(d.branches)}</select>${field('receipt', 'Número único del comprobante', 'text', '', 'required maxlength="100"')}${field('amount', 'Total pagado (' + esc(d.business.currency) + ')', 'number', '', 'required min="0.01" step="any" data-money max="10000000"')}${purchasePromotionSelection()}<button>Revisar compra</button></form><div id="purchaseReview"></div></section><section id="counterRedemption" hidden><h3>Canjear un premio</h3><p>El cliente presenta su tarjeta y solicita el premio. No necesita abrir la web.</p><form id="counterChoose"><label for="rewardId">Premio</label><select id="rewardId" name="rewardId" required>${availableRewards.map(r => `<option value="${esc(r.id)}" ${(m.balances.find(b => b.programId === r.programId)?.available || 0) < r.cost ? 'disabled' : ''}>${esc(r.name)} · ${rewardCost(r, m.balances)}</option>`).join('')}</select><label for="counterBranch">Sucursal</label><select id="counterBranch" name="branchId" required>${options(d.branches)}</select><button ${availableRewards.some(r => (m.balances.find(b => b.programId === r.programId)?.available || 0) >= r.cost) ? '' : 'disabled'}>Revisar canje</button></form><div id="counterReview"></div></section></div></section>`;;
        const recoveryButton = found.querySelector('#openWalletRecovery'), recoveryPanel = found.querySelector('#walletRecoveryPanel');
        const showRecovery = show => {
            if (!recoveryPanel || content.querySelector('form[aria-busy="true"]')) return;
            recoveryPanel.hidden = !show; recoveryButton.setAttribute('aria-expanded', String(show));
            if (show) { recoveryPanel.scrollIntoView({block: 'nearest'}); found.querySelector('#restoreReason').focus(); }
            else recoveryButton.focus();
        };
        recoveryButton?.addEventListener('click', () => showRecovery(recoveryPanel.hidden));
        found.querySelector('#closeWalletRecovery')?.addEventListener('click', () => showRecovery(false));
        if (lookupForm.dataset.recovery === m.member.id) {
            delete lookupForm.dataset.recovery;
            // Wait for the read-only lookup form to release its busy guard.
            setTimeout(() => { if (found.isConnected && state.member?.member.id === m.member.id) showRecovery(true); }, 0);
        }
        action('changeCustomer', () => {
            if (content.querySelector('form[aria-busy="true"]')) { notice('Espera a que termine la operación.'); return; }
            renderSales(); document.querySelector('#value')?.focus();
        });
        found.querySelectorAll('[data-counter-mode]').forEach(button => button.onclick = () => {
            if (content.querySelector('form[aria-busy="true"]')) { notice('Espera a que termine la operación.'); return; }
            const purchase = button.dataset.counterMode === 'purchase';
            found.querySelector('#counterPurchase').hidden = !purchase; found.querySelector('#counterRedemption').hidden = purchase;
            found.querySelectorAll('[data-counter-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        });
        if (!availableRewards.some(r => (m.balances.find(b => b.programId === r.programId)?.available || 0) >= r.cost)) {
            const help = document.createElement('p'); help.className = 'empty-reward'; help.textContent = 'No hay premios de entrega directa con saldo suficiente. Los descuentos en productos se revisan al registrar la compra.';
            found.querySelector('#counterChoose').before(help);
        }
        const purchaseForm = found.querySelector('#purchase');
        bindPurchasePromotionSelection(purchaseForm);
        let purchaseRevision = 0;
        const clearPurchaseReview = () => { purchaseRevision++; found.querySelector('#purchaseReview')?.replaceChildren(); };
        purchaseForm.addEventListener('input', clearPurchaseReview);
        purchaseForm.addEventListener('change', clearPurchaseReview);
        form('purchase', async (p, f) => {
            const ticket = purchaseRevision;
            const payload = {memberId: m.member.id, branchId: p.branchId, receipt: p.receipt, amountMinor: purchaseMinor(p.amount), currency: d.business.currency, programIds: selectedPurchasePrograms(f)};
            const quote = await api('/api/staff/purchases/quote', payload);
            if (ticket !== purchaseRevision || !f.isConnected) return;
            if (quote.earningReview) payload.expectedEarningReview = quote.earningReview;
            const review = found.querySelector('#purchaseReview');
            review.innerHTML = `<section class="panel purchase-confirmation"><h3>Confirmar compra</h3><p>${esc(m.member.name)} · <strong>${(quote.amountMinor / 100).toFixed(2)} ${esc(d.business.currency)}</strong></p>${purchasePromotionReview(payload.programIds)}${purchaseEarningReview(quote)}<p>Confirma cuando el cobro esté realizado en caja.</p><form id="finishSimplePurchase"><button>Guardar compra</button></form></section>`;
            form('finishSimplePurchase', async () => {
                if (ticket !== purchaseRevision || !f.isConnected) throw new Error('La compra cambió. Revisa el total otra vez.');
                const r = await api('/api/staff/purchases', payload, 'POST', operationKey(f, payload));
                counterReceipt(r.replayed ? 'Esta compra ya estaba registrada' : 'Compra registrada', `<p>${esc(m.member.name)} · ${(payload.amountMinor / 100).toFixed(2)} ${esc(d.business.currency)}</p>${purchaseEarningsReceipt(r.earned, payload.programIds)}<p>La actualización de Wallet se enviará automáticamente cuando esté habilitado.</p><p class="small">Comprobante: ${esc(r.purchaseId)}</p>`);
                notice('Compra registrada una sola vez.');
            });
        });
        let counterRevision = 0;
        const clearCounterReview = () => { counterRevision++; found.querySelector('#counterReview').replaceChildren(); };
        found.querySelector('#counterChoose').addEventListener('input', clearCounterReview);
        found.querySelector('#counterChoose').addEventListener('change', clearCounterReview);
        form('counterChoose', async p => {
            const ticket = counterRevision;
            const reward = availableRewards.find(r => r.id === p.rewardId);
            if (!reward) throw new Error('Selecciona un premio disponible.');
            const payload = {memberId: m.member.id, branchId: p.branchId, rewardId: reward.id, expectedRevision: m.member.revision, expectedRewardVersion: reward.version, identityVerified: true, customerConfirmed: true};
            const review = document.querySelector('#counterReview');
            review.innerHTML = `<hr><h3>Confirmar ${esc(reward.name)}</h3><p>${esc(m.member.name)} · ${rewardCost(reward, m.balances)} · ${esc(d.branches.find(b => b.id === p.branchId)?.name)}</p><p>El saldo se descontará al confirmar. Entrega el premio solo después de ver el recibo.</p><form id="counterConfirm"><label class="check"><input type="checkbox" name="identityVerified" required>Verifiqué al titular de la tarjeta.</label><label class="check"><input type="checkbox" name="customerConfirmed" required>El cliente solicitó este premio y acepta el descuento.</label><button>Confirmar canje y descontar</button></form>`;
            form('counterConfirm', async (confirmation, f) => {
                if (ticket !== counterRevision || !f.isConnected) throw new Error('El premio o la sucursal cambió. Revisa el canje otra vez.');
                if (confirmation.identityVerified !== 'on' || confirmation.customerConfirmed !== 'on') throw new Error('Falta la confirmación del titular.');
                const r = await api('/api/staff/counter-redemptions', payload, 'POST', operationKey(f, payload));
                counterReceipt(r.replayed ? 'Canje ya confirmado: no entregues otro premio' : 'Canje confirmado', `<p>${esc(r.name)} · ${esc(m.member.name)}</p><p>${r.replayed ? 'Este recibo corresponde a la entrega anterior. Comprueba si ya entregaste el premio.' : 'Ya puedes entregar el premio. El saldo se descontó una sola vez.'}</p><p class="small">Recibo único: ${esc(r.receipt)}</p>`);
                notice(r.replayed ? 'Recibo recuperado. No repitas la entrega.' : 'Canje confirmado.');
            });
        });;
        let recoveryExpiry;
        form('restoreIssue', async (p, f) => {
            clearInterval(recoveryExpiry);
            const started = Date.now(), session = state.token;
            found.querySelector('#restoreResult').replaceChildren();
            const r = await api('/api/staff/wallet/restore', {memberId: m.member.id, reason: p.reason, identityVerified: p.identityVerified === 'on'});
            if (!f.isConnected || state.token !== session) return;
            if (Date.now() >= started + 300000) throw new Error('El enlace venció mientras se preparaba. Verifica al titular e inténtalo otra vez.');
            const target = found.querySelector('#restoreResult');
            const url = new URL(r.path, location.origin);
            if (url.origin !== location.origin || !url.pathname.startsWith('/join/')) throw new Error('Enlace de recuperación inválido.');
            target.replaceChildren();
            const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Abrir recuperación de la tarjeta'; link.className = 'button'; target.append(link);
            f.elements.identityVerified.checked = false;
            const timer = document.createElement('p'); timer.className = 'recovery-expiry'; target.append(timer);
            const tick = () => {
                if (!target.isConnected || state.token !== session) { clearInterval(recoveryExpiry); target.replaceChildren(); return; }
                const seconds = Math.max(0, Math.ceil((started + 300000 - Date.now()) / 1000));
                if (!seconds) { clearInterval(recoveryExpiry); target.textContent = 'El enlace venció. Verifica al titular para generar uno nuevo de la misma tarjeta.'; return; }
                timer.textContent = `QR de un solo uso · vence en ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
            }; tick(); recoveryExpiry = setInterval(tick, 1000);
            link.addEventListener('click', e => { if (Date.now() >= started + 300000 || state.token !== session) { e.preventDefault(); tick(); } });
            const hint = document.createElement('p'); hint.textContent = 'Comparte este enlace únicamente con el titular verificado. Vence en cinco minutos y solo admite un uso. Recupera la misma tarjeta; no revoca copias existentes en Wallet.'; target.append(hint);
            if (r.qrData) {
                const bytes = Uint8Array.from(atob(r.qrData), ch => ch.charCodeAt(0));
                const image = document.createElement('img'); image.className = 'qr'; image.alt = 'QR temporal para recuperar la tarjeta';
                const source = URL.createObjectURL(new Blob([bytes], {type: 'image/png'})); image.onload = () => URL.revokeObjectURL(source); image.src = source; target.prepend(image);
            }
        });
    });
    form('confirm', async (p, f) => {
        const payload = {token: p.token.trim(), branchId: p.branchId};
        const r = await api('/api/staff/redemptions/confirm', payload, 'POST', operationKey(f, payload));
        document.querySelector('#confirmation').innerHTML = `<h3>${r.replayed ? 'Este canje ya estaba confirmado: no entregues otro premio' : 'Entrega confirmada'}</h3><p>${esc(r.name)}</p><p class="small">Recibo único: ${esc(r.receipt)}</p>`;
    });
}
function renderPrograms(edit=null){const list=state.data.programs, p=edit?.config||{};const w=p.window||{};const b=p.bonuses?.[0];document.querySelector('#content').innerHTML=`<div class="grid"><section class="panel"><h2>${edit?'Editar promoción':'Crear promoción'}</h2><form id="program">${field('name','Nombre','text',p.name||'','required maxlength="120"')}<label>Qué acumula el cliente</label><select name="kind" ${edit?'disabled':''}>${Object.entries(kinds).map(([k,v])=>`<option value="${k}" ${p.kind===k?'selected':''}>${v}</option>`).join('')}</select><div data-kind="POINTS" class="row"><div>${field('unitAmount','Por cada monto de compra ('+esc(state.data.business.currency)+')','number',(p.unitMinor||100)/100,'min="0.01" step="any" data-money required')}</div><div>${field('pointsPerUnit','Puntos que acumula','number',p.pointsPerUnit||1,'min="1" required')}</div></div><div data-kind="CASHBACK">${field('cashback','Cashback (%)','number',(p.cashbackBps||500)/100,'min="0.01" max="100" step="0.01" required')}</div><div data-kind="STAMPS">${field('stampsPerPurchase','Sellos por compra','number',p.stampsPerPurchase||1,'min="1" max="100" required')}</div>${field('minimumAmount','Compra mínima ('+esc(state.data.business.currency)+')','number',(p.minimumSpendMinor||1)/100,'min="0.01" step="any" data-money required')}<p class="small">Cashback es saldo promocional para canjear. Los sellos se cuentan por compra registrada.</p><details ${edit?'open':''}><summary>Fechas, horarios y sucursales</summary><p class="small">Zona horaria: ${esc(state.data.business.timezone)}. Todas las fechas y horas corresponden a la zona del negocio.</p>${field('startsAt','Disponible desde','datetime-local',localDateTime(w.startsAt))}${field('endsAt','Finaliza el','datetime-local',localDateTime(w.endsAt))}<div class="row"><div>${field('localStart','Desde','time',w.localStart||'')}</div><div>${field('localEnd','Hasta','time',w.localEnd||'')}</div></div>${field('weekdays','Días: lunes=1, domingo=7','text',(w.weekdays||[1,2,3,4,5,6,7]).join(','),'required')}<label>Aplicar en sucursales (sin selección: todas)</label><select name="branches" multiple>${options(state.data.branches)}</select>${field('multiplier','Multiplicador de puntos / saldo / sellos','number',b?.multiplier||1,'min="1" max="10" required')}<p class="small">El multiplicador aplica durante esta promoción. Para bonos con horarios independientes, esta primera versión dispone de la API.</p></details><label class="check"><input name="active" type="checkbox" ${p.active!==false?'checked':''}>Promoción activa</label><button>${edit?'Guardar nueva versión':'Crear promoción'}</button></form></section><section class="panel"><h2>Promociones del negocio</h2><p>Al editar una promoción, las compras anteriores conservan sus reglas y sus saldos.</p><div class="list">${list.length?list.map(x=>`<div><span class="tag">${esc(kinds[x.config.kind])} · v${x.version}</span><h3>${esc(x.config.name)}</h3><p>${x.config.active?'Activa':'Pausada'}</p><button class="quiet" data-edit="${esc(x.id)}">Editar</button></div>`).join(''):'<p class="empty">Crea tu primera promoción.</p>'}</div></section></div>`;
 const typeSelect=document.querySelector('[name=kind]');const showKind=()=>document.querySelectorAll('[data-kind]').forEach(el=>el.style.display=el.dataset.kind===typeSelect.value?'':'none');typeSelect.onchange=showKind;showKind();
 if(edit){const s=document.querySelector('[name=branches]');[...s.options].forEach(o=>o.selected=(p.branchIds||[]).includes(o.value))}
 document.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>{const target=list.find(x=>x.id===btn.dataset.edit);if(target.config.bonuses.length>1||target.config.bonuses.some(b=>b.branchIds.length||JSON.stringify(b.window)!==JSON.stringify({startsAt:null,endsAt:null,weekdays:[1,2,3,4,5,6,7],localStart:null,localEnd:null}))){notice('Esta regla contiene bonos avanzados. Edítala desde la API para conservarlos.');return}renderPrograms(target)});
 form('program',async(v,f)=>{const program={name:v.name,kind:p.kind||v.kind,active:v.active==='on',unitMinor:Math.round(Number(v.unitAmount)*100),pointsPerUnit:Number(v.pointsPerUnit),cashbackBps:Math.round(Number(v.cashback)*100),stampsPerPurchase:Number(v.stampsPerPurchase),minimumSpendMinor:Math.round(Number(v.minimumAmount)*100),branchIds:[...f.elements.branches.selectedOptions].map(o=>o.value),window:{startsAt:utcDateTime(v.startsAt),endsAt:utcDateTime(v.endsAt),weekdays:v.weekdays.split(',').map(Number),localStart:v.localStart||null,localEnd:v.localEnd||null},bonuses:Number(v.multiplier)>1?[{priority:1,multiplier:Number(v.multiplier)}]:[]};await api('/api/staff/programs'+(edit?'/'+edit.id:''),edit?{expectedVersion:edit.version,program}:program,edit?'PUT':'POST');notice('Promoción guardada.');await merchant()})}
function renderRewards(edit=null){if(edit && window.LoyaltyRewardGoals){window.LoyaltyRewardGoals.open(edit,document.querySelector('[data-reward="'+edit.id+'"]'));return;}const p=edit||{};;const initialKind=state.data.programs.find(x=>x.id===(p.programId||state.data.programs[0]?.id))?.config.kind;document.querySelector('#content').innerHTML=`<div class="grid"><section class="panel"><h2>${edit?'Editar premio':'Crear premio'}</h2><p>Elige el premio y la meta de esta promoción. Cada programa conserva su propio saldo.</p><form id="reward">${field('name','Premio que entregarás','text',p.name||'','required')}<label>Programa</label><select name="programId" required ${edit?'disabled':''}>${options(state.data.programs.map(p=>({id:p.id,name:p.config.name})),p.programId)}</select>${field('cost',initialKind==='CASHBACK'?'Saldo necesario ('+esc(state.data.business.currency)+')':initialKind==='STAMPS'?'Sellos necesarios':'Puntos necesarios','number',p.cost?(initialKind==='CASHBACK'?p.cost/100:p.cost):9,initialKind==='CASHBACK'?'min="0.01" step="any" data-money required':'min="1" step="1" required')}<label class="check"><input name="active" type="checkbox" ${p.active!==false?'checked':''}>Disponible para canjear</label><button>Guardar premio</button></form></section><section class="panel"><h2>Premios disponibles</h2><div class="list">${state.data.rewards.map(r=>`<div><h3>${esc(r.name)}</h3><p>${r.cost} unidades · ${r.active?'Disponible':'Pausado'} · v${r.version}</p><button class="quiet" data-reward="${r.id}">Editar</button></div>`).join('')||'<p>Aún no hay premios.</p>'}</div></section></div>`;;
 const rewardProgram=document.querySelector('[name=programId]');rewardProgram.onchange=()=>{const kind=state.data.programs.find(x=>x.id===rewardProgram.value)?.config.kind;document.querySelector('label[for=cost]').textContent=kind==='CASHBACK'?'Saldo necesario ('+state.data.business.currency+')':kind==='STAMPS'?'Sellos necesarios':'Puntos necesarios';const cost=document.querySelector('#cost');cost.min=kind==='CASHBACK'?'0.01':'1';cost.step=kind==='CASHBACK'?'any':'1';configureMoneyInput(cost,kind==='CASHBACK')};
 document.querySelectorAll('[data-reward]').forEach(b=>b.onclick=()=>renderRewards(state.data.rewards.find(r=>r.id===b.dataset.reward)));
 form('reward',async v=>{const reward={programId:p.programId||v.programId,name:v.name,cost:state.data.programs.find(x=>x.id===(p.programId||v.programId))?.config.kind==='CASHBACK'?Math.round(Number(v.cost)*100):Number(v.cost),active:v.active==='on',benefit:p.benefit||null};await api('/api/staff/rewards'+(edit?'/'+edit.id:''),edit?{expectedVersion:edit.version,reward}:reward,edit?'PUT':'POST');await merchant();notice('Premio guardado.')})}
function renderBranches(){document.querySelector('#content').innerHTML=`<section class="panel"><h2>Sucursales del negocio</h2><p>Comparten clientes y tarjeta. Asigna los accesos de cada persona desde Equipo y accesos.</p><div class="list">${state.data.branches.map(b=>`<div>${esc(b.name)} <span class="tag">${esc(b.code)}</span></div>`).join('')}</div><form id="branch">${field('name','Nombre de la sucursal','text','','required')}${field('code','Código único','text','','required')}<button>Agregar sucursal</button></form><button type="button" class="quiet" id="openTeam">Administrar equipo y accesos</button></section>`;form('branch',async d=>{await api('/api/staff/branches',d);await merchant()});document.querySelector('#openTeam').onclick=()=>{state.tab='team';renderMerchant();}}

function renderJoinQR(){const slug=state.data.business.slug;document.querySelector('#content').innerHTML=`<section class="panel narrow"><h2>Invita a tus clientes</h2><p>Coloca este QR fijo en cada local. El cliente lo usa una sola vez para registrarse y añadir su tarjeta a Wallet. La misma tarjeta funciona en todas las sucursales.</p><img class="qr" alt="QR de registro" src="/api/public/${encodeURIComponent(slug)}/qr"><a class="button" href="/join/${encodeURIComponent(slug)}" target="_blank" rel="noopener">Abrir formulario</a></section>`}
async function customerStart() {
    try {
        const d = await api(`/api/public/${encodeURIComponent(state.slug)}`);
        state.business = d.business;
        state.customerPrograms = d.programs;
        const fragment = new URLSearchParams(location.hash.slice(1));
        const restoreToken = fragment.get('restore');
        if (restoreToken) {
            history.replaceState(null, '', location.pathname);
            app.innerHTML = `<section class="panel narrow"><div class="eyebrow">${esc(d.business.name)}</div><h1>Recupera tu tarjeta.</h1><p>Conservarás tus puntos, tus consumos y tu tarjeta para todas las sucursales.</p><form id="restoreUse"><button>Recuperar mi tarjeta</button></form><p class="small">Este enlace se usa una sola vez y vence a los cinco minutos.</p></section>`;
            form('restoreUse', async () => {
                const r = await api(`/api/public/${encodeURIComponent(state.slug)}/restore`, {token: restoreToken});
                state.token = r.token;
                await customerCard();
            });
            return;
        }
        app.innerHTML = `<section class="narrow"><div class="eyebrow">${esc(d.business.name)}</div><h1>Tu tarjeta.<br>Siempre contigo.</h1><p>Regístrate una vez y guarda tu tarjeta en Wallet. En tus próximas compras, solo preséntala en caja.</p><section class="panel"><form id="enroll">${field('name', 'Tu nombre', 'text', '', 'required maxlength="80" autocomplete="name"')}${field('document', 'Cédula', 'text', '', 'required minlength="5" maxlength="40" inputmode="numeric" autocomplete="off"')}<p class="small">Una cédula permite una sola tarjeta en este negocio, válida en todas sus sucursales. No necesitas contraseña.</p><label class="check"><input name="acceptedTerms" type="checkbox" required>Acepto participar en el piloto y guardar mi nombre, identificador protegido y movimientos para administrar mi tarjeta. Usaré datos ficticios durante las pruebas.</label><button>Crear mi tarjeta</button></form><details><summary>Ya tengo tarjeta</summary><p>Abre Apple Wallet o Google Wallet y presenta tu tarjeta en caja. No necesitas registrarte otra vez ni iniciar sesión.</p><p>Si cambiaste de teléfono o borraste la tarjeta, pide al dueño del negocio que verifique tu identidad y te ayude a recuperarla.</p></details></section></section>`;
        form('enroll', async v => {
            const r = await api(`/api/public/${encodeURIComponent(state.slug)}/join`, {name: v.name, document: v.document, acceptedTerms: v.acceptedTerms === 'on'});
            state.token = r.token;
            await customerCard();
        });
    } catch (e) {
        app.innerHTML = `<section class="panel narrow"><h2>No pudimos abrir el registro</h2><p>${esc(e.message)}</p></section>`;
    }
}
async function imageFromApi(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${state.token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error('No se pudo generar el código QR.');return URL.createObjectURL(await r.blob())}
function rewardCost(r,balances){const kind=balances.find(b=>b.programId===r.programId)?.kind||state.customerPrograms?.find(p=>p.id===r.programId)?.config.kind;return kind==='CASHBACK'?(r.cost/100).toFixed(2)+' '+esc(state.business?.currency||state.data?.business.currency):r.cost+' '+esc(kinds[kind]||'unidades')}
async function customerCard() {
    const d = await api('/api/me');
    exit.hidden = false;
    exit.textContent = 'Terminar';
    app.innerHTML = `<section class="narrow"><div class="eyebrow">${esc(state.business.name)}</div><h1>Tu tarjeta está lista,<br>${esc(d.member.name)}.</h1><section id="walletMount" class="panel"><p>Preparando las opciones para guardar tu tarjeta…</p></section><section class="card"><h2>Una tarjeta. Todas las sucursales.</h2><p>En cada compra, abre Wallet y muestra el QR. En caja registran tu consumo y tus puntos se actualizan en la misma tarjeta.</p><p>Para un premio, presenta tu tarjeta y pídelo al cajero. El negocio verifica al titular y confirma el canje.</p><div class="balances">${d.balances.map(b => `<div class="balance"><span>${esc(b.name)}</span><strong>${b.kind === 'CASHBACK' ? (b.available / 100).toFixed(2) : b.available}</strong><small>${b.kind === 'CASHBACK' ? esc(state.business.currency) : esc(kinds[b.kind])}</small></div>`).join('')}</div></section><details class="panel"><summary>Ver identificador de esta tarjeta</summary><img id="cardQR" class="qr" alt="QR personal de la tarjeta"><p class="small">Este QR identifica tu tarjeta. La cédula no se incluye en el código. Tu negocio también puede localizarte por cédula.</p></details></section>`;
    try {
        const url = await imageFromApi('/api/me/qr');
        const img = document.querySelector('#cardQR');
        if (img) { img.onload = () => URL.revokeObjectURL(url); img.src = url; }
        else URL.revokeObjectURL(url);
    } catch (e) { notice(e.message); }
}
state.slug?customerStart():welcome();
