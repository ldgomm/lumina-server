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
            const button = document.createElement('button'); button.textContent = label; button.classList.toggle('active', state.tab === tab);
            button.onclick = safe(async () => { state.tab = tab; renderMerchant(); }); nav.append(button);
            if (state.tab === tab) render().catch(e => notice(e.message));
        }
    };
    let editingProgram = null;
    const existingPrograms = renderPrograms;
    renderPrograms = function (edit = null) {
        editingProgram = edit;
        existingPrograms(edit);
        const root = document.querySelector('#content');
        const panel = document.createElement('section'); panel.className = 'panel';
        panel.innerHTML = `<h2>Crear una promoción en un paso</h2><p>Los botones son ejemplos editables. Puedes configurar tu propia categoría, cantidad, porcentaje y premio.</p><div class="row"><button type="button" data-template="pizza">Sexta pizza gratis</button><button type="button" data-template="cafe">Quinto café al 50%</button><button type="button" data-template="ropa">Segunda compra al 20%</button><button type="button" data-template="corte">Octavo corte gratis</button></div><form id="promotionTemplate">${field('promoName', 'Nombre de la promoción', 'text', 'Sexta pizza gratis', 'required maxlength="120"')}${field('group', 'Categoría que cuenta', 'text', 'pizza', 'required maxlength="60"')}${select('mode', 'Acumula por', [['units', 'Producto o servicio pagado'], ['visits', 'Compra con productos de esta categoría']])}${field('nth', 'El premio corresponde al número…', 'number', 6, 'required min="2" max="101"')}${field('percent', 'Descuento del premio (%)', 'number', 100, 'required min="0.01" max="100" step="0.01"')}${field('rewardName', 'Nombre del premio', 'text', 'Pizza gratis', 'required maxlength="120"')}<p id="templateExplanation"></p><button>Crear promoción y premio</button></form><p class="small">Después puedes ajustar fechas, horarios, bonos y sucursales en la promoción. El premio se aplica a una unidad —la de menor precio elegible— o al total de la categoría, según el modo. Se canjea un premio por comprobante, con saldo acumulado antes de esa compra.</p>`;
        root.prepend(panel);
        const f = panel.querySelector('form');
        const explain = () => panel.querySelector('#templateExplanation').textContent = `Acumula ${Number(f.elements.nth.value) - 1} sellos pagados y usa el premio en la compra siguiente. Una compra con canje no acumula en esa misma promoción.`;
        f.oninput = explain; explain();
        const presets = {pizza: ['Sexta pizza gratis', 'pizza', 6, 100, 'Pizza gratis', 'units'], cafe: ['Quinto café al 50%', 'café', 5, 50, '50% en un café', 'units'], ropa: ['Segunda compra de ropa al 20%', 'ropa', 2, 20, '20% en ropa', 'visits'], corte: ['Octavo corte gratis', 'corte', 8, 100, 'Corte gratis', 'units']};
        panel.querySelectorAll('[data-template]').forEach(b => b.onclick = () => { const v = presets[b.dataset.template]; ['promoName', 'group', 'nth', 'percent', 'rewardName', 'mode'].forEach((name, i) => f.elements[name].value = v[i]); explain(); });
        form('promotionTemplate', async (v, node) => { const payload = {name: v.promoName, group: v.group.trim(), nth: Number(v.nth), percentBps: Math.round(Number(v.percent) * 100), countUnits: v.mode === 'units', rewardName: v.rewardName}; await api('/api/staff/promotion-templates', payload, 'POST', operationKey(node, payload)); await merchant(); notice('Promoción y premio creados.'); });
    };

    function enhancePurchase() {
        const f = document.querySelector('#purchase'); if (!f || f.dataset.productsReady) return;
        f.dataset.productsReady = 'true';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = 'Registrar productos y aplicar un descuento'; f.prepend(button);
        button.onclick = () => checkout(f, state.member);
        if (state.data.programs.some(p => p.config.productGroup || p.config.countUnits)) checkout(f, state.member);
    }
    function checkout(old, member) {
        let rows = [{name: '', group: '', quantity: 1, unitMinor: 0}];
        const panel = document.createElement('div'); old.replaceWith(panel);
        const rewards = member.rewards.filter(r => r.active && r.benefit && (member.balances.find(b => b.programId === r.programId)?.available || 0) >= r.cost);
        const categories = [...new Set(state.data.programs.map(p => p.config.productGroup).filter(Boolean))];
        let common = {branchId: state.data.branches[0]?.id || '', receipt: '', reward: '', programs: state.data.programs.filter(p => p.config.active).map(p => p.id)};
        const readRows = f => [...f.querySelectorAll('[data-line]')].map(line => ({name: line.querySelector('[data-name]').value.trim(), group: line.querySelector('[data-group]').value.trim(), quantity: Number(line.querySelector('[data-quantity]').value), unitMinor: Math.round(Number(line.querySelector('[data-price]').value) * 100)}));
        const keep = f => { rows = readRows(f); common = {branchId: f.elements.branchId.value, receipt: f.elements.receipt.value, reward: f.elements.reward.value, programs: [...f.querySelectorAll('[name=program]:checked')].map(x => x.value)}; };
        const draw = () => {
            panel.innerHTML = `<form id="productPurchase"><label>Sucursal</label><select name="branchId" required>${options(state.data.branches, common.branchId)}</select>${field('receipt', 'Comprobante único', 'text', common.receipt, 'required maxlength="100"')}<datalist id="productGroups">${categories.map(g => `<option value="${esc(g)}">`).join('')}</datalist>${rows.map((r, i) => `<fieldset data-line><legend>Producto ${i + 1}</legend><label>Producto o servicio<input data-name required maxlength="100" value="${esc(r.name)}"></label><label>Categoría<input data-group required list="productGroups" maxlength="60" value="${esc(r.group)}"></label><div class="row"><label>Cantidad<input data-quantity type="number" min="1" max="100" required value="${r.quantity}"></label><label>Precio por unidad<input data-price type="number" min="0.01" max="10000000" step="0.01" required value="${r.unitMinor ? r.unitMinor / 100 : ''}"></label></div>${rows.length > 1 ? `<button type="button" class="quiet" data-remove="${i}">Quitar producto</button>` : ''}</fieldset>`).join('')}<button type="button" class="quiet" id="addProduct" ${rows.length >= 30 ? 'disabled' : ''}>Añadir producto</button><details><summary>Promociones que aplican</summary><p>Solo acumulan las que coincidan con los productos, fechas y sucursal.</p>${state.data.programs.filter(p => p.config.active).map(p => `<label class="check"><input type="checkbox" name="program" value="${esc(p.id)}" ${checked(common.programs.includes(p.id))}>${esc(p.config.name)}</label>`).join('')}</details>${select('reward', 'Premio para aplicar en esta compra', [['', 'Sin canje'], ...rewards.map(r => [r.id, r.name])], common.reward)}<div id="purchaseConsent"><label class="check"><input name="verified" type="checkbox">Verifiqué al titular.</label><label class="check"><input name="confirmed" type="checkbox">El cliente pidió este premio y acepta usar sus sellos.</label></div><button>Revisar total y descuento</button></form><div id="receiptReview"></div>`;
            const f = panel.querySelector('form'); let revision = 0;
            const consent = () => { const enabled = Boolean(f.elements.reward.value); panel.querySelector('#purchaseConsent').hidden = !enabled; f.elements.verified.required = f.elements.confirmed.required = enabled; };
            consent(); f.elements.reward.onchange = consent;
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
                    panel.innerHTML = `<section class="panel"><h3>${result.replayed ? 'Esta compra ya estaba registrada' : 'Compra guardada'}</h3><p>Total: ${money(result.amountMinor)} · Descuento: ${money(result.discountMinor)}</p><p>${result.earned.map(x => `${x.amount} ${esc(kinds[x.kind])}`).join(' · ') || 'Sin acumulación adicional.'}</p><p>${result.redemptionId ? 'El premio quedó canjeado en el mismo comprobante. No lo entregues otra vez.' : 'La tarjeta se actualizará con esta compra.'}</p><p class="small">Recibo: ${esc(result.purchaseId)}</p><p>Busca al cliente nuevamente para otra operación.</p></section>`; notice('Comprobante guardado.');
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
        const d = data.design; let logo = d.logoPng, saving = false, loadingLogo = false, logoRevision = 0;
        root.innerHTML = `<section class="panel wallet-design-panel"><h2>Personaliza tu tarjeta</h2><p>Elige el fondo de tu negocio. Te ayudamos a que sus textos se lean bien.</p><div class="wallet-design-layout"><form id="walletDesign"><fieldset id="designFields">
            ${field('displayName', 'Nombre en la tarjeta', 'text', d.displayName, 'maxlength="80"')}
            <h3 class="design-colors-heading">Colores</h3>
            ${field('background', 'Color de fondo', 'color', d.background, 'aria-describedby="backgroundHelp"')}
            <p id="backgroundHelp" class="design-help">Puedes usar cualquier fondo. El texto y las etiquetas deben distinguirse sobre él.</p>
            <label class="check"><input id="autoContrast" type="checkbox" checked>Ajustar texto y etiquetas al cambiar el fondo</label>
            <p class="design-help">Solo ajustamos los colores que no se leen. También puedes elegirlos manualmente abajo.</p>
            <div class="design-color-fields"><div>${field('foreground', 'Color del texto', 'color', d.foreground, 'aria-describedby="foregroundStatus"')}<p id="foregroundStatus" class="design-color-status"></p></div><div>${field('label', 'Color de las etiquetas', 'color', d.label, 'aria-describedby="labelStatus"')}<p id="labelStatus" class="design-color-status"></p></div></div>
            <div class="design-feedback" aria-live="polite" aria-atomic="true"><p id="contrastStatus"></p><p id="contrastAdjustment" class="design-help"></p></div>
            <button type="button" class="quiet" id="fixContrast">Corregir colores</button>
            <label>Logo PNG o JPG<input id="designLogo" type="file" accept="image/png,image/jpeg"></label><p id="logoStatus">${logo ? 'Logo personalizado guardado.' : 'Se usa el logo predeterminado.'}</p><button type="button" class="quiet" id="removeLogo">Usar logo predeterminado</button>
            ${select('featuredProgramId', 'Saldo destacado', [['', 'Mantener el orden actual'], ...state.data.programs.map(p => [p.id, p.config.name])], d.featuredProgramId || '')}
            ${select('stampSymbol', 'Símbolo de los sellos', ['●', '★', '♥', '✂', '◆'].map(x => [x, x]), d.stampSymbol)}
            ${field('welcome', 'Texto de bienvenida', 'text', d.welcome, 'required maxlength="80"')}
            ${field('usage', 'Cómo usar la tarjeta', 'text', d.usage, 'required maxlength="350"')}
            ${field('birthdayMessage', 'Felicitación de cumpleaños', 'text', d.birthdayMessage, 'required maxlength="250"')}
            </fieldset><p id="designSaveHint" class="design-help" aria-live="polite"></p><p id="designSaveError" class="design-error" role="alert" hidden></p><button id="saveDesign" type="submit" aria-describedby="designSaveHint">Guardar diseño</button></form>
            <aside class="design-preview-wrap"><h3>Vista previa de colores</h3><p class="design-help">Datos de ejemplo. Apple y Google determinan la distribución final en Wallet.</p><div id="designPreview" class="design-preview"><div class="design-preview-brand"><img id="previewLogo" alt="" hidden><strong id="previewName"></strong></div><span id="previewWelcome" class="design-preview-hero"></span><span class="design-preview-label">SALDO DISPONIBLE</span><strong class="design-preview-balance">100 puntos</strong><div class="design-preview-bottom"><div><span class="design-preview-label">CLIENTE</span><span>Cliente de ejemplo</span></div><div><span class="design-preview-label">SELLOS</span><span id="previewStamps"></span></div></div></div><p class="design-help">Los cambios se enviarán a las tarjetas existentes al guardar.</p></aside></div></section>`;
        const f = root.querySelector('#walletDesign'), fields = root.querySelector('#designFields');
        const background = f.elements.background, foreground = f.elements.foreground, labels = f.elements.label;
        const auto = root.querySelector('#autoContrast'), save = root.querySelector('#saveDesign'), fix = root.querySelector('#fixContrast');
        const status = root.querySelector('#contrastStatus'), adjustment = root.querySelector('#contrastAdjustment');
        const error = root.querySelector('#designSaveError'), preview = root.querySelector('#designPreview');
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
            root.querySelector('#previewWelcome').textContent = f.elements.welcome.value || 'Bienvenido';
            root.querySelector('#previewStamps').textContent = f.elements.stampSymbol.value.repeat(3) + '○○';
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
                const scale = Math.min(160 / bitmap.width, 36 / bitmap.height, 1);
                const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
                const value = canvas.toDataURL('image/png').split(',')[1];
                if (value.length > 26668) throw new Error('El logo tiene demasiado detalle. Usa una imagen más sencilla.');
                logo = value; root.querySelector('#logoStatus').textContent = 'Logo preparado para guardar.';
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
            clearError(); saving = true; fields.disabled = true; update();
            try {
                await api('/api/staff/wallet-design', payload, 'PUT');
                notice('Diseño guardado. Se actualizará en Wallet.');
                if (f.isConnected && state.tab === 'design') await designPage();
            } catch (issue) {
                if (f.isConnected) { error.textContent = issue.message; error.hidden = false; }
            } finally {
                saving = false; fields.disabled = false; if (f.isConnected) update();
            }
        });
        f.dataset.palette = [background.value, foreground.value, labels.value].join('/'); update();
    }

    const customerFilters = {days: 30, inactiveDays: 30, segment: 'ALL', q: ''};
    let customerRequest = 0, customerFilterTenant = null;
    async function customersPage(offset = 0) {
        if (customerFilterTenant !== state.data.business.id) {
            Object.assign(customerFilters, {days: 30, inactiveDays: 30, segment: 'ALL', q: ''});
            customerFilterTenant = state.data.business.id; offset = 0;
        }
        const root = document.querySelector('#content'), request = ++customerRequest;
        root.innerHTML = '<section class="panel" role="status">Consultando tus clientes…</section>';
        const params = new URLSearchParams({...customerFilters, offset});
        let d;
        try { d = await api('/api/staff/customer-activity?' + params); }
        catch (e) {
            if (!root.isConnected || state.tab !== 'customers' || request !== customerRequest) return;
            root.innerHTML = `<section class="panel"><h2>No pudimos cargar los clientes</h2><p role="alert">${esc(e.message)}</p><button id="retryCustomers">Volver a intentar</button></section>`;
            action('retryCustomers', () => customersPage(offset)); return;
        }
        if (!root.isConnected || state.tab !== 'customers' || request !== customerRequest) return;
        if (offset > 0 && offset >= d.total) return customersPage(Math.max(0, Math.floor((d.total - 1) / 50) * 50));
        const s = d.summary;
        const segments = [['ALL', 'Todos', s.registeredCustomers], ['NEAR', 'A un sello', s.nearCustomers], ['READY', 'Con premio', s.readyCustomers], ['RETURNING', 'Han vuelto', s.returningCustomers], ['INACTIVE', 'Sin volver', s.inactiveCustomers], ['NEW', 'Sin compras', s.newCustomers]];
        const metric = (label, value, help) => `<div class="customer-metric"><span>${label}</span><strong>${value}</strong><small>${help}</small></div>`;
        root.innerHTML = `<section class="panel"><div class="customer-heading"><div><h2>Quién vuelve a tu negocio</h2><p>Todas tus sucursales, en un solo lugar.</p></div><button class="quiet" id="refreshCustomers">Actualizar</button></div>
            <form id="customerFilters" class="customer-filters"><div>${select('days', 'Resumen del período', [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días']], String(customerFilters.days))}</div><div>${field('q', 'Buscar cliente por nombre', 'search', customerFilters.q, 'maxlength="100" autocomplete="off"')}</div><div>${field('inactiveDays', 'Sin volver desde hace (días)', 'number', customerFilters.inactiveDays, 'required min="1" max="365" step="1"')}</div><button>Aplicar filtros</button></form>
            <p class="small">${esc(date(d.from))} — ${esc(date(d.through))} · ${esc(d.timezone)}. Incluye el día actual.</p>
            <div class="customer-metrics">${metric('Compras registradas', s.periodPurchases, 'Comprobantes del período')}${metric('Gasto de clientes', money(s.periodSpentMinor), 'Total pagado después de descuentos')}${metric('Clientes que compraron', s.periodBuyers, `${s.periodReturningBuyers} ya tienen más de una compra`)}${metric('Premios reclamados', s.periodClaimedRewards, 'Canjes confirmados en el período')}</div>
            <p class="small">Descuentos en comprobantes: <strong>${money(s.periodDiscountMinor)}</strong>. El resumen abarca el negocio completo; la búsqueda y los grupos filtran la lista de abajo.</p>
        </section><section class="panel"><h2>Clientes y oportunidades de regreso</h2><p>La lista usa todo el historial. “Sin volver” cuenta días desde la última compra; “Sin compras” incluye a quienes aún no registran ninguna.</p><div class="customer-segments" role="group" aria-label="Filtrar clientes">${segments.map(([key, label, count]) => `<button type="button" class="quiet" data-segment="${key}" aria-pressed="${customerFilters.segment === key}">${label} <span>${count}</span></button>`).join('')}</div>
            <p class="small" id="customerPageCount" role="status">${d.total ? `${offset + 1}–${offset + d.customers.length} de ${d.total} clientes` : 'No hay clientes para estos filtros.'}</p>
            <div class="commercial-table-wrap"><table class="commercial-table customer-table"><caption class="small">Historial acumulado y premios de promociones activas</caption><thead><tr><th>Cliente</th><th>Compras / gasto</th><th>Frecuencia media</th><th>Premios</th><th>Última compra</th></tr></thead><tbody>${d.customers.map(c => `<tr><td><button class="quiet" data-customer="${esc(c.id)}">${esc(c.name)}</button><small>${c.returning ? 'Ha vuelto' : c.purchases ? 'Una compra registrada' : 'Aún no compra'}</small></td><td>${c.purchases}<small>${money(c.spentMinor)}</small></td><td>${c.averageDaysBetweenPurchases === null ? '—' : Number(c.averageDaysBetweenPurchases).toFixed(1) + ' días'}</td><td><div class="customer-prizes">${c.readyRewards ? `<span class="customer-ready">${c.readyRewards} premio${c.readyRewards === 1 ? '' : 's'} por canjear</span>` : ''}${c.nearRewards ? '<span class="customer-near">A un sello de un premio</span>' : ''}<small>${c.claimedRewards} reclamados</small></div></td><td>${esc(date(c.lastPurchase))}${c.daysSinceLastPurchase === null ? '' : `<small>Hace ${c.daysSinceLastPurchase} día${c.daysSinceLastPurchase === 1 ? '' : 's'}</small>`}</td></tr>`).join('') || '<tr><td colspan="5">Prueba otro grupo o borra la búsqueda por nombre.</td></tr>'}</tbody></table></div>
            <div class="row customer-pagination"><button class="quiet" id="customersPrev" ${offset ? '' : 'disabled'}>Anterior</button><button class="quiet" id="customersNext" ${d.hasMore ? '' : 'disabled'}>Siguiente</button></div><p class="small">Los premios de una misma promoción son alternativas: el saldo se comprueba otra vez en caja. Las promociones pausadas o eliminadas no se incluyen.</p>
        </section><div id="customerDetail"></div>`;
        form('customerFilters', async v => { customerFilters.days = Number(v.days); customerFilters.inactiveDays = Number(v.inactiveDays); customerFilters.q = v.q.trim(); await customersPage(); });
        action('refreshCustomers', () => customersPage(offset));
        action('customersPrev', () => customersPage(Math.max(0, offset - 50))); action('customersNext', () => customersPage(offset + 50));
        root.querySelectorAll('[data-segment]').forEach(b => b.onclick = safe(async () => { customerFilters.segment = b.dataset.segment; await customersPage(); }));
        let detailRequest = 0;
        root.querySelectorAll('[data-customer]').forEach(b => b.onclick = safe(async () => {
            const chosen = ++detailRequest, target = root.querySelector('#customerDetail');
            target.innerHTML = '<section class="panel" role="status">Consultando el historial…</section>';
            let details;
            try { details = await api('/api/staff/customer-insights/' + b.dataset.customer); }
            catch (e) { if (chosen === detailRequest && target.isConnected) target.innerHTML = `<section class="panel" role="alert">${esc(e.message)}. Selecciona al cliente para volver a intentar.</section>`; return; }
            if (!root.isConnected || !target.isConnected || state.tab !== 'customers' || chosen !== detailRequest) return;
            const p = details.preferences;
            const rewardText = r => {
                if (!r.remaining) return 'Saldo suficiente para canjear';
                if (r.kind === 'CASHBACK') return 'Faltan ' + money(r.remaining);
                return `Falta${r.remaining === 1 ? '' : 'n'} ${r.remaining} ${r.kind === 'STAMPS' ? (r.remaining === 1 ? 'sello' : 'sellos') : (r.remaining === 1 ? 'punto' : 'puntos')}`;
            };
            target.innerHTML = `<section class="panel"><h2 tabindex="-1">${esc(b.textContent)}</h2><h3>Progreso de sus premios</h3><div class="customer-reward-list">${details.rewardProgress.map(r => `<div><strong>${esc(r.name)}</strong><p>${esc(r.program)}</p><span class="${r.remaining === 0 ? 'customer-ready' : 'customer-near'}">${esc(rewardText(r))}</span></div>`).join('') || '<p>No tiene saldo acumulado en promociones activas con premios.</p>'}</div><p class="small">Se muestran hasta 100 premios con saldo y los 100 movimientos más recientes de cada tipo. Canjea desde Caja, donde se verifican identidad, condiciones y saldo vigente.</p><h3>Compras recientes</h3>${details.purchases.map(x => `<div><strong>${esc(date(x.at))} · ${esc(x.branch)} · ${money(x.paidMinor)}</strong><p>${x.items.map(i => `${i.quantity} × ${esc(i.name)} (${esc(i.group)})`).join(' · ') || 'Compra anterior sin detalle de productos.'}${x.discountMinor ? ' · Descuento: ' + money(x.discountMinor) : ''}</p></div>`).join('') || '<p>Todavía no hay compras.</p>'}<h3>Premios reclamados</h3>${details.rewards.map(x => `<p>${esc(x.name)} · ${esc(date(x.at))}</p>`).join('') || '<p>Todavía no hay canjes.</p>'}<details><summary>Cumpleaños y preferencias</summary><form id="customerPreferences">${field('birthday', 'Mes y día de cumpleaños (MM-DD, opcional)', 'text', p.birthday || '', 'placeholder="11-04" pattern="[0-9]{2}-[0-9]{2}"')}<label class="check"><input name="marketingConsent" type="checkbox" ${checked(p.marketingConsent)}>El cliente quiere recibir felicitaciones y anuncios del negocio.</label><label class="check"><input name="confirmed" type="checkbox" required>El cliente autorizó estas preferencias.</label><button>Guardar preferencias</button></form></details></section>`;
            target.querySelector('h2').focus({preventScroll: true});
            target.scrollIntoView({behavior: 'smooth', block: 'start'});
            form('customerPreferences', async v => { await api('/api/staff/customer-insights/' + b.dataset.customer + '/preferences', {preferences: {birthday: v.birthday || null, marketingConsent: v.marketingConsent === 'on'}, customerConfirmed: v.confirmed === 'on'}, 'PUT'); notice('Preferencias guardadas.'); });
        }));
    }
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
        const editor = document.querySelector('#programV7');
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
