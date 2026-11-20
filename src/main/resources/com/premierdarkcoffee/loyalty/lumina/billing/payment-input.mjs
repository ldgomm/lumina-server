import { isId, requireThat, text } from '../shared/domain.mjs';
export function paymentInput(data) {
 requireThat(data.confirm==='yes','Confirma que el pago fue recibido.');
 requireThat(isId(data.requestKey)&&isId(data.invoiceId),'Vuelve a abrir el formulario de pago.');
 requireThat(/^\d{1,8}(\.\d{1,2})?$/.test(data.amount||''),'Escribe un importe válido con hasta dos decimales.');
 const [whole,cents='']=data.amount.split('.'),amountMinor=Number(whole)*100+Number(cents.padEnd(2,'0'));
 requireThat(Number.isSafeInteger(amountMinor)&&amountMinor>0&&amountMinor<=1_000_000_000,'Revisa el importe.');
 requireThat(['TRANSFER','CASH','CARD','OTHER'].includes(data.method),'Selecciona el medio de pago.');
 requireThat(/^\d{4}-\d{2}-\d{2}$/.test(data.paidOn||''),'Selecciona la fecha del pago.');
 return {invoiceId:data.invoiceId,amountMinor,...(data.walletCut==='yes'?{walletCut:true}:{}),reference:text(data.reference,'referencia',1,100),method:data.method,paidOn:data.paidOn};
}

export function chargeInput(data) {
 requireThat(data.confirm==='yes'&&isId(data.requestKey),'Confirma el cargo acordado.');
 const amount=paymentInput({...data,invoiceId:data.requestKey,method:'OTHER',paidOn:data.dueOn,reference:'CARGO'}).amountMinor;
 return {description:text(data.description,'concepto y acuerdo',5,200),amountMinor:amount,dueOn:data.dueOn};
}

export function emptyAccount(company,today) { return {business:{id:company.id,name:company.name},today,membership:null,summary:{balanceMinor:0,overdueMinor:0,nextDueOn:null,invoiceCount:0},invoices:[],payments:[],paymentCount:0,offset:0}; }
