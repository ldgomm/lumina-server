'use strict';
(() => {
  const slot = document.querySelector('[data-wallet-reminder]');
  if (!slot) return;
  const home = slot.dataset.walletReminder === 'home';
  const counter = home && document.querySelector('.task-panel[data-area="wallet"] .task-action[href*="section=sales"]')?.closest('.task-panel');
  const shortcut = home && document.querySelector('[data-wallet-counter]');
  const unavailable = {type:'unavailable',title:'Saldo de Wallet por confirmar',description:'Puedes volver a consultar el estado de tu cuenta.',href:'/billing',action:'Ver mi cuenta'};
  let visible = home, expires = 0, result = null, request = null, unavailableNow = false;

  function draw() {
    const message=unavailableNow?unavailable:result;
    const show = visible && message;
    slot.hidden = !show;
    const suspended=Boolean(result && ['overdue','suspended'].includes(result.type));
    if (counter) counter.hidden = suspended;
    if (shortcut) shortcut.hidden = suspended;
    if (!show) return;
    const title = document.createElement('strong'), description = document.createElement('p');
    title.textContent = message.title;
    description.textContent = message.description;
    slot.dataset.urgency = message.type;
    slot.replaceChildren(title, description);
    if (['/billing?view=charges#pago-wallet','/billing'].includes(message.href)) {
      const action = document.createElement('a');
      action.href = message.href;
      action.textContent = message.action;
      slot.append(action);
    }
  }
  async function update() {
    if (Date.now() >= expires) {
      if (!request) {
        request = fetch('/plans/wallet/state', {credentials:'same-origin', redirect:'error'})
          .then(response => response.ok ? response.json() : Promise.reject())
          .then(data => { result=data.reminder; unavailableNow=false; expires=Date.now()+60000; })
          .catch(() => { unavailableNow=true; expires=Date.now()+15000; })
          .finally(() => { request=null; });
      }
      await request;
    }
    draw();
  }
  if (home) update();
  else document.addEventListener('lumina-wallet-section', event => {
    visible = event.detail === 'overview';
    if (visible) update();
    else draw();
  });
  window.addEventListener('pageshow',event=>{if(event.persisted && visible){expires=0;update();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && visible)update();});
})();
