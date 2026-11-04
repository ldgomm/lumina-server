'use strict';
(() => {
    const original = customerCard;
    let generation = 0;
    customerCard = async function () {
        const current = ++generation;
        await original();
        const panel = document.querySelector('#walletMount');
        if (!state.token || !panel) return;
        try {
            const status = await api('/api/me/wallet-status');
            if (current !== generation || !state.token || !panel.isConnected) return;
            panel.innerHTML = `<h2>Guárdala en tu Wallet</h2><p>Hazlo ahora y confirma que quieres añadirla en tu teléfono. Después podrás cerrar esta página.</p><div class="row">${status.apple ? '<button id="addAppleWallet">Añadir a Apple Wallet</button>' : ''}${status.google ? '<button id="addGoogleWallet">Añadir a Google Wallet</button>' : ''}</div><div id="walletLink"></div><p class="small">${status.apple || status.google ? 'Para comprar o canjear, presenta tu tarjeta en caja. No necesitas contraseña.' : 'El negocio todavía debe habilitar Apple Wallet o Google Wallet. Tu registro está guardado: caja puede localizarte por cédula. Aún no se ha instalado una tarjeta en tu teléfono.'}</p>`;
            for (const [id, provider] of [['addAppleWallet', 'apple'], ['addGoogleWallet', 'google']]) {
                const button = document.getElementById(id); if (!button) continue;
                button.onclick = async () => {
                    button.disabled = true;
                    try {
                        const result = await api(`/api/me/wallet/${provider}/link`, {});
                        if (!state.token || !button.isConnected) return;
                        const url = new URL(result.url);
                        const valid = provider === 'apple' ? url.origin === location.origin && url.pathname.startsWith('/wallet/apple/download/') : url.origin === 'https://pay.google.com' && url.pathname.startsWith('/gp/v/save/');
                        if (!valid) throw new Error('No se pudo verificar el enlace de Wallet.');
                        const container = document.querySelector('#walletLink'); container.replaceChildren();
                        const link = document.createElement('a'); link.className = 'button'; link.href = url.href; link.rel = 'noreferrer';
                        link.textContent = provider === 'apple' ? 'Abrir tarjeta en Apple Wallet' : 'Continuar en Google Wallet';
                        container.append(link); container.append(document.createTextNode(' El teléfono te pedirá confirmar. Este enlace vence en unos minutos.'));
                        notice('Tarjeta preparada. Pulsa el enlace para abrir Wallet.');
                    } catch (e) { notice(e.message); } finally { button.disabled = false; }
                };
            }
        } catch (e) { if (panel.isConnected) panel.textContent = e.message; }
    };
})();
;
