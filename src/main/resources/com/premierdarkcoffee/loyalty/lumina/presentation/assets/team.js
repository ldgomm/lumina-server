'use strict';
for (const editor of document.querySelectorAll('[data-team-editor]')) {
  const {rules,titles}=JSON.parse(editor.dataset.definitions),form=editor.closest('form');
  const inputs=[...editor.querySelectorAll('input[type=checkbox]')];
  const has=(scope,action)=>inputs.some(input=>input.name===`${scope}.${action}`&&input.checked);
  const set=(scope,action,value)=>{const input=inputs.find(input=>input.name===`${scope}.${action}`);if(input)input.checked=value;};
  const nativeScopes=Object.keys(rules).filter(scope=>scope.startsWith('WALLET_'));
  const combos={NONE:[],VIEW:['VIEW'],REQUEST:['VIEW','REQUEST'],ALL:['VIEW','REQUEST','APPROVE'],EDIT:['VIEW','EDIT']};
  const selectors=[...editor.querySelectorAll('[data-access-level]')];
  for(const select of selectors){
    const scope=select.dataset.accessLevel,actions=rules[scope].actions;
    const entries=[['NONE','Sin acceso'],['VIEW','Solo consultar']];
    if(actions.includes('REQUEST'))entries.push(['REQUEST','Consultar y solicitar'],['ALL','Solicitar y aprobar'],['CUSTOM','Personalizar']);
    if(actions.includes('EDIT'))entries.push(['EDIT','Consultar y modificar']);
    for(const [value,label] of entries){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
    select.parentElement.hidden=false;
  }
  function render(){
    for(const select of selectors){
      const scope=select.dataset.accessLevel,chosen=rules[scope].actions.filter(action=>has(scope,action));
      const match=Object.keys(combos).find(key=>combos[key].join(',')===chosen.join(','))||'CUSTOM';
      select.value=select.dataset.custom==='yes'?'CUSTOM':match;
      if(scope==='WALLET'){
        const required=nativeScopes.some(key=>has(key,'VIEW'));
        select.querySelector('option[value=NONE]').disabled=required;
        let hint=select.closest('[data-team-scope]').querySelector('[data-wallet-dependency]');
        if(!hint){hint=document.createElement('p');hint.dataset.walletDependency='';hint.className='team-help';hint.textContent='La consulta está incluida en las tareas de Wallet elegidas.';select.closest('[data-team-scope]').append(hint);}
        hint.hidden=!required;
      }
      const detail=editor.querySelector(`[data-custom="${scope}"]`);
      detail.hidden=select.value!=='CUSTOM';detail.open=select.value==='CUSTOM';
    }
    const mode=form.elements.cash_mode.value,branch=form.elements.branch;
    editor.querySelector('[data-cash-branch]').hidden=mode==='OFF';branch.required=mode!=='OFF';
    const list=editor.querySelector('[data-access-preview]');list.replaceChildren();
    const add=text=>{const item=document.createElement('li');item.textContent=text;list.append(item);};
    if(mode!=='OFF')add('Wallet · '+({BOTH:'compras y canjes',PURCHASES:'solo compras',REWARDS:'solo canjes'}[mode])+(branch.value?' · '+branch.selectedOptions[0].textContent:''));
    for(const [scope,rule] of Object.entries(rules)){
      const selected=rule.actions.filter(action=>has(scope,action));if(!selected.length)continue;
      if(['INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE'].includes(scope)&&selected.every(action=>has('SOCIAL',action)))continue;
      add(`${rule.title}: ${selected.map(action=>titles[action].toLowerCase()).join(', ')}`);
    }
    if(!list.childElementCount)add('Sin tareas asignadas.');
    for(const module of editor.querySelectorAll('[data-module]')){
      module.dataset.enabled=String([...module.querySelectorAll('input[type=checkbox]')].some(input=>input.checked)||(module.dataset.module==='WALLET'&&mode!=='OFF'));
    }
    for(const details of editor.querySelectorAll('.team-more,.team-platforms')){
      const count=[...details.querySelectorAll('[data-access-level]')].filter(select=>rules[select.dataset.accessLevel].actions.some(action=>has(select.dataset.accessLevel,action))).length;
      const label=details.classList.contains('team-more')?'Más opciones de Wallet':'Permisos por red';
      details.querySelector('summary').textContent=label+(count?' · '+count+' con acceso':'');
    }
  }
  const syncDependency=(scope,action,checked)=>{
    if(checked){set(scope,'VIEW',true);if(scope.startsWith('WALLET_'))set('WALLET','VIEW',true);}
    else if(action==='VIEW'){
      if(scope==='WALLET'&&nativeScopes.some(key=>has(key,'VIEW'))){set('WALLET','VIEW',true);return;}
      for(const input of inputs)if(input.name.startsWith(scope+'.'))input.checked=false;
    }
  };
  editor.addEventListener('change',event=>{
    const select=event.target.closest('[data-access-level]');
    if(select){
      const scope=select.dataset.accessLevel;select.dataset.custom=select.value==='CUSTOM'?'yes':'';
      if(select.value!=='CUSTOM'){
        for(const action of rules[scope].actions)set(scope,action,combos[select.value].includes(action));
        if(scope.startsWith('WALLET_')&&has(scope,'VIEW'))set('WALLET','VIEW',true);
        // Native tasks require the base read grant; removing service requests must
        // never silently remove unrelated design/customer permissions.
        if(nativeScopes.some(key=>has(key,'VIEW')))set('WALLET','VIEW',true);
      }
    } else if(inputs.includes(event.target)) {
      const [scope,action]=event.target.name.split('.');syncDependency(scope,action,event.target.checked);
    }
    render();
  });
  // Keep optional tasks compact while making existing assignments visible in
  // their summary. No grant changes when opening or closing these sections.
  render();
}
const edited=new Set();
for(const form of document.querySelectorAll('[data-team-form]')){
  const signature=()=>JSON.stringify([...new FormData(form)]);
  const initial=signature();
  const status=form.querySelector('[data-save-status]');
  const mark=()=>{const changed=signature()!==initial;if(changed)edited.add(form);else edited.delete(form);if(status)status.textContent=changed?'Cambios sin guardar':'Los cambios se aplican al guardar.';};
  form.addEventListener('input',mark);
  form.addEventListener('change',mark);
  form.addEventListener('submit',event=>{if(!event.defaultPrevented){edited.delete(form);for(const button of form.querySelectorAll('button[type=submit]')){button.disabled=true;button.textContent='Guardando…';}form.setAttribute('aria-busy','true');}});
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
