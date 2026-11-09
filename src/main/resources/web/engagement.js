'use strict';
(() => {
    const money = n => (Number(n) / 100).toFixed(2) + ' ' + state.data.business.currency;
    const checked = b => b ? 'checked' : '';
    const date = s => s ? new Intl.DateTimeFormat('es-EC', {timeZone: state.data.business.timezone, dateStyle: 'medium', timeStyle: 'short'}).format(new Date(s)) : 'Sin compras';
    const safe = fn => async () => { try { await fn(); } catch (e) { notice(e.message); } };
    const select = (name, label, choices, value = '') => `<label for="${name}">${label}</label><select name="${name}" id="${name}">${choices.map(([v, n]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    const existingMerchant = renderMerchant;
    renderMerchant = function () {
        existingMerchant();
        if (state.data.role !== 'OWNER') return;
        const nav = app.querySelector('nav');
        for (const [tab, label, render] of [['design', 'Mi tarjeta', designPage], ['customers', 'Mis clientes', customersPage], ['events', 'Eventos y cumpleaños', eventsPage]]) {
            const button = document.createElement('button'); button.dataset.tab = tab; button.textContent = label;; button.classList.toggle('active', state.tab === tab);
            button.onclick = safe(async () => { state.tab = tab; renderMerchant(); }); nav.append(button);
            if (state.tab === tab) render().catch(e => notice(e.message));
        }
    };
    let editingProgram = null;
    const existingPrograms = renderPrograms;
    renderPrograms = function (edit = null, create = false) {
        editingProgram = edit;
        if (edit || !create) { existingPrograms(edit, create); return; }
        const root=document.querySelector('#content'), currency=state.data.business.currency;
                let step=0, method='STAMPS', draftTouched=false, pendingExample=null;
        const suggestions=state.data.promotionSuggestions || {category:{name:'Tu negocio',source:'GENERAL'},productExamples:[],examples:[]};
        const examples=suggestions.examples || [], category=suggestions.category;
        const exampleHint=example=>{
            const money=value=>(value/100).toFixed(2)+' '+currency;
            if(['STAMPS','DISCOUNT'].includes(example.method))return `Acumula ${example.nth-1} ${example.nth===2?'sello':'sellos'}. ${example.percentBps/100}% de descuento ${example.countUnits?'en una unidad de':'en la próxima compra de'} ${example.group}.`;
            if(example.method==='POINTS')return `${example.pointsPerUnit} ${example.pointsPerUnit===1?'punto':'puntos'} por cada ${money(example.unitMinor)}. Premio con ${example.cost} puntos: ${example.rewardName}.`;
            return `${example.cashbackBps/100}% de saldo promocional. Premio con ${money(example.cost)}: ${example.rewardName}.`;
        };
        const categoryExamples=`<section class="business-promotion-examples" aria-labelledby="businessExamplesTitle"><div class="eyebrow">Ideas para tu negocio</div><h3 id="businessExamplesTitle">Ejemplos para ${esc(category.name)}</h3><p>${category.source==='ACTIVITY'?'Según tu actividad registrada. El administrador puede confirmar o corregir el tipo de negocio.':category.source==='GENERAL'?'Pide al administrador que asigne tu tipo de negocio para recibir ejemplos específicos.':'Sugerencias adaptadas al tipo de negocio elegido en el registro.'} Todos los valores y nombres son editables.</p><div class="business-examples-grid">${examples.map(example=>`<article class="business-example"><span class="tag">${esc(({STAMPS:'Sellos · Gratis',DISCOUNT:'Sellos · Descuento',POINTS:'Puntos',CASHBACK:'Cashback'})[example.method])}</span><h4>${esc(example.name)}</h4><p>${esc(exampleHint(example))}</p><button type="button" class="quiet" data-business-example="${esc(example.id)}" aria-label="Usar ejemplo: ${esc(example.name)}">Usar este ejemplo</button></article>`).join('')}</div><p class="small">Elegir un ejemplo solo completa el borrador. Revisa sus condiciones antes de crear la promoción.</p><div id="replaceExampleConfirm" class="replace-example-confirm" hidden><p id="replaceExampleText"></p><div class="row"><button type="button" class="quiet" id="keepExampleDraft">Mantener mi borrador</button><button type="button" id="replaceExampleDraft">Usar ejemplo y reemplazar borrador</button></div></div></section>`;;
                root.innerHTML=`<button type="button" class="quiet promotion-back" id="backToPromotions">← Volver a promociones</button><section class="panel promotion-wizard"><div class="eyebrow">Nueva promoción</div><h2>Una razón para que vuelvan.</h2><p>Elige el beneficio, ajusta las reglas y revisa cómo lo recibirá tu cliente.</p><ol class="registration-steps" aria-label="Pasos de la promoción"><li data-promotion-step="0">1 <span>Beneficio</span></li><li data-promotion-step="1">2 <span>Reglas</span></li><li data-promotion-step="2">3 <span>Revisión</span></li></ol><form id="promotionTemplate" novalidate><fieldset data-wizard-panel="0"><legend>¿Qué quieres ofrecer?</legend>${categoryExamples}<h3>O crea tu propia idea</h3><p class="small">Empieza desde cero con cualquiera de estas opciones.</p><div class="promotion-choice-grid">${[['STAMPS','Un producto o servicio gratis','Acumula sellos y canjea en una próxima compra.','★'],['DISCOUNT','Un descuento por volver','Tú eliges el porcentaje y cuándo puede usarlo.','%'],['POINTS','Puntos por sus compras','Define cuánto acumula y qué premio puede canjear.','✦'],['CASHBACK','Saldo promocional','Devuelve un porcentaje como saldo para un premio.','$']].map(([key,title,body,icon])=>`<button type="button" data-promotion-method="${key}" aria-pressed="${method===key}"><span aria-hidden="true">${icon}</span><strong>${title}</strong><small>${body}</small></button>`).join('')}</div></fieldset>
            <fieldset data-wizard-panel="1" hidden><legend>Dale forma a tu promoción</legend><p id="selectedBusinessExample" class="selected-business-example" role="status" hidden></p>${field('promoName','Nombre que verá el cliente','text','','required maxlength="120" placeholder="Por ejemplo: Gracias por volver"')}<div data-wizard-kind="STAMPS DISCOUNT">${field('group','Producto, servicio o categoría que cuenta','text','','required maxlength="60" list="promotionCategories" placeholder="' + esc((suggestions.productExamples || []).slice(0,3).join(', ') || 'Producto o servicio elegible') + '"')}<datalist id="promotionCategories">${[...new Set([...(suggestions.productExamples||[]),...state.data.programs.map(p=>p.config.productGroup).filter(Boolean)])].map(g=>`<option value="${esc(g)}">`).join('')}</datalist>${select('mode','Cómo cuenta cada sello',[['units','Una unidad pagada = un sello'],['visits','Una compra de esta categoría = un sello']])}<div class="row"><div>${field('nth','Número de la compra o unidad premiada','number',6,'required min="2" max="101" step="1"')}<small>Si eliges 6, acumula 5 sellos y canjea en la compra siguiente.</small></div><div>${field('percent','Descuento del premio (%)','number',100,'required min="0.01" max="100" step="0.01"')}<small>100% equivale a gratis para el alcance elegido.</small></div></div></div>
            <div data-wizard-kind="POINTS"><div class="row"><div>${field('unitAmount','Por cada monto pagado ('+esc(currency)+')','number',1,'data-money required min="0.01" max="10000000" step="any"')}</div><div>${field('pointsPerUnit','Puntos que gana','number',1,'required min="1" max="1000000" step="1"')}</div></div>${field('pointCost','Puntos necesarios para el premio','number',10,'required min="1" max="1000000000" step="1"')}</div>
            <div data-wizard-kind="CASHBACK">${field('cashback','Porcentaje que vuelve como saldo (%)','number',5,'required min="0.01" max="100" step="0.01"')}${field('cashbackCost','Saldo necesario para el premio ('+esc(currency)+')','number',5,'data-money required min="0.01" max="10000000" step="any"')}<p class="small">Es saldo promocional del negocio; no es una transferencia bancaria.</p></div><div data-wizard-kind="POINTS CASHBACK">${field('minimumAmount','Compra mínima que acumula ('+esc(currency)+')','number',1,'data-money required min="0.01" max="10000000" step="any"')}</div>${field('rewardName','Premio que recibirá','text','','required maxlength="120" placeholder="Describe con claridad qué vas a entregar"')}<aside class="promotion-explanation" id="templateExplanation" aria-live="polite"></aside><details><summary>Cuándo y dónde estará disponible</summary><div class="row"><div>${field('startsAt','Comienza (opcional)','datetime-local')}</div><div>${field('endsAt','Termina (opcional)','datetime-local')}</div></div><p class="small">Sin fechas: disponible desde ahora. Zona horaria ${esc(state.data.business.timezone)}.</p><fieldset><legend>Sucursales</legend><p class="small">Sin marcar: todas las sucursales actuales y futuras.</p>${state.data.branches.map(b=>`<label class="check"><input type="checkbox" name="promotionBranch" value="${esc(b.id)}">${esc(b.name)}</label>`).join('')}</fieldset></details></fieldset>
            <fieldset data-wizard-panel="2" hidden><legend>Así funcionará para tu cliente</legend><div id="promotionReview" class="promotion-review"></div><p class="small">La promoción y su premio se crean juntos. Puedes pausarlos o ajustar fechas, horarios y bonos después.</p></fieldset><div class="registration-actions"><button type="button" class="quiet" id="promotionBack" hidden>Volver</button><button type="submit" id="promotionNext">Continuar →</button></div></form><details class="promotion-advanced-link"><summary>Necesito configurar una regla avanzada</summary><p>Permite administrar acumulación y premios por separado, con horarios, días y bonos.</p><button type="button" class="quiet" id="advancedPromotion">Abrir editor avanzado</button></details></section>`;;
        const f=root.querySelector('#promotionTemplate'),busy=()=>f.getAttribute('aria-busy')==='true';
        const isStamps=()=>['STAMPS','DISCOUNT'].includes(method);
        const explanation=()=>{
            if(isStamps()){const n=Number(f.elements.nth.value),p=Number(f.elements.percent.value),units=f.elements.mode.value==='units';return `Acumula ${Math.max(0,n-1)} sellos con ${units?'unidades pagadas':'compras de esta categoría'}. Luego puede canjear ${p}% de descuento ${units?'en una unidad elegible (la de menor precio)':'en el total de los productos de esa categoría'}. La compra con canje no acumula en esta misma promoción.`;}
            if(method==='POINTS')return `Cada ${f.elements.unitAmount.value} ${currency} completos pagados acumula ${f.elements.pointsPerUnit.value} puntos. Con ${f.elements.pointCost.value} puntos puede solicitar el premio en caja. Compra mínima: ${f.elements.minimumAmount.value} ${currency}.`;
            return `Cada compra elegible devuelve ${f.elements.cashback.value}% como saldo promocional. Con ${f.elements.cashbackCost.value} ${currency} de saldo puede solicitar el premio en caja. Compra mínima: ${f.elements.minimumAmount.value} ${currency}.`;
        };
        const sync=()=>{
            root.querySelectorAll('[data-wizard-kind]').forEach(p=>{p.hidden=!p.dataset.wizardKind.split(' ').includes(method);p.querySelectorAll('input,select,button').forEach(n=>n.disabled=p.hidden);});
            root.querySelectorAll('[data-promotion-method]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.promotionMethod===method)));
            root.querySelector('#templateExplanation').textContent=explanation();
        };
        const show=()=>{
            root.querySelectorAll('[data-wizard-panel]').forEach(p=>p.hidden=Number(p.dataset.wizardPanel)!==step);
            root.querySelectorAll('[data-promotion-step]').forEach(p=>{p.classList.toggle('current',Number(p.dataset.promotionStep)===step);if(Number(p.dataset.promotionStep)===step)p.setAttribute('aria-current','step');else p.removeAttribute('aria-current');});
            root.querySelector('#promotionBack').hidden=step===0;root.querySelector('#promotionNext').textContent=step===2?'Crear promoción y premio':'Continuar →';
            if(step===2){const branches=[...f.querySelectorAll('[name=promotionBranch]:checked')].map(n=>state.data.branches.find(b=>b.id===n.value)?.name).filter(Boolean);root.querySelector('#promotionReview').innerHTML=`<span class="eyebrow">${esc(({STAMPS:'Sellos y premio',DISCOUNT:'Sellos y descuento',POINTS:'Puntos',CASHBACK:'Cashback'})[method])}</span><h3>${esc(f.elements.promoName.value)}</h3><p>${esc(explanation())}</p><div class="review-reward"><strong>Premio</strong><span>${esc(f.elements.rewardName.value)}</span></div><p>${isStamps()?'Categoría: '+esc(f.elements.group.value)+'<br>':''}Sucursales: ${esc(branches.join(', ')||'Todas las actuales y futuras')}<br>Inicio: ${esc(f.elements.startsAt.value||'Desde ahora')}<br>Fin: ${esc(f.elements.endsAt.value||'Sin fecha final')}</p>${!isStamps()?'<p class="small">El premio se entrega al confirmar un canje en caja; no aplica automáticamente un descuento a una compra.</p>':''}`;}
            root.querySelector(`[data-wizard-panel="${step}"] input,[data-wizard-panel="${step}"] button`)?.focus();
        };
        const validate=()=>{for(const n of f.querySelectorAll('[data-wizard-panel="1"] input,[data-wizard-panel="1"] select')){if(n.disabled)continue;if(n.type==='text')n.setCustomValidity(n.required&&!n.value.trim()?'Completa este dato para continuar.':'');if(!n.checkValidity()){step=1;show();const details=n.closest('details');if(details)details.open=true;n.reportValidity();return false;}}try{const start=utcDateTime(f.elements.startsAt.value),end=utcDateTime(f.elements.endsAt.value);if(start&&end&&end<=start)throw new Error('La fecha final debe ser posterior al inicio.');}catch(e){notice(e.message);step=1;show();return false;}return true;};
        root.querySelectorAll('[data-promotion-method]').forEach(b=>b.onclick=()=>{if(busy())return;const changed=method!==b.dataset.promotionMethod;method=b.dataset.promotionMethod;if(changed&&isStamps())f.elements.percent.value=method==='STAMPS'?100:20;sync();});
                f.addEventListener('input',e=>{if(step===1)draftTouched=true;if(e.target.type==='text')e.target.setCustomValidity('');sync();});f.addEventListener('change',()=>{if(step===1)draftTouched=true;sync();});;
        f.addEventListener('submit',e=>{if(busy()||step>0&&!validate()){e.preventDefault();e.stopImmediatePropagation();return;}if(step<2){e.preventDefault();e.stopImmediatePropagation();step++;show();}},true);
        root.querySelector('#promotionBack').onclick=()=>{if(!busy()){step--;show();}};
        root.querySelector('#backToPromotions').onclick=()=>{if(!busy())renderPrograms();};root.querySelector('#advancedPromotion').onclick=()=>{if(!busy())existingPrograms(null,true);};
                const applyExample=example=>{
            if(busy())return;
            method=example.method;
            const values={promoName:example.name,rewardName:example.rewardName,group:example.group||'',nth:example.nth||6,percent:(example.percentBps||10000)/100,mode:example.countUnits===false?'visits':'units',unitAmount:(example.unitMinor||100)/100,pointsPerUnit:example.pointsPerUnit||1,pointCost:example.cost||100,cashback:(example.cashbackBps||500)/100,cashbackCost:(example.cost||500)/100,minimumAmount:(example.minimumSpendMinor||100)/100};
            Object.entries(values).forEach(([name,value])=>{f.elements[name].value=value;f.elements[name].setCustomValidity('');});
            draftTouched=false;pendingExample=null;root.querySelector('#replaceExampleConfirm').hidden=true;
            const note=root.querySelector('#selectedBusinessExample');note.hidden=false;note.textContent='Ejemplo: '+example.name+'. Ajusta los valores y el premio a tu negocio.';
            step=1;sync();show();
        };
        root.querySelectorAll('[data-business-example]').forEach(button=>button.onclick=()=>{
            if(busy())return;const example=examples.find(e=>e.id===button.dataset.businessExample);if(!example)return;
            if(!draftTouched){applyExample(example);return;}
            pendingExample=example;root.querySelector('#replaceExampleText').textContent='Usar «'+example.name+'» reemplazará el nombre, las reglas y el premio de tu borrador. Se conservarán las fechas y sucursales que elegiste.';
            root.querySelector('#replaceExampleConfirm').hidden=false;root.querySelector('#keepExampleDraft').focus();
        });
        root.querySelector('#keepExampleDraft').onclick=()=>{pendingExample=null;root.querySelector('#replaceExampleConfirm').hidden=true;};
        root.querySelector('#replaceExampleDraft').onclick=()=>{if(pendingExample)applyExample(pendingExample);};;
        form('promotionTemplate',async(v,node)=>{
            const branchIds=[...node.querySelectorAll('[name=promotionBranch]:checked')].map(n=>n.value),window={startsAt:utcDateTime(v.startsAt),endsAt:utcDateTime(v.endsAt)};
            const payload=isStamps()?{name:v.promoName.trim(),group:v.group.trim(),nth:Number(v.nth),percentBps:Math.round(Number(v.percent)*100),countUnits:v.mode==='units',rewardName:v.rewardName.trim(),branchIds,window}:{program:{name:v.promoName.trim(),kind:method,unitMinor:method==='POINTS'?Math.round(Number(v.unitAmount)*100):100,pointsPerUnit:method==='POINTS'?Number(v.pointsPerUnit):1,cashbackBps:method==='CASHBACK'?Math.round(Number(v.cashback)*100):0,minimumSpendMinor:Math.round(Number(v.minimumAmount)*100),branchIds,window},rewardName:v.rewardName.trim(),rewardCost:method==='POINTS'?Number(v.pointCost):Math.round(Number(v.cashbackCost)*100)};
            await api(isStamps()?'/api/staff/promotion-templates':'/api/staff/promotion-setups',payload,'POST',operationKey(node,payload));await merchant();notice('Promoción y premio creados juntos.');
        });sync();show();
    };;;

    function enhanceCounterRewards() {
        const counter = document.querySelector('.customer-counter'), member = state.member;
        if (!counter || !member || counter.dataset.rewardsReady) return;
        counter.dataset.rewardsReady = 'true';
        const amount = (value, kind) => kind === 'CASHBACK'
            ? Math.trunc(value / 100) + '.' + String(value % 100).padStart(2, '0') + ' ' + state.data.business.currency
            : value + ' ' + (kind === 'STAMPS' ? (value === 1 ? 'sello' : 'sellos') : (value === 1 ? 'punto' : 'puntos'));
        // Only the member response defines visible rewards; the owner dashboard can include paused programs.
        const rewards = member.rewards.filter(r => r.active).map(r => {
            const program = state.data.programs.find(p => p.id === r.programId);
            const balance = member.balances.find(b => b.programId === r.programId);
            const kind = balance?.kind || program?.config.kind;
            const available = balance?.available ?? 0;
            const exact = Number.isSafeInteger(available) && available >= 0 && Number.isSafeInteger(r.cost) && r.cost > 0 && ['POINTS', 'STAMPS', 'CASHBACK'].includes(kind);
            return {reward: r, name: balance?.name || program?.config.name || 'Promoción', kind, available, exact, ready: exact && available >= r.cost};
        }).sort((a, b) => Number(b.ready) - Number(a.ready));
        if (!rewards.length) return;
        const ready = rewards.filter(r => r.ready).length;
        const section = document.createElement('section'); section.className = 'counter-rewards'; section.setAttribute('aria-labelledby', 'counterRewardsTitle');
        section.innerHTML = `<div class="counter-rewards-heading"><div><span class="eyebrow">Su próxima recompensa</span><h3 id="counterRewardsTitle">${ready ? ready + (ready === 1 ? ' opción con saldo suficiente' : ' opciones con saldo suficiente') : 'Cada visita lo acerca a un premio'}</h3></div><div class="counter-reward-filters" role="group" aria-label="Filtrar premios"><button type="button" data-reward-filter="all" aria-pressed="true">Todos (${rewards.length})</button><button type="button" data-reward-filter="ready" aria-pressed="false">Con saldo (${ready})</button></div></div><button type="button" class="quiet counter-jump" id="jumpToPurchase">Ir a la compra ↓</button><p class="small">El saldo de cada promoción se usa por separado. Sus premios son alternativas: elegir uno reduce el saldo para los demás. Caja verifica las condiciones al confirmar.</p><div class="counter-reward-grid"></div><button type="button" class="quiet" id="moreCounterRewards" hidden>Mostrar todos los premios</button><p id="counterRewardSelection" role="status" aria-live="polite"></p>`;
        counter.querySelector('.counter-modes').before(section);
        let filter = 'all', expanded = false;
        const draw = () => {
            const filtered = rewards.filter(r => filter === 'all' || r.ready), visible = expanded ? filtered : filtered.slice(0, 2);
            section.querySelector('.counter-reward-grid').innerHTML = visible.map(model => {
                const {reward: r, name, available, kind, ready, exact} = model;
                const remaining = Math.max(0, r.cost - available);
                const status = !exact ? 'Consulta el saldo exacto en caja' : ready ? 'Saldo suficiente' : `Falta${remaining === 1 && kind !== 'CASHBACK' ? '' : 'n'} ${amount(remaining, kind)}`;
                return `<article class="counter-reward-card ${ready ? 'is-ready' : ''}"><p class="counter-reward-program">${esc(name)}</p><h4>${esc(r.name)}</h4><span class="counter-reward-status">${esc(status)}</span>${exact ? `<progress max="${r.cost}" value="${Math.min(available, r.cost)}" aria-label="${esc('Progreso para ' + r.name)}"></progress><p class="counter-reward-balance">Saldo: <strong>${esc(amount(available, kind))}</strong><br>Canje: ${esc(amount(r.cost, kind))}</p>` : ''}<p class="counter-reward-conditions">${esc(r.benefitText || (r.benefit ? 'El descuento se calcula al revisar los productos de la compra.' : 'Se entrega tras confirmar el canje en caja.'))}</p>${ready ? `<p class="small">Si eliges este premio, el saldo queda en ${esc(amount(available - r.cost, kind))}.</p><button type="button" data-select-counter-reward="${esc(r.id)}">${r.benefit ? 'Aplicar en una compra' : 'Preparar canje'}</button>` : ''}</article>`;
            }).join('') || '<p class="empty-reward">Todavía no tiene saldo suficiente. En «Todos» puedes ver cuánto falta para cada premio.</p>';
            const more = section.querySelector('#moreCounterRewards'); more.hidden = filtered.length <= 2; more.textContent = expanded ? 'Mostrar menos' : `Mostrar los ${filtered.length} premios`;
            section.querySelectorAll('[data-reward-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rewardFilter === filter)));
            section.querySelectorAll('[data-select-counter-reward]').forEach(button => button.onclick = () => {
                if (counter.querySelector('form[aria-busy="true"]')) return;
                const model = rewards.find(r => r.reward.id === button.dataset.selectCounterReward);
                if (!model?.ready) return;
                const reward = model.reward;
                counter.querySelector(`[data-counter-mode="${reward.benefit ? 'purchase' : 'redemption'}"]`).click();
                if (reward.benefit && counter.querySelector('#purchase')) checkout(counter.querySelector('#purchase'), member);
                const target = counter.querySelector(reward.benefit ? '#productPurchase' : '#counterChoose');
                const choice = target?.elements[reward.benefit ? 'reward' : 'rewardId'];
                if (!choice || ![...choice.options].some(o => o.value === reward.id && !o.disabled)) return;
                choice.value = reward.id; choice.dispatchEvent(new Event('change', {bubbles: true}));
                section.querySelector('#counterRewardSelection').textContent = `Seleccionado: ${reward.name}. ${reward.benefit ? 'Revisa los productos y el descuento antes de guardar.' : 'Revisa el canje y confirma con el titular.'} Aún no se ha descontado saldo.`;
                target.scrollIntoView({behavior: 'smooth', block: 'start'}); choice.focus({preventScroll: true});
            });
        };
        section.querySelectorAll('[data-reward-filter]').forEach(button => button.onclick = () => {
            if (counter.querySelector('form[aria-busy="true"]')) return;
            filter = button.dataset.rewardFilter; expanded = false; draw();
        });
        section.querySelector('#jumpToPurchase').onclick = () => {
            if (counter.querySelector('form[aria-busy="true"]')) return;
            counter.querySelector('[data-counter-mode="purchase"]').click();
            const target = counter.querySelector('#counterPurchase'); target.scrollIntoView({behavior: 'smooth', block: 'start'});
            target.querySelector('[name=receipt]')?.focus({preventScroll: true});
        };
        section.querySelector('#moreCounterRewards').onclick = () => { if (!counter.querySelector('form[aria-busy="true"]')) { expanded = !expanded; draw(); } };
        draw();
    }

    function enhancePurchase() {
        const f = document.querySelector('#purchase'); if (!f || f.dataset.productsReady) return;
        f.dataset.productsReady = 'true';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = 'Registrar productos y aplicar un descuento'; f.prepend(button);
        button.onclick = () => checkout(f, state.member);
        if (state.data.programs.some(p => p.config.productGroup || p.config.countUnits)) checkout(f, state.member);
    }
    function checkout(old, member) {
        let rows = [{name: '', group: '', quantity: 1, unitMinor: 0}];
        const previousBranch = old.elements.branchId?.value, previousReceipt = old.elements.receipt?.value;
        old.closest('#counterPurchase')?.querySelector('#purchaseReview')?.remove();
        const panel = document.createElement('div'); old.replaceWith(panel);
        const rewards = member.rewards.filter(r => r.active && r.benefit && (member.balances.find(b => b.programId === r.programId)?.available || 0) >= r.cost);
        const categories = [...new Set(state.data.programs.map(p => p.config.productGroup).filter(Boolean))];
        let common = {branchId: previousBranch || state.data.branches[0]?.id || '', receipt: previousReceipt || '', reward: '', programs: selectedPurchasePrograms(old)};
        const readRows = f => [...f.querySelectorAll('[data-line]')].map(line => ({name: line.querySelector('[data-name]').value.trim(), group: line.querySelector('[data-group]').value.trim(), quantity: Number(line.querySelector('[data-quantity]').value), unitMinor: Math.round(Number(line.querySelector('[data-price]').value) * 100)}));
        const keep = f => { rows = readRows(f); common = {branchId: f.elements.branchId.value, receipt: f.elements.receipt.value, reward: f.elements.reward.value, programs: [...f.querySelectorAll('[name=program]:checked')].map(x => x.value)}; };
        const draw = () => {
            panel.innerHTML = `<form id="productPurchase"><label for="checkoutBranch">Sucursal</label><select id="checkoutBranch" name="branchId" required>${options(state.data.branches, common.branchId)}</select>${field('receipt', 'Comprobante único', 'text', common.receipt, 'required maxlength="100"')}<datalist id="productGroups">${categories.map(g => `<option value="${esc(g)}">`).join('')}</datalist>${rows.map((r, i) => `<fieldset data-line><legend>Producto ${i + 1}</legend><label>Producto o servicio<input data-name required maxlength="100" value="${esc(r.name)}"></label><label>Categoría<input data-group required list="productGroups" maxlength="60" value="${esc(r.group)}"></label><div class="row"><label>Cantidad<input data-quantity type="number" min="1" max="100" required value="${r.quantity}"></label>${field('linePrice' + i, 'Precio por unidad', 'number', r.unitMinor ? r.unitMinor / 100 : '', 'data-price data-money min="0.01" max="10000000" step="any" required')}</div>${rows.length > 1 ? `<button type="button" class="quiet" data-remove="${i}">Quitar producto</button>` : ''}</fieldset>`).join('')}<button type="button" class="quiet" id="addProduct" ${rows.length >= 30 ? 'disabled' : ''}>Añadir producto</button>${purchasePromotionSelection(common.programs)}${select('reward', 'Premio para aplicar en esta compra', [['', 'Sin canje'], ...rewards.map(r => [r.id, r.name])], common.reward)}<p id="purchaseRewardDetails" class="counter-selected-benefit" hidden></p><div id="purchaseConsent"><label class="check"><input name="verified" type="checkbox">Verifiqué al titular.</label><label class="check"><input name="confirmed" type="checkbox">El cliente pidió este premio y acepta usar el saldo de esta promoción.</label></div><div class="checkout-subtotal"><span>Subtotal</span><strong id="checkoutSubtotal"></strong><small>El descuento se calcula al revisar la compra.</small></div><button>Revisar total y descuento</button></form><div id="receiptReview"></div>`;
            const f = panel.querySelector('form'); let revision = 0;
            bindPurchasePromotionSelection(f);
            const consent = () => {
                const reward = rewards.find(r => r.id === f.elements.reward.value), enabled = Boolean(reward);
                panel.querySelector('#purchaseConsent').hidden = !enabled; f.elements.verified.required = f.elements.confirmed.required = enabled;
                const detail = panel.querySelector('#purchaseRewardDetails'); detail.hidden = !enabled;
                detail.textContent = reward?.benefitText || (enabled ? 'Revisa los productos elegibles antes de confirmar el descuento.' : '');
            };
            const subtotal = () => { const total = readRows(f).reduce((sum, x) => sum + x.quantity * x.unitMinor, 0); panel.querySelector('#checkoutSubtotal').textContent = Number.isFinite(total) && total >= 0 ? money(total) : 'Revisa cantidades y precios'; };
            f.addEventListener('input', subtotal); subtotal();
            consent(); f.elements.reward.onchange = () => { f.elements.verified.checked = f.elements.confirmed.checked = false; consent(); };
            f.addEventListener('input', () => { revision++; panel.querySelector('#receiptReview').replaceChildren(); });
            f.addEventListener('change', () => { revision++; panel.querySelector('#receiptReview').replaceChildren(); });
            panel.querySelector('#addProduct').onclick = () => { keep(f); rows.push({name: '', group: '', quantity: 1, unitMinor: 0}); draw(); };
            panel.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { keep(f); rows.splice(Number(b.dataset.remove), 1); draw(); });
            form('productPurchase', async (v, node) => {
                const ticket = revision; const items = readRows(node); const reward = rewards.find(r => r.id === v.reward);
                const payload = {memberId: member.member.id, branchId: v.branchId, receipt: v.receipt, currency: state.data.business.currency, amountMinor: items.reduce((s, x) => s + x.quantity * x.unitMinor, 0), items, programIds: selectedPurchasePrograms(node), rewardId: reward?.id || null, expectedRevision: member.member.revision, expectedRewardVersion: reward?.version || null, identityVerified: v.verified === 'on', customerConfirmed: v.confirmed === 'on'};
                const quote = await api('/api/staff/purchases/quote', payload);
                if (ticket !== revision || !node.isConnected) return;
                payload.amountMinor = quote.amountMinor;
                const review = panel.querySelector('#receiptReview');
                review.innerHTML = `<section class="panel"><h3>Confirmar compra</h3><p>Productos: ${money(quote.grossMinor)}<br>Descuento: ${money(quote.discountMinor)}<br><strong>Total pagado: ${money(quote.amountMinor)}</strong></p>${quote.rewardName ? `<p>Premio: ${esc(quote.rewardName)}</p>` : ''}${purchasePromotionReview(payload.programIds)}<p>Confirma cuando el cobro o la entrega estén realizados en caja.</p><form id="finishPurchase"><button>${payload.rewardId ? 'Guardar compra y canje' : 'Guardar compra'}</button></form></section>`;
                form('finishPurchase', async (_, confirm) => {
                    if (ticket !== revision) throw new Error('La compra cambió. Revisa el total otra vez.');
                    const result = await api('/api/staff/purchases', payload, 'POST', operationKey(node, payload));
                    counterReceipt(result.replayed ? 'Esta compra ya estaba registrada' : 'Compra guardada', `<p>${esc(member.member.name)}</p><p>Total: <strong>${money(result.amountMinor)}</strong> · Descuento: ${money(result.discountMinor)}</p>${purchaseEarningsReceipt(result.earned, payload.programIds)}<p>${result.redemptionId ? 'El premio quedó canjeado en el mismo comprobante. No lo entregues otra vez.' : 'La tarjeta se actualizará con esta compra.'}</p><p class="small">Recibo: ${esc(result.purchaseId)}</p>`); notice('Comprobante guardado.');
                });
            });
        };
        draw();
    }

        function walletColorContrast(a, b) {
        const luminance = hex => {
            const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
                .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const x = luminance(a), y = luminance(b);
        return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
    }

    async function designPage() {
        const root = document.querySelector('#content'); const data = await api('/api/staff/wallet-design');
        if (!root.isConnected || state.tab !== 'design') return;
                const presets = [
    {
        "id": "navy",
        "name": "Navy",
        "group": "General",
        "background": "#0b1f3a",
        "foreground": "#ffffff",
        "label": "#b8d8ff",
        "symbol": "★",
        "terms": "todos profesional"
    },
    {
        "id": "coffee",
        "name": "Café",
        "group": "Comida y bebidas",
        "background": "#34241f",
        "foreground": "#fff8ed",
        "label": "#e8bc82",
        "symbol": "☕",
        "terms": "cafeteria bebidas"
    },
    {
        "id": "pizza",
        "name": "Pizzería",
        "group": "Comida y bebidas",
        "background": "#702c28",
        "foreground": "#fff9ed",
        "label": "#f5d391",
        "symbol": "🍕",
        "terms": "pizza restaurante"
    },
    {
        "id": "barber",
        "name": "Barbería",
        "group": "Belleza y bienestar",
        "background": "#202936",
        "foreground": "#ffffff",
        "label": "#bdcedd",
        "symbol": "✂",
        "terms": "corte cabello"
    },
    {
        "id": "shop",
        "name": "Boutique",
        "group": "Moda y compras",
        "background": "#f2e9da",
        "foreground": "#202c40",
        "label": "#425a76",
        "symbol": "🛍",
        "terms": "ropa moda"
    },
    {
        "id": "restaurant",
        "name": "Restaurante",
        "group": "Comida y bebidas",
        "background": "#193f38",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🍴",
        "terms": "comida almuerzo cena"
    },
    {
        "id": "pet",
        "name": "Veterinaria y mascotas",
        "group": "Mascotas",
        "background": "#23566a",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🐾",
        "terms": "perro gato animales pet shop"
    },
    {
        "id": "auto",
        "name": "Taller automotriz",
        "group": "Autos y servicios",
        "background": "#283c50",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🔧",
        "terms": "mecanica aceite mantenimiento"
    },
    {
        "id": "burger",
        "name": "Hamburguesería",
        "group": "Comida y bebidas",
        "background": "#792c20",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🍔",
        "terms": "hamburguesa comida rapida"
    },
    {
        "id": "bakery",
        "name": "Panadería",
        "group": "Comida y bebidas",
        "background": "#614626",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🥐",
        "terms": "pan croissant"
    },
    {
        "id": "cake",
        "name": "Pastelería",
        "group": "Comida y bebidas",
        "background": "#6c304c",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🎂",
        "terms": "torta pastel reposteria"
    },
    {
        "id": "icecream",
        "name": "Heladería",
        "group": "Comida y bebidas",
        "background": "#e3f0e8",
        "foreground": "#0b1f3a",
        "label": "#0b1f3a",
        "symbol": "🍦",
        "terms": "helado postre yogurt"
    },
    {
        "id": "grocery",
        "name": "Supermercado",
        "group": "Comida y bebidas",
        "background": "#244c35",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🛒",
        "terms": "mercado minimarket viveres tienda"
    },
    {
        "id": "florist",
        "name": "Florería",
        "group": "Moda y compras",
        "background": "#f1e3ec",
        "foreground": "#0b1f3a",
        "label": "#0b1f3a",
        "symbol": "🌸",
        "terms": "flor ramo flores"
    },
    {
        "id": "gym",
        "name": "Gimnasio",
        "group": "Belleza y bienestar",
        "background": "#153f43",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🏋",
        "terms": "fitness deporte entrenamiento"
    },
    {
        "id": "phone",
        "name": "Telefonía",
        "group": "Hogar y tecnología",
        "background": "#183765",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "📱",
        "terms": "celular telefono accesorios"
    },
    {
        "id": "electronics",
        "name": "Electrónica",
        "group": "Hogar y tecnología",
        "background": "#202b53",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "◆",
        "terms": "electrodomesticos computadora tecnologia"
    },
    {
        "id": "audio",
        "name": "Música y audio",
        "group": "Hogar y tecnología",
        "background": "#41355f",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🎧",
        "terms": "audifonos instrumentos sonido"
    },
    {
        "id": "tires",
        "name": "Llantas y lubricantes",
        "group": "Autos y servicios",
        "background": "#30353e",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🛞",
        "terms": "neumaticos aceite"
    },
    {
        "id": "laundry",
        "name": "Lavandería",
        "group": "Autos y servicios",
        "background": "#e2edf5",
        "foreground": "#0b1f3a",
        "label": "#0b1f3a",
        "symbol": "🧺",
        "terms": "lavado ropa tintoreria"
    },
    {
        "id": "books",
        "name": "Librería y papelería",
        "group": "Moda y compras",
        "background": "#4b3930",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "📚",
        "terms": "libro cuaderno utiles"
    },
    {
        "id": "dental",
        "name": "Clínica dental",
        "group": "Belleza y bienestar",
        "background": "#dfeeee",
        "foreground": "#0b1f3a",
        "label": "#0b1f3a",
        "symbol": "🦷",
        "terms": "dentista odontologia"
    },
    {
        "id": "spa",
        "name": "Spa y bienestar",
        "group": "Belleza y bienestar",
        "background": "#364b43",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🌿",
        "terms": "masaje relajacion"
    },
    {
        "id": "gifts",
        "name": "Regalos",
        "group": "Moda y compras",
        "background": "#5e3057",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🎁",
        "terms": "detalles juguetes"
    },
    {
        "id": "home",
        "name": "Hogar y muebles",
        "group": "Hogar y tecnología",
        "background": "#eae5de",
        "foreground": "#0b1f3a",
        "label": "#0b1f3a",
        "symbol": "🏠",
        "terms": "decoracion muebleria"
    },
    {
        "id": "optics",
        "name": "Óptica",
        "group": "Belleza y bienestar",
        "background": "#2f4352",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "👓",
        "terms": "lentes gafas"
    },
    {
        "id": "hotel",
        "name": "Hotel y alojamiento",
        "group": "Autos y servicios",
        "background": "#1e3646",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🔑",
        "terms": "hostal hospedaje turismo"
    },
    {
        "id": "hardware",
        "name": "Ferretería",
        "group": "Hogar y tecnología",
        "background": "#4c3d27",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "🔨",
        "terms": "herramientas construccion"
    },
    {
        "id": "fuel",
        "name": "Estación de servicio",
        "group": "Autos y servicios",
        "background": "#273a3d",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "⛽",
        "terms": "gasolinera combustible lavado auto"
    },
    {
        "id": "shoes",
        "name": "Calzado",
        "group": "Moda y compras",
        "background": "#3f3334",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "👟",
        "terms": "zapatos zapatillas"
    },
    {
        "id": "jewelry",
        "name": "Joyería",
        "group": "Moda y compras",
        "background": "#182f35",
        "foreground": "#ffffff",
        "label": "#ffffff",
        "symbol": "◆",
        "terms": "relojes joyas accesorios"
    },
    {
        "id": "salon",
        "name": "Salón de belleza",
        "group": "Belleza y bienestar",
        "background": "#efdfe5",
        "foreground": "#0b1f3a",
        "label": "#0b1f3a",
        "symbol": "♥",
        "terms": "peluqueria estetica unas manicure"
    }
];
        const stampOptions = [["●", "● Círculo"], ["★", "★ Estrella"], ["♥", "♥ Corazón"], ["✂", "✂ Barbería"], ["◆", "◆ Diamante"], ["☕", "☕ Café"], ["🍕", "🍕 Pizza"], ["🛍", "🛍 Compras"], ["👟", "👟 Calzado"], ["🔧", "🔧 Taller"], ["🍔", "🍔 Hamburguesa"], ["🥐", "🥐 Panadería"], ["🍦", "🍦 Helado"], ["🛒", "🛒 Supermercado"], ["🎂", "🎂 Pastel"], ["🐾", "🐾 Mascotas"], ["🌸", "🌸 Flores"], ["🏋", "🏋 Gimnasio"], ["📱", "📱 Telefonía"], ["🎧", "🎧 Audio"], ["🚗", "🚗 Auto"], ["🛞", "🛞 Llantas"], ["🧺", "🧺 Lavandería"], ["📚", "📚 Libros"], ["🦷", "🦷 Dental"], ["🌿", "🌿 Bienestar"], ["🎁", "🎁 Regalo"], ["🏠", "🏠 Hogar"], ["👓", "👓 Óptica"], ["🔑", "🔑 Hotel"], ["🔨", "🔨 Ferretería"], ["⛽", "⛽ Combustible"], ["🍴", "🍴 Restaurante"]];
;
        const compositions = [
            ['EDITORIAL','Editorial','Arte grande y asimétrico; el premio encabeza la tarjeta.'],
            ['STAMPBOOK','Libreta','Hojas, encuadernación y una colección de sellos.'],
            ['TICKET','Cupón','Talón lateral, perforaciones y avance en un bloque propio.'],
            ['MOSAIC','Mosaico','Piezas geométricas y espacios divididos.'],
            ['RIBBON','Cintas','Bandas entrelazadas, movimiento diagonal y premio destacado.'],
            ['PATH','Recorrido','Una ruta hacia la meta y avance como protagonista.'],
            ['SIGNATURE','Medallón original','Conserva la composición de tus tarjetas anteriores.']
        ];
        const d = data.design; let logo = d.logoPng, saving = false, loadingLogo = false, logoRevision = 0, example = 'progress', previewProvider = 'apple', appleLayout = 'poster';
                root.innerHTML = `<section class="panel wallet-design-panel"><h2>Personaliza tu tarjeta</h2><p>Tu marca, una meta clara y el próximo premio. Personaliza ambas Wallet desde aquí.</p><div class="wallet-design-layout"><form id="walletDesign"><fieldset id="designFields">
            ${field('displayName', 'Nombre en la tarjeta', 'text', d.displayName, 'maxlength="80"')}
            <h3 class="design-colors-heading">1. Elige la composición</h3>
            <p class="design-help">Seis diseños nuevos con estructuras propias. Las miniaturas usan el mismo azul y símbolo para que compares la composición. El medallón anterior sigue disponible.</p>
            <input type="hidden" id="composition" name="composition" value="${esc(d.composition || 'SIGNATURE')}">
            <div class="wallet-compositions" role="group" aria-label="Composición de la tarjeta">${compositions.map(([id,name,description],i) => `<button type="button" data-composition="${id}" aria-pressed="false"><img loading="lazy" width="516" height="406" src="/wallet/art/v29/${id}/GRADIENT/5/0b1f3a/50/100.png" alt=""><span class="composition-caption"><small>${i < 6 ? 'DISEÑO '+String(i+1).padStart(2,'0') : 'ANTERIOR'}</small><strong>${name}</strong><span>${description}</span></span><span class="composition-check" aria-hidden="true">✓</span></button>`).join('')}</div>
            <p id="compositionStatus" class="design-help" aria-live="polite"></p>
            <h3 class="design-colors-heading">2. Colores y símbolo de tu negocio</h3><p class="design-help">Estas 32 paletas cambian colores y símbolo. La composición que elegiste se conserva. Todo se guarda al pulsar Guardar diseño.</p><div class="wallet-style-search"><label for="walletStyleSearch">Busca tu tipo de negocio<input id="walletStyleSearch" type="search" placeholder="Ej. zapatos, mascotas, pasteles…" maxlength="60" autocomplete="off"></label><label for="walletStyleGroup">Categoría<select id="walletStyleGroup"><option value="">Todas las categorías</option>${[...new Set(presets.map(p => p.group))].map(group => `<option value="${group}">${group}</option>`).join('')}</select></label></div><p id="walletStyleResults" class="design-help" aria-live="polite"></p><div class="wallet-style-presets" role="group" aria-label="Paletas por tipo de negocio">${presets.map(p => `<button type="button" data-wallet-style="${p.id}" aria-pressed="false"><span class="wallet-style-swatch" style="--swatch:${p.background};--swatch-ink:${p.foreground}" aria-hidden="true"><span>${p.symbol}</span></span><strong>${p.name}</strong><small>${p.group}</small></button>`).join('')}</div><button type="button" class="quiet" id="walletStylesMore" aria-expanded="false">Ver todas las paletas</button><p id="presetStatus" class="design-help" aria-live="polite"></p><h3 class="design-colors-heading">Colores</h3>
            ${field('background', 'Color de fondo', 'color', d.background, 'aria-describedby="backgroundHelp"')}
            <p id="backgroundHelp" class="design-help">Puedes usar cualquier fondo. El texto y las etiquetas deben distinguirse sobre él.</p>
            <label class="check"><input id="autoContrast" type="checkbox" checked>Ajustar texto y etiquetas al cambiar el fondo</label>
            <p class="design-help">El fondo se aplica a ambas Wallet. Apple usa estos colores de texto y etiquetas; Google elige los suyos. Puedes corregir los colores automáticamente o elegirlos abajo.</p>
            <div class="design-color-fields"><div>${field('foreground', 'Color del texto', 'color', d.foreground, 'aria-describedby="foregroundStatus"')}<p id="foregroundStatus" class="design-color-status"></p></div><div>${field('label', 'Color de las etiquetas', 'color', d.label, 'aria-describedby="labelStatus"')}<p id="labelStatus" class="design-color-status"></p></div></div>
            <div class="design-feedback" aria-live="polite" aria-atomic="true"><p id="contrastStatus"></p><p id="contrastAdjustment" class="design-help"></p></div>
            <button type="button" class="quiet" id="fixContrast">Corregir colores</button>
            <label>Logo PNG o JPG<input id="designLogo" type="file" accept="image/png,image/jpeg"></label><p id="logoStatus">${logo ? 'Logo personalizado guardado.' : 'Se usa el logo predeterminado.'}</p><button type="button" class="quiet" id="removeLogo">Usar logo predeterminado</button>
            ${select('featuredProgramId', 'Promoción destacada en Wallet', [['', 'Primera promoción activa'], ...state.data.programs.filter(p => p.config.active !== false).map(p => [p.id, p.config.name])], d.featuredProgramId || '')}<p class="design-help">Apple y Google destacarán esta promoción y su premio de menor costo. Los demás saldos y premios siguen disponibles en los detalles de la tarjeta.</p>
            ${select('stampSymbol', 'Símbolo de tu negocio', stampOptions, d.stampSymbol)}
            ${select('artworkStyle', 'Acabado de la ilustración', [['GRADIENT','Cálido · luz y profundidad'],['AURORA','Aurora · reflejos fríos'],['SOLID','Plano · sin degradados']], d.artworkStyle || 'GRADIENT')}
            <p class="design-help">Cada composición representa el avance de forma propia. Hasta 20 sellos se muestran por unidad; puntos, cashback y metas mayores se representan proporcionalmente. El saldo exacto siempre aparece en texto. La tipografía de los campos la controla cada Wallet.</p>
            ${field('welcome', 'Texto de bienvenida', 'text', d.welcome, 'required maxlength="80"')}
            ${field('usage', 'Cómo usar la tarjeta', 'text', d.usage, 'required maxlength="350"')}
            <p class="design-help">Configura títulos, mensajes y felicitaciones automáticas desde Eventos y cumpleaños.</p>
            </fieldset><p id="designSaveHint" class="design-help" aria-live="polite"></p><p id="designSaveError" class="design-error" role="alert" hidden></p><button id="saveDesign" type="submit" aria-describedby="designSaveHint">Guardar diseño</button></form>
            <aside class="design-preview-wrap"><h3>Vista previa de tus Wallet</h3><p class="design-help">Promociones reales, saldos ficticios. Cada Wallet decide la distribución final.</p><div class="wallet-preview-platforms" role="group" aria-label="Wallet de la vista previa"><button type="button" data-preview-provider="apple">Apple Wallet</button><button type="button" data-preview-provider="google">Google Wallet</button></div><p id="previewPlatformHint" class="design-help"></p><div class="wallet-apple-layouts" role="group" aria-label="Formato de Apple"><button type="button" data-apple-layout="poster">Póster · iOS 27+</button><button type="button" data-apple-layout="classic">Clásica · versiones anteriores</button></div>
            <div class="wallet-preview-modes" role="group" aria-label="Estado de ejemplo de la tarjeta"><button type="button" data-wallet-example="new">Nueva</button><button type="button" data-wallet-example="half">A mitad</button><button type="button" data-wallet-example="progress" class="active">Cerca del premio</button><button type="button" data-wallet-example="ready">Con premio</button><button type="button" data-wallet-example="paused">Pausada</button></div>
            <div id="designPreview" class="design-preview signature-poster"><div class="signature-brand-row"><div class="design-preview-brand"><img id="previewLogo" alt="" hidden><strong id="previewName"></strong></div><div class="apple-preview-fields"><div class="wallet-preview-status"><span id="previewStatusLabel" class="design-preview-label"></span><strong id="previewStatus"></strong></div><div class="wallet-preview-balance"><span id="previewProgram" class="design-preview-label"></span><span id="previewWelcome" class="design-preview-hero"></span></div></div></div><img id="appleStampArtwork" class="stamp-artwork apple-stamp-artwork" alt=""><div class="wallet-preview-code" aria-hidden="true"><span>QR personal</span></div><div class="signature-copy"><div class="wallet-native-journey" id="appleJourney" hidden><span id="appleJourneyLabel"></span><strong id="appleJourneyValue"></strong></div><div id="previewPrizeWrap"><span id="previewPrizeLabel" class="design-preview-label"></span><strong id="previewPrize"></strong></div></div><div class="signature-member"><span class="design-preview-label">TITULAR</span><span>Cliente de ejemplo</span></div></div>
            <div id="googleDesignPreview" class="google-design-preview" hidden><div class="google-preview-brand"><img id="googlePreviewLogo" alt="" hidden><strong id="googlePreviewName"></strong></div><p class="google-preview-member">Cliente de ejemplo</p><div class="google-preview-values"><div><span id="googlePreviewMainLabel"></span><strong id="googlePreviewMain"></strong></div><div><span id="googlePreviewStatusLabel"></span><strong id="googlePreviewStatus"></strong></div></div><div class="google-preview-headline"><span id="googlePreviewRewardLabel"></span><strong id="googlePreviewReward"></strong></div><div class="wallet-native-journey" id="googleJourney" hidden><span id="googleJourneyLabel"></span><strong id="googleJourneyValue"></strong></div><img id="googleStampArtwork" class="stamp-artwork google-stamp-artwork" alt=""><div class="wallet-preview-code" aria-hidden="true"><span>QR personal</span></div></div><div class="wallet-preview-detail" aria-live="polite"><strong id="previewRewardName"></strong><p id="previewRewardConditions" hidden></p><p id="previewRewardDetail"></p><p id="previewStamps"></p><div id="walletProgressLegend" class="wallet-progress-legend" hidden><span><i class="earned" aria-hidden="true"></i>Acumulado</span><span><i aria-hidden="true"></i>Pendiente</span><span id="walletProgressNext"></span></div></div><details class="wallet-preview-more"><summary>Qué verá en los detalles</summary><ol><li>Premio destacado, condiciones y saldo disponible.</li><li>Saldos de cada promoción, sin mezclarlos.</li><li>Últimos consumos y canjes con fecha y sucursal.</li><li>Otros premios, novedades e instrucciones.</li></ol><p>Las promociones pausadas o eliminadas dejan de ofrecerse. Los movimientos ya realizados permanecen en el historial.</p></details><p class="design-help">Esta vista no registra compras ni entrega premios. Al guardar, se enviará el diseño a las tarjetas existentes; la recepción depende de la conexión y de Wallet.</p></aside></div></section>`;
;
                const f = root.querySelector('#walletDesign'), fields = root.querySelector('#designFields');
        let showAllStyles = false;
        const styleSearch = root.querySelector('#walletStyleSearch'), styleGroup = root.querySelector('#walletStyleGroup');
        const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        function filterStyles() {
            const terms = normalize(styleSearch.value.trim()).split(/\s+/).filter(Boolean);
            const matching = presets.filter(p => (!styleGroup.value || p.group === styleGroup.value) && terms.every(term => normalize(p.name + ' ' + p.group + ' ' + p.terms).includes(term)));
            const filtered = !!terms.length || !!styleGroup.value;
            const visible = showAllStyles || filtered ? matching : matching.slice(0, 8);
            root.querySelectorAll('[data-wallet-style]').forEach(button => { button.hidden = !visible.some(p => p.id === button.dataset.walletStyle); });
            root.querySelector('#walletStyleResults').textContent = matching.length ? `${visible.length} de ${matching.length} paletas. Todas se pueden personalizar.` : 'No encontramos esa paleta. Prueba otra palabra o adapta Navy a tu marca.';
            const more = root.querySelector('#walletStylesMore'); more.hidden = filtered || matching.length <= 8;
            more.textContent = showAllStyles ? 'Ver menos paletas' : `Ver las ${presets.length} paletas`;
            more.setAttribute('aria-expanded', String(showAllStyles));
        }
        styleSearch.addEventListener('input', filterStyles); styleGroup.addEventListener('change', filterStyles);
        root.querySelector('#walletStylesMore').onclick = () => { showAllStyles = !showAllStyles; filterStyles(); };
        filterStyles();;
        const background = f.elements.background, foreground = f.elements.foreground, labels = f.elements.label;
        const auto = root.querySelector('#autoContrast'), save = root.querySelector('#saveDesign'), fix = root.querySelector('#fixContrast');
        const status = root.querySelector('#contrastStatus'), adjustment = root.querySelector('#contrastAdjustment');
        const error = root.querySelector('#designSaveError'), preview = root.querySelector('#designPreview');
        const googlePreview = root.querySelector('#googleDesignPreview');
        const googleParts = {
            values: googlePreview.querySelector('.google-preview-values'),
            main: root.querySelector('#googlePreviewMain').parentElement,
            status: root.querySelector('#googlePreviewStatus').parentElement,
            headline: root.querySelector('#googlePreviewReward').parentElement,
            journey: root.querySelector('#googleJourney'), hero: root.querySelector('#googleStampArtwork')
        };
        const specs = [{input: foreground, name: 'Texto', field: 'Color del texto', min: 4.5}, {input: labels, name: 'Etiquetas', field: 'Color de las etiquetas', min: 3}];
        const invalidColors = () => specs.filter(s => walletColorContrast(background.value, s.input.value) < s.min);
        const recommended = () => walletColorContrast(background.value, '#000000') >= walletColorContrast(background.value, '#ffffff') ? '#000000' : '#ffffff';
        const clearError = () => { error.hidden = true; error.textContent = ''; };
        function correctColors() {
            const failed = invalidColors(), color = recommended();
            failed.forEach(s => { s.input.value = color; });
            adjustment.textContent = failed.length ? `${failed.map(s => s.name).join(' y ')}: ajustado a ${color === '#000000' ? 'negro' : 'blanco'} para conservar tu fondo. Revisa la vista previa antes de guardar.` : '';
        }
        function update() {
            const failed = invalidColors();
            for (const s of specs) {
                const valid = !failed.includes(s), hint = root.querySelector('#' + s.input.name + 'Status');
                s.input.setAttribute('aria-invalid', String(!valid));
                s.input.setCustomValidity(valid ? '' : `${s.field} no se distingue sobre el fondo. Pulsa «Corregir colores».`);
                hint.textContent = valid ? `${s.name}: se lee bien.` : `${s.name}: no se distingue. Prueba ${recommended() === '#000000' ? 'negro' : 'blanco'} o pulsa «Corregir colores».`;
                hint.classList.toggle('design-error', !valid);
            }
            status.textContent = failed.length ? `Falta corregir: ${failed.map(s => s.field.toLowerCase()).join(' y ')}. Puedes conservar el fondo elegido.` : 'Esta combinación se lee bien. Puedes guardar el diseño.';
            status.parentElement.classList.toggle('design-feedback-error', !!failed.length);
            fix.disabled = saving || loadingLogo || !failed.length;
            save.disabled = saving || loadingLogo || !!failed.length;
            save.textContent = saving ? 'Guardando…' : 'Guardar diseño';
            root.querySelector('#designSaveHint').textContent = saving ? 'Guardando el diseño…' : loadingLogo ? 'Espera a que termine de preparar el logo.' : failed.length ? 'Guardar está desactivado. Pulsa «Corregir colores» o cambia los campos indicados.' : 'Listo para guardar. La tarjeta conservará su QR y sus saldos.';
            preview.style.backgroundColor = background.value; preview.style.color = foreground.value;
            preview.style.setProperty('--preview-label', labels.value);
            root.querySelector('#previewName').textContent = f.elements.displayName.value.trim() || state.data.business.name;
            const activePrograms = state.data.programs.filter(p => p.config.active !== false);
            const program = activePrograms.find(p => p.id === f.elements.featuredProgramId.value) || activePrograms[0];
            const reward = program && state.data.rewards.filter(r => r.active && r.programId === program.id && r.cost > 0).sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0];
            const kind = program?.config.kind;
            const amount = !program || example === 'new' ? 0 : reward ? (example === 'ready' ? reward.cost : example === 'half' ? Math.floor(reward.cost / 2) : Math.max(0, reward.cost - 1)) : kind === 'CASHBACK' ? 500 : kind === 'STAMPS' ? 3 : 100;;
            const unit = n => kind === 'CASHBACK' ? money(n) : `${n} ${kind === 'STAMPS' ? (n === 1 ? 'sello' : 'sellos') : (n === 1 ? 'punto' : 'puntos')}`;
            const remaining = reward ? Math.max(0, reward.cost - amount) : null;
            const paused = example === 'paused';
            root.querySelector('#previewWelcome').textContent = !program ? f.elements.welcome.value || 'Bienvenido' : reward && kind === 'STAMPS' && remaining > 0 ? `${amount} / ${reward.cost}` : unit(amount);
            root.querySelector('#previewProgram').textContent = reward && !paused ? (kind === 'STAMPS' ? 'SELLOS' : kind === 'POINTS' ? 'PUNTOS' : 'SALDO') : program?.config.name || 'Tu tarjeta';
            root.querySelector('#previewStatusLabel').textContent = paused || !reward ? 'MEMBRESÍA' : remaining === 0 ? 'PREMIO' : remaining === 1 && kind !== 'CASHBACK' ? 'TE FALTA' : 'TE FALTAN';
            root.querySelector('#previewStatus').textContent = paused ? 'Pausada' : !reward ? 'Activa' : remaining === 0 ? 'Disponible' : unit(remaining);
            root.querySelector('#previewPrizeWrap').hidden = !reward;
            root.querySelector('#previewPrizeLabel').textContent = paused ? 'PREMIO PAUSADO' : remaining === 0 ? 'CANJEA EN CAJA' : 'PRÓXIMO PREMIO';
            const compactPrize = [...(reward?.name || '').trim().replace(/\s+/g, ' ')];
            root.querySelector('#previewPrize').textContent = compactPrize.length > 28 ? compactPrize.slice(0, 27).join('') + '…' : compactPrize.join('');
            const conditions = root.querySelector('#previewRewardConditions'); conditions.hidden = !reward?.benefitText; conditions.textContent = reward?.benefitText || '';
            root.querySelector('#previewRewardName').textContent = reward ? `${paused ? 'Premio pausado' : remaining === 0 ? 'Premio disponible' : 'Próximo premio'} · ${reward.name}` : 'Tu tarjeta, a tu medida';
            root.querySelector('#previewRewardDetail').textContent = paused ? 'Operaciones pausadas. Tus saldos se conservan; los canjes vuelven a estar disponibles cuando se reactive el negocio.' : reward ? `Saldo de ejemplo: ${unit(amount)}. Canje: ${unit(reward.cost)}. ${remaining === 0 ? `Si canjea este premio, le quedan ${unit(amount - reward.cost)}. Caja confirma el saldo vigente.` : `Te falta${remaining === 1 && kind !== 'CASHBACK' ? '' : 'n'} ${unit(remaining)}.`}` : program ? 'Esta promoción aún no tiene un premio activo. Puedes crearlo en Premios.' : 'Al activar una promoción, aparecerá su saldo. Hasta entonces se muestra tu bienvenida.';
            const artworkGoal = !paused && reward ? reward.cost : 0;
            const individual = kind === 'STAMPS' && artworkGoal <= 20;
            const artworkTotal = !artworkGoal ? 0 : individual ? artworkGoal : 100;
            const artworkFilled = !artworkGoal ? 0 : individual ? Math.min(amount, artworkGoal) : Math.floor(Math.min(amount, artworkGoal) * 100 / artworkGoal);
            const symbol = stampOptions.findIndex(option => option[0] === f.elements.stampSymbol.value);;
            const artworkPath = `/wallet/art/v29/${f.elements.composition.value}/${f.elements.artworkStyle.value}/${Math.max(0, symbol)}/${background.value.slice(1)}/${artworkFilled}/${artworkTotal}.png`;;
            for (const [id, suffix] of [['appleStampArtwork', appleLayout === 'poster' ? '?layout=poster' : '?layout=apple'], ['googleStampArtwork', '']]) {
                const art = root.querySelector('#' + id); art.hidden = false;
                { art.src = artworkPath + suffix; art.alt = artworkGoal ? `Ejemplo: ${unit(amount)} de ${unit(artworkGoal)}. Caja confirma el canje.` : 'Diseño sin meta activa.'; }
                art.onerror = () => { if (f.isConnected) { root.querySelector('#compositionStatus').textContent = 'No se pudo cargar la ilustración. Revisa la conexión del servidor antes de guardar.'; } };
            }
                        preview.classList.toggle('with-stamp-artwork', !!artworkGoal);
            const composition = f.elements.composition.value;
            preview.dataset.composition = composition; googlePreview.dataset.composition = composition;
            const selection = compositions.find(c => c[0] === composition);
            root.querySelector('#compositionStatus').textContent = selection ? `${selection[1]}: ${selection[2]} Cambiar la composición conserva tus colores, logo y promoción.` : '';
            root.querySelectorAll('button[data-composition]').forEach(button => { button.setAttribute('aria-pressed',String(button.dataset.composition === composition)); button.disabled = saving || loadingLogo; });
            const rewardFirst = ['EDITORIAL','TICKET','RIBBON'].includes(composition);
            const appleCopy = preview.querySelector('.signature-copy');
            if(rewardFirst) appleCopy.append(root.querySelector('#previewPrizeWrap'), root.querySelector('#appleJourney'));
            else appleCopy.append(root.querySelector('#appleJourney'), root.querySelector('#previewPrizeWrap'));
            preview.classList.toggle('signature-poster' , appleLayout === 'poster');
            preview.classList.toggle('signature-classic', appleLayout === 'classic');
            root.querySelector('.wallet-apple-layouts').hidden = previewProvider !== 'apple';
            root.querySelectorAll('[data-apple-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.appleLayout === appleLayout)));
            preview.querySelector('.wallet-preview-status').hidden = !!artworkGoal;
            const nativeBalance = preview.querySelector('.wallet-preview-balance');
            if (artworkGoal) preview.querySelector('.apple-preview-fields').append(nativeBalance);
            else preview.querySelector('.signature-copy').prepend(nativeBalance);
            preview.querySelector('.signature-member').hidden = appleLayout === 'classic' && !!artworkGoal;
            const summary = !reward ? '' : kind === 'CASHBACK' ? `${(amount / 100).toFixed(2)} de ${(reward.cost / 100).toFixed(2)} ${state.data.business.currency}` : `${amount} de ${reward.cost} ${kind === 'STAMPS' ? (reward.cost === 1 ? 'sello' : 'sellos') : (reward.cost === 1 ? 'punto' : 'puntos')}`;
            const percentage = reward ? Math.floor(Math.min(amount, reward.cost) * 100 / reward.cost) : 0;
            for (const provider of ['apple', 'google']) {
                root.querySelector('#' + provider + 'Journey').hidden = !artworkGoal;
                root.querySelector('#' + provider + 'JourneyLabel').textContent = remaining === 0 ? 'META ALCANZADA' : provider === 'apple' ? `Falta${remaining === 1 && kind !== 'CASHBACK' ? '' : 'n'} ${unit(remaining)}` : 'Tu avance';
                root.querySelector('#' + provider + 'JourneyValue').textContent = summary;
            }
            root.querySelector('#walletProgressLegend').hidden = !artworkGoal;
            root.querySelector('#walletProgressNext').textContent = remaining === 0 ? 'Saldo suficiente. Confirma el canje en caja.' : `Te falta${remaining === 1 && kind !== 'CASHBACK' ? '' : 'n'} ${unit(remaining)} para el premio.`;
            root.querySelectorAll('[data-wallet-style]').forEach(button => {
                const preset = presets.find(p => p.id === button.dataset.walletStyle);
                button.setAttribute('aria-pressed', String(background.value === preset.background && foreground.value === preset.foreground && labels.value === preset.label && f.elements.stampSymbol.value === preset.symbol));
            });;
            root.querySelector('#previewStamps').textContent = !paused && artworkGoal && individual ? `${Math.min(amount, artworkGoal)} de ${artworkGoal} sellos completados en este ejemplo.` : '';
            root.querySelectorAll('[data-wallet-example]').forEach(button => {
                const selected = button.dataset.walletExample === example;
                button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
                button.disabled = saving || loadingLogo || button.dataset.walletExample === 'ready' && !reward;
            });
            preview.hidden = previewProvider !== 'apple'; googlePreview.hidden = previewProvider !== 'google';
            root.querySelector('#previewPlatformHint').textContent = previewProvider === 'apple'
                ? (appleLayout === 'poster' ? 'Póster para iOS 27 o posterior. Ilustración real del servidor; composición orientativa. Apple decide la tipografía y la distribución final.' : 'Formato clásico compatible con versiones anteriores. El mismo QR, saldo y premio; Apple decide la distribución final.')
                : 'Google: saldo, avance y nombre del premio en el frente. Consumos y condiciones en los detalles. El color del texto lo decide Google.';
            root.querySelectorAll('[data-apple-layout]').forEach(button => { button.disabled = saving || loadingLogo; });
            root.querySelectorAll('[data-preview-provider]').forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.previewProvider === previewProvider));
                button.disabled = saving || loadingLogo;
            });
            googlePreview.style.backgroundColor = background.value; googlePreview.style.color = recommended();
            root.querySelector('#googlePreviewName').textContent = f.elements.displayName.value.trim() || state.data.business.name;
            root.querySelector('#googlePreviewMainLabel').textContent = kind === 'CASHBACK' ? state.data.business.currency : kind === 'STAMPS' ? 'Sellos' : kind === 'POINTS' ? 'Puntos' : 'Tarjeta';
            root.querySelector('#googlePreviewMain').textContent = !program ? (paused ? 'Pausada' : 'Activa') : reward && kind === 'STAMPS' && remaining > 0 ? `${amount}/${reward.cost}` : kind === 'CASHBACK' ? (amount / 100).toFixed(2) : String(amount);
            root.querySelector('#googlePreviewStatusLabel').textContent = paused || !reward ? 'Estado' : remaining === 0 ? 'Premio' : remaining === 1 && kind !== 'CASHBACK' ? 'Falta' : 'Faltan';
            root.querySelector('#googlePreviewStatus').textContent = paused ? 'Pausada' : !reward ? 'Activa' : remaining === 0 ? 'En caja' : unit(remaining);
            root.querySelector('#googlePreviewRewardLabel').textContent = paused ? 'Estado' : !reward ? 'Tu promoción' : remaining === 0 ? 'Premio en caja' : 'Próximo premio';
            const headline = paused ? 'Operaciones pausadas' : reward?.name || program?.config.name || f.elements.welcome.value;
            const characters = [...headline.trim().replace(/\s+/g, ' ')];
            root.querySelector('#googlePreviewReward').textContent = characters.length > 44 ? characters.slice(0, 43).join('') + '…' : characters.join('');
            root.querySelectorAll('[data-wallet-style]').forEach(button => { button.disabled = saving || loadingLogo; });
            const googleLogo = root.querySelector('#googlePreviewLogo'); googleLogo.hidden = !logo;
            if (logo) googleLogo.src = 'data:image/png;base64,' + logo; else googleLogo.removeAttribute('src');
            const image = root.querySelector('#previewLogo'); image.hidden = !logo;
            if (logo) image.src = 'data:image/png;base64,' + logo; else image.removeAttribute('src');
            // Render the same native rows used in the Google class. Hero placement follows Google's template rules.
            let rowOne = googlePreview.querySelector('.composition-google-row-one');
            let rowTwo = googlePreview.querySelector('.composition-google-row-two');
            if (!rowOne) {
                rowOne = document.createElement('div'); rowOne.className = 'composition-google-row composition-google-row-one';
                rowTwo = document.createElement('div'); rowTwo.className = 'composition-google-row composition-google-row-two';
                googlePreview.insertBefore(rowOne, googlePreview.querySelector('.google-preview-values')); googlePreview.insertBefore(rowTwo, googlePreview.querySelector('.wallet-preview-code'));
            }
            const values = googleParts.values;
            const main = googleParts.main, statusCell = googleParts.status;
            const headlineNode = googleParts.headline, journeyNode = googleParts.journey, heroNode = googleParts.hero;
            values.append(main,statusCell); values.hidden = composition !== 'SIGNATURE' && composition !== 'MOSAIC';
            for (const node of [values, headlineNode, journeyNode]) googlePreview.append(node);
            rowOne.replaceChildren(); rowTwo.replaceChildren();
            googlePreview.append(values);
            const hasJourney = !!artworkGoal;
            // Lost targets use Google's status headline and empty journey, without a stale progress row.
            if(composition === 'STAMPBOOK') { rowTwo.append(journeyNode,headlineNode); googlePreview.insertBefore(heroNode,rowOne); }
            else if(rewardFirst) { rowOne.append(headlineNode); rowTwo.append(journeyNode,statusCell); googlePreview.insertBefore(heroNode,rowTwo); }
            else if(composition === 'PATH') { rowOne.append(journeyNode); rowTwo.append(headlineNode,statusCell); googlePreview.insertBefore(heroNode,rowTwo); }
            else { rowOne.append(values); rowTwo.append(headlineNode,journeyNode); googlePreview.insertBefore(heroNode,rowTwo); }
            rowOne.hidden = composition === 'STAMPBOOK' || composition === 'PATH' && !hasJourney;
            rowTwo.classList.toggle('composition-stacked', composition === 'SIGNATURE');
            // Google omits an entirely empty first row, moving the hero above the remaining one.
            if(composition === 'PATH' && !hasJourney) googlePreview.insertBefore(heroNode,rowOne);
            return !failed.length;
        }
        root.querySelectorAll('[data-apple-layout]').forEach(button => { button.onclick = () => { appleLayout = button.dataset.appleLayout; update(); }; });
        function edited(e) {
            if (saving) return;
            clearError();
            if (e.target === background || e.target === foreground || e.target === labels) {
                // Browsers can emit both input and change for one color selection.
                const palette = [background.value, foreground.value, labels.value].join('/');
                if (f.dataset.palette !== palette) {
                    adjustment.textContent = '';
                    if (e.target === background && auto.checked) correctColors();
                }
            } else if (e.target === auto && auto.checked) correctColors();
            f.dataset.palette = [background.value, foreground.value, labels.value].join('/');
            update();
        }
        root.querySelectorAll('[data-wallet-example]').forEach(button => button.onclick = () => { example = button.dataset.walletExample; update(); });
        root.querySelectorAll('[data-preview-provider]').forEach(button => button.onclick = () => { if (saving || loadingLogo) return; previewProvider = button.dataset.previewProvider; update(); });
        root.querySelectorAll('[data-wallet-style]').forEach(button => button.onclick = () => {
            if (saving || loadingLogo) return;
            const preset = presets.find(p => p.id === button.dataset.walletStyle);
            background.value = preset.background; foreground.value = preset.foreground; labels.value = preset.label;
            f.elements.stampSymbol.value = preset.symbol;
            clearError(); correctColors(); update();
            root.querySelector('#presetStatus').textContent = `Paleta ${preset.name} aplicada. Se conservan la composición y el acabado elegidos.`;
        });
        root.querySelectorAll('button[data-composition]').forEach(button => button.onclick = () => {
            if (saving || loadingLogo) return;
            f.elements.composition.value = button.dataset.composition; clearError(); update();
        });
        f.addEventListener('input', edited); f.addEventListener('change', edited);
        fix.onclick = () => { clearError(); correctColors(); f.dataset.palette = [background.value, foreground.value, labels.value].join('/'); update(); };
        root.querySelector('#removeLogo').onclick = () => {
            logoRevision++; loadingLogo = false; logo = null; root.querySelector('#designLogo').value = '';
            root.querySelector('#logoStatus').textContent = 'Se usará el logo predeterminado.'; clearError(); update();
        };
        root.querySelector('#designLogo').onchange = async e => {
            const file = e.target.files[0]; if (!file) return;
            const revision = ++logoRevision; loadingLogo = true; clearError(); update();
            try {
                if (file.size > 5 * 1024 * 1024) throw new Error('Elige una imagen de menos de 5 MB.');
                const bitmap = await createImageBitmap(file);
                if (revision !== logoRevision || !f.isConnected) { bitmap.close(); return; }
                let value = '';
                try {
                    for (const ratio of [3, 2, 1]) {
                        const scale = Math.min(160 * ratio / bitmap.width, 36 * ratio / bitmap.height, 1);
                        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                        const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                        value = canvas.toDataURL('image/png').split(',')[1];
                        if (atob(value).length <= 20000) break;
                    }
                } finally { bitmap.close(); }
                if (atob(value).length > 20000) throw new Error('El logo tiene demasiado detalle. Usa una imagen más sencilla.');
                logo = value; root.querySelector('#logoStatus').textContent = 'Logo preparado con la mayor resolución disponible.';
            } catch (issue) {
                if (revision === logoRevision && f.isConnected) { error.textContent = issue.message; error.hidden = false; }
            } finally {
                if (revision === logoRevision && f.isConnected) { loadingLogo = false; update(); }
            }
        };
        f.addEventListener('submit', async e => {
            e.preventDefault(); if (saving || loadingLogo) return;
            if (!update()) { invalidColors()[0].input.focus(); return; }
            if (!f.reportValidity()) return;
            const values = Object.fromEntries(new FormData(f));
            const payload = {expectedVersion: data.version, design: {...d, ...values, featuredProgramId: values.featuredProgramId || null, logoPng: logo}};
            clearError(); saving = true; fields.disabled = true; f.setAttribute('aria-busy', 'true'); update();;
            try {
                await api('/api/staff/wallet-design', payload, 'PUT');
                notice('Diseño guardado para Apple y Google. Las tarjetas se actualizarán cuando Wallet reciba el cambio.');
                if (f.isConnected && state.tab === 'design') await designPage();
            } catch (issue) {
                if (f.isConnected) { error.textContent = issue.message; error.hidden = false; }
            } finally {
                saving = false; fields.disabled = false; f.removeAttribute('aria-busy'); if (f.isConnected) update();;
            }
        });
        f.dataset.palette = [background.value, foreground.value, labels.value].join('/'); update();
    }

    const customerFilters = {days: 30, inactiveDays: 30, segment: 'ALL', q: '', sort: 'RECENT'};
    let customerRequest = 0, customerFilterTenant = null;;
    async function customersPage(offset = 0) {
        if (customerFilterTenant !== state.data.business.id + ':' + state.token) {
            Object.assign(customerFilters, {days: 30, inactiveDays: 30, segment: 'ALL', q: '', sort: 'RECENT'});
            customerFilterTenant = state.data.business.id + ':' + state.token; offset = 0;
        }
        const root = document.querySelector('#content'), request = ++customerRequest, session = state.token;
        root.innerHTML = '<section class="panel" role="status">Consultando tus clientes…</section>';
        const params = new URLSearchParams({...customerFilters, offset});
        let d;
        try { d = await api('/api/staff/customer-activity?' + params); }
        catch (e) {
            if (!root.isConnected || state.tab !== 'customers' || request !== customerRequest || session !== state.token) return;
            root.innerHTML = `<section class="panel"><h2>No pudimos cargar los clientes</h2><p role="alert">${esc(e.message)}</p><button id="retryCustomers">Volver a intentar</button></section>`;
            action('retryCustomers', () => customersPage(offset)); return;
        }
        if (!root.isConnected || state.tab !== 'customers' || request !== customerRequest || session !== state.token) return;
        if (offset > 0 && offset >= d.total) return customersPage(Math.max(0, Math.floor((d.total - 1) / 50) * 50));
        const s = d.summary;
        const segments = [['ALL', 'Todos', s.registeredCustomers], ['NEAR', 'A un sello', s.nearCustomers], ['READY', 'Con premio', s.readyCustomers], ['RETURNING', 'Han vuelto', s.returningCustomers], ['INACTIVE', 'Sin volver', s.inactiveCustomers], ['NEW', 'Sin compras', s.newCustomers]];
        const metric = (label, value, help) => `<div class="customer-metric"><span>${label}</span><strong>${value}</strong><small>${help}</small></div>`;
        root.innerHTML = `<section class="panel"><div class="customer-heading"><div><h2>Quién vuelve a tu negocio</h2><p>Todas tus sucursales, en un solo lugar.</p></div><button class="quiet" id="refreshCustomers">Actualizar</button></div>
            <form id="customerFilters" class="customer-filters"><div>${select('days', 'Resumen del período', [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días']], String(customerFilters.days))}</div><div>${field('q', 'Buscar cliente por nombre', 'search', customerFilters.q, 'maxlength="100" autocomplete="off"')}</div><div>${field('inactiveDays', 'Sin volver desde hace (días)', 'number', customerFilters.inactiveDays, 'required min="1" max="365" step="1"')}</div><div>${select('sort', 'Ordenar clientes', [['RECENT','Compra más reciente'],['SPENT','Mayor gasto'],['VISITS','Más compras'],['NAME','Nombre: A–Z'],['NEWEST','Registro más reciente']], customerFilters.sort)}</div><button>Aplicar filtros</button></form>
            <p class="small">${esc(date(d.from))} — ${esc(date(d.through))} · ${esc(d.timezone)}. Incluye el día actual.</p>
            <div class="customer-metrics">${metric('Compras registradas', s.periodPurchases, 'Comprobantes del período')}${metric('Gasto de clientes', money(s.periodSpentMinor), 'Total pagado después de descuentos')}${metric('Clientes que compraron', s.periodBuyers, `${s.periodReturningBuyers} ya tienen más de una compra`)}${metric('Premios reclamados', s.periodClaimedRewards, 'Canjes confirmados en el período')}</div>
            <p class="small">Descuentos en comprobantes: <strong>${money(s.periodDiscountMinor)}</strong>. El resumen abarca el negocio completo; la búsqueda y los grupos filtran la lista de abajo.</p>
        </section><section class="panel"><h2>Clientes y oportunidades de regreso</h2><p>La lista usa todo el historial. “Sin volver” cuenta días desde la última compra; “Sin compras” incluye a quienes aún no registran ninguna.</p><div class="customer-segments" role="group" aria-label="Filtrar clientes">${segments.map(([key, label, count]) => `<button type="button" class="quiet" data-segment="${key}" aria-pressed="${customerFilters.segment === key}">${label} <span>${count}</span></button>`).join('')}</div>
            <p class="small" id="customerPageCount" role="status">${d.total ? `${offset + 1}–${offset + d.customers.length} de ${d.total} clientes` : 'No hay clientes para estos filtros.'}</p>
            <div class="commercial-table-wrap"><table class="commercial-table customer-table"><caption class="small">Historial acumulado y premios de promociones activas</caption><thead><tr><th>Cliente</th><th>Compras / gasto</th><th>Frecuencia media</th><th>Premios</th><th>Última compra</th></tr></thead><tbody>${d.customers.map(c => `<tr><td data-label="Cliente"><button class="quiet" data-customer="${esc(c.id)}">${esc(c.name)}</button>${c.cardSuffix ? `<small>Tarjeta · ${esc(c.cardSuffix)}</small>` : ''}<small>${c.returning ? 'Ha vuelto' : c.purchases ? 'Una compra registrada' : 'Aún no compra'}</small></td><td data-label="Compras / gasto">${c.purchases}<small>${money(c.spentMinor)}</small></td><td data-label="Frecuencia media">${c.averageDaysBetweenPurchases === null ? '—' : Number(c.averageDaysBetweenPurchases).toFixed(1) + ' días'}</td><td data-label="Premios"><div class="customer-prizes">${c.readyRewards ? `<span class="customer-ready">${c.readyRewards} premio${c.readyRewards === 1 ? '' : 's'} por canjear</span>` : ''}${c.nearRewards ? '<span class="customer-near">A un sello de un premio</span>' : ''}<small>${c.claimedRewards} reclamados</small></div></td><td data-label="Última compra">${esc(date(c.lastPurchase))}${c.daysSinceLastPurchase === null ? '' : `<small>Hace ${c.daysSinceLastPurchase} día${c.daysSinceLastPurchase === 1 ? '' : 's'}</small>`}</td></tr>`).join('') || '<tr><td colspan="5">Prueba otro grupo o borra la búsqueda por nombre.</td></tr>'}</tbody></table></div>
            <div class="row customer-pagination"><button class="quiet" id="customersPrev" ${offset ? '' : 'disabled'}>Anterior</button><button class="quiet" id="customersNext" ${d.hasMore ? '' : 'disabled'}>Siguiente</button></div><p class="small">Los premios de una misma promoción son alternativas: el saldo se comprueba otra vez en caja. Las promociones pausadas o eliminadas no se incluyen.</p>
        </section>`;
        form('customerFilters', async v => { customerFilters.days = Number(v.days); customerFilters.inactiveDays = Number(v.inactiveDays); customerFilters.q = v.q.trim(); customerFilters.sort = v.sort; await customersPage(); });
        action('refreshCustomers', () => customersPage(offset));
        action('customersPrev', () => customersPage(Math.max(0, offset - 50))); action('customersNext', () => customersPage(offset + 50));
        root.querySelectorAll('[data-segment]').forEach(b => b.onclick = safe(async () => { customerFilters.segment = b.dataset.segment; await customersPage(); }));
        root.querySelectorAll('[data-customer]').forEach(b => b.onclick = () => window.openCustomerWorkspace(b.dataset.customer, b));
        const search = root.querySelector('#q');
        attachPredictiveSearch(search, {
            load: async q => (await api('/api/staff/customer-suggestions?q=' + encodeURIComponent(q))).items,
            label: row => row.name, description: row => 'Tarjeta · ' + row.cardSuffix,
            choose: row => window.openCustomerWorkspace(row.id, search)
        });
    }
    let customerDrawer = null;
    const customerBusy = () => Boolean(document.querySelector('form[aria-busy="true"]'));
    function closeCustomerDrawer() {
        if (customerBusy()) { const status = customerDrawer?.querySelector('#customerDrawerStatus'); if (status) status.textContent = 'Guardando preferencias. Espera a que termine para continuar.'; else notice('Espera a que termine la operación.'); return false; }
        customerDrawer?.close(); return true;
    }
    window.openCustomerWorkspace = async function (memberId, trigger = document.activeElement) {
        if (!closeCustomerDrawer()) return;
        const session = state.token, tenant = state.data.business.id;
        const dialog = document.createElement('dialog'); customerDrawer = dialog;
        dialog.className = 'customer-drawer'; dialog.setAttribute('aria-labelledby', 'profileTitle');
        dialog.innerHTML = '<header class="profile-header"><div><span class="eyebrow">MIS CLIENTES</span><h2 id="profileTitle" tabindex="-1">Ficha del cliente</h2></div><button type="button" class="quiet" id="closeCustomer" aria-label="Cerrar ficha del cliente">Cerrar ×</button></header><p id="customerDrawerStatus" class="small profile-status" role="status"></p><div class="profile-body" id="profileBody" role="status">Cargando la ficha…</div>';
        document.body.append(dialog); dialog.showModal(); document.body.classList.add('customer-drawer-open');
        dialog.querySelector('#closeCustomer').onclick = closeCustomerDrawer;
        dialog.addEventListener('cancel', e => { e.preventDefault(); closeCustomerDrawer(); });
        dialog.addEventListener('close', () => { dialog.remove(); if (customerDrawer === dialog) { customerDrawer = null; document.body.classList.remove('customer-drawer-open'); } if (trigger?.isConnected) trigger.focus({preventScroll: true}); }, {once: true});
        const valid = () => dialog.open && dialog.isConnected && state.token === session && state.data?.business.id === tenant;
        const body = dialog.querySelector('#profileBody');
        let timelineRequest = 0, timelineKind = 'ALL', timelineBranch = '';
        const rewardText = r => !r.remaining ? 'Saldo suficiente para canjear' : r.kind === 'CASHBACK' ? 'Faltan ' + money(r.remaining) : `Falta${r.remaining === 1 ? '' : 'n'} ${r.remaining} ${r.kind === 'STAMPS' ? (r.remaining === 1 ? 'sello' : 'sellos') : (r.remaining === 1 ? 'punto' : 'puntos')}`;
        const request = offset => api('/api/staff/customer-workspace/' + encodeURIComponent(memberId) + '?' + new URLSearchParams({kind: timelineKind, branchId: timelineBranch, offset}));
        const drawTimeline = timeline => {
            const target = dialog.querySelector('#customerTimeline'); target.removeAttribute('aria-busy');
            target.innerHTML = `<p class="small" role="status">${timeline.total ? `${timeline.offset + 1}–${timeline.offset + timeline.items.length} de ${timeline.total} movimientos` : 'No hay movimientos con estos filtros.'}</p><ol class="customer-timeline">${timeline.items.map(x => {
                const purchase = x.kind === 'PURCHASE';
                return `<li class="timeline-event"><span class="timeline-badge" aria-hidden="true">${purchase ? '↗' : '★'}</span><div><div class="timeline-title"><strong>${purchase ? 'Compra' : 'Premio reclamado'}</strong><b>${purchase ? esc(money(x.paidMinor)) : esc(x.name)}</b></div><p class="small">${esc(date(x.at))} · ${esc(x.branch || 'Sucursal no registrada')}</p>${purchase ? `<details><summary>Ver comprobante y productos</summary><p class="small">Comprobante: ${esc(x.receipt)}</p><ul>${(x.items || []).map(i => `<li>${esc(i.quantity)} × ${esc(i.name)}${i.group ? ` · ${esc(i.group)}` : ''}</li>`).join('') || '<li>Compra sin detalle de productos.</li>'}</ul><dl class="receipt-totals"><div><dt>Antes del descuento</dt><dd>${esc(money(x.grossMinor))}</dd></div><div><dt>Descuento</dt><dd>${esc(money(x.discountMinor))}</dd></div><div><dt>Total pagado</dt><dd>${esc(money(x.paidMinor))}</dd></div></dl>${x.redemptionId ? '<p class="small">Incluye un canje, que también figura en este historial.</p>' : ''}</details>` : `<p>Usó ${x.balanceKind === 'CASHBACK' ? esc(money(x.cost)) : esc(x.cost) + ' ' + (x.balanceKind === 'STAMPS' ? 'sellos' : 'puntos')} de su saldo.</p>`}</div></li>`;
            }).join('')}</ol><div class="customer-pagination row"><button type="button" class="quiet" id="timelinePrev" ${timeline.offset ? '' : 'disabled'}>Movimientos anteriores</button><button type="button" class="quiet" id="timelineNext" ${timeline.hasMore ? '' : 'disabled'}>Movimientos siguientes</button></div>`;
            target.querySelector('#timelinePrev').onclick = () => loadTimeline(Math.max(0, timeline.offset - 20));
            target.querySelector('#timelineNext').onclick = () => loadTimeline(timeline.offset + 20);
        };
        const loadTimeline = async offset => {
            const serial = ++timelineRequest, target = dialog.querySelector('#customerTimeline'); target.setAttribute('aria-busy', 'true');
            target.innerHTML = '<p role="status">Cargando movimientos…</p>';
            try { const d = await request(offset); if (valid() && serial === timelineRequest) drawTimeline(d.timeline); }
            catch (e) { if (!valid() || serial !== timelineRequest) return; target.removeAttribute('aria-busy'); target.innerHTML = `<p role="alert">${esc(e.message)}</p><button type="button" id="retryTimeline">Reintentar movimientos</button>`; target.querySelector('button').onclick = () => loadTimeline(offset); }
        };
        const load = async () => {
            body.innerHTML = '<p role="status">Cargando la ficha…</p>';
            try {
                const d = await request(0); if (!valid()) return;
                dialog.querySelector('#profileTitle').textContent = d.member.name;
                const s = d.summary, p = d.preferences;
                const metric = (label, value) => `<div><span>${label}</span><strong>${esc(value)}</strong></div>`;
                body.removeAttribute('role');
                body.innerHTML = `<div class="profile-intro"><p>Cliente desde ${esc(date(d.member.joinedAt))}</p><div class="profile-primary-actions"><button type="button" id="serveCustomer">Atender en Caja →</button><button type="button" class="quiet" id="recoverCustomerWallet">Actualizar o recuperar tarjeta</button></div></div><div class="profile-metrics">${metric('Compras', s.purchases)}${metric('Total pagado', money(s.spentMinor))}${metric('Premios reclamados', s.claimedRewards)}${metric('Frecuencia media', s.averageDaysBetweenPurchases === null ? 'Aún sin calcular' : Number(s.averageDaysBetweenPurchases).toFixed(1) + ' días')}</div><p class="small">Todo el historial · Última compra: ${esc(date(s.lastPurchase))}. Descuentos registrados: ${esc(money(s.discountMinor))}.</p><section class="profile-section"><h3>Sus próximos premios</h3><div class="customer-reward-list">${d.rewardProgress.map(r => `<div><strong>${esc(r.name)}</strong><p>${esc(r.program)}</p><span class="${r.remaining === 0 ? 'customer-ready' : 'customer-near'}">${esc(rewardText(r))}</span></div>`).join('') || '<p>Aún no tiene saldo en promociones activas con premios.</p>'}</div><p class="small">Hasta 100 premios activos con saldo. Los de una misma promoción son alternativas. Caja comprueba identidad, condiciones y saldo vigente.</p></section><section class="profile-section"><h3>Historial de movimientos</h3><div class="row timeline-filters"><div>${select('timelineKind', 'Tipo de movimiento', [['ALL', 'Todos'], ['PURCHASE', 'Compras'], ['REWARD', 'Canjes']])}</div><div>${select('timelineBranch', 'Sucursal', [['', 'Todas las sucursales'], ...state.data.branches.map(b => [b.id, b.name])])}</div></div><div id="customerTimeline" aria-live="polite"></div><p class="small">El historial conserva las operaciones confirmadas aunque su promoción haya terminado. Filtrar movimientos no cambia los totales de la ficha.</p></section><details class="profile-section"><summary>Cumpleaños y preferencias</summary><form id="customerPreferences">${field('birthday', 'Mes y día de cumpleaños (MM-DD, opcional)', 'text', p.birthday || '', 'placeholder="11-04" pattern="[0-9]{2}-[0-9]{2}"')}<label class="check"><input name="marketingConsent" type="checkbox" ${checked(p.marketingConsent)}>El cliente quiere recibir felicitaciones y anuncios del negocio.</label><label class="check"><input name="confirmed" type="checkbox" required>El cliente autorizó estas preferencias.</label><button>Guardar preferencias</button></form></details>`;
                drawTimeline(d.timeline);
                dialog.querySelector('#timelineKind').onchange = e => { timelineKind = e.target.value; loadTimeline(0); };
                dialog.querySelector('#timelineBranch').onchange = e => { timelineBranch = e.target.value; loadTimeline(0); };
                const serve = recovery => {
                    if (!valid() || !closeCustomerDrawer()) return;
                    state.tab = 'sales'; renderMerchant();
                    const lookup = document.querySelector('#lookup');
                    lookup.elements.kind.value = 'cardCode'; lookup.elements.value.value = d.member.cardCode;
                    if (recovery) lookup.dataset.recovery = d.member.id;
                    lookup.requestSubmit();
                };
                dialog.querySelector('#serveCustomer').onclick = () => serve(false);
                dialog.querySelector('#recoverCustomerWallet').onclick = () => serve(true);
                form('customerPreferences', async v => {
                    try { await api('/api/staff/customer-insights/' + encodeURIComponent(memberId) + '/preferences', {preferences: {birthday: v.birthday || null, marketingConsent: v.marketingConsent === 'on'}, customerConfirmed: v.confirmed === 'on'}, 'PUT'); }
                    finally { if (valid()) dialog.querySelector('#customerDrawerStatus').textContent = ''; }
                    if (valid()) { dialog.querySelector('#customerPreferences').elements.confirmed.checked = false; dialog.querySelector('#customerDrawerStatus').textContent = 'Preferencias guardadas.'; }
                });
            } catch (e) { if (!valid()) return; body.innerHTML = `<p role="alert">${esc(e.message)}</p><button type="button" id="retryProfile">Volver a intentar</button>`; body.querySelector('button').onclick = load; }
        };
        await load();
    };;
    window.openCustomerSegment = function (segment) {
        if (customerBusy()) { notice('Espera a que termine la operación.'); return; }
        customerFilterTenant = state.data.business.id + ':' + state.token;
        Object.assign(customerFilters, {days: 30, inactiveDays: 30, segment, q: '', sort: 'RECENT'});
        state.tab = 'customers'; renderMerchant(); document.querySelector('#sectionTitle')?.focus();
    };
    let eventsRequest = 0;
    async function eventsPage() {
        const root=document.querySelector('#content'), ticket=++eventsRequest, session=state.token;
        const valid=()=>root.isConnected&&state.tab==='events'&&ticket===eventsRequest&&session===state.token;
        root.innerHTML='<section class="panel" role="status">Cargando eventos y cumpleaños…</section>';
        let d,birthday;
        try{[d,birthday]=await Promise.all([api('/api/staff/customer-events'),api('/api/staff/birthday-settings')]);}
        catch(issue){if(valid()){root.innerHTML=`<section class="panel"><p role="alert">${esc(issue.message)}</p><button id="retryEvents">Reintentar</button></section>`;root.querySelector('#retryEvents').onclick=()=>eventsPage();}return;}
        if(!valid())return;
        root.innerHTML=`<div class="section-heading"><div><span class="eyebrow">Mantén el vínculo</span><h2>Eventos y cumpleaños</h2></div></div><div class="engagement-tabs" role="group" aria-label="Tipo de mensaje"><button type="button" data-message-tab="birthdays" aria-pressed="true">Cumpleaños automáticos</button><button type="button" data-message-tab="events" aria-pressed="false">Eventos programados</button></div><div id="birthdayAutomation"></div><div id="scheduledEvents" hidden><section class="panel"><h3>Programar un evento o aviso</h3><p>Aparecerá en los detalles de ambas Wallet durante las fechas elegidas, para clientes que aceptaron anuncios.</p><form id="customerEvent">${select('eventSuggestion','Empezar con un texto',[['','Escribir mi propio mensaje'],['news','Una novedad del negocio'],['event','Invitación a un evento'],['hours','Aviso de horario']])}${field('title','Título','text','','required maxlength="80"')}<label for="eventBody">Mensaje</label><textarea id="eventBody" name="body" required maxlength="500" rows="3"></textarea>${field('startsAt','Mostrar desde','datetime-local','','required')}${field('endsAt','Mostrar hasta','datetime-local','','required')}<p class="small">Zona horaria: ${esc(state.data.business.timezone)}. Revisa el contenido antes de programarlo.</p><button>Programar aviso</button></form></section><section class="panel"><h3>Avisos programados</h3>${d.events.map(e=>`<article class="request-card"><h4>${esc(e.title)}</h4><p>${esc(e.body)}</p><p class="small">${esc(date(e.startsAt))} — ${esc(date(e.endsAt))}</p>${e.active?`<button class="quiet" data-cancel-event="${esc(e.id)}">Desactivar aviso</button>`:'<p>Desactivado</p>'}</article>`).join('')||'<p>Aún no hay eventos.</p>'}</section></div><p class="small">Los mensajes actualizan el contenido de Apple y Google Wallet. No equivalen a SMS, WhatsApp o correo y no garantizan una alerta en la pantalla bloqueada. El servidor y la conexión de las tarjetas deben estar disponibles.</p>`;
        const tab=name=>{root.querySelector('#birthdayAutomation').hidden=name!=='birthdays';root.querySelector('#scheduledEvents').hidden=name!=='events';root.querySelectorAll('[data-message-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.messageTab===name)));};
        root.querySelectorAll('[data-message-tab]').forEach(b=>b.onclick=()=>{if(!root.querySelector('form[aria-busy="true"]'))tab(b.dataset.messageTab);});
        renderBirthdaySettings(root.querySelector('#birthdayAutomation'),birthday,valid);
        const suggestions={news:['Tenemos novedades','Consulta en el local las novedades que preparamos para ti.'],event:['Te esperamos en nuestro próximo evento','Consulta en el local los detalles y condiciones del evento.'],hours:['Información de atención','Consulta nuestro horario de atención antes de tu próxima visita.']};
        const eventForm=root.querySelector('#customerEvent');eventForm.elements.eventSuggestion.onchange=()=>{const v=suggestions[eventForm.elements.eventSuggestion.value];if(v){eventForm.elements.title.value=v[0];eventForm.elements.body.value=v[1];}};
        form('customerEvent',async(v,f)=>{const body={title:v.title,body:v.body,startsAt:utcDateTime(v.startsAt),endsAt:utcDateTime(v.endsAt)};await api('/api/staff/customer-events',body,'POST',operationKey(f,body));if(valid()){await eventsPage();const button=document.querySelector('[data-message-tab="events"]');button?.click();notice('Aviso programado.');}});
        root.querySelectorAll('[data-cancel-event]').forEach(b=>b.onclick=safe(async()=>{if(b.disabled)return;b.disabled=true;try{await api('/api/staff/customer-events/'+encodeURIComponent(b.dataset.cancelEvent),null,'DELETE');if(valid()){await eventsPage();document.querySelector('[data-message-tab="events"]')?.click();}}finally{if(b.isConnected)b.disabled=false;}}));
    }
    function renderBirthdaySettings(root,data,valid) {
        const settings=data.settings;let version=data.version;
        const key=x=>JSON.stringify([x.title,x.message]);
        const choices=[...new Map([...(settings.templates||[]),...data.suggestions].map(x=>[key(x),{...x}])).values()].slice(0,8);
        const selected=new Set((settings.templates?.length?settings.templates:choices).map(key));
        root.innerHTML=`<section class="panel birthday-settings"><div class="commercial-heading-row"><div><span class="eyebrow">Una felicitación, cada año</span><h3>Que tu negocio recuerde su día</h3></div><span class="profile-status" id="birthdayModeStatus">${settings.enabled?'Activado':'Pausado'}</span></div><p>Se prepara automáticamente el día del cumpleaños, según ${esc(state.data.business.timezone)}, si el cliente autorizó estos mensajes. El 29 de febrero se celebra el 28 en años no bisiestos.</p><form id="birthdayForm"><label class="check"><input type="checkbox" name="enabled" ${checked(settings.enabled)}>Activar felicitaciones automáticas</label>${select('birthdayMode','Cómo elegir el mensaje',[['FIXED','Usar siempre el mismo texto'],['RANDOM','Elegir al azar entre mis textos']],settings.mode)}<div id="fixedBirthdayFields"><div class="row"><div>${select('birthdayTitleOption','Ideas para el título',[['','Personalizado'],...data.suggestions.map((x,i)=>[String(i),x.title])])}${field('birthdayTitle','Título de la felicitación','text',settings.title,'required maxlength="80"')}</div><div>${select('birthdayMessageOption','Ideas para el mensaje',[['','Personalizado'],...data.suggestions.map((x,i)=>[String(i),x.message])])}<label for="birthdayMessage">Mensaje de cumpleaños</label><textarea name="birthdayMessage" id="birthdayMessage" required maxlength="250" rows="4">${esc(settings.message)}</textarea></div></div></div><div id="randomBirthdayFields" hidden><p>Selecciona al menos dos opciones. Puedes editar sus títulos y mensajes. Se guarda una elección por cliente y año, compartida entre Apple y Google.</p><div id="birthdayChoices"></div><button type="button" class="quiet" id="addBirthdayChoice">Añadir mi propio texto</button></div><aside class="birthday-preview" aria-live="polite"><span class="eyebrow">Vista previa del contenido</span><strong id="birthdayPreviewTitle"></strong><p id="birthdayPreviewBody"></p><small>El diseño final depende de cada Wallet.</small></aside><p class="small">Los textos ya preparados para el cumpleaños de hoy conservan su elección. Pausar oculta las felicitaciones mientras esté desactivado; no elimina saldos ni premios.</p><button>Guardar cumpleaños automáticos</button><p id="birthdaySaved" role="status"></p></form></section>`;
        const f=root.querySelector('#birthdayForm');
        const drawChoices=()=>{
            root.querySelector('#birthdayChoices').innerHTML=choices.map((x,i)=>`<fieldset class="birthday-choice"><legend><label class="check"><input type="checkbox" data-greeting-choice="${i}" ${selected.has(key(x))?'checked':''}>Usar opción ${i+1}</label></legend>${field('greetingTitle'+i,'Título de la opción '+(i+1),'text',x.title,'required maxlength="80" data-greeting-title="'+i+'"')}<label for="greetingBody${i}">Mensaje de la opción ${i+1}</label><textarea id="greetingBody${i}" data-greeting-body="${i}" required maxlength="250" rows="3">${esc(x.message)}</textarea></fieldset>`).join('');
            root.querySelector('#addBirthdayChoice').disabled=choices.length>=8;
        };
        const activeChoices=()=>[...root.querySelectorAll('[data-greeting-choice]:checked')].map(n=>choices[Number(n.dataset.greetingChoice)]);
        const update=()=>{
            const random=f.elements.birthdayMode.value==='RANDOM';root.querySelector('#fixedBirthdayFields').hidden=random;root.querySelector('#randomBirthdayFields').hidden=!random;
            root.querySelectorAll('[data-greeting-title],[data-greeting-body]').forEach(n=>{const index=n.dataset.greetingTitle??n.dataset.greetingBody;n.disabled=!random||!root.querySelector(`[data-greeting-choice="${index}"]`).checked;});
            f.elements.birthdayTitle.disabled=random;f.elements.birthdayMessage.disabled=random;
            const example=random?(activeChoices()[0]||{title:'Selecciona tus textos',message:'Elige al menos dos opciones para alternar las felicitaciones.'}):{title:f.elements.birthdayTitle.value,message:f.elements.birthdayMessage.value};
            root.querySelector('#birthdayPreviewTitle').textContent=example.title;root.querySelector('#birthdayPreviewBody').textContent=example.message;
        };
        drawChoices();update();
        f.addEventListener('input',e=>{const n=e.target,index=n.dataset.greetingTitle??n.dataset.greetingBody;if(index!==undefined){const item=choices[Number(index)],old=key(item),was=selected.has(old);selected.delete(old);item[n.dataset.greetingTitle!==undefined?'title':'message']=n.value;if(was)selected.add(key(item));}update();});
        f.addEventListener('change',e=>{if(e.target.dataset.greetingChoice!==undefined){const item=choices[Number(e.target.dataset.greetingChoice)];if(e.target.checked)selected.add(key(item));else selected.delete(key(item));}update();});
        for(const [choice,target,prop] of [['birthdayTitleOption','birthdayTitle','title'],['birthdayMessageOption','birthdayMessage','message']])f.elements[choice].onchange=()=>{if(f.elements[choice].value!=='')f.elements[target].value=data.suggestions[Number(f.elements[choice].value)][prop];update();};
        root.querySelector('#addBirthdayChoice').onclick=()=>{if(choices.length>=8||f.getAttribute('aria-busy')==='true')return;const x={title:'Mi felicitación',message:'Escribe aquí tu mensaje de cumpleaños.'};choices.push(x);selected.add(key(x));drawChoices();update();root.querySelector('#greetingTitle'+(choices.length-1)).focus();};
        form('birthdayForm',async()=>{
            const random=f.elements.birthdayMode.value==='RANDOM', templates=activeChoices().map(x=>({...x}));
            if(random&&new Set(templates.map(key)).size<2)throw new Error('Selecciona al menos dos felicitaciones diferentes.');
            const config={enabled:f.elements.enabled.checked,mode:f.elements.birthdayMode.value,title:f.elements.birthdayTitle.value,message:f.elements.birthdayMessage.value,templates};
            try{const result=await api('/api/staff/birthday-settings',{expectedVersion:version,settings:config},'PUT');if(valid()){version=result.version;root.querySelector('#birthdayModeStatus').textContent=config.enabled?'Activado':'Pausado';root.querySelector('#birthdaySaved').textContent='Configuración guardada para Apple y Google Wallet.';}}
            catch(issue){if(issue.code==='VERSION_CONFLICT'&&valid()&&!root.querySelector('#reloadBirthdays')){const b=document.createElement('button');b.id='reloadBirthdays';b.type='button';b.className='quiet';b.textContent='Recargar la configuración guardada';b.onclick=()=>{if(!f.matches('[aria-busy="true"]'))eventsPage();};root.append(b);}throw issue;}
        });
    }

    // Existing forms retain their handlers. Preserve newer rule fields when the legacy editor saves.
    const previousApi = api;
    api = async function (path, body, method = 'POST', key = null) {
        if (body && method === 'PUT' && /^\/api\/staff\/programs\//.test(path)) { const old = state.data?.programs.find(p => path.endsWith('/' + p.id)); if (old) body = {...body, program: {...body.program, productGroup: old.config.productGroup || '', countUnits: Boolean(old.config.countUnits)}}; }
        if (body && method === 'PUT' && /^\/api\/staff\/rewards\//.test(path)) { const old = state.data?.rewards.find(r => path.endsWith('/' + r.id)); if (old) body = {...body, reward: {...body.reward, benefit: old.benefit || null}}; }
        if (body && /\/api\/public\/[^/]+\/join$/.test(path)) { const node = document.querySelector('#enroll'); body = {...body, preferences: {birthday: node?.elements.birthMonthDay?.value || null, marketingConsent: Boolean(node?.elements.marketingConsent?.checked)}}; }
        return previousApi(path, body, method, key);
    };
    function enhance() {
        enhancePurchase();
        enhanceCounterRewards();
        const editor = document.querySelector('#programV7');;
        if (editor && editingProgram?.config.productGroup && !editor.dataset.categoryReady) {
            editor.dataset.categoryReady = 'true';
            const info = document.createElement('p');
            info.textContent = `Categoría: ${editingProgram.config.productGroup}. Acumula por ${editingProgram.config.countUnits ? 'producto o servicio pagado' : 'compra con productos de esta categoría'}. Para cambiar este criterio, crea otra promoción.`;
            editor.prepend(info);
            editor.querySelector('label[for="stampsPerPurchase"]').textContent = editingProgram.config.countUnits ? 'Sellos por unidad pagada' : 'Sellos por compra registrada';
            editor.querySelector('[data-promotion-kind="STAMPS"] .small').textContent = 'Los horarios, sucursales y bonos se aplican a esta forma de acumulación.';
        }
        const enroll = document.querySelector('#enroll'); if (enroll && !enroll.dataset.preferencesReady) {
            enroll.dataset.preferencesReady = 'true'; const extra = document.createElement('div');
            extra.innerHTML = `${field('birthMonthDay', 'Mes y día de cumpleaños (opcional)', 'text', '', 'placeholder="MM-DD" pattern="[0-9]{2}-[0-9]{2}"')}<label class="check"><input name="marketingConsent" type="checkbox">Quiero recibir felicitaciones y anuncios de este negocio en mi tarjeta. Puedo pedir al negocio que los desactive.</label>`;
            enroll.querySelector('button').before(extra);
        }
    }
    new MutationObserver(enhance).observe(app, {childList: true, subtree: true}); enhance();
})();
