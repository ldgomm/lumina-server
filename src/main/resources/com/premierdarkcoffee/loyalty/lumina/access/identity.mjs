import { requireThat } from '../shared/domain.mjs';
import * as rules from '../presentation/assets/identity-rules.mjs';
const check=(name,value)=>{try{return rules[name](value);}catch(error){requireThat(false,error.message);}};
export const documentNumber=value=>check('documentNumber',value);
export const rucNumber=value=>check('rucNumber',value);
export const whatsappNumber=value=>check('whatsappNumber',value);
export const identityLabel=account=>account.document?'Cédula ····'+account.document.slice(-4):'Cédula pendiente';
