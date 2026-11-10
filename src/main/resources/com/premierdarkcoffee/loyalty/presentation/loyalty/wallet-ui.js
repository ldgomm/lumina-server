'use strict';
(() => {
    const original = customerCard;
    let generation = 0, expiryTimer;
    customerCard = async function () {
        const current = ++generation, session = state.token;
        clearInterval(expiryTimer);
        await original();
        const panel = document.querySelector('#walletMount');
        const live = () => current === generation && session && state.token === session && panel?.isConnected;
        if (!live()) return;
        const names = {apple: 'Apple Wallet', google: 'Google Wallet'};
        async function load() {
            panel.innerHTML = '<p role="status">Comprobando las opciones de tu tarjeta…</p>';
            try {
                const status = await api('/api/me/wallet-status');
                if (!live()) return;
                const providers = ['apple', 'google'].filter(p => status[p] === true);
                if (!providers.length) {
                    panel.innerHTML = '<h2>Tu registro está guardado</h2><p>El negocio todavía debe habilitar Wallet. En caja pueden localizarte por cédula.</p><p class="small">Aún no se ha instalado una tarjeta en tu teléfono.</p>';
                    return;
                }
                const android = /Android/i.test(navigator.userAgent), apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
                let selected = providers.includes(android ? 'google' : 'apple') ? (android ? 'google' : 'apple') : providers[0];
                let busy = false, deadline = 0;
                panel.innerHTML = `<div class="eyebrow">Llévala contigo</div><h2>Tu próxima visita empieza aquí</h2><p>Guarda esta tarjeta una vez. Después, presenta su QR en caja para acumular o pedir un premio.</p>
                    <ol class="wallet-save-steps" aria-label="Cómo guardar la tarjeta"><li data-save-step="1" aria-current="step"><span>1</span>Preparar</li><li data-save-step="2"><span>2</span>Abrir Wallet</li><li data-save-step="3"><span>3</span>Confirmar allí</li></ol>
                    <div class="wallet-provider-picker" role="group" aria-label="Dónde guardar tu tarjeta">${providers.map(p => `<button type="button" data-wallet-provider="${p}">${names[p]}</button>`).join('')}</div>
                    <p id="walletDeviceHint" class="small"></p><div id="walletLink" class="wallet-save-result" hidden></div>
                    <button type="button" id="prepareWallet">Preparar mi tarjeta</button><p id="walletFeedback" role="status" aria-live="polite"></p>
                    <details class="wallet-save-help"><summary>¿Qué hago después?</summary><p>Confirma «Añadir» o «Guardar» dentro de Wallet. Cuando veas la tarjeta guardada, puedes cerrar esta página. No necesitas una contraseña de Loyalty para comprar.</p><p>En Google Wallet usa tu propia cuenta de Google, la que tienes en el teléfono.</p><p>Si ya tenías esta tarjeta, conserva la misma. Ante un cambio de teléfono o de conexión, pide al negocio que verifique tu identidad y te ayude a recuperarla.</p></details>`;
                const buttons = [...panel.querySelectorAll('[data-wallet-provider]')], prepare = panel.querySelector('#prepareWallet');
                const result = panel.querySelector('#walletLink'), feedback = panel.querySelector('#walletFeedback');
                function step(value) {
                    panel.querySelectorAll('[data-save-step]').forEach(node => {
                        node.classList.toggle('complete', Number(node.dataset.saveStep) < value);
                        if (Number(node.dataset.saveStep) === value) node.setAttribute('aria-current', 'step');
                        else node.removeAttribute('aria-current');
                    });
                }
                function clearLink() { clearInterval(expiryTimer); deadline = 0; result.replaceChildren(); result.hidden = true; }
                function controls() {
                    buttons.forEach(b => { b.disabled = busy; b.setAttribute('aria-pressed', String(b.dataset.walletProvider === selected)); });
                    prepare.disabled = busy; prepare.classList.toggle('wallet-save-secondary', !!deadline);
                    prepare.textContent = busy ? 'Preparando tu tarjeta…' : deadline ? 'Preparar otro enlace' : 'Preparar mi tarjeta';
                    panel.setAttribute('aria-busy', String(busy));
                    panel.querySelector('#walletDeviceHint').textContent = android || apple
                        ? `${names[selected]} · Elige la Wallet que usarás en este teléfono.`
                        : 'Para guardarla, continúa en el teléfono donde usarás la tarjeta.';
                }
                function message(text, error = false) { feedback.textContent = text; feedback.setAttribute('role', error ? 'alert' : 'status'); feedback.classList.toggle('wallet-save-error', error); }
                function expire() {
                    clearLink(); step(1); controls();
                    message('Este enlace venció. Pulsa «Preparar mi tarjeta» para obtener otro de la misma tarjeta.');
                }
                buttons.forEach(button => button.onclick = () => {
                    if (busy || !live() || button.dataset.walletProvider === selected) return;
                    selected = button.dataset.walletProvider; clearLink(); step(1); message(''); controls();
                });
                prepare.onclick = async () => {
                    if (busy || !live()) return;
                    busy = true; clearLink(); step(1); message(''); controls();
                    const started = Date.now(), provider = selected;
                    try {
                        const response = await api(`/api/me/wallet/${provider}/link`, {});
                        if (!live()) return;
                        const url = new URL(response.url);
                        const valid = !url.username && !url.password && !url.hash && (provider === 'apple'
                            ? url.origin === location.origin && /^\/wallet\/apple\/download\/[A-Za-z0-9_-]{43}$/.test(url.pathname) && !url.search
                            : url.origin === 'https://pay.google.com' && /^\/gp\/v\/save\/[A-Za-z0-9_.-]+$/.test(url.pathname) && !url.search);
                        if (!valid || !Number.isFinite(response.expiresIn) || response.expiresIn <= 0 || response.expiresIn > 3600) throw new Error('No se pudo verificar el enlace. Vuelve a preparar tu tarjeta.');
                        deadline = started + response.expiresIn * 1000;
                        if (Date.now() >= deadline) { expire(); return; }
                        const link = document.createElement('a'); link.className = 'button'; link.href = url.href; link.rel = 'noreferrer';
                        link.textContent = `Abrir ${names[provider]}`;
                        link.onclick = event => {
                            if (!live() || Date.now() >= deadline) { event.preventDefault(); if (live()) expire(); else clearLink(); return; }
                            step(3); message('Falta confirmar dentro de Wallet. Abrir el enlace no confirma que la tarjeta se haya guardado.');
                        };
                        const hint = document.createElement('p'); hint.className = 'small';
                        result.append(link, hint); result.hidden = false; step(2);
                        function tick() {
                            if (!live()) { clearLink(); return; }
                            const seconds = Math.ceil((deadline - Date.now()) / 1000);
                            if (seconds <= 0) { expire(); return; }
                            hint.textContent = `Enlace disponible durante ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}. Confirma el guardado dentro de Wallet.`;
                        }
                        tick(); expiryTimer = setInterval(tick, 1000);
                        message('Tarjeta preparada. Abre Wallet para continuar.'); link.focus();
                    } catch (issue) {
                        if (!live()) return;
                        clearLink();
                        const hint = issue.code === 'WALLET_RETRY'
                            ? 'El negocio todavía no pudo conectar con Wallet. Reintenta; si continúa, pide ayuda en caja. Tu registro y tus saldos se conservan.'
                            : issue.status === 401
                                ? 'Esta sesión terminó. Si aún no guardaste la tarjeta, pide al negocio que verifique tu identidad y te ayude a recuperarla.'
                                : issue.message || 'No se pudo preparar la tarjeta. Comprueba tu conexión y reintenta.';
                        message(hint, true);
                    } finally { busy = false; if (live()) controls(); }
                };
                controls();
            } catch (issue) {
                if (!live()) return;
                panel.innerHTML = '<h2>Vamos a guardar tu tarjeta</h2><p role="alert">No pudimos comprobar la conexión. Tu registro está guardado.</p><button type="button" id="retryWalletStatus">Reintentar</button>';
                panel.querySelector('#retryWalletStatus').onclick = () => { if (live()) load(); };
            }
        }
        await load();
    };
})();;
;
