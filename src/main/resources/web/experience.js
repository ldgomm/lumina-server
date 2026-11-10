'use strict';
// Interface only: balances, quotes and permissions remain authoritative on the server.
(() => {
    const pages = {
        overview: ['Resumen', 'Tu negocio, de un vistazo.', 'Actividad registrada y accesos para el día a día.', 'home'],
        sales: ['Caja', 'Una buena visita empieza aquí.', 'Busca la tarjeta, registra la operación y sigue con el próximo cliente.', 'scan'],
        radar: ['Radar de regreso', 'La próxima visita tiene una razón.', 'Ritmos de compra y oportunidades con una explicación clara.', 'spark'],
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
    const leaveDesign = action => { const proceed=()=>window.loyaltyDesignLeave ? window.loyaltyDesignLeave(action) : action(); return window.loyaltyOperationLeave ? window.loyaltyOperationLeave(proceed) : proceed(); };
    const go = tab => { if (busy()) { notice('Espera a que termine la operación.'); return; } leaveDesign(() => { state.tab = tab; renderMerchant(); document.querySelector('#sectionTitle')?.focus(); }); };
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
            const radar=document.createElement('button');radar.dataset.tab='radar';radar.textContent='Radar de regreso';radar.onclick=()=>go('radar');nav.append(radar);;
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
        const groups = [['Día a día', ['overview', 'sales', 'customers', 'radar']], ['Fidelización', ['programs', 'rewards', 'design', 'events', 'qr']], ['Administración', ['business', 'branches', 'account', 'reports']]];
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
        nav.addEventListener('click', e => {
            if (busy()) { e.preventDefault(); e.stopImmediatePropagation(); notice('Espera a que termine la operación.'); return; }
            const button = e.target.closest('button[data-tab]');
            if (button && window.loyaltyDesignLeave) { e.preventDefault(); e.stopImmediatePropagation(); leaveDesign(() => { if (button.isConnected) button.click(); }); }
        }, true);
        shell.querySelector('#quickCounter')?.addEventListener('click', () => go('sales'));
        if (state.tab === 'overview' && state.data.role === 'OWNER') overview(content);
        if (state.tab === 'radar' && state.data.role === 'OWNER') window.renderReturnRadar(content,{path:'/api/staff/return-radar',valid:()=>state.tab==='radar'&&state.data?.role==='OWNER',owner:true});;
    };;

    let overviewRequest = 0, overviewDays = 30;
    async function overview(root) {
        const ticket=++overviewRequest, token=state.token, tenant=state.data.business.id, days=overviewDays;
        const valid=()=>root.isConnected&&state.tab==='overview'&&state.token===token&&state.data?.business.id===tenant&&ticket===overviewRequest;
        root.innerHTML='<section class="panel loading-panel" role="status">Preparando la actividad y los pendientes de tu negocio…</section>';
        try {
            const [activity,branding]=await Promise.allSettled([api('/api/staff/customer-activity?days='+days),api('/api/staff/wallet-design')]);
            if(!valid())return;
            if(activity.status!=='fulfilled')throw activity.reason;
            const data=activity.value,s=data.summary,programs=state.data.programs;
            const summaries=programs.map(p=>({program:p,...window.LoyaltyPromotionSummary(p)}));
            const enabled=programs.filter(p=>p.config.active), noReward=summaries.filter(s=>s.program.config.active&&!s.activeRewards.length);
            const ended=summaries.filter(s=>s.status==='ENDED'),soon=summaries.filter(s=>s.endingSoon);
            const designSaved=branding.status==='fulfilled'?branding.value.version>0:null;
            const steps=[
                [state.data.branches.length>0,'Tus sucursales','Al menos una sucursal registrada','branches'],
                [enabled.length>0,'Una promoción','Al menos una promoción habilitada','programs'],
                [enabled.some(p=>state.data.rewards.some(r=>r.programId===p.id&&r.active)),'Un premio para volver','Un premio activo en una promoción habilitada','rewards'],
                [designSaved,'La identidad de tu tarjeta',designSaved===null?'No se pudo comprobar. Abre Mi tarjeta.':'Diseño guardado para Apple y Google','design'],
                [s.registeredCustomers>0,'Tu primer cliente','Al menos un registro con el QR del negocio','qr']
            ];
            const complete=steps.filter(x=>x[0]===true).length;
            const tasks=[];
            if(noReward.length)tasks.push({title:noReward.length+' promoción'+(noReward.length===1?' sin premio activo':'es sin premio activo'),body:'Define qué puede canjear el cliente con el saldo acumulado.',tab:'programs',filter:'NO_REWARD',tone:'attention'});
            if(ended.length)tasks.push({title:ended.length+' promoción'+(ended.length===1?' finalizada':'es finalizadas'),body:'Revisa las fechas antes de volver a ofrecerlas en caja.',tab:'programs',filter:'ENDED',tone:'attention'});
            if(soon.length)tasks.push({title:soon.length+' promoción'+(soon.length===1?' termina pronto':'es terminan pronto'),body:'Su fecha final llega en los próximos 7 días.',tab:'programs',tone:'attention'});
            if(s.readyCustomers>0)tasks.push({title:s.readyCustomers+' cliente'+(s.readyCustomers===1?' con saldo para un premio':'s con saldo para un premio'),body:'Consulta sus beneficios y verifica las condiciones al atenderlos.',segment:'READY',tone:'opportunity'});
            if(s.newCustomers>0)tasks.push({title:s.newCustomers+' registro'+(s.newCustomers===1?' sin primera compra':'s sin primera compra'),body:'Conoce quién ya tiene tarjeta y aún no registra una compra.',segment:'NEW',tone:'opportunity'});
            if(!tasks.length)tasks.push({title:'Tu siguiente paso está en caja',body:'Registra compras y canjes para que este resumen refleje la actividad del negocio.',tab:'sales',tone:'opportunity'});
            const metric=(label,value,help,type)=>`<div class="overview-metric"><div>${icon(type)}<span>${label}</span></div><strong>${esc(value)}</strong><small>${esc(help)}</small></div>`;
            root.innerHTML=`<div class="overview-period"><div><label for="overviewDays">Período del resumen</label><select id="overviewDays">${[7,30,90].map(n=>`<option value="${n}" ${n===days?'selected':''}>Últimos ${n} días · incluye hoy</option>`).join('')}</select></div><button type="button" class="text-button" id="refreshOverview">Actualizar resumen</button></div><div class="overview-metrics">${metric('Compras registradas',s.periodPurchases,'Comprobantes del período','store')}${metric('Total pagado',money(s.periodSpentMinor),'Después de descuentos','chart')}${metric('Clientes que compraron',s.periodBuyers,'Personas distintas en el período','people')}${metric('Premios reclamados',s.periodClaimedRewards,'Canjes confirmados','gift')}</div>
                <div class="overview-command-grid"><section class="overview-hero"><span class="eyebrow">LA PRÓXIMA VISITA</span><h2>Todo empieza<br>con un regreso.</h2><p>Identifica al cliente, elige sus promociones y revisa lo que ganará antes de guardar.</p><button type="button" data-go="sales">Atender a un cliente ${icon('arrow')}</button><div class="overview-hero-foot"><span>${s.registeredCustomers} clientes registrados</span><span>${enabled.length} promociones habilitadas</span></div></section><section class="panel overview-priorities"><div class="section-heading"><div><span class="eyebrow">SIGUIENTES PASOS</span><h2>Qué merece tu atención</h2></div></div><p class="small">Estado actual del catálogo y de los clientes; independiente del período elegido.</p>${tasks.slice(0,5).map((t,i)=>`<button type="button" class="priority-task tone-${t.tone}" data-task="${i}"><span class="task-dot" aria-hidden="true">${t.tone==='attention'?'!':'↗'}</span><span><strong>${esc(t.title)}</strong><small>${esc(t.body)}</small></span><span aria-hidden="true">→</span></button>`).join('')}</section></div>
                <section class="panel setup-checklist"><div class="section-heading"><div><span class="eyebrow">CONFIGURACIÓN DEL NEGOCIO</span><h2>${complete===5?'Ya tienes la base para operar.':'Completa tu puesta a punto.'}</h2><p>${complete} de 5 pasos completados. La conexión y recepción en los teléfonos se prueban por separado.</p></div><strong class="setup-fraction">${complete}<span>/5</span></strong></div><progress max="5" value="${complete}" aria-label="Pasos de configuración completados"></progress><div class="setup-steps">${steps.map(([done,title,help,tab],i)=>`<button type="button" class="setup-step ${done?'is-complete':''}" data-go="${tab}"><span class="setup-number" aria-hidden="true">${done?'✓':i+1}</span><strong>${esc(title)}</strong><small>${esc(help)}</small><span class="setup-action">${done?'Revisar':'Completar'} →</span></button>`).join('')}</div></section>
                <div class="overview-columns"><section class="panel"><div class="section-heading"><h2>Clientes con compras recientes</h2><button type="button" class="text-button" data-go="customers">Ver clientes ${icon('arrow')}</button></div>${data.customers.filter(c=>c.lastPurchase).slice(0,5).map(c=>`<div class="recent-customer"><span class="customer-avatar" aria-hidden="true">${esc(c.name.slice(0,1).toUpperCase())}</span><div><button type="button" class="text-button" data-profile="${esc(c.id||'')}">${esc(c.name)}</button><small>Última compra: ${esc(date(c.lastPurchase))}</small></div><div><strong>${c.purchases} compra${c.purchases===1?'':'s'}</strong><small>${esc(money(c.spentMinor))} acumulados</small></div></div>`).join('')||'<div class="experience-empty"><strong>La primera compra abre el camino.</strong><p>Invita a tus clientes con el QR de registro.</p><button type="button" class="quiet" data-go="qr">Ver QR de registro</button></div>'}<p class="small">Los datos de cada cliente abarcan todo su historial.</p></section><section class="panel overview-opportunities"><h2>Una próxima visita</h2><button type="button" class="opportunity-link" data-client-segment="NEAR"><strong>${s.nearCustomers}</strong><p>A un sello de un premio →</p></button><button type="button" class="opportunity-link" data-client-segment="INACTIVE"><strong>${s.inactiveCustomers}</strong><p>Sin volver en 30 días →</p></button><button type="button" class="quiet" data-go="radar">Entender sus ritmos de regreso</button><p class="small">Los grupos pueden coincidir. No se envían mensajes ni se crean premios al consultar.</p></section></div><p class="small overview-footnote">Del ${esc(date(data.from))} al ${esc(date(data.through))} · ${esc(data.timezone)}. Solo operaciones registradas en Loyalty.</p>`;
            root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
            root.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{const t=tasks[Number(b.dataset.task)];if(t.segment){window.openCustomerSegment(t.segment);return;}if(t.filter)window.loyaltyPromotionFilter=t.filter;go(t.tab);});
            root.querySelectorAll('[data-client-segment]').forEach(b=>b.onclick=()=>window.openCustomerSegment(b.dataset.clientSegment));
            root.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>b.dataset.profile&&window.openCustomerWorkspace(b.dataset.profile,b));
            root.querySelector('#refreshOverview').onclick=()=>overview(root);
            root.querySelector('#overviewDays').onchange=e=>{overviewDays=Number(e.target.value);overview(root);};
        } catch(issue) {
            if(!valid())return;
            root.innerHTML=`<section class="panel experience-empty"><h2>No pudimos cargar el resumen</h2><p role="alert">${esc(issue.message)}</p><button type="button" id="retryOverview">Volver a intentar</button><button type="button" class="quiet" id="counterWithoutOverview">Ir a caja</button></section>`;
            root.querySelector('#retryOverview').onclick=()=>overview(root);root.querySelector('#counterWithoutOverview').onclick=()=>go('sales');
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
    exit.onclick = async event => { if (busy()) { notice('Espera a que termine la operación antes de salir.'); return; } return leaveDesign(async () => { window.stopComebackScanner?.(); document.body.classList.remove('staff-mode'); app.classList.remove('welcome-view'); await oldExit(event); }); };
    const enter = merchant;
    merchant = async function () { await enter(); app.classList.remove('welcome-view'); };
    const brand = document.querySelector('.brand');
    if (brand) brand.innerHTML = '<span class="loyalty-mark" aria-hidden="true">L</span> Loyalty';
    if (!state.slug && location.pathname !== '/platform' && !state.token) welcome();
})();
