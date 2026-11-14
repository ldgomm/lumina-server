import { documentNumber, rucNumber, whatsappNumber, contactPhone } from './identity-rules.mjs';
let sequence=0;
for(const input of document.querySelectorAll('[data-identity]')) {
 const note=document.createElement('span');note.className='identity-feedback';note.id='identity-check-'+(++sequence);note.setAttribute('aria-live','polite');input.after(note);
 input.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),note.id].filter(Boolean).join(' '));
 const validate=()=>{
   input.setCustomValidity('');note.textContent='';delete note.dataset.error;input.removeAttribute('aria-invalid');
   if(!input.value.trim())return;
   try {
     ({ruc:rucNumber,document:documentNumber,phone:whatsappNumber,contact:contactPhone}[input.dataset.identity])(input.value);
     // Successful checks remain quiet; the form explains the purpose of the data.
   } catch(error){input.setCustomValidity(error.message);input.setAttribute('aria-invalid','true');note.textContent=error.message;note.dataset.error='true';}
 };
 input.addEventListener('blur',validate);
 input.addEventListener('input',()=>{input.setCustomValidity('');input.removeAttribute('aria-invalid');note.textContent='';delete note.dataset.error;});
 input.form?.addEventListener('submit',event=>{validate();if(!input.checkValidity()){event.preventDefault();input.reportValidity();}});
}

for(const input of document.querySelectorAll('input[type="password"][name="password"],input[type="password"][name="current"],input[type="password"][name="confirmation"]')) {
 // Account forms already own an accessible reveal button and its lifecycle.
 if(input.closest('.password-control'))continue;
 const wrap=document.createElement('span');wrap.className='password-control';input.before(wrap);wrap.append(input);
 const button=document.createElement('button');button.type='button';button.className='password-reveal';button.textContent='Mostrar';button.setAttribute('aria-label','Mostrar contraseña');button.setAttribute('aria-pressed','false');wrap.append(button);
 const reveal=show=>{input.type=show?'text':'password';button.textContent=show?'Ocultar':'Mostrar';button.setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña');button.setAttribute('aria-pressed',String(show));};
 button.addEventListener('click',()=>reveal(input.type==='password'));
 input.form?.addEventListener('submit',()=>reveal(false));
 window.addEventListener('pageshow',()=>reveal(false));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reveal(false);});
}
