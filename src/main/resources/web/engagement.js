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
        const root = document.querySelector('#content');
        root.innerHTML = `<button type="button" class="quiet promotion-back" id="backToPromotions">← Volver a promociones</button><section class="panel promotion-create"><div class="eyebrow">Nueva promoción</div><h2>Define tu próximo premio.</h2><p>Las reglas las eliges tú. Estos ejemplos se pueden cambiar por completo.</p><div class="promotion-methods" role="group" aria-label="Tipo de promoción"><button type="button" class="active" aria-pressed="true">Sellos + premio o descuento<br><small>Por productos, servicios o visitas</small></button><button type="button" id="advancedPromotion">Puntos, cashback o sellos<br><small>Reglas y premios por separado</small></button></div><form id="promotionTemplate"><div class="row"><div>${field('promoName', 'Nombre de la promoción', 'text', '', 'required maxlength="120" placeholder="Por ejemplo: Tu próxima visita tiene premio"')}</div><div>${field('group', 'Categoría que cuenta', 'text', '', 'required maxlength="60" placeholder="Por ejemplo: café, corte, ropa…"')}</div></div>${select('mode', 'Cuándo acumula un sello', [['units', 'Por cada producto o servicio pagado'], ['visits', 'Por cada compra con esta categoría']])}<div class="row"><div>${field('nth', 'Número de la compra o unidad premiada', 'number', 6, 'required min="2" max="101"')}</div><div>${field('percent', 'Descuento del premio (%)', 'number', 100, 'required min="0.01" max="100" step="0.01"')}</div></div>${field('rewardName', 'Nombre del premio', 'text', '', 'required maxlength="120" placeholder="Lo que recibirá tu cliente"')}<p class="promotion-explanation" id="templateExplanation" aria-live="polite"></p><details><summary>Usar un ejemplo como punto de partida</summary><p class="small">Nada está fijo: cambia el nombre, la categoría, la cantidad y el beneficio.</p><div class="row"><button type="button" class="quiet" data-template="pizza">Sexta pizza gratis</button><button type="button" class="quiet" data-template="cafe">Quinto café al 50%</button><button type="button" class="quiet" data-template="ropa">Segunda compra al 20%</button><button type="button" class="quiet" data-template="corte">Octavo corte gratis</button></div></details><button type="submit">Crear promoción y premio</button></form><p class="small">Después puedes ajustar fechas, horarios, bonos y sucursales. El premio se aplica a una unidad —la de menor precio elegible— o al total de la categoría, según el modo. Un premio por comprobante, con saldo acumulado antes de esa compra.</p></section>`;
        root.querySelector('#backToPromotions').onclick = () => renderPrograms();
        root.querySelector('#advancedPromotion').onclick = () => existingPrograms(null, true);
        const f = root.querySelector('#promotionTemplate');
        const explain = () => {
            const nth = Number(f.elements.nth.value), percent = Number(f.elements.percent.value);
            const units = f.elements.mode.value === 'units';
            root.querySelector('#templateExplanation').textContent = !f.elements.nth.validity.valid || !f.elements.percent.validity.valid ? 'Elige el número de compra premiada (2 a 101) y un descuento mayor que 0 y hasta 100%.' : `Tu cliente acumula ${nth - 1} sellos con ${units ? 'productos o servicios pagados' : 'compras de la categoría'} y puede usar ${percent}% de descuento ${units ? 'en una unidad elegible' : 'en los productos de esa categoría'} en la compra siguiente. La compra con canje no acumula en esta misma promoción.`;
        };
        f.oninput = explain; explain();
        const presets = {pizza: ['Sexta pizza gratis', 'pizza', 6, 100, 'Pizza gratis', 'units'], cafe: ['Quinto café al 50%', 'café', 5, 50, '50% en un café', 'units'], ropa: ['Segunda compra de ropa al 20%', 'ropa', 2, 20, '20% en ropa', 'visits'], corte: ['Octavo corte gratis', 'corte', 8, 100, 'Corte gratis', 'units']};
        root.querySelectorAll('[data-template]').forEach(b => b.onclick = () => { const v = presets[b.dataset.template]; ['promoName', 'group', 'nth', 'percent', 'rewardName', 'mode'].forEach((name, i) => f.elements[name].value = v[i]); explain(); });
        form('promotionTemplate', async (v, node) => {
            const payload = {name: v.promoName, group: v.group.trim(), nth: Number(v.nth), percentBps: Math.round(Number(v.percent) * 100), countUnits: v.mode === 'units', rewardName: v.rewardName};
            await api('/api/staff/promotion-templates', payload, 'POST', operationKey(node, payload)); await merchant(); notice('Promoción y premio creados.');
        });
        f.elements.promoName.focus();
    };;

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
        const panel = document.createElement('div'); old.replaceWith(panel);
        const rewards = member.rewards.filter(r => r.active && r.benefit && (member.balances.find(b => b.programId === r.programId)?.available || 0) >= r.cost);
        const categories = [...new Set(state.data.programs.map(p => p.config.productGroup).filter(Boolean))];
        let common = {branchId: previousBranch || state.data.branches[0]?.id || '', receipt: previousReceipt || '', reward: '', programs: state.data.programs.filter(p => p.config.active).map(p => p.id)};
        const readRows = f => [...f.querySelectorAll('[data-line]')].map(line => ({name: line.querySelector('[data-name]').value.trim(), group: line.querySelector('[data-group]').value.trim(), quantity: Number(line.querySelector('[data-quantity]').value), unitMinor: Math.round(Number(line.querySelector('[data-price]').value) * 100)}));
        const keep = f => { rows = readRows(f); common = {branchId: f.elements.branchId.value, receipt: f.elements.receipt.value, reward: f.elements.reward.value, programs: [...f.querySelectorAll('[name=program]:checked')].map(x => x.value)}; };
        const draw = () => {
            panel.innerHTML = `<form id="productPurchase"><label for="checkoutBranch">Sucursal</label><select id="checkoutBranch" name="branchId" required>${options(state.data.branches, common.branchId)}</select>${field('receipt', 'Comprobante único', 'text', common.receipt, 'required maxlength="100"')}<datalist id="productGroups">${categories.map(g => `<option value="${esc(g)}">`).join('')}</datalist>${rows.map((r, i) => `<fieldset data-line><legend>Producto ${i + 1}</legend><label>Producto o servicio<input data-name required maxlength="100" value="${esc(r.name)}"></label><label>Categoría<input data-group required list="productGroups" maxlength="60" value="${esc(r.group)}"></label><div class="row"><label>Cantidad<input data-quantity type="number" min="1" max="100" required value="${r.quantity}"></label><label>Precio por unidad<input data-price type="number" min="0.01" max="10000000" step="0.01" required value="${r.unitMinor ? r.unitMinor / 100 : ''}"></label></div>${rows.length > 1 ? `<button type="button" class="quiet" data-remove="${i}">Quitar producto</button>` : ''}</fieldset>`).join('')}<button type="button" class="quiet" id="addProduct" ${rows.length >= 30 ? 'disabled' : ''}>Añadir producto</button><details><summary>Promociones que aplican</summary><p>Solo acumulan las que coincidan con los productos, fechas y sucursal.</p>${state.data.programs.filter(p => p.config.active).map(p => `<label class="check"><input type="checkbox" name="program" value="${esc(p.id)}" ${checked(common.programs.includes(p.id))}>${esc(p.config.name)}</label>`).join('')}</details>${select('reward', 'Premio para aplicar en esta compra', [['', 'Sin canje'], ...rewards.map(r => [r.id, r.name])], common.reward)}<p id="purchaseRewardDetails" class="counter-selected-benefit" hidden></p><div id="purchaseConsent"><label class="check"><input name="verified" type="checkbox">Verifiqué al titular.</label><label class="check"><input name="confirmed" type="checkbox">El cliente pidió este premio y acepta usar el saldo de esta promoción.</label></div><div class="checkout-subtotal"><span>Subtotal</span><strong id="checkoutSubtotal"></strong><small>El descuento se calcula al revisar la compra.</small></div><button>Revisar total y descuento</button></form><div id="receiptReview"></div>`;
            const f = panel.querySelector('form'); let revision = 0;
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
                const payload = {memberId: member.member.id, branchId: v.branchId, receipt: v.receipt, currency: state.data.business.currency, amountMinor: items.reduce((s, x) => s + x.quantity * x.unitMinor, 0), items, programIds: [...node.querySelectorAll('[name=program]:checked')].map(x => x.value), rewardId: reward?.id || null, expectedRevision: member.member.revision, expectedRewardVersion: reward?.version || null, identityVerified: v.verified === 'on', customerConfirmed: v.confirmed === 'on'};
                const quote = await api('/api/staff/purchases/quote', payload);
                if (ticket !== revision || !node.isConnected) return;
                payload.amountMinor = quote.amountMinor;
                const review = panel.querySelector('#receiptReview');
                review.innerHTML = `<section class="panel"><h3>Confirmar compra</h3><p>Productos: ${money(quote.grossMinor)}<br>Descuento: ${money(quote.discountMinor)}<br><strong>Total pagado: ${money(quote.amountMinor)}</strong></p>${quote.rewardName ? `<p>Premio: ${esc(quote.rewardName)}</p>` : ''}<p>Confirma cuando el cobro o la entrega estén realizados en caja.</p><form id="finishPurchase"><button>Guardar compra y canje</button></form></section>`;
                form('finishPurchase', async (_, confirm) => {
                    if (ticket !== revision) throw new Error('La compra cambió. Revisa el total otra vez.');
                    const result = await api('/api/staff/purchases', payload, 'POST', operationKey(node, payload));
                    counterReceipt(result.replayed ? 'Esta compra ya estaba registrada' : 'Compra guardada', `<p>${esc(member.member.name)}</p><p>Total: <strong>${money(result.amountMinor)}</strong> · Descuento: ${money(result.discountMinor)}</p><p>${result.earned.map(x => x.kind === 'CASHBACK' ? money(x.amount) + ' de cashback' : x.amount + ' ' + esc(kinds[x.kind]).toLowerCase()).join(' · ') || 'Sin acumulación adicional.'}</p><p>${result.redemptionId ? 'El premio quedó canjeado en el mismo comprobante. No lo entregues otra vez.' : 'La tarjeta se actualizará con esta compra.'}</p><p class="small">Recibo: ${esc(result.purchaseId)}</p>`); notice('Comprobante guardado.');
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
        const d = data.design; let logo = d.logoPng, saving = false, loadingLogo = false, logoRevision = 0, example = 'progress', previewProvider = 'apple';
        root.innerHTML = `<section class="panel wallet-design-panel"><h2>Personaliza tu tarjeta</h2><p>Elige el fondo de tu negocio. Te ayudamos a que sus textos se lean bien.</p><div class="wallet-design-layout"><form id="walletDesign"><fieldset id="designFields">
            ${field('displayName', 'Nombre en la tarjeta', 'text', d.displayName, 'maxlength="80"')}
            <h3 class="design-colors-heading">Colores</h3>
            ${field('background', 'Color de fondo', 'color', d.background, 'aria-describedby="backgroundHelp"')}
            <p id="backgroundHelp" class="design-help">Puedes usar cualquier fondo. El texto y las etiquetas deben distinguirse sobre él.</p>
            <label class="check"><input id="autoContrast" type="checkbox" checked>Ajustar texto y etiquetas al cambiar el fondo</label>
            <p class="design-help">El fondo se aplica a ambas Wallet. Apple usa estos colores de texto y etiquetas; Google elige los suyos. Puedes corregir los colores automáticamente o elegirlos abajo.</p>
            <div class="design-color-fields"><div>${field('foreground', 'Color del texto', 'color', d.foreground, 'aria-describedby="foregroundStatus"')}<p id="foregroundStatus" class="design-color-status"></p></div><div>${field('label', 'Color de las etiquetas', 'color', d.label, 'aria-describedby="labelStatus"')}<p id="labelStatus" class="design-color-status"></p></div></div>
            <div class="design-feedback" aria-live="polite" aria-atomic="true"><p id="contrastStatus"></p><p id="contrastAdjustment" class="design-help"></p></div>
            <button type="button" class="quiet" id="fixContrast">Corregir colores</button>
            <label>Logo PNG o JPG<input id="designLogo" type="file" accept="image/png,image/jpeg"></label><p id="logoStatus">${logo ? 'Logo personalizado guardado.' : 'Se usa el logo predeterminado.'}</p><button type="button" class="quiet" id="removeLogo">Usar logo predeterminado</button>
            ${select('featuredProgramId', 'Promoción destacada en Wallet', [['', 'Primera promoción activa'], ...state.data.programs.filter(p => p.config.active !== false).map(p => [p.id, p.config.name])], d.featuredProgramId || '')}<p class="design-help">Apple y Google destacarán esta promoción y su premio de menor costo. Los demás saldos y premios siguen disponibles en los detalles de la tarjeta.</p>
            ${select('stampSymbol', 'Símbolo de los sellos', ['●', '★', '♥', '✂', '◆'].map(x => [x, x]), d.stampSymbol)}
            ${field('welcome', 'Texto de bienvenida', 'text', d.welcome, 'required maxlength="80"')}
            ${field('usage', 'Cómo usar la tarjeta', 'text', d.usage, 'required maxlength="350"')}
            ${field('birthdayMessage', 'Felicitación de cumpleaños', 'text', d.birthdayMessage, 'required maxlength="250"')}
            </fieldset><p id="designSaveHint" class="design-help" aria-live="polite"></p><p id="designSaveError" class="design-error" role="alert" hidden></p><button id="saveDesign" type="submit" aria-describedby="designSaveHint">Guardar diseño</button></form>
            <aside class="design-preview-wrap"><h3>Vista previa de tus Wallet</h3><p class="design-help">Promociones reales, saldos ficticios. Cada Wallet decide la distribución final.</p><div class="wallet-preview-platforms" role="group" aria-label="Wallet de la vista previa"><button type="button" data-preview-provider="apple">Apple Wallet</button><button type="button" data-preview-provider="google">Google Wallet</button></div><p id="previewPlatformHint" class="design-help"></p>
            <div class="wallet-preview-modes" role="group" aria-label="Estado de ejemplo de la tarjeta"><button type="button" data-wallet-example="new">Nueva</button><button type="button" data-wallet-example="progress" class="active">Acumulando</button><button type="button" data-wallet-example="ready">Con premio</button></div>
            <div id="designPreview" class="design-preview"><div class="design-preview-brand"><img id="previewLogo" alt="" hidden><strong id="previewName"></strong></div><div class="wallet-preview-status"><span id="previewStatusLabel" class="design-preview-label"></span><strong id="previewStatus"></strong></div><span id="previewWelcome" class="design-preview-hero"></span><span id="previewProgram" class="design-preview-label"></span><div class="design-preview-bottom"><div><span class="design-preview-label">CLIENTE</span><span>Cliente de ejemplo</span></div><div id="previewPrizeWrap"><span id="previewPrizeLabel" class="design-preview-label"></span><span id="previewPrize"></span></div></div><div class="wallet-preview-code" aria-hidden="true"><span>QR personal</span></div></div>
            <div id="googleDesignPreview" class="google-design-preview" hidden><div class="google-preview-brand"><img id="googlePreviewLogo" alt="" hidden><strong id="googlePreviewName"></strong></div><p class="google-preview-member">Cliente de ejemplo</p><div class="google-preview-values"><div><span id="googlePreviewMainLabel"></span><strong id="googlePreviewMain"></strong></div><div><span id="googlePreviewStatusLabel"></span><strong id="googlePreviewStatus"></strong></div></div><div class="wallet-preview-code" aria-hidden="true"><span>QR personal</span></div></div><div class="wallet-preview-detail" aria-live="polite"><strong id="previewRewardName"></strong><p id="previewRewardConditions" hidden></p><p id="previewRewardDetail"></p><p id="previewStamps"></p></div><p class="design-help">Esta vista no registra compras ni entrega premios. Al guardar, se enviará el diseño a las tarjetas existentes; la recepción depende de la conexión y de Wallet.</p></aside></div></section>`;
        const f = root.querySelector('#walletDesign'), fields = root.querySelector('#designFields');
        const background = f.elements.background, foreground = f.elements.foreground, labels = f.elements.label;
        const auto = root.querySelector('#autoContrast'), save = root.querySelector('#saveDesign'), fix = root.querySelector('#fixContrast');
        const status = root.querySelector('#contrastStatus'), adjustment = root.querySelector('#contrastAdjustment');
        const error = root.querySelector('#designSaveError'), preview = root.querySelector('#designPreview');
        const googlePreview = root.querySelector('#googleDesignPreview');
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
            const amount = !program || example === 'new' ? 0 : reward ? (example === 'ready' ? reward.cost : Math.max(0, reward.cost - 1)) : kind === 'CASHBACK' ? 500 : kind === 'STAMPS' ? 3 : 100;
            const unit = n => kind === 'CASHBACK' ? money(n) : `${n} ${kind === 'STAMPS' ? (n === 1 ? 'sello' : 'sellos') : (n === 1 ? 'punto' : 'puntos')}`;
            const remaining = reward ? Math.max(0, reward.cost - amount) : null;
            root.querySelector('#previewWelcome').textContent = !program ? f.elements.welcome.value || 'Bienvenido' : reward && kind === 'STAMPS' && remaining > 0 ? `${amount} / ${reward.cost}` : unit(amount);
            root.querySelector('#previewProgram').textContent = program?.config.name || 'Tu tarjeta';
            root.querySelector('#previewStatusLabel').textContent = !reward ? 'MEMBRESÍA' : remaining === 0 ? 'PREMIO' : remaining === 1 && kind !== 'CASHBACK' ? 'TE FALTA' : 'TE FALTAN';
            root.querySelector('#previewStatus').textContent = !reward ? 'Activa' : remaining === 0 ? 'Disponible' : unit(remaining);
            root.querySelector('#previewPrizeWrap').hidden = !reward;
            root.querySelector('#previewPrizeLabel').textContent = remaining === 0 ? 'CANJEA EN CAJA' : 'PRÓXIMO PREMIO';
            const compactPrize = [...(reward?.name || '').trim().replace(/\s+/g, ' ')];
            root.querySelector('#previewPrize').textContent = compactPrize.length > 28 ? compactPrize.slice(0, 27).join('') + '…' : compactPrize.join('');
            const conditions = root.querySelector('#previewRewardConditions'); conditions.hidden = !reward?.benefitText; conditions.textContent = reward?.benefitText || '';
            root.querySelector('#previewRewardName').textContent = reward ? `${remaining === 0 ? 'Premio disponible' : 'Próximo premio'} · ${reward.name}` : 'Tu tarjeta, a tu medida';
            root.querySelector('#previewRewardDetail').textContent = reward ? `Saldo de ejemplo: ${unit(amount)}. Canje: ${unit(reward.cost)}. ${remaining === 0 ? `Si canjea este premio, le quedan ${unit(amount - reward.cost)}. Caja confirma el saldo vigente.` : `Te falta${remaining === 1 && kind !== 'CASHBACK' ? '' : 'n'} ${unit(remaining)}.`}` : program ? 'Esta promoción aún no tiene un premio activo. Puedes crearlo en Premios.' : 'Al activar una promoción, aparecerá su saldo. Hasta entonces se muestra tu bienvenida.';
            root.querySelector('#previewStamps').textContent = reward && kind === 'STAMPS' && reward.cost <= 20 ? Array.from({length: reward.cost}, (_, i) => i < amount ? f.elements.stampSymbol.value : '○').join(' ') : '';
            root.querySelectorAll('[data-wallet-example]').forEach(button => {
                const selected = button.dataset.walletExample === example;
                button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
                button.disabled = saving || loadingLogo || button.dataset.walletExample === 'ready' && !reward;
            });
            preview.hidden = previewProvider !== 'apple'; googlePreview.hidden = previewProvider !== 'google';
            root.querySelector('#previewPlatformHint').textContent = previewProvider === 'apple'
                ? 'Apple: saldo en el frente; premios, consumos y sellos en los detalles.'
                : 'Google: saldo y progreso en la tarjeta; premios, consumos y sellos en los detalles. El color del texto lo decide Google.';
            root.querySelectorAll('[data-preview-provider]').forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.previewProvider === previewProvider));
                button.disabled = saving || loadingLogo;
            });
            googlePreview.style.backgroundColor = background.value; googlePreview.style.color = recommended();
            root.querySelector('#googlePreviewName').textContent = f.elements.displayName.value.trim() || state.data.business.name;
            root.querySelector('#googlePreviewMainLabel').textContent = kind === 'CASHBACK' ? state.data.business.currency : kind === 'STAMPS' ? 'Sellos' : kind === 'POINTS' ? 'Puntos' : 'Tarjeta';
            root.querySelector('#googlePreviewMain').textContent = !program ? 'Activa' : reward && kind === 'STAMPS' && remaining > 0 ? `${amount}/${reward.cost}` : kind === 'CASHBACK' ? (amount / 100).toFixed(2) : String(amount);
            root.querySelector('#googlePreviewStatusLabel').textContent = !reward ? 'Estado' : remaining === 0 ? 'Premio' : remaining === 1 && kind !== 'CASHBACK' ? 'Falta' : 'Faltan';
            root.querySelector('#googlePreviewStatus').textContent = !reward ? 'Activa' : remaining === 0 ? 'En caja' : unit(remaining);
            const googleLogo = root.querySelector('#googlePreviewLogo'); googleLogo.hidden = !logo;
            if (logo) googleLogo.src = 'data:image/png;base64,' + logo; else googleLogo.removeAttribute('src');
            const image = root.querySelector('#previewLogo'); image.hidden = !logo;
            if (logo) image.src = 'data:image/png;base64,' + logo; else image.removeAttribute('src');
            return !failed.length;
        }
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
            const payload = {expectedVersion: data.version, design: {...values, featuredProgramId: values.featuredProgramId || null, logoPng: logo}};
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
                body.innerHTML = `<div class="profile-intro"><p>Cliente desde ${esc(date(d.member.joinedAt))}</p><button type="button" id="serveCustomer">Atender en Caja →</button></div><div class="profile-metrics">${metric('Compras', s.purchases)}${metric('Total pagado', money(s.spentMinor))}${metric('Premios reclamados', s.claimedRewards)}${metric('Frecuencia media', s.averageDaysBetweenPurchases === null ? 'Aún sin calcular' : Number(s.averageDaysBetweenPurchases).toFixed(1) + ' días')}</div><p class="small">Todo el historial · Última compra: ${esc(date(s.lastPurchase))}. Descuentos registrados: ${esc(money(s.discountMinor))}.</p><section class="profile-section"><h3>Sus próximos premios</h3><div class="customer-reward-list">${d.rewardProgress.map(r => `<div><strong>${esc(r.name)}</strong><p>${esc(r.program)}</p><span class="${r.remaining === 0 ? 'customer-ready' : 'customer-near'}">${esc(rewardText(r))}</span></div>`).join('') || '<p>Aún no tiene saldo en promociones activas con premios.</p>'}</div><p class="small">Hasta 100 premios activos con saldo. Los de una misma promoción son alternativas. Caja comprueba identidad, condiciones y saldo vigente.</p></section><section class="profile-section"><h3>Historial de movimientos</h3><div class="row timeline-filters"><div>${select('timelineKind', 'Tipo de movimiento', [['ALL', 'Todos'], ['PURCHASE', 'Compras'], ['REWARD', 'Canjes']])}</div><div>${select('timelineBranch', 'Sucursal', [['', 'Todas las sucursales'], ...state.data.branches.map(b => [b.id, b.name])])}</div></div><div id="customerTimeline" aria-live="polite"></div><p class="small">El historial conserva las operaciones confirmadas aunque su promoción haya terminado. Filtrar movimientos no cambia los totales de la ficha.</p></section><details class="profile-section"><summary>Cumpleaños y preferencias</summary><form id="customerPreferences">${field('birthday', 'Mes y día de cumpleaños (MM-DD, opcional)', 'text', p.birthday || '', 'placeholder="11-04" pattern="[0-9]{2}-[0-9]{2}"')}<label class="check"><input name="marketingConsent" type="checkbox" ${checked(p.marketingConsent)}>El cliente quiere recibir felicitaciones y anuncios del negocio.</label><label class="check"><input name="confirmed" type="checkbox" required>El cliente autorizó estas preferencias.</label><button>Guardar preferencias</button></form></details>`;
                drawTimeline(d.timeline);
                dialog.querySelector('#timelineKind').onchange = e => { timelineKind = e.target.value; loadTimeline(0); };
                dialog.querySelector('#timelineBranch').onchange = e => { timelineBranch = e.target.value; loadTimeline(0); };
                dialog.querySelector('#serveCustomer').onclick = () => {
                    if (!valid() || !closeCustomerDrawer()) return;
                    state.tab = 'sales'; renderMerchant();
                    const lookup = document.querySelector('#lookup');
                    lookup.elements.kind.value = 'cardCode'; lookup.elements.value.value = d.member.cardCode; lookup.requestSubmit();
                };
                form('customerPreferences', async v => {
                    try { await api('/api/staff/customer-insights/' + encodeURIComponent(memberId) + '/preferences', {preferences: {birthday: v.birthday || null, marketingConsent: v.marketingConsent === 'on'}, customerConfirmed: v.confirmed === 'on'}, 'PUT'); }
                    finally { if (valid()) dialog.querySelector('#customerDrawerStatus').textContent = ''; }
                    if (valid()) { dialog.querySelector('#customerPreferences').elements.confirmed.checked = false; dialog.querySelector('#customerDrawerStatus').textContent = 'Preferencias guardadas.'; }
                });
            } catch (e) { if (!valid()) return; body.innerHTML = `<p role="alert">${esc(e.message)}</p><button type="button" id="retryProfile">Volver a intentar</button>`; body.querySelector('button').onclick = load; }
        };
        await load();
    };
    window.openCustomerSegment = function (segment) {
        if (customerBusy()) { notice('Espera a que termine la operación.'); return; }
        customerFilterTenant = state.data.business.id + ':' + state.token;
        Object.assign(customerFilters, {days: 30, inactiveDays: 30, segment, q: '', sort: 'RECENT'});
        state.tab = 'customers'; renderMerchant(); document.querySelector('#sectionTitle')?.focus();
    };
    async function eventsPage() {
        const root = document.querySelector('#content'); const d = await api('/api/staff/customer-events'); if (!root.isConnected || state.tab !== 'events') return;
        root.innerHTML = `<section class="panel"><h2>Eventos y avisos para tus clientes</h2><p>Se mostrarán automáticamente en los detalles de Wallet durante las fechas elegidas, a quienes aceptaron anuncios. Las felicitaciones usan el día de cumpleaños y el texto de Mi tarjeta.</p><p class="small">Los avisos comerciales de esta versión actualizan el contenido de la tarjeta; no prometen una alerta en la pantalla bloqueada. Los avisos de progreso dependen de las notificaciones y actualizaciones que el cliente permita en Wallet.</p><form id="customerEvent">${field('title', 'Título', 'text', '', 'required maxlength="80"')}${field('body', 'Mensaje', 'text', '', 'required maxlength="500"')}${field('startsAt', 'Mostrar desde', 'datetime-local', '', 'required')}${field('endsAt', 'Mostrar hasta', 'datetime-local', '', 'required')}<p>Zona horaria: ${esc(state.data.business.timezone)}</p><button>Programar aviso</button></form></section><section class="panel"><h2>Avisos programados</h2>${d.events.map(e => `<div><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p><p>${esc(date(e.startsAt))} — ${esc(date(e.endsAt))}</p>${e.active ? `<button class="quiet" data-cancel-event="${esc(e.id)}">Desactivar aviso</button>` : '<p>Desactivado</p>'}</div>`).join('') || '<p>No hay avisos todavía.</p>'}</section>`;
        form('customerEvent', async (v, node) => { const payload = {...v, startsAt: utcDateTime(v.startsAt), endsAt: utcDateTime(v.endsAt)}; await api('/api/staff/customer-events', payload, 'POST', operationKey(node, payload)); await eventsPage(); notice('Aviso programado.'); });
        root.querySelectorAll('[data-cancel-event]').forEach(b => b.onclick = safe(async () => { await api('/api/staff/customer-events/' + b.dataset.cancelEvent, {}, 'DELETE'); await eventsPage(); }));
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
