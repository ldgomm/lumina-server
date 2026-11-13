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
            panel.innerHTML = '<p role="status">Preparando las opciones de tu tarjeta…</p>';
            try {
                const status = await api('/api/me/wallet-status');
                if (!live()) return;
                const providers = ['apple', 'google'].filter(p => status[p] === true);
                if (!providers.length) {
                    panel.innerHTML = '<h2>Tu registro está listo</h2><p>El negocio está preparando las tarjetas. Mientras tanto, pueden atenderte por cédula en caja.</p>';
                    return;
                }
                const android=/Android/i.test(navigator.userAgent), apple=/iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
                let selected=providers.includes(android?'google':'apple')?(android?'google':'apple'):providers[0],busy=false,deadline=0;
                panel.innerHTML = `<div class="eyebrow">Tu tarjeta digital</div><h2>Guárdala en tu teléfono</h2><p>Después, presenta su QR en caja.</p>
                  <div id="walletLink" class="wallet-save-result" hidden></div><button type="button" id="prepareWallet" disabled>Preparando tu tarjeta…</button>
                  <p id="walletFeedback" role="status" aria-live="polite"></p><p id="walletDeviceHint" class="small"></p>
                  ${providers.length>1?`<details class="wallet-save-help" ${!android&&!apple?'open':''}><summary>${android||apple?'Usar otra Wallet':'¿Qué teléfono usas?'}</summary><div class="wallet-provider-picker" role="group" aria-label="Tipo de teléfono">${providers.map(p=>`<button type="button" class="quiet" data-wallet-provider="${p}">${p==='apple'?'iPhone · Apple Wallet':'Android · Google Wallet'}</button>`).join('')}</div></details>`:''}
                  <details class="wallet-save-help"><summary>Ayuda para guardar mi tarjeta</summary><p>Al abrir Wallet, confirma «Añadir» o «Guardar». Ese último paso se hace en Apple o Google.</p><p>Si abriste el QR desde Instagram, WhatsApp o TikTok y no puedes guardarla, abre esta misma página en Safari (iPhone) o Chrome (Android).</p><p>Si ya tienes esta tarjeta, se conserva la misma. Para cambiar de teléfono o recuperar el acceso, pide ayuda al negocio.</p></details>`;
                const result=panel.querySelector('#walletLink'), retry=panel.querySelector('#prepareWallet'),feedback=panel.querySelector('#walletFeedback'),buttons=[...panel.querySelectorAll('[data-wallet-provider]')];
                function message(value,error=false){feedback.textContent=value;feedback.setAttribute('role',error?'alert':'status');}
                function clearLink(){clearInterval(expiryTimer);deadline=0;result.replaceChildren();result.hidden=true;}
                function controls(){
                    panel.setAttribute('aria-busy',String(busy));retry.disabled=busy;retry.hidden=!!deadline;
                    retry.textContent=busy?'Preparando tu tarjeta…':'Reintentar';
                    buttons.forEach(b=>{b.disabled=busy;b.setAttribute('aria-pressed',String(b.dataset.walletProvider===selected));});
                    panel.querySelector('#walletDeviceHint').textContent=android||apple?(selected==='apple'?'Para iPhone. Confirma «Añadir» en Apple Wallet.':'Para Android. Usa la cuenta de Google de este teléfono y confirma el guardado.'):'Abre esta página en el teléfono donde usarás la tarjeta.';
                }
                function expired(){clearLink();controls();retry.textContent='Renovar enlace de la misma tarjeta';message('El enlace venció. Renueva el acceso para guardar tu tarjeta.');}
                async function prepare(){
                    if(busy||!live())return;
                    busy=true;clearLink();message('');controls();
                    const started=Date.now(),provider=selected;
                    try {
                        const response=await api(`/api/me/wallet/${provider}/link`,{});
                        if(!live())return;
                        const url=new URL(response.url);
                        const valid=!url.username&&!url.password&&!url.hash&&(provider==='apple'
                            ?url.origin===location.origin&&/^\/wallet\/apple\/download\/[A-Za-z0-9_-]{43}$/.test(url.pathname)&&!url.search
                            :url.origin==='https://pay.google.com'&&/^\/gp\/v\/save\/[A-Za-z0-9_.-]+$/.test(url.pathname)&&!url.search);
                        if(!valid||!Number.isFinite(response.expiresIn)||response.expiresIn<=0||response.expiresIn>3600)throw new Error('No pudimos verificar el enlace. Reintenta.');
                        deadline=started+response.expiresIn*1000;
                        if(Date.now()>=deadline){expired();return;}
                        // A normal link, already prepared, preserves the user's tap in Safari/Chrome.
                        // No synthetic second click, popup, automatic navigation or installation claim.
                        const link=document.createElement('a');link.className='button wallet-add-primary';link.href=url.href;link.rel='noreferrer';link.textContent=`Añadir a ${names[provider]}`;
                        link.onclick=event=>{
                            if(!live()||Date.now()>=deadline){event.preventDefault();if(live())expired();else clearLink();return;}
                            message(`Confirma el guardado en ${names[provider]}.`);
                        };
                        result.append(link);result.hidden=false;
                        expiryTimer=setInterval(()=>{if(!live())clearLink();else if(Date.now()>=deadline)expired();},1000);
                    }catch(issue){
                        if(!live())return;clearLink();
                        message(issue.status===401?'Tu sesión terminó. Pide al negocio que verifique tu identidad y te ayude a recuperar la misma tarjeta.':issue.code==='WALLET_RETRY'?'No pudimos conectar con Wallet. Reintenta en un momento; tu registro está guardado.':issue.message||'No pudimos preparar tu tarjeta. Reintenta.',true);
                    }finally{busy=false;if(live())controls();}
                }
                retry.onclick=prepare;
                buttons.forEach(b=>b.onclick=()=>{if(!busy&&live()&&selected!==b.dataset.walletProvider){selected=b.dataset.walletProvider;prepare();}});
                await prepare();
            }catch(issue){
                if(!live())return;
                panel.innerHTML='<h2>Tu registro está listo</h2><p role="alert">No pudimos comprobar Wallet. Reintenta para guardar tu tarjeta.</p><button type="button" id="retryWalletStatus">Reintentar</button>';
                panel.querySelector('#retryWalletStatus').onclick=()=>{if(live())load();};
            }
        }
        await load();
    };
})();
