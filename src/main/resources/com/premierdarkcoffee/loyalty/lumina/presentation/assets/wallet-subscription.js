'use strict';
(() => {
  const slot = document.querySelector('[data-wallet-reminder]');
  if (!slot) return;
  const home = slot.dataset.walletReminder === 'home';
  const counter = home && document.querySelector('.task-panel[data-area="wallet"] .task-action[href*="section=sales"]')?.closest('.task-panel');
  let visible = home, expires = 0, result = null, request = null;

  function draw() {
    const show = visible && result;
    slot.hidden = !show;
    if (counter) counter.hidden = Boolean(show && ['overdue','suspended'].includes(result.type));
    if (!show) return;
    const title = document.createElement('strong'), description = document.createElement('p');
    title.textContent = result.title;
    description.textContent = result.description;
    slot.dataset.urgency = result.type;
    slot.replaceChildren(title, description);
    if (['/billing?view=charges#pago-wallet','/billing'].includes(result.href)) {
      const action = document.createElement('a');
      action.href = result.href;
      action.textContent = result.action;
      slot.append(action);
    }
  }
  async function update() {
    if (Date.now() >= expires) {
      if (!request) {
        request = fetch('/plans/wallet/state', {credentials:'same-origin', redirect:'error'})
          .then(response => response.ok ? response.json() : Promise.reject())
          .then(data => { result=data.reminder; expires=Date.now()+60000; })
          .catch(() => { result=null; expires=Date.now()+15000; })
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
})();
