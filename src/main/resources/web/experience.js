'use strict';
// Interface only: balances, quotes and permissions remain authoritative on the server.
(() => {
    const pages = {
        overview: ['Resumen', 'Tu negocio, de un vistazo.', 'Actividad registrada y accesos para el día a día.', 'home'],
        sales: ['Caja', 'Una buena visita empieza aquí.', 'Busca la tarjeta, registra la operación y sigue con el próximo cliente.', 'scan'],
        customers: ['Mis clientes', 'Conoce a quienes vuelven.', 'Compras, frecuencia y premios de todas tus sucursales.', 'people'],
        programs: ['Promociones', 'Más motivos para volver.', 'Crea tus propias reglas y cambia cada promoción cuando lo necesites.', 'spark'],
        rewards: ['Premios', 'Un beneficio que vale la visita.', 'Define qué se entrega y el saldo necesario para canjearlo.', 'gift'],
        design: ['Mi tarjeta', 'Tu marca, en su Wallet.', 'Personaliza el diseño y comprueba los colores antes de guardar.', 'card'],
        events: ['Eventos y cumpleaños', 'Mantén la conversación.', 'Organiza mensajes y eventos para tus clientes.', 'calendar'],
        qr: ['QR de registro', 'La primera visita cuenta.', 'Un registro, una tarjeta y todas tus sucursales.', 'scan'],
        branches: ['Sucursales y acceso', 'Un negocio. Todo conectado.', 'Tus locales comparten la tarjeta; cada cajero tiene su propio acceso.', 'store'],
        business: ['Mi negocio', 'La información de tu negocio.', 'Datos fiscales, contacto y ubicación, siempre a mano.', 'store'],
        account: ['Mi cuenta', 'Tu cuenta, siempre clara.', 'Consulta membresía, cargos, pagos y avisos.', 'card'],
        reports: ['Informes', 'Entiende cómo crece tu negocio.', 'Datos de las operaciones que has registrado en Loyalty.', 'chart']
    };;
    const shapes = {
        home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
        scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M5 12h14"/>',
        people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
        spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
        gift: '<path d="M3 9h18v4H3Zm2 4v8h14v-8M12 9v12"/><path d="M12 9S4 9 5 5s7 0 7 4Zm0 0s8 0 7-4-7 0-7 4Z"/>',
        card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 5h3"/>',
        store: '<path d="M4 10v11h16V10M2 10l3-7h14l3 7Zm7 11v-7h6v7"/>',
        chart: '<path d="M4 3v18h17M8 16v-5m5 5V7m5 9v-3"/>',
        arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>'
    };
    const icon = name => `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shapes[name] || shapes.spark}</svg>`;
    const busy = () => Boolean(document.querySelector('form[aria-busy="true"]'));
    const go = tab => { if (busy()) { notice('Espera a que termine la operación.'); return; } state.tab = tab; renderMerchant(); document.querySelector('#sectionTitle')?.focus(); };
    const money = value => new Intl.NumberFormat('es-EC', {style: 'currency', currency: state.data.business.currency}).format(Number(value || 0) / 100);
    const date = value => value ? new Intl.DateTimeFormat('es-EC', {timeZone: state.data.business.timezone, dateStyle: 'medium'}).format(new Date(value)) : 'Sin compras';

    // Keep the existing handlers and permission checks; only relocate their navigation.
    const merchantView = renderMerchant;
    renderMerchant = function () {
        window.stopComebackScanner?.();
        merchantView();
        document.body.classList.add('staff-mode');
        const nav = app.querySelector('nav'), content = document.querySelector('#content');
        const current = pages[state.tab] || pages.sales;
        nav.className = 'workspace-nav'; nav.setAttribute('aria-label', 'Menú del negocio');
        if (state.data.role === 'OWNER') {
            const home = document.createElement('button'); home.dataset.tab = 'overview'; home.textContent = 'Resumen'; home.onclick = () => go('overview'); nav.prepend(home);
        }
        const buttons = [...nav.querySelectorAll('button')];
        for (const button of buttons) {
            const tab = button.dataset.tab || Object.keys(pages).find(key => pages[key][0] === button.textContent);
            if (!tab || !pages[tab]) continue;
            button.dataset.tab = tab; button.type = 'button'; button.className = state.tab === tab ? 'active' : '';
            if (state.tab === tab) button.setAttribute('aria-current', 'page');
            button.innerHTML = icon(pages[tab][3]) + `<span>${pages[tab][0]}</span>`;
        }
        nav.replaceChildren();
        const groups = [['Día a día', ['overview', 'sales', 'customers']], ['Fidelización', ['programs', 'rewards', 'design', 'events', 'qr']], ['Administración', ['business', 'branches', 'account', 'reports']]];
        for (const [label, keys] of groups) {
            const items = keys.map(key => buttons.find(b => b.dataset.tab === key)).filter(Boolean);
            if (!items.length) continue;
            const group = document.createElement('div'); group.className = 'nav-group';
            const title = document.createElement('span'); title.className = 'nav-group-label'; title.textContent = label;
            group.append(title, ...items); nav.append(group);
        }
        const shell = document.createElement('div'); shell.className = 'workspace';
        shell.innerHTML = `<aside class="workspace-sidebar" id="workspaceSidebar"><div class="workspace-business"><span class="business-avatar">${esc(state.data.business.name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(state.data.business.name)}</strong><small>${state.data.role === 'OWNER' ? 'Administración del negocio' : 'Acceso de caja'}</small></div></div><div id="navigationMount"></div><div class="sidebar-note">Una tarjeta.<br>Todas tus sucursales.</div></aside><section class="workspace-main"><div class="workspace-topline"><span>${esc(state.data.business.name)} <span aria-hidden="true">/</span> ${current[0]}</span><button type="button" class="quiet menu-toggle" id="workspaceMenu" aria-controls="workspaceSidebar" aria-expanded="false">Menú</button></div><div class="workspace-search"><label for="workspaceSearch">Ir a una sección</label><input id="workspaceSearch" type="search" maxlength="80" placeholder="Busca caja, clientes, promociones…"></div><div class="workspace-heading"><div><h1 id="sectionTitle" tabindex="-1">${current[1]}</h1><p>${current[2]}</p></div>${state.tab !== 'sales' ? `<button type="button" id="quickCounter">${icon('scan')} Abrir caja</button>` : ''}</div><div id="workspaceContent"></div></section>`;
        shell.querySelector('#navigationMount').replaceWith(nav); shell.querySelector('#workspaceContent').replaceWith(content); app.replaceChildren(shell);
        const permitted=buttons.filter(button=>pages[button.dataset.tab]);
        attachPredictiveSearch(shell.querySelector('#workspaceSearch'),{
            minimum:1,load:async q=>{const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return permitted.map(b=>({tab:b.dataset.tab,title:pages[b.dataset.tab][0],detail:pages[b.dataset.tab][2]})).filter(x=>normalize(x.title+' '+x.detail).includes(normalize(q)));},
            label:row=>row.title,description:row=>row.detail,choose:row=>go(row.tab)
        });
        window.scrollTo(0, 0);
        document.title = current[0] + ' · ' + state.data.business.name + ' · Loyalty';
        const toggle = shell.querySelector('#workspaceMenu');
        toggle.onclick = () => { const opened = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(opened)); shell.dataset.menuOpen = String(opened); };
        shell.addEventListener('keydown', e => { if (e.key === 'Escape' && shell.dataset.menuOpen === 'true') { shell.dataset.menuOpen = 'false'; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); } });
        nav.addEventListener('click', e => { if (busy()) { e.preventDefault(); e.stopImmediatePropagation(); notice('Espera a que termine la operación.'); } }, true);
        shell.querySelector('#quickCounter')?.addEventListener('click', () => go('sales'));
        if (state.tab === 'overview' && state.data.role === 'OWNER') overview(content);
    };;

    async function overview(root) {
        root.innerHTML = '<section class="panel loading-panel" role="status">Preparando el resumen de tu negocio…</section>';
        try {
            const data = await api('/api/staff/customer-activity?days=30');
            if (!root.isConnected || state.tab !== 'overview') return;
            const s = data.summary, programs = state.data.programs, active = programs.filter(p => p.config.active).length;
            const metric = (label, value, help, type) => `<div class="overview-metric"><div>${icon(type)}<span>${label}</span></div><strong>${esc(value)}</strong><small>${esc(help)}</small></div>`;
            root.innerHTML = `<div class="overview-period"><span>Últimos 30 días · incluye hoy</span><button type="button" class="text-button" id="refreshOverview">Actualizar resumen</button></div><div class="overview-metrics">${metric('Compras registradas', s.periodPurchases, 'Comprobantes del período', 'store')}${metric('Total pagado', money(s.periodSpentMinor), 'Después de descuentos', 'chart')}${metric('Clientes que compraron', s.periodBuyers, 'Personas distintas en el período', 'people')}${metric('Premios reclamados', s.periodClaimedRewards, 'Canjes confirmados', 'gift')}</div><div class="overview-columns"><section class="overview-hero"><span class="eyebrow">La próxima visita empieza en caja</span><h2>Cada regreso,<br>una buena razón.</h2><p>Escanea el QR de Wallet o busca por cédula para registrar una compra o entregar un premio.</p><button type="button" data-go="sales">Atender a un cliente ${icon('arrow')}</button><div class="overview-hero-foot"><span>${s.registeredCustomers} clientes registrados</span><span>${active} promoción${active === 1 ? ' habilitada' : 'es habilitadas'}</span></div></section><section class="panel overview-next"><h2>Tu negocio, listo para recibirlos</h2><button type="button" data-go="programs">${icon('spark')}<span><strong>${active ? 'Revisar promociones' : 'Crear tu primera promoción'}</strong><small>Sellos, puntos, cashback y descuentos</small></span>${icon('arrow')}</button><button type="button" data-go="design">${icon('card')}<span><strong>Personalizar mi tarjeta</strong><small>Logo, colores y textos del negocio</small></span>${icon('arrow')}</button><button type="button" data-go="qr">${icon('scan')}<span><strong>Invitar a nuevos clientes</strong><small>Abre el QR fijo para el registro</small></span>${icon('arrow')}</button></section></div><div class="overview-columns"><section class="panel"><div class="section-heading"><h2>Clientes con compras recientes</h2><button type="button" class="text-button" data-go="customers">Ver clientes ${icon('arrow')}</button></div>${data.customers.filter(c => c.lastPurchase).slice(0, 5).map(c => `<div class="recent-customer"><span class="customer-avatar" aria-hidden="true">${esc(c.name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(c.name)}</strong><small>Última compra: ${esc(date(c.lastPurchase))}</small></div><div><strong>${c.purchases} compra${c.purchases === 1 ? '' : 's'}</strong><small>${esc(money(c.spentMinor))} acumulados</small></div></div>`).join('') || '<div class="experience-empty"><strong>La primera compra abre el camino.</strong><p>Registra un cliente con el QR del negocio y atiéndelo desde caja.</p><button type="button" class="quiet" data-go="qr">Ver QR de registro</button></div>'}<p class="small">Los datos de cada cliente abarcan todo su historial.</p></section><section class="panel overview-opportunities"><h2>Motivos para una próxima visita</h2><div><strong>${s.nearCustomers}</strong><p>cliente${s.nearCustomers === 1 ? '' : 's'} a un sello de un premio</p></div><div><strong>${s.readyCustomers}</strong><p>cliente${s.readyCustomers === 1 ? '' : 's'} con saldo para un premio</p></div><p class="small">Solo promociones activas. El saldo y las condiciones se comprueban nuevamente en caja.</p><button type="button" class="quiet" data-go="customers">Consultar clientes</button></section></div><p class="small overview-footnote">Resumen del ${esc(date(data.from))} al ${esc(date(data.through))} · ${esc(data.timezone)}. Solo incluye las operaciones registradas en Loyalty.</p>`;
            root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
            root.querySelector('#refreshOverview').onclick = () => overview(root);
        } catch (issue) {
            if (!root.isConnected || state.tab !== 'overview') return;
            root.innerHTML = `<section class="panel experience-empty"><h2>No pudimos cargar el resumen</h2><p role="alert">${esc(issue.message)}</p><button type="button" id="retryOverview">Volver a intentar</button><button type="button" class="quiet" id="counterWithoutOverview">Ir a caja</button></section>`;
            root.querySelector('#retryOverview').onclick = () => overview(root);
            root.querySelector('#counterWithoutOverview').onclick = () => go('sales');
        }
    }

    const loginView = welcome;
    welcome = function () {
        document.body.classList.remove('staff-mode'); document.title = 'Loyalty · Acceso al negocio';
        loginView();
        app.classList.add('welcome-view');
        const intro = app.querySelector('.intro'); intro.innerHTML = '<div class="eyebrow">LOYALTY · TU COMUNIDAD CRECE CONTIGO</div><h1>Que una visita<br>sea el principio.</h1><p>Un lugar para recibir a tus clientes, premiar sus compras y conocer qué los hace volver.</p>';
        app.querySelector('#credential').setAttribute('placeholder', 'Tu credencial privada');
    };
    const oldExit = exit.onclick;
    exit.onclick = async event => { if (busy()) { notice('Espera a que termine la operación antes de salir.'); return; } window.stopComebackScanner?.(); document.body.classList.remove('staff-mode'); app.classList.remove('welcome-view'); await oldExit(event); };
    const enter = merchant;
    merchant = async function () { await enter(); app.classList.remove('welcome-view'); };
    const brand = document.querySelector('.brand');
    if (brand) brand.innerHTML = '<span class="loyalty-mark" aria-hidden="true">L</span> Loyalty';
    if (!state.slug && location.pathname !== '/platform' && !state.token) welcome();
})();
