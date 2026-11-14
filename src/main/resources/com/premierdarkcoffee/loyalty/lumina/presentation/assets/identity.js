import { documentNumber, rucNumber, whatsappNumber } from './identity-rules.mjs';
let sequence=0;
for(const input of document.querySelectorAll('[data-identity]')) {
 const note=document.createElement('span');note.className='identity-feedback';note.id='identity-check-'+(++sequence);note.setAttribute('aria-live','polite');input.after(note);
 input.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),note.id].filter(Boolean).join(' '));
 const validate=()=>{
   input.setCustomValidity('');note.textContent='';delete note.dataset.error;input.removeAttribute('aria-invalid');
   if(!input.value.trim())return;
   try {
     ({ruc:rucNumber,document:documentNumber,phone:whatsappNumber}[input.dataset.identity])(input.value);
     note.textContent=input.dataset.identity==='phone'?'Número de contacto válido.':input.dataset.identity==='ruc'?'Formato correcto. Existencia y estado pendientes de verificación en el SRI.':'Número consistente. Esto no verifica la identidad del titular.';
   } catch(error){input.setCustomValidity(error.message);input.setAttribute('aria-invalid','true');note.textContent=error.message;note.dataset.error='true';}
 };
 input.addEventListener('blur',validate);
 input.addEventListener('input',()=>{input.setCustomValidity('');input.removeAttribute('aria-invalid');note.textContent='';delete note.dataset.error;});
 input.form?.addEventListener('submit',event=>{validate();if(!input.checkValidity()){event.preventDefault();input.reportValidity();}});
}
