'use strict';
(() => {
    const platform = location.pathname === '/platform';
    const names = {ACTIVE:'Activo',SUSPENDED:'Suspendido',CLOSED:'Dado de baja',PAID:'Pagado',PARTIAL:'Pago parcial',OPEN:'Pendiente',OVERDUE:'Vencido',VOID:'Anulado',INFO:'Información',WARNING:'Advertencia',URGENT:'Urgente',TRANSFER:'Transferencia',CASH:'Efectivo',CARD:'Tarjeta',OTHER:'Otro'};
    const money = (n,c='USD') => new Intl.NumberFormat('es',{style:'currency',currency:c}).format(Number(n || 0)/100);
    const badge = s => `<span class="commercial-badge ${esc(s)}">${esc(names[s] || s)}</span>`;
    const date = s => s ? esc(s.slice(0,10)) : '—';
    const amount = (name,label,value='') => field(name,label,'number',value,'required min="0" max="10000000" step="0.01"');
    const select = (name,label,items,value) => `<label for="${name}">${label}</label><select id="${name}" name="${name}">${items.map(([v,n])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
    const minor = v => { if(!/^\d+(\.\d{1,2})?$/.test(v))throw new Error('Usa un monto con hasta dos decimales.'); return Math.round(Number(v)*100); };
    const stat = (label,value,note='') => `<div class="commercial-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note?`<small>${esc(note)}</small>`:''}</div>`;
    const table = (heads,rows,empty='Todavía no hay registros.') => rows.length ? `<div class="commercial-table-wrap"><table class="commercial-table"><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>{let col=0;return row.replace(/<td(?=[ >])/g,()=>`<td data-label="${esc(heads[col++]||'')}"`)}).join('')}</tbody></table></div>` : `<p class="commercial-empty">${esc(empty)}</p>`;
    let selected = null, accountData = null, pane = 'account', offset = 0, requestVersion = 0;
    const endpoint = () => platform ? `/api/platform/tenants/${selected}` : '/api/staff';
    const handle = fn => async () => {try{await fn()}catch(e){notice(e.message)}};
    function dialog(title,fields,handler,label='Guardar',warning='') {
        document.querySelector('#commercialDialog')?.remove();
        const d = document.createElement('dialog'); d.id='commercialDialog';d.className='commercial-dialog';
        d.innerHTML=`<h2>${esc(title)}</h2>${warning?`<p>${esc(warning)}</p>`:''}<form id="commercialForm">${fields}<div class="row"><button type="button" class="quiet" id="closeDialog">Cancelar</button><button type="submit">${esc(label)}</button></div></form>`;
        document.body.append(d); d.showModal();
                action('closeDialog',()=>d.close());d.addEventListener('close',()=>d.remove());
        form('commercialForm',async(values,f)=>{await handler(values,f);d.close()});
        const businessName=d.querySelector('[name=name]'),businessSlug=d.querySelector('[name=slug]');
        if(businessName&&businessSlug){let edited=false;businessSlug.addEventListener('input',()=>{edited=true});businessName.addEventListener('input',()=>{if(!edited)businessSlug.value=businessName.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)});}

    }
    function login() {

        exit.hidden=true;
        app.innerHTML=`<section class="narrow"><div class="eyebrow">Administración de plataforma</div><h1>Cada negocio,<br>bien acompañado.</h1><p>Administra membresías, pagos y permanencia. Consulta cómo crece tu comunidad.</p><section class="panel"><h2>Entrar a la plataforma</h2><form id="platformLogin">${field('platformToken','Credencial de plataforma','password','','required autocomplete="off"')}<button type="submit">Entrar</button></form><p class="commercial-note">Usa PLATFORM_ADMIN_TOKEN de tu configuración local. La credencial del negocio abre su propio portal.</p></section><a href="/">Ir al acceso de negocios</a></section>`;
        form('platformLogin',async v=>{state.token=v.platformToken.trim();try{await listBusinesses()}catch(e){state.token='';throw e}});
    }
    async function listBusinesses(query='',page=0) {
        const ticket=++requestVersion;
        const data=await api(`/api/platform/tenants?q=${encodeURIComponent(query)}&offset=${page}`);
                if(ticket!==requestVersion)return;
        exit.hidden=false;selected=null;
        app.innerHTML=`<div class="commercial-head"><div><div class="eyebrow">Tu plataforma</div><h1>Negocios que vuelven a crecer.</h1><p>Membresías, cuentas y relaciones de largo plazo.</p></div><div class="row"><button id="newBusiness">Añadir negocio</button><button class="quiet" id="addExistingLocation">Añadir local a un negocio</button></div></div><div class="commercial-stats">${stat('En esta página',data.items.length)}${stat('Activos',data.items.filter(x=>x.state==='ACTIVE').length)}${stat('Suspendidos',data.items.filter(x=>x.state==='SUSPENDED').length)}${stat('Clientes de esta página',data.items.reduce((a,b)=>a+b.clients,0))}</div><section class="panel"><form id="businessSearch" class="commercial-search"><div>${field('query','Buscar por nombre o identificador','search',query,'maxlength="100"')}</div><button type="submit">Buscar</button></form>${table(['Negocio','Estado','Clientes','Saldo emitido','Próximo cargo',''],data.items.map(b=>`<tr><td class="commercial-identity">${esc(b.name)}<small>${esc(b.slug)} · Desde ${date(b.joinedAt)}</small></td><td>${badge(b.state)}</td><td>${b.clients}</td><td>${money(b.balanceMinor,b.currency)}</td><td>${date(b.nextChargeOn)}</td><td><button class="quiet" data-business="${esc(b.id)}">Administrar</button></td></tr>`),'Añade tu primer negocio para empezar.')}<div class="commercial-pager"><button class="quiet" id="listPrev" ${page===0?'disabled':''}>Anterior</button><span>Página ${Math.floor(page/50)+1}</span><button class="quiet" id="listNext" ${data.nextOffset===null?'disabled':''}>Siguiente</button></div><p class="commercial-note">Los saldos corresponden a cargos emitidos. Los cargos programados se actualizan en segundo plano y al abrir cada cuenta. Cada negocio conserva su propia moneda.</p></section>`;
        form('businessSearch',v=>listBusinesses(v.query,0));action('listPrev',()=>listBusinesses(query,Math.max(0,page-50)));action('listNext',()=>listBusinesses(query,data.nextOffset));
        document.querySelectorAll('[data-business]').forEach(b=>b.onclick=handle(async()=>{selected=b.dataset.business;pane='account';offset=0;await loadAccount()}));
        action('newBusiness',()=>dialog('Añadir negocio',`${field('name','Nombre','text','','required maxlength="120"')}${field('slug','Enlace del negocio','text','','required pattern="[a-z0-9-]+" minlength="3" maxlength="60"')}${select('currency','Moneda',[['USD','USD · Dólar'],['EUR','EUR · Euro']], 'USD')}${field('timezone','Zona horaria','text','America/Guayaquil','required')}${field('firstBranchName','Primera sucursal','text','Principal','required maxlength="120"')}${field('firstBranchCode','Código de la sucursal','text','PRINCIPAL','required maxlength="40"')}<p>Este negocio tendrá su propia tarjeta. Sus sucursales compartirán el saldo y los premios.</p>`,async(v)=>{
            const r=await api('/api/platform/tenants',{name:v.name,slug:v.slug,currency:v.currency,timezone:v.timezone,firstBranch:{name:v.firstBranchName,code:v.firstBranchCode}});await listBusinesses();
            const panel=document.createElement('section');panel.className='panel';panel.innerHTML=`<h2>Negocio creado</h2><p>Entrega esta credencial al dueño por un medio privado. Se muestra una sola vez.</p><div class="code">${esc(r.ownerToken)}</div><p>Registro de clientes: <a href="${esc(r.enrollmentPath)}">${esc(r.enrollmentPath)}</a></p>`;app.prepend(panel);
        },'Crear negocio'));
        action('addExistingLocation',()=>{
            if(!data.items.length){notice('Busca primero el negocio al que pertenece este local.');return;}
            dialog('Relacionar un nuevo local',`${select('tenantId','Negocio que comparte la tarjeta',data.items.map(b=>[b.id,b.name]))}${field('name','Nombre del nuevo local','text','','required maxlength="120"')}${field('code','Código del local','text','','required maxlength="40"')}<p>El local se añade como sucursal del negocio seleccionado. Los clientes conservan su tarjeta y saldo. La lista corresponde a tu búsqueda actual.</p>`,async(v,f)=>{
                const payload={name:v.name,code:v.code};await api(`/api/platform/tenants/${encodeURIComponent(v.tenantId)}/branches`,payload,'POST',operationKey(f,payload));
                selected=v.tenantId;pane='branches';await loadAccount();notice('Local añadido al mismo negocio.');
            },'Añadir local');
        });
    }
    async function renderLocations(root) {
        const tenant=selected;
        const data=await api(`${endpoint()}/branches`);
        if(tenant!==selected || !root.isConnected)return;
        root.innerHTML=`<section class="panel"><h2>Una tarjeta para todos los locales</h2><p>Las sucursales de ${esc(data.business.name)} comparten clientes, saldo y premios. Las promociones configuradas para todas las sucursales también incluyen los locales nuevos.</p>${table(['Sucursal','Código'],data.branches.map(b=>`<tr><td>${esc(b.name)}</td><td>${esc(b.code)}</td></tr>`),'Añade una sucursal para comenzar.')}<form id="platformBranch">${field('name','Nombre del local','text','','required maxlength="120"')}${field('code','Código único dentro del negocio','text','','required maxlength="40"')}<button>Añadir sucursal</button></form></section><section class="panel"><h2>Dar acceso al negocio</h2><p>El dueño administra promociones y premios. El cajero registra compras y canjes en su sucursal.</p><form id="platformStaff">${select('role','Tipo de acceso',[['CASHIER','Cajero'],['OWNER','Dueño del negocio']],'CASHIER')}${select('branchId','Sucursal del cajero',data.branches.map(b=>[b.id,b.name]))}<button>Crear credencial privada</button></form><div id="platformIssued"></div></section>`;
        form('platformBranch',async(v,f)=>{const payload={name:v.name,code:v.code};await api(`/api/platform/tenants/${tenant}/branches`,payload,'POST',operationKey(f,payload));await renderLocations(root);notice('Sucursal añadida. Comparte la tarjeta del negocio.');});
        const role=root.querySelector('[name=role]'),branch=root.querySelector('[name=branchId]');
        const change=()=>{branch.disabled=role.value==='OWNER';branch.required=role.value==='CASHIER';};role.onchange=change;change();
        form('platformStaff',async v=>{
            const result=await api(`/api/platform/tenants/${tenant}/credentials`,{role:v.role,branchId:v.role==='CASHIER'?v.branchId:null});
            if(tenant!==selected || !root.isConnected)return;
            root.querySelector('#platformIssued').innerHTML=`<h3>Guarda esta credencial</h3><p>Se muestra una vez. Entrégala al responsable por un medio privado.</p><div class="code">${esc(result.token)}</div><p>El responsable entra desde el acceso de negocios. Los clientes siguen sin contraseña.</p>`;
        });
    }
    async function loadAccount() {

        const ticket=++requestVersion;const result=await api(`${endpoint()}/account?offset=${offset}`);
        if(ticket!==requestVersion)return;accountData=result;renderAccount();
    }
    function shell() {
        const d=accountData,b=d.business;
        if(platform){
            app.innerHTML=`<div class="commercial-head"><div><button class="quiet" id="backBusinesses">← Negocios</button><h1>${esc(b.name)}</h1><p>En la plataforma desde ${date(b.joinedAt)} · ${b.tenureDays} días · ${esc(b.currency)}</p></div>${badge(d.access.effectiveState)}</div><div id="commercialRoot" class="commercial-account"></div>`;
            action('backBusinesses',()=>listBusinesses());
                }
        const root=document.querySelector(platform?'#commercialRoot':'#content');if(!root)return null;
        root.innerHTML=`<nav aria-label="Administración de cuenta">${[['account','Estado de cuenta'],...(platform?[['branches','Sucursales y accesos'],['membership','Membresía'],['access','Estado del negocio']]:[]),['notices','Avisos'],['metrics','Informes']].map(([key,label])=>`<button data-commercial-pane="${key}" class="${pane===key?'active':''}">${label}</button>`).join('')}</nav><div id="commercialPane"></div>`;
        root.querySelectorAll('[data-commercial-pane]').forEach(b=>b.onclick=handle(async()=>{pane=b.dataset.commercialPane;renderAccount()}));
        return document.querySelector('#commercialPane');
;
    }
    function renderAccount() {
                const root=shell();if(!root)return;
        if(pane==='account')renderStatement(root);
        else if(pane==='branches')renderLocations(root).catch(e=>notice(e.message));
        else if(pane==='membership')renderMembership(root);
        else if(pane==='access')renderAccess(root);
;
        else if(pane==='notices')renderNotices(root);
        else if(pane==='metrics')renderMetrics(root).catch(e=>notice(e.message));
    }
    function warnings(d) {
        const a=d.access,s=d.summary,m=d.membership;
        return `${a.effectiveState!=='ACTIVE'?`<div class="commercial-alert"><strong>${a.effectiveState==='CLOSED'?'Negocio dado de baja':'Operaciones suspendidas'}</strong><p>${a.overdueSuspension?'Hay cargos pendientes fuera del plazo de gracia. Al saldarlos, el acceso se recupera automáticamente.':esc(a.reason)}</p><p>Los clientes y sus saldos se conservan. Puedes seguir consultando esta cuenta.</p></div>`:''}${s.overdueMinor>0?`<div class="commercial-alert">Saldo vencido: <strong>${money(s.overdueMinor,d.business.currency)}</strong>. Revisa los cargos pendientes.</div>`:''}${s.nextDueOn && s.nextDueOn>=d.today && s.nextDueOn<=new Date(Date.parse(d.today+'T12:00:00Z')+7*864e5).toISOString().slice(0,10)?`<div class="commercial-alert info">Tienes un vencimiento próximo: <strong>${date(s.nextDueOn)}</strong>.</div>`:''}${!m?'<p class="commercial-note">Todavía no se ha configurado una membresía. No se generan cargos recurrentes.</p>':''}`;
    }
    function renderStatement(root) {
        const d=accountData,c=d.business.currency,m=d.membership;
        root.innerHTML=`${warnings(d)}<div class="commercial-stats">${stat('Saldo pendiente',money(d.summary.balanceMinor,c))}${stat('Saldo vencido',money(d.summary.overdueMinor,c))}${stat('Próximo vencimiento',d.summary.nextDueOn||'Sin cargos')}${stat('Próximo cargo',m?.plan.recurring?m.nextChargeOn:'Sin programación')}</div><section class="panel"><div class="commercial-heading-row"><h2>Cargos y vencimientos</h2>${platform?'<button id="addCharge">Añadir cargo</button>':''}</div>${m?`<p>${esc(m.plan.name)} · ${money(m.plan.feeMinor,c)} cada ${m.plan.intervalMonths} mes(es) · Alta de membresía: ${date(m.plan.startedOn)} · ${m.plan.recurring?'Programación activa':'Programación pausada'}</p>`:''}${table(['Concepto','Vencimiento','Importe','Pendiente','Estado',...(platform?['Acciones']:[])],d.invoices.map(i=>`<tr><td>${esc(i.description)}${i.periodStart?`<small>${date(i.periodStart)} → ${date(i.periodEnd)} · v${i.planVersion}</small>`:''}<small>${esc(i.id)}</small>${i.voidReason?`<small>Motivo: ${esc(i.voidReason)}</small>`:''}</td><td>${date(i.dueOn)}</td><td>${money(i.amountMinor,c)}</td><td>${money(i.remainingMinor,c)}</td><td>${badge(i.status)}</td>${platform?`<td>${i.remainingMinor>0?`<button data-pay="${i.id}">Registrar pago</button>`:''}${i.status!=='VOID'&&i.paidMinor===0?` <button class="quiet" data-void="${i.id}">Anular</button>`:''}</td>`:''}</tr>`))}</section><section class="panel"><h2>Pagos registrados</h2>${table(['Referencia','Fecha','Medio','Importe','Estado',...(platform?['']:[])],d.payments.map(p=>`<tr><td>${esc(p.reference)}<small>Cargo: ${esc(p.invoiceId)}</small></td><td>${date(p.paidOn)}</td><td>${esc(names[p.method])}</td><td>${money(p.amountMinor,c)}</td><td>${p.reversed?'Revertido':'Aplicado'}${p.reversalReason?`<small>${esc(p.reversalReason)}</small>`:''}</td>${platform?`<td>${!p.reversed?`<button class="quiet" data-reverse="${p.id}">Revertir</button>`:''}</td>`:''}</tr>`))}</section><div class="commercial-pager"><button class="quiet" id="accountPrev" ${offset===0?'disabled':''}>Anterior</button><span>Página ${Math.floor(offset/100)+1} · ${d.summary.invoiceCount} cargos / ${d.paymentCount} pagos</span><button class="quiet" id="accountNext" ${Math.max(d.summary.invoiceCount,d.paymentCount)<=offset+100?'disabled':''}>Siguiente</button></div><p class="commercial-note">Los pagos son registros administrativos de cobros recibidos. No se debita una tarjeta ni una cuenta bancaria desde este panel. Los cargos no sustituyen una factura fiscal.</p>`;
        action('accountPrev',async()=>{offset=Math.max(0,offset-100);await loadAccount()});action('accountNext',async()=>{offset+=100;await loadAccount()});
        if(!platform)return;
        action('addCharge',()=>dialog('Añadir cargo',`${field('description','Concepto','text','','required maxlength="200"')}${amount('amount',`Importe (${c})`)}${field('dueOn','Vencimiento','date',d.today,'required')}`,async(v,f)=>{const payload={description:v.description,amountMinor:minor(v.amount),dueOn:v.dueOn};await api(`${endpoint()}/charges`,payload,'POST',operationKey(f,payload));await loadAccount()},'Crear cargo'));
        root.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{
            const i=d.invoices.find(i=>i.id===b.dataset.pay);
            dialog('Registrar pago recibido',`${amount('amount',`Importe (${c})`,(i.remainingMinor/100).toFixed(2))}${field('reference','Referencia única del comprobante','text','','required maxlength="100"')}${select('method','Medio de pago',Object.entries(names).filter(([v])=>['TRANSFER','CASH','CARD','OTHER'].includes(v)),'TRANSFER')}${field('paidOn','Fecha del pago','date',d.today,`required max="${d.today}"`)}`,async(v,f)=>{const payload={invoiceId:i.id,amountMinor:minor(v.amount),reference:v.reference,method:v.method,paidOn:v.paidOn};await api(`${endpoint()}/payments`,payload,'POST',operationKey(f,payload));await loadAccount()},'Registrar pago',`${i.description}. Pendiente: ${money(i.remainingMinor,c)}. Se permiten pagos parciales.`);
        });
        function correction(path,title,message){dialog(title,field('reason','Motivo','text','','required maxlength="500"'),async(v,f)=>{await api(endpoint()+path,v,'POST',operationKey(f,v));await loadAccount()},'Confirmar',message)}
        root.querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>correction(`/charges/${b.dataset.void}/void`,'Anular cargo','Se conserva el cargo y el motivo en el historial. Solo se pueden anular cargos sin pagos activos.'));
        root.querySelectorAll('[data-reverse]').forEach(b=>b.onclick=()=>correction(`/payments/${b.dataset.reverse}/reverse`,'Revertir registro de pago','El saldo volverá a estar pendiente. Esta corrección no devuelve dinero a una cuenta bancaria.'));
    }
    function renderMembership(root) {
        const d=accountData,p=d.membership?.plan||{name:'',feeMinor:0,startedOn:d.today,nextChargeOn:d.today,intervalMonths:1,dueDays:7,graceDays:7,autoSuspend:false,recurring:true,anchorDay:Number(d.today.slice(-2))};
        const next=d.membership?.nextChargeOn||p.nextChargeOn;
        root.innerHTML=`<div class="commercial-split"><section class="panel"><h2>Membresía del negocio</h2><form id="membershipForm">${field('name','Nombre del plan','text',p.name,'required maxlength="100"')}${amount('fee',`Tarifa (${d.business.currency})`,(p.feeMinor/100).toFixed(2))}${select('intervalMonths','Ciclo',[[1,'Mensual'],[3,'Trimestral'],[6,'Semestral'],[12,'Anual']],p.intervalMonths)}<div class="row"><div>${field('startedOn','Alta de membresía','date',p.startedOn,`required max="${d.today}"`)}</div><div>${field('nextChargeOn','Próximo cargo','date',next,`required min="${d.today}"`)}</div></div><div class="row"><div>${field('anchorDay','Día de corte','number',p.anchorDay,'required min="1" max="31"')}</div><div>${field('dueDays','Días para pagar','number',p.dueDays,'required min="0" max="90"')}</div><div>${field('graceDays','Días de gracia','number',p.graceDays,'required min="0" max="90"')}</div></div><label class="check"><input name="recurring" type="checkbox" ${p.recurring?'checked':''}>Generar cargos recurrentes</label><label class="check"><input name="autoSuspend" type="checkbox" ${p.autoSuspend?'checked':''}>Suspender al superar el plazo de gracia</label><button type="submit">Guardar membresía</button></form></section><section class="panel"><h2>Reglas claras</h2><p>La tarifa nueva se aplica a los cargos futuros. Los cargos ya emitidos conservan su importe y versión.</p><p>El día 31 se ajusta al último día de los meses más cortos y vuelve al 31 cuando corresponde.</p><p>La suspensión automática es opcional. Se activa después del vencimiento más los días de gracia, usando la zona horaria del negocio.</p><p>Pausar los cargos no elimina deudas. Dar de baja el negocio también pausa su membresía; al reactivarlo, debes reanudarla con una fecha de cargo válida.</p><p class="commercial-definition">Vencimiento = fecha del cargo + días para pagar. La suspensión comienza al día siguiente de terminar la gracia.</p></section></div>`;
        form('membershipForm',async v=>{const plan={name:v.name,feeMinor:minor(v.fee),startedOn:v.startedOn,nextChargeOn:v.nextChargeOn,intervalMonths:Number(v.intervalMonths),dueDays:Number(v.dueDays),graceDays:Number(v.graceDays),anchorDay:Number(v.anchorDay),autoSuspend:v.autoSuspend==='on',recurring:v.recurring==='on'};await api(`${endpoint()}/membership`,{expectedVersion:d.membership?.version||0,plan},'PUT');await loadAccount();notice('Membresía guardada. Los cargos anteriores se conservan.')});
    }
    function renderAccess(root) {
        const d=accountData,a=d.access;
        root.innerHTML=`${warnings(d)}<div class="commercial-split"><section class="panel"><h2>Estado del negocio</h2><p>Estado manual: ${badge(a.state)} · Estado actual: ${badge(a.effectiveState)}</p><form id="accessForm">${select('state','Nuevo estado',[['ACTIVE','Activo'],['SUSPENDED','Suspendido'],['CLOSED','Dado de baja']],a.state)}${field('reason','Motivo del cambio','text','','required maxlength="500"')}<button type="submit">Aplicar cambio</button></form></section><section class="panel"><h2>Qué ocurre al suspender</h2><p>Se pausan compras, nuevos canjes, registros y cambios de promociones. Los saldos y el historial permanecen disponibles, y las reservas pueden cancelarse o expirar.</p><p>El dueño conserva el acceso a su cuenta y sus informes. Los demás negocios siguen operando.</p><p>Una suspensión manual requiere reactivación manual. Si se debe a mora automática, pagar todo el saldo fuera de gracia recupera el acceso.</p><p class="commercial-definition">Suspender mantiene los cargos programados. Dar de baja detiene los cargos futuros. Los cargos ya vencidos o emitidos se conservan.</p></section></div><section class="panel"><h2>Historial de estados</h2>${table(['Estado','Motivo','Fecha'],d.accessHistory.map(h=>`<tr><td>${badge(h.state)}</td><td>${esc(h.reason)}</td><td>${date(h.at)}</td></tr>`))}</section><section class="panel"><h2>Actividad administrativa reciente</h2>${table(['Acción','Fecha'],d.history.map(h=>`<tr><td>${esc(({BILLING_PLAN:'Membresía actualizada',BILLING_CHARGE:'Cargo creado',BILLING_PAYMENT:'Pago registrado',BILLING_REVERSAL:'Pago revertido',BILLING_VOID:'Cargo anulado',BUSINESS_ACTIVE:'Negocio activado',BUSINESS_SUSPENDED:'Negocio suspendido',BUSINESS_CLOSED:'Negocio dado de baja',BUSINESS_NOTICE:'Aviso publicado'})[h.action]||'Cambio administrativo')}</td><td>${esc(new Date(h.at).toLocaleString())}</td></tr>`))}</section>`;
        form('accessForm',async v=>{await api(`${endpoint()}/access`,{...v,expectedVersion:a.version},'PUT');await loadAccount();notice('Estado actualizado.')});
    }
    function renderNotices(root) {
        const d=accountData;
        root.innerHTML=`${warnings(d)}${platform?`<section class="panel"><h2>Publicar aviso para el negocio</h2><form id="noticeForm">${field('title','Título','text','','required maxlength="120"')}<label for="body">Mensaje</label><textarea id="body" name="body" rows="4" required maxlength="2000"></textarea><div class="row"><div>${select('severity','Prioridad',[['INFO','Información'],['WARNING','Advertencia'],['URGENT','Urgente']],'INFO')}</div><div>${field('expiresOn','Visible hasta (opcional)','date','',`min="${d.today}"`)}</div></div><button type="submit">Publicar aviso</button></form><p class="commercial-note">Aparecerá dentro del portal del negocio. No se envía por correo ni WhatsApp.</p></section>`:''}<section class="panel"><h2>Avisos vigentes</h2>${d.notices.map(n=>`<article class="commercial-notice">${badge(n.severity)}<h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><p class="small">${date(n.createdAt)}</p>${!platform?`<button class="quiet" data-read="${n.id}" ${n.read?'disabled':''}>${n.read?'Leído':'Marcar como leído'}</button>`:''}</article>`).join('')||'<p>No tienes avisos pendientes.</p>'}</section>`;
        if(platform)form('noticeForm',async(v,f)=>{const payload={...v,expiresOn:v.expiresOn||null};await api(`${endpoint()}/notices`,payload,'POST',operationKey(f,payload));await loadAccount();notice('Aviso publicado en el portal.')});
        root.querySelectorAll('[data-read]').forEach(b=>b.onclick=handle(async()=>{await api(`/api/staff/notices/${b.dataset.read}/read`,{});await loadAccount()}));
    }
    async function renderMetrics(root,days=30) {
        root.innerHTML='<section class="panel" role="status">Cargando informes…</section>';
        const data=await api(`${endpoint()}/metrics?days=${days}`);
        if(!root.isConnected||pane!=='metrics')return;
        const c=accountData.business.currency;
        root.innerHTML=`<section class="panel"><div class="commercial-heading-row"><div><h2>Clientes que regresan</h2><p>Desde ${date(data.fromDate||data.from)} hasta ${date(data.throughDate||data.through)} · ${esc(accountData.business.timezone)}</p></div><div class="commercial-period">${select('reportDays','Período',[[30,'Últimos 30 días'],[90,'Últimos 90 días'],[365,'Últimos 365 días']],days)}</div></div><div class="commercial-stats">${stat('Clientes registrados',data.totalClients)}${stat('Nuevos en el período',data.newClients,data.growthPercent===null?'Sin base para comparar':`${data.growthPercent.toFixed(1)}% frente al período anterior`)}${stat('Clientes que compraron',data.activeClients)}${stat('Repetición de compra',data.repeatRate.toFixed(1)+'%',`${data.repeatClients} clientes con 2 o más compras`)}</div><div class="commercial-stats">${stat('Compras registradas',data.purchases)}${stat('Ventas registradas',money(data.salesMinor,c))}${stat('Premios entregados',data.redemptions)}${stat('Nuevos en período anterior',data.previousNewClients)}</div><p class="commercial-definition">Repetición = clientes con dos o más compras ÷ clientes con al menos una compra, dentro del período. Crecimiento compara altas con los ${days} días anteriores. El período actual incluye el día de hoy hasta este momento. Estas cifras reflejan las operaciones registradas en Loyalty.</p></section><section class="panel"><h2>Actividad por día</h2>${table(['Día','Compras','Clientes compradores','Ventas'],data.daily.map(x=>`<tr><td>${date(x.day)}</td><td>${x.purchases}</td><td>${x.clients}</td><td>${money(x.salesMinor,c)}</td></tr>`),'Aún no hay compras en este período.')}<p class="commercial-note">Se muestran los días con compras. La cantidad de clientes diarios no se suma para calcular clientes únicos del período.</p></section>`;
        document.querySelector('#reportDays').onchange=e=>renderMetrics(root,Number(e.target.value)).catch(e=>notice(e.message));
    }
    const baseMerchant=renderMerchant;
    renderMerchant=function(){
        ++requestVersion;
        baseMerchant();const nav=app.querySelector('nav');
        if(state.data.role==='OWNER'){
            for(const [tab,label] of [['account','Mi cuenta'],['reports','Informes']]){
                const b=document.createElement('button');b.textContent=label;b.dataset.tab=tab;b.classList.toggle('active',state.tab===tab);
                b.onclick=()=>{state.tab=tab;renderMerchant()};nav.append(b);
            }
            if(['account','reports'].includes(state.tab)){pane=state.tab==='reports'?'metrics':'account';offset=0;document.querySelector('#content').innerHTML='<p role="status">Cargando cuenta…</p>';loadAccount().catch(e=>notice(e.message));return;}
        }
        const content=document.querySelector('#content');
        api('/api/staff/access').then(a=>{if(!content.isConnected||a.canOperate)return;const n=document.createElement('div');n.className='commercial-alert';n.textContent='Las nuevas operaciones están pausadas. Los datos y saldos se conservan. El dueño puede consultar Mi cuenta.';content.prepend(n);content.querySelectorAll('form button').forEach(b=>b.disabled=true)}).catch(e=>notice(e.message));
    };
    const baseCustomer=customerCard;
    customerCard=async function(){await baseCustomer();const a=await api('/api/me/access');if(!a.canOperate&&state.token){const n=document.createElement('div');n.className='commercial-alert';n.textContent='Este negocio tiene pausadas las nuevas operaciones. Tu saldo e historial se conservan.';app.prepend(n);app.querySelectorAll('[data-reserve]').forEach(b=>b.disabled=true)}};
    const baseExit=exit.onclick;exit.onclick=async()=>{++requestVersion;document.querySelector('#commercialDialog')?.remove();selected=null;accountData=null;if(platform){state.token='';login()}else await baseExit()};
    if(platform)login();
})();
