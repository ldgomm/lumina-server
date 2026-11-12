'use strict';
for (const editor of document.querySelectorAll('[data-team-editor]')) {
  const {rules,titles,presets}=JSON.parse(editor.dataset.definitions);
  const inputs=[...editor.querySelectorAll('input[type=checkbox]')];
  const has=(scope,action)=>inputs.some(input=>input.name===`${scope}.${action}`&&input.checked);
  const set=(scope,action,value)=>{const input=inputs.find(input=>input.name===`${scope}.${action}`);if(input)input.checked=value;};
  const render=()=>{
    const list=editor.querySelector('[data-access-preview]');list.replaceChildren();
    for(const [scope,rule] of Object.entries(rules)){
      const selected=rule.actions.filter(action=>has(scope,action));
      if(!selected.length)continue;
      if(['INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE'].includes(scope)&&selected.every(action=>has('SOCIAL',action)))continue;
      const item=document.createElement('li');item.textContent=`${rule.title}: ${selected.map(action=>titles[action].toLowerCase()).join(', ')}`;list.append(item);
    }
    if(!list.childElementCount){const item=document.createElement('li');item.textContent='Sin acceso a servicios. Caja se asigna por separado.';list.append(item);}
  };
  editor.addEventListener('change',event=>{
    if(!inputs.includes(event.target))return;
    const [scope,action]=event.target.name.split('.');
    if(event.target.checked){
      set(scope,'VIEW',true);
      if(scope.startsWith('WALLET_'))set('WALLET','VIEW',true);
    }else if(action==='VIEW'){
      for(const input of inputs)if(input.name.startsWith(scope+'.'))input.checked=false;
      if(scope==='WALLET')for(const input of inputs)if(input.name.startsWith('WALLET_'))input.checked=false;
    }
    editor.querySelector('[data-preset-note]').textContent='Configuración personalizada. Revisa el resumen antes de guardar.';
    render();
  });
  for(const button of editor.querySelectorAll('[data-team-preset]'))button.addEventListener('click',()=>{
    const preset=presets[button.dataset.teamPreset];
    const current=inputs.filter(input=>input.checked).map(input=>input.name).sort().join(',');
    const next=[...(preset?.grants||[])].sort().join(',');
    if(current&&current!==next&&!window.confirm('Esta base reemplazará los permisos del formulario. No se guardará todavía.'))return;
    for(const input of inputs)input.checked=(preset?.grants||[]).includes(input.name);
    editor.querySelector('[data-preset-note]').textContent=preset?.note||'No tendrá acceso a servicios. Caja se configura por separado.';
    editor.dispatchEvent(new Event('change',{bubbles:true}));render();
  });
  render();
}
for(const form of document.querySelectorAll('form[action$="/caja/guardar"]')){
  const f=form.elements,preview=form.querySelector('[data-cash-preview]');
  const update=()=>{
    const actions=[f.purchases.checked?'registrar compras':null,f.rewards.checked?'canjear premios y descuentos':null].filter(Boolean);
    preview.textContent=actions.length?'Podrá '+actions.join(' y ')+' en '+f.branch.selectedOptions[0].textContent+'. Se aplicará al guardar.':'Elige al menos una operación para habilitar Caja.';
    f.purchases.setCustomValidity(actions.length?'':'Selecciona compras, canjes o ambas operaciones.');
  };
  for(const button of form.querySelectorAll('[data-cash-preset]'))button.addEventListener('click',()=>{
    f.purchases.checked=button.dataset.cashPreset!=='rewards';f.rewards.checked=button.dataset.cashPreset!=='purchases';form.dispatchEvent(new Event('change',{bubbles:true}));
  });
  form.addEventListener('change',update);update();
}
const edited=new Set();
for(const form of document.querySelectorAll('[data-team-form]')){
  const signature=()=>JSON.stringify([...new FormData(form)]);
  const initial=signature();
  form.addEventListener('input',()=>{if(signature()!==initial)edited.add(form);else edited.delete(form);});
  form.addEventListener('change',()=>{if(signature()!==initial)edited.add(form);else edited.delete(form);});
  form.addEventListener('submit',event=>{if(!event.defaultPrevented)edited.delete(form);});
}
window.addEventListener('beforeunload',event=>{if(edited.size){event.preventDefault();event.returnValue='';}});
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(!edited.size||!link||link.getAttribute('href').startsWith('#')||link.target==='_blank'||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  if(!window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?'))event.preventDefault();else edited.clear();
});
for(const button of document.querySelectorAll('[data-copy-activation]'))button.addEventListener('click',async()=>{
  const code=button.parentElement.querySelector('.secret');const status=document.querySelector('[data-copy-status]');
  try{await navigator.clipboard.writeText(code.textContent);status.textContent='Código copiado.';}
  catch{const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(code);selection.removeAllRanges();selection.addRange(range);status.textContent='Código seleccionado. Cópialo con el teclado.';}
});
