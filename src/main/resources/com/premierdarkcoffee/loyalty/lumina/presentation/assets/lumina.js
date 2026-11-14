'use strict';

for (const panel of document.querySelectorAll('[data-request-form]')) {
  const formats = JSON.parse(panel.dataset.formats);
  const channel = panel.querySelector('[name=channel]');
  const service = panel.querySelector('[name=service]');
  const type = panel.querySelector('[name=type]');
  const allChannels = Array.from(channel.options, option => [option.value,option.textContent]);
  const videoChannels = ['SOCIAL'];
  const sync = () => {
    const previousChannel = channel.value;
    const allowed = allChannels.filter(([key]) => type.value !== 'VISIT' || videoChannels.includes(key));
    if (channel.options.length !== allowed.length) {
      channel.replaceChildren(...allowed.map(([key,title])=>new Option(title,key,false,key===previousChannel)));
    }
    const previous = service.value;
    const choices = formats[channel.value] || [];
    service.replaceChildren(...choices.map(([key,title]) => new Option(title,key,false,key === previous)));
    const visits = panel.querySelector('[data-visit]');
    const quantity = panel.querySelector('[data-quantity]');
    if (visits) visits.hidden = type.value !== 'VISIT';
    if (quantity) quantity.hidden = type.value === 'VISIT';
  };
  channel.addEventListener('change',sync);
  type.addEventListener('change',sync);
  sync();
}

const navigationButton=document.querySelector('.menu-toggle');
if(navigationButton){
  const nav=document.getElementById(navigationButton.getAttribute('aria-controls'));
  const backdrop=document.querySelector('.navigation-backdrop'),close=nav?.querySelector('.navigation-close');
  const background=[...document.querySelectorAll('main,.workspace-topbar,footer')];
  const media=window.matchMedia?.('(max-width:760px)');
  const isMobile=()=>media?media.matches:window.innerWidth<=760;
  const setOpen=(open,restore=true)=>{
    navigationButton.setAttribute('aria-expanded',String(open));document.body.classList.toggle('nav-open',open);
    if(backdrop)backdrop.hidden=!open;
    for(const node of background)node.inert=open;
    if(open)close?.focus();else if(restore)navigationButton.focus();
  };
  navigationButton.addEventListener('click',()=>setOpen(navigationButton.getAttribute('aria-expanded')!=='true'));
  close?.addEventListener('click',()=>setOpen(false));backdrop?.addEventListener('click',()=>setOpen(false));
  nav?.addEventListener('click',event=>{if(event.target.closest('a')&&document.body.classList.contains('nav-open'))setOpen(false,false);});
  document.addEventListener('keydown',event=>{
    if(!document.body.classList.contains('nav-open'))return;
    if(event.key==='Escape'){event.preventDefault();setOpen(false);}
    if(event.key==='Tab'&&nav){
      const focusable=[...nav.querySelectorAll('*')].filter(e=>e.tabIndex>=0&&!e.disabled&&e.type!=='hidden'&&!e.closest('[hidden]'));
      const first=focusable[0],last=focusable.at(-1),outside=!nav.contains(document.activeElement);
      if(event.shiftKey&&(document.activeElement===first||outside)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||outside)){event.preventDefault();first?.focus();}
    }
  });
  media?.addEventListener('change',()=>{if(!isMobile())setOpen(false,false);});
  window.addEventListener('pageshow',()=>setOpen(false,false));
}
// Reveal optional controls before the browser focuses an invalid field.
document.addEventListener('invalid',event=>{
  for(let parent=event.target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
},true);
// Run after form-level validators, so a cancelled submission remains editable.
const pendingButtons = new WeakMap();
const restoreForm = form => {
  delete form.dataset.busy;
  form.removeAttribute('aria-busy');
  const saved = pendingButtons.get(form);
  if (saved) {
    saved.button.textContent = saved.caption;
    saved.button.disabled = saved.disabled;
    pendingButtons.delete(form);
  }
};
document.addEventListener('submit', event => {
  const form = event.target;
  if (!form.matches('form[method="post"]') || event.defaultPrevented) return;
  if (form.dataset.busy === 'yes') { event.preventDefault(); return; }
  form.dataset.busy = 'yes';
  form.setAttribute('aria-busy', 'true');
  const button = event.submitter || form.querySelector('button[type="submit"],button:not([type])');
  if (button) {
    pendingButtons.set(form, {button,caption:button.textContent,disabled:button.disabled});
    button.textContent = 'Guardando…';
    // Keep named submitters in the submitted payload.
    if (!button.name) button.disabled = true;
  }
});
window.addEventListener('pageshow', () => {
  for (const form of document.querySelectorAll('form[data-busy]')) restoreForm(form);
});

// Drafts stay in the current page only; never persist customer details in storage.
const draftForms = new Map();
const draftSignature = form => JSON.stringify([...new FormData(form)].filter(([name]) =>
  name !== '_csrf' && !name.startsWith('catalog_')));
for (const form of document.querySelectorAll('form[method="post"]')) {
  if (form.matches('[data-team-form]') || form.querySelector('input[type="password"]')) continue;
  if (!form.querySelector('textarea,[data-request-composer],[data-package-quantity]')) continue;
  const original = draftSignature(form);
  const mark = () => {
    if (draftSignature(form) !== original) draftForms.set(form, original);
    else draftForms.delete(form);
  };
  form.addEventListener('input', mark);
  form.addEventListener('change', mark);
}
const hasDrafts = () => [...draftForms].some(([form,original]) =>
  form.dataset.busy !== 'yes' && draftSignature(form) !== original);
window.addEventListener('beforeunload', event => {
  if (hasDrafts()) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (event.defaultPrevented || !link || !hasDrafts() || link.target === '_blank' || link.hasAttribute('download') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const destination = new URL(link.href, location.href);
  if (destination.pathname === location.pathname && destination.search === location.search && destination.origin === location.origin) return;
  if (!window.confirm('Tienes cambios sin enviar. ¿Quieres salir y descartarlos?')) event.preventDefault();
  else draftForms.clear();
});

for(const form of document.querySelectorAll('form:has([name="term"])')) {
  if(form.querySelector('[data-offer-editor]'))continue;
  const term=form.querySelector('[name="term"]');
  const sync=()=>{for(const code of ['LOGO','IDENTITY','BRAND_GUIDE']){const field=form.elements[code];if(field){field.disabled=term.value==='MONTHLY';field.closest('label').hidden=field.disabled;}}};
  term.addEventListener('change',sync);sync();
}

for(const form of document.querySelectorAll('form:has([name="individual_service"])')) {
  const service=form.querySelector('[name=individual_service]'),term=form.querySelector('[name=term]');
  const sync=()=>{const brand=['LOGO','IDENTITY','BRAND_GUIDE'].includes(service.value);const monthly=term.querySelector('option[value=MONTHLY]');monthly.disabled=brand;if(brand)term.value='ONE_OFF';};
  service.addEventListener('change',sync);sync();
}

const validationMessage=document.querySelector('[role=alert]');
if(validationMessage){validationMessage.tabIndex=-1;validationMessage.focus();}

// This finder filters authorized navigation only. It has no network or storage access.
for(const box of document.querySelectorAll('.navigation-find')) {
  const nav=box.parentElement,input=box.querySelector('[data-nav-search]'),clear=box.querySelector('[data-nav-clear]'),result=box.querySelector('[data-nav-result]');
  const links=[...nav.children].filter(e=>e.matches('a[href]'));
  const headings=[...nav.children].filter(e=>e.matches('.nav-label'));
  const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  const filter=()=>{
    const words=fold(input.value).split(/\s+/).filter(Boolean);
    for(const link of links)link.hidden=!words.every(word=>fold(link.textContent).includes(word));
    for(const heading of headings){let next=heading.nextElementSibling,visible=false;while(next&&!next.matches('.nav-label')){if(links.includes(next)&&!next.hidden)visible=true;next=next.nextElementSibling;}heading.hidden=!!words.length&&!visible;}
    const count=links.filter(e=>!e.hidden).length;
    result.textContent=words.length?(count?count+' sección'+(count===1?'':'es'):'No encontramos esa sección.'):'';
    clear.hidden=!words.length;
  };
  box.hidden=false;input.addEventListener('input',filter);
  clear.addEventListener('click',()=>{input.value='';filter();input.focus();});
  input.addEventListener('keydown',event=>{if(event.key==='Escape'&&input.value){event.preventDefault();event.stopPropagation();input.value='';filter();}});
  window.addEventListener('pageshow',filter);
}
