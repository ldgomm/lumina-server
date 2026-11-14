(() => {
  for (const editor of document.querySelectorAll('.control-state-editor')) {
    const select = editor.querySelector('[name="state"]');
    const update = () => { for (const effect of editor.querySelectorAll('[data-state-effect]')) effect.hidden = effect.dataset.stateEffect !== select.value; };
    if (select) { select.addEventListener('change', update); update(); }
  }
  document.querySelector('[data-print-receipt]')?.addEventListener('click', () => window.print());
})();
