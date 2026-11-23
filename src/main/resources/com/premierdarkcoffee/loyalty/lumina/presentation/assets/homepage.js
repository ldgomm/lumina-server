(() => {
  const menu = document.querySelector('.mobile-menu');
  if (!menu) return;
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
})();

(() => {
  const button = document.querySelector('[data-visit-demo]');
  if (!button) return;
  const example = button.closest('.wallet-exhibit');
  const status = example.querySelector('[data-visit-status]');
  button.hidden = false;
  button.addEventListener('click', () => {
    const ready = example.classList.toggle('reward-ready');
    status.textContent = ready ? 'Premio disponible · 5 de 5 sellos' : '4 de 5 sellos';
    button.textContent = ready ? 'Volver a probar' : 'Simular una visita';
  });
})();
