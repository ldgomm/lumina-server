'use strict';
(() => {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const emptyWindow = () => ({startsAt: null, endsAt: null, weekdays: [1, 2, 3, 4, 5, 6, 7], localStart: null, localEnd: null});
    const branchFields = (prefix, selected) => `<fieldset><legend>Sucursales</legend><p class="small">Sin marcar: todas las sucursales actuales y futuras.</p>${state.data.branches.map(b => `<label class="check"><input type="checkbox" name="${prefix}branch" value="${esc(b.id)}" ${selected.includes(b.id) ? 'checked' : ''}>${esc(b.name)}</label>`).join('')}</fieldset>`;
    const windowFields = (prefix, w) => `${field(prefix + 'start', 'Fecha y hora de inicio', 'datetime-local', localDateTime(w.startsAt), 'data-original="' + esc(w.startsAt || '') + '" data-display="' + esc(localDateTime(w.startsAt)) + '"')}${field(prefix + 'end', 'Fecha y hora final', 'datetime-local', localDateTime(w.endsAt), 'data-original="' + esc(w.endsAt || '') + '" data-display="' + esc(localDateTime(w.endsAt)) + '"')}<fieldset><legend>Días de la semana</legend><div class="row">${days.map((name, i) => `<label class="check"><input type="checkbox" name="${prefix}day" value="${i + 1}" ${w.weekdays.includes(i + 1) ? 'checked' : ''}>${name}</label>`).join('')}</div></fieldset><div class="row"><div>${field(prefix + 'from', 'Hora de inicio diaria', 'time', w.localStart || '', 'step="1"')}</div><div>${field(prefix + 'until', 'Hora final diaria', 'time', w.localEnd || '', 'step="1"')}</div></div><p class="small">Deja ambas horas vacías para todo el día. Un horario de 22:00 a 02:00 termina al día siguiente.</p>`;
    const values = (form, name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);
    const readMoment = input => input.value === input.dataset.display ? (input.dataset.original || null) : utcDateTime(input.value);
    const readWindow = (form, prefix) => ({startsAt: readMoment(form.elements[prefix + 'start']), endsAt: readMoment(form.elements[prefix + 'end']), weekdays: values(form, prefix + 'day').map(Number), localStart: form.elements[prefix + 'from'].value || null, localEnd: form.elements[prefix + 'until'].value || null});
        async function showProgramRemoval(programId) {
        document.querySelector('#removePromotionDialog')?.remove();
        const dialog = document.createElement('dialog'); dialog.id = 'removePromotionDialog'; dialog.className = 'promotion-removal';
        dialog.setAttribute('aria-labelledby', 'removePromotionTitle'); document.body.append(dialog);
        let busy = false, review = null, mustReview = false, deletionKey = crypto.randomUUID();
        dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
        dialog.addEventListener('close', () => dialog.remove());
        const close = () => { if (!busy) { dialog.close(); dialog.remove(); } };
        async function load() {
            review = null; mustReview = true;
            dialog.innerHTML = '<h2 id="removePromotionTitle">Eliminar promoción</h2><p role="status">Consultando clientes y saldos afectados…</p><button type="button" id="closeRemoval">Cancelar</button>';
            dialog.querySelector('#closeRemoval').onclick = close;
            try {
                const result = await api('/api/staff/programs/' + programId + '/deletion-preview');
                if (!dialog.isConnected) return;
                review = result; mustReview = false; deletionKey = crypto.randomUUID();
                const units = value => review.kind === 'CASHBACK' ? (Number(value) / 100).toFixed(2) + ' ' + review.currency : value + ' ' + (review.kind === 'STAMPS' ? 'sellos' : 'puntos');
                dialog.innerHTML = `<h2 id="removePromotionTitle">Eliminar «${esc(review.name)}»</h2><p><strong>Esta acción es definitiva y no se puede deshacer.</strong></p><dl class="removal-impact"><dt>Clientes con saldo o canjes pendientes</dt><dd>${review.customersWithBalance}</dd><dt>Saldo disponible que se perderá</dt><dd>${esc(units(review.available))}</dd><dt>Saldo reservado que se perderá</dt><dd>${esc(units(review.reserved))}</dd><dt>Canjes pendientes que se cancelarán</dt><dd>${review.pendingRedemptions}</dd><dt>Premios vinculados que se retirarán</dt><dd>${review.rewards}</dd></dl><p>Se retirará del registro y de las tarjetas de los ${review.registeredCustomers} clientes del negocio, en todas sus sucursales. Wallet puede tardar en recibir la actualización.</p><p>Las tarjetas, las otras promociones y el historial de compras y canjes se conservan. Esta promoción y sus saldos no podrán recuperarse.</p><form id="confirmPromotionRemoval"><label class="check"><input id="acknowledgeRemoval" type="checkbox" required>Entiendo que se perderán estos saldos y se cancelarán los canjes pendientes.</label><label for="removalWords">Escribe ELIMINAR para confirmar</label><input id="removalWords" autocomplete="off" spellcheck="false" required pattern="ELIMINAR"><p id="removalError" class="design-error" role="alert" hidden></p><p id="removalBusy" role="status" hidden>Eliminando la promoción…</p><div class="row"><button type="button" class="quiet" id="cancelRemoval">Conservar promoción</button><button type="submit" class="danger" id="deletePromotion" disabled>Eliminar definitivamente</button></div><button type="button" class="quiet" id="refreshRemoval" hidden>Actualizar aviso</button></form>`;
                const f = dialog.querySelector('form'), button = dialog.querySelector('#deletePromotion');
                const ack = dialog.querySelector('#acknowledgeRemoval'), words = dialog.querySelector('#removalWords');
                const refresh = dialog.querySelector('#refreshRemoval'), cancel = dialog.querySelector('#cancelRemoval');
                const update = () => { button.disabled = busy || mustReview || !ack.checked || words.value !== 'ELIMINAR'; };
                f.addEventListener('input', update); f.addEventListener('change', update); cancel.onclick = close; refresh.onclick = load;
                f.onsubmit = async e => {
                    e.preventDefault(); update(); if (button.disabled || !f.reportValidity()) return;
                    const body = {expectedVersion: review.version, expectedImpact: review.impactHash, confirmation: words.value, acknowledged: ack.checked};
                    busy = true; update(); ack.disabled = words.disabled = cancel.disabled = refresh.disabled = true;
                    const error = dialog.querySelector('#removalError'); error.hidden = true; dialog.querySelector('#removalBusy').hidden = false;
                    try {
                        await api('/api/staff/programs/' + programId, body, 'DELETE', deletionKey);
                        busy = false; close(); state.tab = 'programs'; notice('Promoción eliminada definitivamente. Las tarjetas se actualizarán.');
                        try { await merchant(); } catch { notice('Promoción eliminada. Recarga el panel para ver los cambios.'); }
                    } catch (issue) {
                        if (!dialog.isConnected) return;
                        mustReview = issue.code === 'DELETION_REVIEW_CHANGED' || issue.status === 404;
                        error.textContent = issue.message; error.hidden = false;
                        refresh.hidden = !mustReview;
                        if (mustReview) { ack.checked = false; words.value = ''; }
                    } finally {
                        busy = false;
                        if (dialog.isConnected) { ack.disabled = words.disabled = cancel.disabled = refresh.disabled = false; dialog.querySelector('#removalBusy').hidden = true; update(); }
                    }
                };
                cancel.focus();
            } catch (issue) {
                if (!dialog.isConnected) return;
                dialog.innerHTML = `<h2 id="removePromotionTitle">Eliminar promoción</h2><p class="design-error" role="alert">${esc(issue.message)}</p><button type="button" class="quiet" id="closeRemoval">Cerrar</button>`;
                dialog.querySelector('#closeRemoval').onclick = close;
            }
        }
        const pending = load(); dialog.showModal(); await pending;
    }

    function showProgramStatus(program, trigger) {
        if (state.data.role !== 'OWNER' || document.querySelector('#programStatusDialog')) return;
        const session = state.token, active = !program.config.active;
        const dialog = document.createElement('dialog'); dialog.id = 'programStatusDialog'; dialog.className = 'promotion-removal';
        dialog.setAttribute('aria-labelledby', 'programStatusTitle');
        dialog.innerHTML = `<h2 id="programStatusTitle">${active ? 'Reactivar' : 'Pausar'} «${esc(program.config.name)}»</h2><p>${active ? 'Volverá a estar disponible según sus fechas, horarios y sucursales. Cada cliente conservará el saldo que ya tenía.' : 'Se ocultará del registro y de Apple y Google Wallet. No se podrá acumular ni canjear esta promoción mientras esté pausada.'}</p><p>Los saldos y el historial se conservan. Las tarjetas recibirán el cambio cuando Wallet pueda conectarse.</p><form id="programStatusForm"><div class="row"><button type="button" class="quiet" id="cancelProgramStatus">Cancelar</button><button type="submit">${active ? 'Reactivar promoción' : 'Pausar promoción'}</button></div><button type="button" class="quiet" id="reloadProgramStatus" hidden>Recargar promociones</button></form>`;
        document.body.append(dialog);
        const busy = () => dialog.querySelector('form')?.getAttribute('aria-busy') === 'true';
        const close = () => { if (busy()) return; dialog.close(); };
        dialog.addEventListener('cancel', e => { if (busy()) e.preventDefault(); });
        dialog.addEventListener('close', () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
        dialog.querySelector('#cancelProgramStatus').onclick = close;
        dialog.querySelector('#reloadProgramStatus').onclick = async () => { if (busy() || state.token !== session) return; close(); try { await merchant(); } catch (e) { notice(e.message); } };
        form('programStatusForm', async (_, f) => {
            if (state.token !== session) throw new Error('La sesión cambió. Abre de nuevo la promoción.');
            try {
                await api('/api/staff/programs/' + program.id, {expectedVersion: program.version, program: {...program.config, active}}, 'PUT');
            } catch (e) { if (e.status === 409 || e.status === 404) { dialog.querySelector('#reloadProgramStatus').hidden = false; throw new Error('La promoción cambió o esta acción ya se aplicó. Recarga para revisar su estado vigente.'); } throw e; }
            if (state.token !== session) { dialog.close(); return; }
            dialog.close();
            try { await merchant(); notice(active ? 'Promoción reactivada. Sus saldos se conservan.' : 'Promoción pausada. El cambio se enviará a Apple y Google Wallet.'); }
            catch { notice('Cambio guardado. Recarga el panel para ver el estado vigente.'); }
        });
        dialog.showModal(); dialog.querySelector('#cancelProgramStatus').focus();
    }

    function programList() {
        const root = document.querySelector('#content');;
        const programs = state.data.programs;
        let status = 'ALL';
        root.innerHTML = `<div class="promotion-toolbar"><p>${programs.length} promoción${programs.length === 1 ? '' : 'es'} en tu negocio.<br>Las pausadas se conservan aquí y se ocultan a tus clientes.</p><button type="button" id="newPromotion">+ Crear promoción</button></div><div class="promotion-controls"><div class="promotion-search"><label for="searchPromotions">Buscar una promoción</label><input type="search" id="searchPromotions" placeholder="Nombre o categoría" maxlength="120" autocomplete="off"></div><div class="promotion-status" role="group" aria-label="Estado de las promociones"><button type="button" data-promotion-status="ALL" aria-pressed="true">Todas</button><button type="button" data-promotion-status="ACTIVE" aria-pressed="false">Activas</button><button type="button" data-promotion-status="PAUSED" aria-pressed="false">Pausadas</button></div></div><div class="promotion-cards" id="promotionCards"></div><p id="promotionListCount" role="status" aria-live="polite"></p>`;
        const draw = () => {
            const search = root.querySelector('#searchPromotions').value.trim().toLocaleLowerCase('es');
            const shown = programs.filter(p => (status === 'ALL' || p.config.active === (status === 'ACTIVE')) && (p.config.name + ' ' + (p.config.productGroup || '')).toLocaleLowerCase('es').includes(search));
            root.querySelector('#promotionCards').innerHTML = shown.map(p => {
                const config = p.config;
                const rewards = state.data.rewards.filter(r => r.programId === p.id && r.active);
                const cost = r => config.kind === 'CASHBACK' ? (r.cost / 100).toFixed(2) + ' ' + state.data.business.currency : r.cost + ' ' + kinds[config.kind].toLowerCase();
                const rule = config.kind === 'POINTS' ? `${config.pointsPerUnit} puntos por cada ${(config.unitMinor / 100).toFixed(2)} ${state.data.business.currency}` : config.kind === 'CASHBACK' ? `${config.cashbackBps / 100}% de cashback promocional` : `${config.stampsPerPurchase} sello${config.stampsPerPurchase === 1 ? '' : 's'} por ${config.countUnits ? 'unidad pagada' : 'compra registrada'}${config.productGroup ? ' · ' + config.productGroup : ''}`;
                return `<article class="panel promotion-item" data-promotion-card="${esc(p.id)}"><div class="promotion-card-top"><span class="eyebrow">${esc(kinds[config.kind])} · v${p.version}</span><span class="promotion-state ${config.active ? '' : 'paused'}">${config.active ? 'Activa' : 'Pausada'}</span></div><h2>${esc(config.name)}</h2><p>${esc(rule)}<br>${config.branchIds.length ? config.branchIds.length + ' sucursal(es) seleccionada(s)' : 'Todas las sucursales'} · Según fechas y condiciones</p><div class="promotion-benefits"><strong>${rewards.length ? 'Premios vinculados' : 'Sin premio activo'}</strong>${rewards.slice(0, 3).map(r => esc(r.name) + ' · ' + esc(cost(r))).join('<br>') || 'Puedes definir el beneficio desde Premios.'}${rewards.length > 3 ? '<br>Y ' + (rewards.length - 3) + ' más.' : ''}</div><div class="promotion-card-foot"><button type="button" class="promotion-toggle" data-program-status="${esc(p.id)}">${config.active ? 'Pausar promoción' : 'Reactivar promoción'}</button><button type="button" class="quiet" data-program-edit="${esc(p.id)}">Editar promoción</button><button type="button" class="danger-quiet" data-program-delete="${esc(p.id)}" aria-label="Eliminar ${esc(config.name)}">Eliminar</button></div></article>`;
            }).join('') || `<section class="panel experience-empty promotion-empty"><strong>${programs.length ? 'No encontramos promociones con estos filtros.' : 'Dale forma al próximo regreso.'}</strong><p>${programs.length ? 'Prueba con otro nombre o cambia el estado.' : 'Elige qué acumula tu cliente y qué premio recibirá. Tú defines la cantidad, el porcentaje y las condiciones.'}</p><button type="button" class="quiet" id="emptyPromotionAction">${programs.length ? 'Quitar filtros' : 'Crear mi primera promoción'}</button></section>`;
            root.querySelector('#promotionListCount').textContent = `${shown.length} de ${programs.length} promociones`;
            root.querySelectorAll('[data-program-status]').forEach(b => b.onclick = () => showProgramStatus(programs.find(p => p.id === b.dataset.programStatus), b));
            root.querySelectorAll('[data-program-edit]').forEach(b => b.onclick = () => renderPrograms(programs.find(p => p.id === b.dataset.programEdit)));
            root.querySelectorAll('[data-program-delete]').forEach(b => b.onclick = () => showProgramRemoval(b.dataset.programDelete).catch(e => notice(e.message)));;
            root.querySelector('#emptyPromotionAction')?.addEventListener('click', () => {
                if (!programs.length) { renderPrograms(null, true); return; }
                status = 'ALL'; root.querySelector('#searchPromotions').value = ''; sync(); draw();
            });
        };
        const sync = () => root.querySelectorAll('[data-promotion-status]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.promotionStatus === status)));
        root.querySelector('#searchPromotions').oninput = draw;
        root.querySelectorAll('[data-promotion-status]').forEach(b => b.onclick = () => { status = b.dataset.promotionStatus; sync(); draw(); });
        root.querySelector('#newPromotion').onclick = () => renderPrograms(null, true);
        draw();
    }

    renderPrograms = function (edit = null, create = false) {
        if (!edit && !create) { programList(); return; }
        let current = edit ? JSON.parse(JSON.stringify(edit.config)) : {name: '', kind: 'POINTS', active: true, unitMinor: 100, pointsPerUnit: 1, cashbackBps: 500, stampsPerPurchase: 1, minimumSpendMinor: 1, branchIds: [], window: emptyWindow(), bonuses: []};
        let advancedOpen = Boolean(edit);
        const read = form => {
            const type = edit ? edit.config.kind : form.elements.kind.value;
            return {name: form.elements.name.value, kind: type, active: form.elements.active.checked,
                unitMinor: Math.round(Number(form.elements.unitAmount.value) * 100), pointsPerUnit: Number(form.elements.pointsPerUnit.value),
                cashbackBps: Math.round(Number(form.elements.cashback.value) * 100), stampsPerPurchase: Number(form.elements.stampsPerPurchase.value),
                minimumSpendMinor: Math.round(Number(form.elements.minimumAmount.value) * 100), branchIds: values(form, 'mainBranch'),
                window: readWindow(form, 'main'), bonuses: current.bonuses.map((b, i) => ({priority: Number(form.elements['bonus' + i + 'priority'].value), multiplier: Number(form.elements['bonus' + i + 'multiplier'].value), window: readWindow(form, 'bonus' + i), branchIds: values(form, 'bonus' + i + 'branch')}))};
        };
        const render = () => {
            const content = document.querySelector('#content'), currency = esc(state.data.business.currency), p = current;
            if (!content) return;
            content.innerHTML = `<button type="button" class="quiet promotion-back" id="backToPromotions">← Volver a promociones</button><section class="panel promotion-editor-panel"><h2>${edit ? 'Editar promoción' : 'Crear promoción'}</h2><p>Define qué acumula el cliente. Después, en Premios, elige qué puede canjear y cuánto cuesta.</p>${edit ? '' : '<div class="row"><button type="button" class="quiet" data-preset="POINTS">Puntos por compra</button><button type="button" class="quiet" data-preset="STAMPS">Compras y premio gratis</button><button type="button" class="quiet" data-preset="CASHBACK">Cashback</button></div>'}<form id="programV7">${field('name', 'Nombre de la promoción', 'text', p.name, 'required maxlength="120"')}<label for="promotionKind">Qué acumula el cliente</label><select id="promotionKind" name="kind" ${edit ? 'disabled' : ''}>${Object.entries(kinds).map(([key, label]) => `<option value="${key}" ${p.kind === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><div data-promotion-kind="POINTS" class="row"><div>${field('unitAmount', 'Por cada monto de compra (' + currency + ')', 'number', p.unitMinor / 100, 'required min="0.01" step="0.01"')}</div><div>${field('pointsPerUnit', 'Puntos que acumula', 'number', p.pointsPerUnit, 'required min="1" max="1000000"')}</div></div><div data-promotion-kind="CASHBACK">${field('cashback', 'Porcentaje de cashback promocional', 'number', p.cashbackBps / 100, 'required min="0.01" max="100" step="0.01"')}</div><div data-promotion-kind="STAMPS">${field('stampsPerPurchase', 'Sellos por compra registrada', 'number', p.stampsPerPurchase, 'required min="1" max="100"')}<p class="small">Ejemplo: 1 sello por compra y un premio que cueste 9 sellos. Cada comprobante único cuenta una vez.</p></div>${field('minimumAmount', 'Compra mínima (' + currency + ')', 'number', p.minimumSpendMinor / 100, 'required min="0.01" step="0.01"')}<p class="small">El cashback es saldo promocional para canjear. Todas las sucursales comparten la tarjeta del cliente.</p><details id="promotionAdvanced" ${advancedOpen ? 'open' : ''}><summary>Fechas, horarios, sucursales y bonos</summary><p>Zona horaria: ${esc(state.data.business.timezone)}.</p>${windowFields('main', p.window)}${branchFields('main', p.branchIds).replaceAll('name="mainbranch"', 'name="mainBranch"')}<h3>Bonos adicionales</h3><p class="small">Ejemplo: doble acumulación los viernes de 18:00 a 20:00. Si coinciden bonos, se aplica el de mayor prioridad; no se multiplican entre sí. Cada bono también debe estar dentro del horario general de la promoción.</p>${p.bonuses.map((b, i) => `<fieldset><legend>Bono ${i + 1}</legend><div class="row"><div>${field('bonus' + i + 'priority', 'Prioridad (distinta en cada bono)', 'number', b.priority, 'required')}</div><div>${field('bonus' + i + 'multiplier', 'Multiplica la acumulación por', 'number', b.multiplier, 'required min="1" max="10"')}</div></div>${windowFields('bonus' + i, b.window)}${branchFields('bonus' + i, b.branchIds)}<button type="button" class="quiet" data-remove-bonus="${i}">Quitar este bono</button></fieldset>`).join('')}<button type="button" id="addBonus" class="quiet" ${p.bonuses.length >= 30 ? 'disabled' : ''}>Añadir bono por horario o fecha</button></details><label class="check"><input name="active" type="checkbox" ${p.active ? 'checked' : ''}>Promoción activa</label><p class="small">Al pausar, dejará de aparecer en Wallet y en el registro. No permitirá acumular ni canjear hasta reactivarla; sus saldos se conservan.</p><button>${edit ? 'Guardar cambios' : 'Crear promoción'}</button></form></section>`;
            const formNode = document.querySelector('#programV7');
            const kind = formNode.elements.kind;
            const showKind = () => content.querySelectorAll('[data-promotion-kind]').forEach(section => { const hidden = section.dataset.promotionKind !== kind.value; section.hidden = hidden; section.querySelectorAll('input').forEach(input => input.disabled = hidden); });
            kind.onchange = showKind; showKind();
            content.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => { kind.value = button.dataset.preset; if (!formNode.elements.name.value.trim()) formNode.elements.name.value = button.textContent; showKind(); });
            document.querySelector('#addBonus').onclick = () => { current = read(formNode); current.bonuses.push({priority: Math.max(0, ...current.bonuses.map(b => b.priority)) + 1, multiplier: 2, window: emptyWindow(), branchIds: []}); advancedOpen = true; render(); };
            content.querySelectorAll('[data-remove-bonus]').forEach(button => button.onclick = () => { current = read(formNode); current.bonuses.splice(Number(button.dataset.removeBonus), 1); advancedOpen = true; render(); });
            content.querySelector('#backToPromotions').onclick = () => renderPrograms();
            form('programV7', async (_, f) => {
                const program = read(f);
                if (!program.window.weekdays.length || program.bonuses.some(b => !b.window.weekdays.length)) throw new Error('Marca al menos un día para cada horario.');
                const priorities = program.bonuses.map(b => b.priority);
                if (new Set(priorities).size !== priorities.length) throw new Error('Asigna una prioridad diferente a cada bono.');
                await api('/api/staff/programs' + (edit ? '/' + edit.id : ''), edit ? {expectedVersion: edit.version, program} : program, edit ? 'PUT' : 'POST');
                await merchant(); notice('Promoción guardada. Puedes definir su recompensa en Premios.');
            });
        };
        render();
    };;;;
})();
