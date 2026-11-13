import { businessControl, requireOperating, requestBusinessChange, createBusinessControlSync, businessStates } from '../businesses/control.mjs';
import { controlPage, accountPage as billingAccountPage } from '../presentation/pages/business-control-pages.mjs';
import { paymentInput, chargeInput } from '../billing/payment-input.mjs';
import { walletComparison } from '../presentation/pages/wallet-benefits.mjs';
import { campaignPage, campaignBanner } from '../presentation/pages/campaign-pages.mjs';
import { campaignBases, createCampaignOffer } from '../campaigns/offers.mjs';
import { legalProfile, saveLegalProfile, subscriptionOfferInput } from '../billing/subscription.mjs';
import { subscriptionPage, legalProfilePage, walletPriceCard } from '../presentation/pages/subscription-pages.mjs';
import { canReadFidelityReport, centralPaths, managementSections, managementTitles } from '../wallet/management-policy.mjs';
import { managementPage, managementFramePage, managementDocument } from '../presentation/pages/management-pages.mjs';
import { offerEditor } from '../presentation/pages/offer-editor.mjs';
import { businessOverview } from '../production/overview.mjs';
import { requestAccessSql } from '../access/content-policy.mjs';
import { walletSections } from '../wallet/access-policy.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { activate, approveCompany, authenticate, can, changePassword, companyFor, createAgency, createSession, createTeamMember,
  getSession, limit, logout, manageAccount, register, requireAccess, requireAgency, requireOwner, teamMember, updateGrants, updateMember } from '../access/accounts.mjs';
import { teamDirectory, teamHistory } from '../access/team-directory.mjs';
import { consultTeams } from '../access/team-consultation.mjs';
import { teamsConsultationPage } from '../presentation/pages/team-consultation-pages.mjs';
import { saveTeamAccess } from '../access/team-access.mjs';
import { equal } from '../access/security.mjs';
import { acceptQuote, cancelContract, contractsFor, createPlan, currentQuote, getPlan, hidePlan, listPlans, offerQuote } from '../memberships/billing.mjs';
import { event, channels, areas, integer, isId, now, Problem, requireThat, socialChannels, text } from '../shared/domain.mjs';
import { cashierAssets, createLoyaltyBridge } from '../wallet/bridge.mjs';
import { createWalletWorkspace } from '../wallet/wallet.mjs';
import { addEvidence, addPiece, addPublication, addVisit, createRequest, editPiece, finishVisit, getPiece, getRequest,
  requestCounts, reviewPiece, updateRequest, visibleRequests } from '../production/production.mjs';
import { addLocation, addMapsMetric, addReview, addSocialMetric, analytics, mapsData, publicationsFor } from '../analytics/reporting.mjs';
import { accountPage, publicPage } from '../presentation/pages/account-pages.mjs';
import { invitePage, memberPage, newMemberPage, teamPage } from '../presentation/pages/team-pages.mjs';
import { card, esc, localLink, page, pathFor } from '../presentation/pages/components.mjs';
import { cookieFrom, json, readForm, readJson, redirect, securityHeaders, send, sessionCookie } from '../presentation/pages/http.mjs';
import { agendaPage, companiesPage, homePage, requestForm, requestDetail, requestsPage } from '../presentation/pages/production-pages.mjs';
import { mapsPage, metricsPage } from '../presentation/pages/service-pages.mjs';
import { cajaHtml, loyaltyWorkspaceHtml, walletPage, walletReportPage } from '../presentation/pages/wallet-pages.mjs';
import { agencyAgenda, agencyOverview, agencyProduction, channelWorkspace, comingSoonPage } from '../presentation/pages/workspace-pages.mjs';

import { contentData } from '../content/workspace.mjs';
import { contentShell } from '../presentation/pages/content-shell.mjs';
import { recordingForm } from '../presentation/pages/content-forms.mjs';
import { newRequestPage } from '../presentation/pages/request-composer.mjs';
import { contentPage } from '../presentation/pages/content-pages.mjs';
import { packagesPage, orderPage } from '../presentation/pages/package-pages.mjs';
import { ordersFor, getOrder, submitOrder, offerOrder, acceptOrder, activateOrder, cancelOrder } from '../memberships/orders.mjs';

const assets = {
  '/assets/wallet-campaigns.js':['wallet-campaigns.js','text/javascript; charset=utf-8'],
  '/assets/black-friday.css':['black-friday.css','text/css; charset=utf-8'],
  '/assets/black-friday.js':['black-friday.js','text/javascript; charset=utf-8'],
  '/assets/wallet-subscription.js':['wallet-subscription.js','text/javascript; charset=utf-8'],
  '/assets/wallet-season.js':['wallet-season.js','text/javascript; charset=utf-8'],
  '/assets/account.css': ['account.css','text/css; charset=utf-8'],
  '/assets/team.css': ['team.css','text/css; charset=utf-8'],
  '/assets/team.js': ['team.js','text/javascript; charset=utf-8'],
  '/assets/instagram.webp': ['instagram.webp','image/webp'],
  '/assets/tiktok.jpg': ['tiktok.jpg','image/jpeg'],
  '/assets/practical.css': ['practical.css','text/css; charset=utf-8'],
  '/assets/management-launch.js': ['management-launch.js','text/javascript; charset=utf-8'],
  '/assets/lumina-symbol.png': ['lumina-symbol.png','image/png'],
  '/assets/lumina-logo.png': ['lumina-logo.png','image/png'],
  '/assets/central.css': ['central.css','text/css; charset=utf-8'],
  '/assets/offers.js': ['offers.js','text/javascript; charset=utf-8'],
  '/assets/management-frame.js': ['management-frame.js','text/javascript; charset=utf-8'],
  '/assets/experience.css': ['experience.css','text/css; charset=utf-8'],
  '/assets/requests.js': ['requests.js','text/javascript; charset=utf-8'],
  '/assets/content.css': ['content.css','text/css; charset=utf-8'],
  '/assets/modules.css': ['modules.css','text/css; charset=utf-8'],
  '/assets/packages.js': ['packages.js','text/javascript; charset=utf-8'],
  '/assets/lumina.css': ['lumina.css','text/css; charset=utf-8'],
  '/assets/lumina.js': ['lumina.js','text/javascript; charset=utf-8'],
  '/assets/caja.js': ['caja.js','text/javascript; charset=utf-8'],
  '/assets/workspace.css': ['workspace.css','text/css; charset=utf-8'],
  '/assets/loyalty-workspace.css': ['loyalty-workspace.css','text/css; charset=utf-8'],
  '/assets/loyalty-context.js': ['loyalty-context.js','text/javascript; charset=utf-8'],
  '/assets/loyalty-launch.js': ['loyalty-launch.js','text/javascript; charset=utf-8'],
};
const sourceAssets = Object.fromEntries(Object.entries(assets).map(([path,[file,type]]) =>
  [path,{body:readFileSync(new URL('../presentation/assets/'+file,import.meta.url)),type}]));
const operations = {
  '/estado':updateRequest, '/cotizar':offerQuote,
  '/aceptar':(db,actor,company,request,data)=>acceptQuote(db,actor,company,request,data.quote),
  '/visitas':addVisit, '/visitas/cerrar':finishVisit, '/piezas':addPiece,
};
const pieceOperations = {
  editar:editPiece, revisar:reviewPiece, evidencia:addEvidence, publicacion:addPublication, medir:addSocialMetric,
};
function teamInvitation(db,actor,id,code) {
  const member = teamMember(db,actor,id);
  return {title:'Acceso creado',description:'Comparte el código con la persona por tu canal habitual.',body:invitePage(member,code)};
}
function agendaRows(db,actor,companyId) {
  const policy=requestAccessSql(actor);
  return db.all(`SELECT v.*,r.title FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
    WHERE v.company_id=? AND ${policy.sql} ORDER BY CASE WHEN v.status='SCHEDULED' THEN 0 ELSE 1 END,
    CASE WHEN v.status='SCHEDULED' THEN v.starts_at END,v.starts_at DESC,v.id LIMIT 100`,companyId,...policy.params);
}
function getRequestPage(db,actor,company,url,request) {
  const pieces = db.all('SELECT * FROM pieces WHERE company_id=? AND request_id=? ORDER BY created_at,id',company.id,request.id)
    .map(piece=>({
      ...piece,
      evidence:db.all('SELECT * FROM evidence WHERE company_id=? AND piece_id=? ORDER BY created_at,id',company.id,piece.id),
      publications:publicationsFor(db,actor,company.id,piece.id),
    }));
  const visits = db.all('SELECT * FROM visits WHERE company_id=? AND request_id=? ORDER BY starts_at,id',company.id,request.id);
  const audit = db.all("SELECT * FROM audit WHERE company_id=? AND subject='REQUEST' AND subject_id=? ORDER BY seq DESC LIMIT 100",company.id,request.id);
  const quote = actor.kind === 'COLLABORATOR' ? null : currentQuote(db,company.id,request.id);
  const plan = request.plan_id ? getPlan(db,request.plan_id) : null;
  const contracts = actor.kind === 'AGENCY' ? contractsFor(db,company.id) : [];
  return {title:request.title,description:'Solicitud, visitas, piezas e historial del negocio.',
    layout:request.channel==='SOCIAL'?'content':undefined,contentView:'solicitudes',
    body:requestDetail({actor,company,url,request,quote,pieces,visits,audit,contracts,plan})};
}

export function createPortal({ db, key, loyaltyUrl, publicOrigin = null, integration = {}, readiness = null }) {
  const bridge = createLoyaltyBridge({db,key,origin:loyaltyUrl});
  const wallets = createWalletWorkspace({db,key,origin:loyaltyUrl,integration});
  const commercialWork=new Map();
  const commercialTurn=async(companyId,work)=>{const previous=commercialWork.get(companyId)||Promise.resolve();const next=previous.catch(()=>{}).then(work);commercialWork.set(companyId,next);try{return await next;}finally{if(commercialWork.get(companyId)===next)commercialWork.delete(companyId);}};
  const controls=createBusinessControlSync({db,remote:wallets.controlRemote,ensureCompany:wallets.ensureCompany});
  const server=createServer({requestTimeout:20_000,headersTimeout:10_000},async (req,res) => {
    let actor = null;
    let company = null;
    let path = '/';
    let cash = null;
    let api = false;
    let agencyWork=false;
    const render = (view,status=200) => {
      const viewer=actor?{...actor,agencyWork,readOnlyCompany:actor.kind==='AGENCY'&&Boolean(company)&&!agencyWork}:null;
      return send(res,status,(view.layout==='content'?contentShell:page)({actor:viewer,company,path,cash,...view}));
    };
    try {
      const origin = publicOrigin || `http://127.0.0.1:${req.socket.localPort}`;
      const trusted = new URL(origin);
      requireThat(req.headers.host === trusted.host && req.url?.startsWith('/') && !req.url.startsWith('//'),
        'Origen del portal inválido.',400);
      const target = new URL(req.url,origin);
      requireThat(target.origin === origin,'Ruta del portal inválida.');
      path = target.pathname;
      const method = req.method;
      api = path.startsWith('/api/') || path.startsWith('/wallet-api/') || path.startsWith('/gestion-api/');
      securityHeaders(res,['/caja','/platform','/wallet','/wallet/gestion','/gestion/vista'].includes(path),path.startsWith('/gestion'));
      requireThat(['GET','POST'].includes(method) || (path.startsWith('/wallet-api/')||path.startsWith('/gestion-api/')) && ['PUT','DELETE'].includes(method),'Método no permitido.',405);
      if (method!=='GET') requireThat(req.headers.origin === origin,'Esta acción requiere el formulario del portal.',403);
      if (method==='GET' && Object.hasOwn(sourceAssets,path)) {
        const asset = sourceAssets[path];
        return send(res,200,asset.body,asset.type);
      }
      if(method==='GET'&&path==='/salud/listo'){
        try {return json(res,200,readiness?await readiness():(db.get('SELECT 1'),{status:'UP',service:'lumina-agency'}));}
        catch {return json(res,503,{status:'UNAVAILABLE',service:'lumina-agency'});}
      }
      if (method==='GET' && path==='/salud') return json(res,200,{status:'UP',service:'lumina-agency'});
      const cookie = cookieFrom(req);
      actor = getSession(db,cookie);
      const startSession = (id,destination='/inicio') => {
        if (actor) { wallets.forget(actor); logout(db,actor); }
        res.setHeader('Set-Cookie',sessionCookie(createSession(db,id),trusted.protocol==='https:'));
        return redirect(res,destination);
      };
      const publicPaths = ['/','/registro','/activar','/configurar'];
      if (method==='GET' && publicPaths.includes(path)) {
        if (actor) return redirect(res,'/inicio');
        const setupAvailable = !db.get("SELECT id FROM accounts WHERE kind='AGENCY'");
        if (path==='/configurar') requireThat(setupAvailable,'La cuenta de agencia ya está configurada.',404);
        return render(publicPage(path,setupAvailable));
      }
      if (method==='POST' && ['/entrar','/registro','/activar','/configurar'].includes(path)) {
        requireThat(!actor,'Cierra la sesión actual para usar otra cuenta.',409);
        limit(db,path+':'+req.socket.remoteAddress,path==='/entrar' ? 50 : 16);
        const data = await readForm(req);
        try {
          if (path==='/entrar') return startSession(await authenticate(db,data));
          if (path==='/registro') {
            const account=await register(db,key,data);
            const created=db.get('SELECT company_id FROM accounts WHERE id=?',account);
            try{await wallets.ensureCompany(created.company_id);}catch{} // Account survives an outage; opening Wallet retries the durable registration.
            return startSession(account,legalProfile(db)?'/planes/wallet':'/inicio');
          }
          if (path==='/activar') return startSession(await activate(db,data));
          return startSession(await createAgency(db,data));
        } catch(issue) {
          if (!(issue instanceof Problem) || ![400,401,409].includes(issue.status)) throw issue;
          const setupAvailable=!db.get("SELECT id FROM accounts WHERE kind='AGENCY'");
          return render(publicPage(path==='/entrar'?'/':path,setupAvailable,{values:data,error:issue.message}),issue.status);
        }
      }
      if (!actor) {
        if (method==='GET' && !api) return redirect(res,'/');
        throw new Problem('Inicia sesión para continuar.',401);
      }
      const serviceAllowed=()=>path==='/salir'||path.startsWith('/cuenta')||path==='/ayuda'||path==='/mi-estado-cuenta'||path==='/planes/wallet/cancelar'||method==='GET'&&(path.startsWith('/planes/wallet')||path==='/inicio'||path==='/wallet/ventajas');
      const scopedCompany=actor.kind==='AGENCY'?(target.searchParams.get('empresa')||req.headers['x-lumina-company']):actor.company_id;
      if(scopedCompany) {
        const state=businessControl(db,scopedCompany);
        if(actor.kind!=='AGENCY'&&(state.state!=='ACTIVE'||state.pending_id)) {
          const permitted=serviceAllowed();
          if(!permitted)requireOperating(db,scopedCompany);
          if(method==='GET'&&path==='/inicio')return render({title:businessStates[state.state],body:card('Estado de tus servicios',`<p>${esc(state.reason)}</p><p>${state.pending_id?'Cambio pendiente de sincronización.':''} Tu información y saldos se conservan.</p><div class="actions"><a class="btn" href="/mi-estado-cuenta">Ver cuenta y pagos</a><a class="btn secondary" href="/ayuda">Contactar a Lúmina</a><a class="btn secondary" href="/cuenta">Mi cuenta</a></div>`)});
        }
        if(actor.kind==='AGENCY'&&method!=='GET')requireOperating(db,scopedCompany);
      }
      if(path.startsWith('/agencia/')) {
        requireAgency(actor);
        requireThat(/^\/agencia\/(inicio|contenido|solicitudes|agenda|planes|mapas|clientes\/verificar)(\/|$)/.test(path),'Área de trabajo no encontrada.',404);
        agencyWork=true;path=path.slice('/agencia'.length);
      }
      actor={...actor,agencyWork,readOnlyCompany:actor.kind==='AGENCY'&&Boolean(target.searchParams.get('empresa'))&&!agencyWork};
      if (actor.kind === 'COLLABORATOR') cash = db.get(
        "SELECT branch_name,purchases,rewards FROM cash_grants WHERE account_id=? AND company_id=? AND status='ACTIVE'",actor.id,actor.company_id);
      if (path.startsWith('/wallet-api/')||path.startsWith('/gestion-api/')) {
        const management=path.startsWith('/gestion-api/');
        const body=method==='GET'?undefined:await readJson(req);
        actor=getSession(db,cookie);
        requireThat(actor,'Tu sesión terminó. Ingresa nuevamente.',401);
        requireThat(equal(actor.csrf,req.headers['x-lumina-csrf']),'Tu sesión de Wallet cambió. Abre de nuevo Wallet.',403);
        if(req.headers['x-lumina-company'])actor={...actor,wallet_company:req.headers['x-lumina-company']};
        const result=await wallets.proxy(actor,path.slice((management?'/gestion-api':'/wallet-api').length),{method,body,query:target.search,key:req.headers['idempotency-key'],surface:management?'management':'wallet'});
        return send(res,result.status,result.bytes,result.type);
      }
      if (method==='GET' && (path.startsWith('/wallet/art/') || path.startsWith('/wallet/brand/') || /^\/api\/public\/[a-z0-9-]+\/qr$/.test(path))) {
        if(target.searchParams.has('empresa')){actor={...actor,wallet_company:target.searchParams.get('empresa')};target.searchParams.delete('empresa');}
        const result=await wallets.artwork(actor,path,target.search);return send(res,200,result.bytes,result.type);
      }
      if (method==='GET' && path.startsWith('/loyalty-assets/')) {
        const name=path.slice('/loyalty-assets/'.length);
        return send(res,200,await wallets.asset(actor,name),cashierAssets[name]);
      }
      if(method==='GET' && path==='/platform')return redirect(res,'/wallet');
      if (method==='GET' && (path==='/wallet/gestion' || path==='/wallet' && actor.kind!=='AGENCY' && (walletSections(actor).length || cash))) {
        if(actor.kind==='COLLABORATOR'&&cash&&path==='/wallet'&&!target.searchParams.has('seccion'))return redirect(res,'/caja');
        requireThat(actor.kind!=='AGENCY','La agencia solo puede consultar Wallet desde la ficha del negocio.',403);
        company=companyFor(db,actor,target.searchParams.get('empresa'));
        actor={...actor,wallet_company:company.id};
        const sections=walletSections(actor);
        requireThat(actor.kind!=='COLLABORATOR'||sections.length,'Tu cuenta no tiene áreas operativas de Wallet.',403);
        const section=target.searchParams.get('seccion')||(actor.kind==='COLLABORATOR'?sections[0]:path==='/wallet'?'overview':'design');
        if(Object.hasOwn(centralPaths,section)){requireThat(actor.kind==='OWNER'||section==='reports'&&canReadFidelityReport(actor),'No tienes acceso a esta área.',403);return redirect(res,centralPaths[section]);}
        requireThat(sections.includes(section),'No tienes acceso a esta área de Wallet.',403);
        try { await wallets.validate(actor); }
        catch(issue) {
          if(!(issue instanceof Problem))throw issue;
          const blocked=actor.kind==='OWNER'?db.all("SELECT w.account_id,a.name,a.revision FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE w.company_id=? AND w.status='BLOCKED' AND a.active=1 AND a.kind IN ('OWNER','COLLABORATOR')",company.id):[];
          return render({title:'Abrir Wallet',body:walletPage({actor,company,error:issue.status>=500?'Wallet no está disponible en este momento. Tu cuenta y tus tarjetas se conservan. Vuelve a intentarlo en unos minutos.':issue.message,blocked})},issue.status);
        }
        company=companyFor(db,actor,company.id);
        return send(res,200,loyaltyWorkspaceHtml(actor,section,sections,company,cash));
      }
      if (method==='GET' && /^\/join\/[a-z0-9-]+$/.test(path)) {
        if(target.searchParams.has('empresa')){actor={...actor,wallet_company:target.searchParams.get('empresa')};target.searchParams.delete('empresa');}
        const dashboard=await wallets.validate(actor);
        requireThat((actor.kind==='OWNER'||actor.kind==='COLLABORATOR'&&(can(actor,'WALLET_CUSTOMERS','EDIT')||!target.search&&can(actor,'WALLET_DESIGN'))) && path==='/join/'+dashboard.business?.slug,'Negocio no encontrado.',404);
        return redirect(res,loyaltyUrl+path+target.search);
      }
      if (api) {
        const input = method==='POST' ? await readJson(req) : undefined;
        actor=getSession(db,cookie);
        requireThat(actor,'Tu sesión terminó. Ingresa nuevamente.',401);
        if(method!=='GET')requireThat(equal(actor.csrf,req.headers['x-lumina-csrf']),'Tu sesión cambió. Abre de nuevo Caja.',403);
        const idempotency = req.headers['idempotency-key'];
        requireThat(idempotency === undefined || /^[A-Za-z0-9_:-]{8,128}$/.test(idempotency),'Referencia de operación inválida.');
        return json(res,200,await bridge.proxy(actor,path,{method,body:input,query:target.searchParams,idempotency}));
      }
      if (method==='GET' && path==='/caja') {
        const grant=bridge.activeGrant(actor);
        return send(res,200,cajaHtml(actor,companyFor(db,actor),grant));
      }
      if (method==='GET' && path.startsWith('/caja-assets/')) {
        const name = path.slice('/caja-assets/'.length);
        return send(res,200,await bridge.asset(actor,name),cashierAssets[name]);
      }
      let data;
      if (method==='POST') {
        data = await readForm(req);
        actor = getSession(db,cookie);
        requireThat(actor,'Tu sesión terminó. Vuelve a iniciar sesión.',401);
        actor={...actor,agencyWork,readOnlyCompany:actor.kind==='AGENCY'&&Boolean(target.searchParams.get('empresa'))&&!agencyWork};
        requireThat(equal(actor.csrf,data._csrf),'El formulario venció. Abre la página y reintenta.',403);
        if(!serviceAllowed())requireOperating(db,actor.kind==='AGENCY'?target.searchParams.get('empresa'):actor.company_id);
      }
      if(method==='POST'&&actor.kind==='AGENCY'&&target.searchParams.get('empresa')&&!agencyWork&&!['/salir','/cuenta/clave'].includes(path)) {
        throw new Problem('La ficha del negocio es de solo lectura para la agencia.',403);
      }
      if (path==='/salir' && method==='POST') {
        wallets.forget(actor);
        logout(db,actor);
        res.setHeader('Set-Cookie',sessionCookie('',trusted.protocol==='https:'));
        return redirect(res,'/');
      }
      if(path==='/wallet/ventajas'&&method==='GET')return render({title:'Lúmina Wallet',body:walletComparison()});
      if(path==='/ayuda'&&method==='GET') {
        const provider=legalProfile(db);
        return render({title:'Ayuda de Lúmina',body:card('Soporte prioritario de Wallet',`<p>Indica el negocio, la sucursal y qué operación necesitas resolver. Damos prioridad a incidencias que impiden registrar compras o canjear.</p>${provider?`<div class="actions"><a class="btn" href="mailto:${esc(provider.email)}?subject=Soporte%20Wallet">${esc(provider.email)}</a><a class="btn secondary" href="tel:${esc(provider.phone.replace(/[^+0-9]/g,''))}">${esc(provider.phone)}</a></div>`:'<p>El contacto de Lúmina está pendiente de configuración.</p>'}<p class="muted">No compartas contraseñas ni datos completos de clientes.</p>`)});
      }
      if(path==='/mi-estado-cuenta'&&method==='GET') {
        requireOwner(actor);company=companyFor(db,actor);
        const offset=Number(target.searchParams.get('offset')||0);requireThat(Number.isSafeInteger(offset)&&offset>=0&&offset<=1_000_000,'Página inválida.');
        return render({title:'Mi cuenta y pagos',body:billingAccountPage(actor,await wallets.account(actor,offset))});
      }
      const administration=path.match(/^\/administracion\/negocios\/([0-9a-f-]{36})(?:\/(estado|reintentar|pago|revertir|cargo|anular))?$/i);
      if(administration) {
        requireAgency(actor);company=companyFor(db,actor,administration[1]);
        const base='/administracion/negocios/'+company.id;let issueText='';
        const offset=Number(target.searchParams.get('offset')||0);requireThat(Number.isSafeInteger(offset)&&offset>=0&&offset<=1_000_000,'Página inválida.');
        const view=async(status=200)=>{
          let account=null;try{account=await wallets.administration(actor,company.id,'account',{offset});}catch(error){issueText=issueText||error.message;}
          return render({title:'Administrar negocio',body:controlPage(actor,company,businessControl(db,company.id),db.all('SELECT * FROM business_commands WHERE company_id=? ORDER BY created_at DESC LIMIT 50',company.id),account,issueText,data||{})},status);
        };
        if(method==='POST')try {
          if(['pago','revertir','cargo','anular'].includes(administration[2])&&isId(data.requestKey)&&!db.get("SELECT seq FROM audit WHERE subject='BILLING_ATTEMPT' AND subject_id=? AND company_id=?",data.requestKey,company.id))event(db,actor,company.id,'BILLING_ATTEMPT',data.requestKey,'CUENTA_SOLICITADA',JSON.stringify({action:administration[2],invoice:data.invoiceId||null,payment:data.paymentId||null,reference:data.reference||null,reason:data.reason||null}),'WALLET');
          if(administration[2]==='estado'){requestBusinessChange(db,actor,company.id,data);await controls.sync(company.id);}
          else if(administration[2]==='reintentar'){requireThat(data.confirm==='yes','Confirma que deseas aplicar el cambio pendiente.');await controls.reconcile(company.id);}
          else if(administration[2]==='pago'){const payment=paymentInput(data);await wallets.administration(actor,company.id,'payments',{method:'POST',body:payment,key:data.requestKey});}
          else if(administration[2]==='revertir'){requireThat(data.confirm==='yes'&&isId(data.paymentId)&&isId(data.requestKey),'Confirma la corrección.');await wallets.administration(actor,company.id,'reverse',{id:data.paymentId,method:'POST',body:{reason:text(data.reason,'motivo',5,500)},key:data.requestKey});}
          else if(administration[2]==='cargo'){await wallets.administration(actor,company.id,'charges',{method:'POST',body:chargeInput(data),key:data.requestKey});}
          else if(administration[2]==='anular'){requireThat(data.confirm==='yes'&&isId(data.invoiceId)&&isId(data.requestKey),'Confirma la anulación.');await wallets.administration(actor,company.id,'void',{id:data.invoiceId,method:'POST',body:{reason:text(data.reason,'motivo',5,500)},key:data.requestKey});}
          else throw new Problem('Acción no encontrada.',404);
          if(['pago','revertir','cargo','anular'].includes(administration[2])&&!db.get("SELECT seq FROM audit WHERE subject='BILLING' AND subject_id=? AND company_id=?",data.requestKey,company.id))event(db,actor,company.id,'BILLING',data.requestKey,'CUENTA_'+administration[2].toUpperCase(),JSON.stringify({invoice:data.invoiceId||null,payment:data.paymentId||null,reference:data.reference||null,reason:data.reason||null}),'WALLET');
          return redirect(res,base);
        }catch(issue){if(!(issue instanceof Problem))throw issue;issueText=issue.message;return view(issue.status);}
        requireThat(!administration[2],'Página no encontrada.',404);
        try{await wallets.ensureCompany(company.id);}catch(issue){issueText=issue.message;}
        company=companyFor(db,actor,company.id);
        return view();
      }
      if(path==='/cuenta/proveedor') {
        requireAgency(actor);
        if(method==='GET')return render({title:'Datos de Lúmina',body:legalProfilePage(actor,legalProfile(db))});
        try{saveLegalProfile(db,actor,data);return redirect(res,'/cuenta');}
        catch(issue){if(!(issue instanceof Problem))throw issue;return render({title:'Revisa los datos',body:legalProfilePage(actor,data,issue.message)},issue.status);}
      }
      if(path.startsWith('/planes/wallet')) {
        requireOwner(actor);
        if(method==='POST') {
          const action=path==='/planes/wallet/aceptar'?'accept':path==='/planes/wallet/cancelar'?'cancel':null;
          requireThat(action,'Acción no encontrada.',404);
          requireThat(/^[0-9a-f-]{36}$/i.test(data.requestKey||''),'Recarga el formulario antes de continuar.');
          const payload=action==='accept'?{offer:subscriptionOfferInput(db,actor,data.cycle||"MONTHLY"),expectedHash:data.hash||'',accepted:data.accept==='yes'}:{expectedVersion:Number(data.version),confirmed:data.confirm==='yes'};
          try { await commercialTurn(actor.company_id,async()=>{if(action==='accept')payload.offer=subscriptionOfferInput(db,actor,data.cycle||'MONTHLY');return wallets.subscription(actor,action,payload,data.requestKey);});return redirect(res,action==='accept'?'/wallet':'/planes/wallet'); }
          catch(issue){if(!(issue instanceof Problem))throw issue;return render({title:'Revisa tu suscripción',body:`<section class="card"><h2>No pudimos confirmar el cambio</h2><p role="alert">${esc(issue.message)}</p><a class="btn" href="/planes/wallet">Revisar condiciones actuales</a></section>`},issue.status);}
        }
        const status=await wallets.subscription(actor);
        if(path==='/planes/wallet/estado')return json(res,200,{accepted:status.accepted,recurring:status.recurring,trialUntil:status.trialUntil,endsOn:status.endsOn,nextChargeOn:status.nextChargeOn,monthlyMinor:status.monthlyMinor,periodMinor:status.periodMinor,cycle:status.cycle,unitMinor:status.unitMinor});
        let offer=null,error='';
        if(!status.legacy&&(!status.recurring||target.searchParams.has('ciclo')&&target.searchParams.get('ciclo')!==(status.cycle||'MONTHLY')))try{offer=await wallets.subscription(actor,'offer',subscriptionOfferInput(db,actor,target.searchParams.get('ciclo')||'MONTHLY'));}catch(issue){if(!(issue instanceof Problem))throw issue;error=issue.message;}
        if(path==='/planes/wallet/condiciones') {
          const expected=target.searchParams.get('oferta');
          requireThat(expected?offer&&expected===offer.hash:status.agreement,'Las condiciones cambiaron. Vuelve al resumen para descargar la versión vigente.',409);
          res.setHeader('Content-Disposition','attachment; filename="condiciones-wallet-lumina.txt"');
          return send(res,200,expected?offer.terms:status.agreement.terms,'text/plain; charset=utf-8');
        }
        requireThat(path==='/planes/wallet','Página no encontrada.',404);
        return render({title:'Mi suscripción Wallet',body:subscriptionPage(actor,status,offer,error)});
      }
      if (['/wallet/conectar','/wallet/desconectar','/equipo/loyalty/vincular','/wallet/vincular'].includes(path))throw new Problem('El acceso ahora usa tu cuenta de Lúmina. Abre Fidelización digital.',410);
      if(path==='/wallet/accesos'&&method==='GET') {
        requireOwner(actor);company=companyFor(db,actor,target.searchParams.get('empresa'));
        const blocked=db.all("SELECT w.account_id,a.name,a.revision FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE w.company_id=? AND w.status='BLOCKED' AND a.active=1 AND a.kind IN ('OWNER','COLLABORATOR')",company.id);
        return render({title:'Accesos de Wallet',body:walletPage({actor,company,blocked})});
      }
      if(path==='/wallet/reparar'&&method==='POST'){requireOwner(actor);company=companyFor(db,actor,target.searchParams.get('empresa'));await wallets.repair(actor,company,data);return redirect(res,'/wallet');}
      if (path==='/wallet' && method==='GET') {
        requireThat(can(actor,'WALLET'),'No tienes permiso para consultar Wallet.',403);
        if(actor.kind!=='AGENCY'||target.searchParams.get('empresa'))company=companyFor(db,actor,target.searchParams.get('empresa'));
        let information=null,error='';
        if(company)actor={...actor,wallet_company:company.id};
        if(actor.kind==='AGENCY'||actor.kind==='OWNER'||walletSections(actor).length)try{
          information=await wallets.summary(actor);
          if(company)company=companyFor(db,actor,company.id);
        }catch(issue){if(!(issue instanceof Problem))throw issue;error=issue.message;}
        const companies=actor.kind==='AGENCY'&&!company?db.all('SELECT id,name FROM companies ORDER BY name,id'):[];
        const contact=company?db.get("SELECT a.name,a.email,c.phone FROM accounts a JOIN companies c ON c.id=a.company_id WHERE c.id=? AND a.kind='OWNER'",company.id):null;
        return render({title:'Fidelización digital',description:'Wallet de tu negocio, integrado en Lúmina.',
          body:walletPage({actor,company,contact,companies,data:information,error,blocked:actor.kind==='OWNER'&&company?db.all("SELECT w.account_id,a.name,a.revision FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE w.company_id=? AND w.status='BLOCKED' AND a.active=1 AND a.kind IN ('OWNER','COLLABORATOR')",company.id):[]})});
      }
      if(path==='/proximamente'&&method==='GET') {
        requireThat(actor.kind!=='COLLABORATOR','Área no asignada.',403);
        return render({title:'WhatsApp Business y asistentes con IA',body:comingSoonPage()});
      }
      if (method==='GET' && ['/resumen','/produccion','/agenda-general'].includes(path)) {
        if(path==='/resumen'&&actor.kind!=='AGENCY')return redirect(res,'/inicio');
        requireAgency(actor);
        const q=text(target.searchParams.get('q')||'','búsqueda',0,100);
        const state=target.searchParams.get('estado')||'',channel=target.searchParams.get('canal')||'';
        requireThat(!channel||Object.hasOwn(channels,channel),'Canal inválido.');
        const rows=()=>db.all(`SELECT r.*,c.name AS company_name FROM requests r JOIN companies c ON c.id=r.company_id
          WHERE (?='' OR instr(lower(r.title||' '||c.name),lower(?))>0) AND (?='' OR r.status=?) AND (?='' OR r.channel=?)
          ORDER BY r.created_at DESC,r.id LIMIT 100`,q,q,state,state,channel,channel);
        const visits=db.all(`SELECT v.*,r.title,c.name AS company_name FROM visits v JOIN requests r ON r.id=v.request_id AND r.company_id=v.company_id
          JOIN companies c ON c.id=v.company_id WHERE v.status='SCHEDULED' AND v.starts_at>=? ORDER BY v.starts_at,v.id LIMIT 100`,now());
        if(path==='/produccion')return render({title:'Producción',description:'Todos los clientes y servicios, con cada trabajo en su etapa.',body:agencyProduction(rows(),{q,state,channel})});
        if(path==='/agenda-general')return render({title:'Agenda',description:'Organiza tus visitas y jornadas de grabación.',body:agencyAgenda(visits)});
        const counts=db.get(`SELECT (SELECT count(*) FROM companies) AS companies,(SELECT count(*) FROM companies WHERE approved=0) AS pending,
          (SELECT count(*) FROM requests WHERE status NOT IN ('CANCELLED','DELIVERED')) AS open,(SELECT count(*) FROM pieces WHERE status='DELIVERED') AS delivered,
          (SELECT count(*) FROM visits WHERE status='SCHEDULED' AND starts_at>=?) AS visits`,now());
        const pipeline=db.all('SELECT status,count(*) AS count FROM requests GROUP BY status');
        return render({title:'Vista general',description:'Todo lo que tu agencia tiene en marcha.',body:agencyOverview({counts,pipeline,visits:visits.slice(0,5),recent:rows().slice(0,6)})});
      }
      if(method==='GET' && path.startsWith('/canales/')) {
        const channel=path.slice('/canales/'.length).toUpperCase();requireThat(Object.hasOwn(channels,channel),'Área no encontrada.',404);
        requireThat(can(actor,channel),'No tienes acceso a esta área.',403);
        if(actor.kind!=='AGENCY'||target.searchParams.get('empresa'))company=companyFor(db,actor,target.searchParams.get('empresa'));
        return redirect(res,pathFor(actor,company)(socialChannels.includes(channel)?'/contenido':channel==='WALLET'?'/wallet':'/servicios/'+channel.toLowerCase()));
      }
      if(method==='GET'&&path==='/contenido/grabacion') {
        requireAccess(actor,'SOCIAL','REQUEST');company=companyFor(db,actor);
        return render({layout:'content',contentView:'agenda',title:'Solicitar una grabación',body:card('Coordinemos la visita',recordingForm(actor,pathFor(actor,company),company.phone))});
      }
      if(method==='GET'&&path==='/contenido') {
        requireAccess(actor,'SOCIAL');
        if(actor.kind!=='AGENCY'||target.searchParams.get('empresa'))company=companyFor(db,actor,target.searchParams.get('empresa'));
        const url=pathFor(actor,company);
        if(target.searchParams.has('plataforma'))return redirect(res,url('/contenido'));
        const data=contentData(db,actor,company,target.searchParams);
        const metricsHtml=data.view==='metricas'&&company?metricsPage(actor,url,analytics(db,actor,company.id,
          {from:target.searchParams.get('desde'),to:target.searchParams.get('hasta')}),'/contenido'):'';
        return render({layout:'content',contentView:data.view,title:data.view==='resumen'?'Tu espacio de contenido':data.title,description:'De la idea a la entrega, en un solo lugar.',body:contentPage({actor,company,url,data,metricsHtml,plans:actor.kind==='OWNER'?listPlans(db):[],contracts:actor.kind==='OWNER'&&company?contractsFor(db,company.id):[]})});
      }
      if(method==='GET'&&path.startsWith('/servicios/')) {
        const channel=path==='/contenido'?'SOCIAL':path.slice('/servicios/'.length).toUpperCase();
        requireThat(['SOCIAL','MAPS','WEB','BRAND'].includes(channel),'Área no encontrada.',404);requireAccess(actor,channel);
        if(actor.kind!=='AGENCY'||target.searchParams.get('empresa'))company=companyFor(db,actor,target.searchParams.get('empresa'));
        if(channel==='SOCIAL') return redirect(res,pathFor(actor,company)('/contenido'));
        const policy=requestAccessSql(actor);
        const rows=db.all(`SELECT r.*,c.name AS company_name FROM requests r JOIN companies c ON c.id=r.company_id WHERE r.channel=? AND ${policy.sql}
          AND (? IS NULL OR r.company_id=?)
          ORDER BY r.created_at DESC,r.id LIMIT 100`,channel,...policy.params,company?.id||null,company?.id||null);
        return render({title:areas[channel],description:channel==='SOCIAL'?'Solicitudes, producción y entregas en un solo lugar.':'Servicios, proyectos y seguimiento.',
          body:channelWorkspace(channel,rows,pathFor(actor,company),Boolean(company)&&can(actor,channel,'REQUEST'),actor)});
      }
      const accountView=options=>({title:'Mi cuenta',body:(actor.kind==='AGENCY'?'<section class="card"><h2>Datos del proveedor</h2><a href="/cuenta/proveedor" class="btn secondary">Identificación legal de Lúmina</a></section>':'')+accountPage(actor,{otherSessions:db.get('SELECT count(*) n FROM sessions WHERE account_id=? AND digest<>? AND expires_at>?',actor.id,actor.session_id,now()).n,...options})});
      if (path==='/cuenta' && method==='GET') return render(accountView({notice:target.searchParams.get('estado')==='clave'?'Contraseña actualizada.':target.searchParams.get('estado')==='sesiones'?'Se cerraron tus otras sesiones.':''}));
      if (path==='/cuenta/sesiones/cerrar' && method==='POST') {
        db.run('DELETE FROM sessions WHERE account_id=? AND digest<>?',actor.id,actor.session_id);
        return redirect(res,'/cuenta?estado=sesiones');
      }
      if (path==='/cuenta/clave' && method==='POST') {
        try {
          limit(db,'account-password:'+actor.id,6);
          requireThat(data.confirmation===data.password,'Las contraseñas nuevas no coinciden.');
          await changePassword(db,actor,data);
          return startSession(actor.id,'/cuenta?estado=clave');
        } catch(error) {
          if(!(error instanceof Problem))throw error;
          return render(accountView({error:error.message}),error.status);
        }
      }
      if (path==='/clientes' && method==='GET') {
        requireAgency(actor);
        const q = text(target.searchParams.get('q') || '','búsqueda',0,100);
        const companies = db.all(`SELECT id,name,approved,phone,created_at FROM companies
          WHERE instr(lower(name),lower(?))>0 OR ?='' ORDER BY approved,name,id LIMIT 100`,q,q);
        return render({title:'Clientes',description:'Consulta la información y el avance de cada negocio. Conservas tu identidad de agencia.',body:companiesPage(companies,q)});
      }
      if (path==='/equipos') {
        if(actor.kind==='OWNER'&&method==='GET')return redirect(res,'/equipo');
        requireAgency(actor);
        requireThat(method==='GET','La consulta de equipos es de solo lectura.',405);
        const directory=consultTeams(db,actor,target.searchParams);
        company=directory.company;
        return render({title:'Equipos y roles',body:teamsConsultationPage(directory)});
      }
      const companyId = target.searchParams.get('empresa');
      if(path==='/equipo'||path.startsWith('/equipo/'))requireOwner(actor);
      const catalog = ['/planes','/planes/retirar','/planes/nueva','/planes/viernes-negro'].includes(path);
      if (actor.kind==='AGENCY' && !companyId && !catalog) {
        if (method==='GET' && path==='/inicio') return redirect(res,'/resumen');
        throw new Problem('Selecciona un negocio desde Clientes.',404);
      }
      if (actor.kind!=='AGENCY' || companyId) company = companyFor(db,actor,companyId);
      const url = pathFor(actor,company);
      if (path==='/inicio' && method==='GET') {
        if(actor.kind==='OWNER'&&!company.loyalty_tenant){try{company=await wallets.ensureCompany(company.id);}catch{}}
        const groups = requestCounts(db,actor,company.id);
        const policy=requestAccessSql(actor);
        const videos=db.all(`SELECT r.quantity,(SELECT count(*) FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='DELIVERED') AS delivered
          FROM requests r WHERE r.company_id=? AND ${policy.sql} AND r.service IN ('VIDEO','REEL','SHORT') AND r.type<>'VISIT' AND r.status<>'CANCELLED'`,company.id,...policy.params);
        const upcoming=db.get(`SELECT count(*) AS count FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
          WHERE v.company_id=? AND ${policy.sql} AND v.status='SCHEDULED' AND v.starts_at>=?`,company.id,...policy.params,now()).count;
        const courtesy = actor.kind==='OWNER' ? db.get("SELECT id,status FROM requests WHERE company_id=? AND type='COURTESY'",company.id) : null;
        return render({title:actor.kind==='AGENCY'?'Información del negocio':'Panel de trabajo',description:'Servicios y actividades del negocio.',
          body:(actor.kind==='OWNER'?campaignBanner(listPlans(db),url):'')+homePage({actor,company,url,groups,upcoming,courtesy,cash,overview:actor.kind!=='AGENCY'?businessOverview(db,actor,company.id):null,
            videoRequested:videos.reduce((sum,row)=>sum+row.quantity,0),videoDelivered:videos.reduce((sum,row)=>sum+row.delivered,0)})});
      }
      if (path==='/clientes/verificar' && method==='POST') {
        approveCompany(db,actor,company);
        return redirect(res,url('/inicio'));
      }
      if(method==='GET'&&path.startsWith('/gestion')) {
        if(path==='/gestion/informes'&&actor.kind==='COLLABORATOR') {
          requireThat(canReadFidelityReport(actor),'Tu acceso no incluye informes de fidelización.',403);
          const days=target.searchParams.get('dias')||'30';requireThat(['7','30','90','365'].includes(days),'Período inválido.');
          const result=await wallets.proxy(actor,'/api/staff/metrics',{query:'?days='+days,surface:'management'});
          requireThat(result.status===200,'No se pudo consultar el informe.',result.status);
          return render({title:'Informes de fidelización',body:walletReportPage(JSON.parse(result.bytes))});
        }
        requireOwner(actor);
        if(path==='/gestion')return render({title:'Administración',body:managementPage()});
        if(path==='/gestion/vista') {
          const section=target.searchParams.get('seccion');requireThat(Object.hasOwn(managementSections,section),'Sección no disponible.',404);
          await wallets.validate(actor);return send(res,200,managementDocument(actor,company,section));
        }
        const slug=path.slice('/gestion/'.length);requireThat(Object.hasOwn(managementTitles,slug),'Sección no disponible.',404);
        return render({title:managementTitles[slug],description:'Administración del negocio desde Lúmina.',body:managementFramePage(slug,target.searchParams)});
      }
      if (path==='/equipo' && method==='GET') {
        return render({title:'Equipos y roles',body:teamPage(actor,company,teamDirectory(db,actor,target.searchParams))});
      }
      if (path==='/equipo/nuevo' && method==='GET') {
        requireOwner(actor);
        return render({title:'Añadir persona',body:newMemberPage(actor)});
      }
      if (path==='/equipo' && method==='POST') {
        requireOwner(actor);
        try {
          const result = createTeamMember(db,actor,data);
          return render(teamInvitation(db,actor,result.id,result.code),201);
        } catch(issue) {
          if(!(issue instanceof Problem)||![400,409].includes(issue.status))throw issue;
          return render({title:'Añadir persona',body:newMemberPage(actor,data,issue.message)},issue.status);
        }
      }
      const teamMatch = path.match(/^\/equipo\/([^/]+)(?:\/(acceso|permisos|datos|invitar|desactivar|caja\/(?:sucursales|guardar|revocar)))?$/);
      if (teamMatch && isId(teamMatch[1])) {
        const [,id,action] = teamMatch;
        teamMember(db,actor,id);
        const memberView = async (options={},loadBranches=true) => {
          let branches=null;
          const member=teamMember(db,actor,id);
          if(loadBranches&&member.active&&member.cash_status!=='REVOKING')try {
            branches=await bridge.branches(actor,await wallets.ownerCredential(actor));
          } catch(issue) {
            if(!(issue instanceof Problem))throw issue;
            options={...options,branchError:'No se pudieron cargar las sucursales. Los demás permisos se pueden gestionar.'};
          }
          actor=getSession(db,cookie);
          requireThat(actor,'Tu sesión terminó. Ingresa nuevamente.',401);
          const current=teamMember(db,actor,id);
          return {title:current.name,body:memberPage(actor,company,current,branches,{...options,history:teamHistory(db,actor,id)})};
        };
        if (method==='GET' && !action) {
          const notices={acceso:'Acceso guardado.',permisos:'Permisos guardados.',datos:'Datos guardados.',caja:'Acceso de Caja guardado.',baja:'Acceso desactivado.',retiro:'Caja retirada.'};
          return render(await memberView({notice:notices[target.searchParams.get('guardado')]||''}));
        }
        if (method==='POST') {
          try {
            if (action==='acceso') {
              limit(db,'loyalty:'+actor.id,40);
              await saveTeamAccess({db,bridge,wallets},actor,id,data);
            }
            if (action==='permisos') updateGrants(db,actor,id,data);
            if (action==='datos') updateMember(db,actor,id,data);
            if (action==='invitar') return render(teamInvitation(db,actor,id,manageAccount(db,actor,id,'INVITE',data)));
            if (action==='desactivar') {
              manageAccount(db,actor,id,'DISABLE',data);
              if(teamMember(db,actor,id).cash_status==='REVOKING')try {
                await bridge.revoke(actor,id,{revision:String(teamMember(db,actor,id).revision),reason:'Baja del acceso completo en Lúmina.',credential:()=>wallets.ownerCredential(actor)});
              } catch(issue) {
                if(!(issue instanceof Problem))throw issue;
                return render(await memberView({notice:'Acceso desactivado. Caja está bloqueada; queda pendiente confirmar su retiro con Wallet.'},false));
              }
            }
            if (action?.startsWith('caja/')) limit(db,'loyalty:'+actor.id,40);
            if (action==='caja/sucursales') return render(await memberView());
            if (action==='caja/guardar') await bridge.configure(actor,id,{...data,credential:await wallets.ownerCredential(actor)});
            if (action==='caja/revocar') await bridge.revoke(actor,id,{...data,credential:()=>wallets.ownerCredential(actor)});
            requireThat(action,'Acción no encontrada.',404);
            const notice={acceso:'acceso',permisos:'permisos',datos:'datos',desactivar:'baja','caja/guardar':'caja','caja/revocar':'retiro'}[action];
            return redirect(res,'/equipo/'+id+(notice?'?guardado='+notice:''));
          } catch(issue) {
            if(!(issue instanceof Problem)||![400,409,503].includes(issue.status))throw issue;
            const section=action==='caja/guardar'?'caja':action==='caja/revocar'?'revocar':action;
            const values=issue.localAccessBlocked?{...data,revision:String(issue.committedRevision)}:data;
            const message=issue.localAccessBlocked&&action==='acceso'?'El cambio de permisos se guardó. '+issue.message:issue.message;
            return render(await memberView({values,error:message,section},issue.status<500),issue.status);
          }
        }
      }
      if(path==='/solicitudes/nueva'&&method==='GET') {
        requireThat(actor.kind!=='AGENCY','Las solicitudes las realiza el negocio.',403);
        const area=target.searchParams.get('area')||'';
        requireThat(!area||Object.hasOwn(areas,area),'Servicio no disponible.',404);
        if(area)requireAccess(actor,area,'REQUEST');
        return render({layout:area==='SOCIAL'?'content':undefined,contentView:'solicitudes',title:'Nueva solicitud',description:'Elige un servicio y cuéntanos tu idea.',body:newRequestPage({actor,url,area,values:{phone:company.phone},plans:actor.kind==='OWNER'?listPlans(db):[],contracts:actor.kind==='OWNER'?contractsFor(db,company.id):[]})});
      }
      if (path==='/solicitudes') {
        if (method==='POST') {
          try {
            const id = createRequest(db,actor,company,data);
            return redirect(res,url('/solicitudes/'+id));
          } catch(issue) {
            if(!(issue instanceof Problem)||![400,409].includes(issue.status)||actor.kind==='AGENCY'||!Object.hasOwn(areas,data.channel)||!can(actor,data.channel,'REQUEST')||data.type==='PLAN')throw issue;
            if(data.type==='COURTESY')return render({title:'Revisa tu video de cortesía',body:card('Tu video de cortesía',`<p class="notice" role="alert">${esc(issue.message)}</p>`+requestForm(actor,url,true,'',false,data))},issue.status);
            return render({layout:data.channel==='SOCIAL'?'content':undefined,contentView:'solicitudes',title:'Revisa tu solicitud',body:newRequestPage({actor,url,area:data.channel,plans:actor.kind==='OWNER'?listPlans(db):[],contracts:actor.kind==='OWNER'?contractsFor(db,company.id):[],values:data,error:issue.message})},issue.status);
          }
        }
        requireThat(Object.keys(channels).some(key=>can(actor,key)),'Tu acceso no incluye solicitudes de marketing.',403);
        const channel = target.searchParams.get('canal') || '';
        const currentPage = integer(target.searchParams.get('pagina') || '0','página',{max:10000});
        const q=text(target.searchParams.get('q')||'','búsqueda',0,100),state=target.searchParams.get('estado')||'';
        const items = visibleRequests(db,actor,company.id,channel,currentPage,{q,state});
        return render({title:'Solicitudes',description:'Cotizaciones, contenido y visitas de tu negocio.',
          body:requestsPage({actor,url,...items,channel,page:currentPage,q,state})});
      }
      const requestMatch = path.match(/^\/solicitudes\/([^/]+)(.*)$/);
      if (requestMatch && isId(requestMatch[1])) {
        const [,requestId,rest] = requestMatch;
        const request = getRequest(db,actor,company.id,requestId);
        if (method==='GET' && !rest) return render(getRequestPage(db,actor,company,url,request));
        if (method==='POST') {
          const pieceMatch = rest.match(/^\/piezas\/([^/]+)\/(editar|revisar|evidencia|publicacion|medir)$/);
          if (Object.hasOwn(operations,rest)) operations[rest](db,actor,company,request,data);
          else if (pieceMatch && isId(pieceMatch[1])) {
            const piece = getPiece(db,company.id,request.id,pieceMatch[1]);
            pieceOperations[pieceMatch[2]](db,actor,company,request,piece,data);
          } else throw new Problem('Acción no encontrada.',404);
          return redirect(res,url('/solicitudes/'+request.id));
        }
      }
      if (path==='/agenda' && method==='GET') {
        requireThat(Object.keys(channels).some(key=>can(actor,key)),'Tu acceso no incluye agenda.',403);
        return render({title:'Agenda',description:'Consulta las últimas 100 visitas, con prioridad para las programadas.',
          body:agendaPage(agendaRows(db,actor,company.id),url)});
      }
      if (path.startsWith('/planes')) {
        requireThat(actor.kind!=='COLLABORATOR','Tu acceso no incluye contratos ni precios.',403);
        if(path==='/planes/viernes-negro') {
          const screen=(values={},error='')=>campaignPage({actor,company,url,plans:listPlans(db,actor.kind==='AGENCY'),bases:actor.kind==='AGENCY'?campaignBases(db):[],values,error});
          if(method==='GET')return render({title:'Viernes Negro',body:screen({base:target.searchParams.get('base')||''})});
          requireAgency(actor);requireThat(!actor.readOnlyCompany,'Publica desde el catálogo de Lúmina.',403);
          try { createCampaignOffer(db,actor,data);return redirect(res,url('/planes/viernes-negro')); }
          catch(issue){if(!(issue instanceof Problem)||![400,409].includes(issue.status))throw issue;return render({title:'Revisa tu promoción',body:screen(data,issue.message)},issue.status);}
        }
        if(method==='GET'&&path==='/planes/nueva') {requireAgency(actor);requireThat(!actor.readOnlyCompany,'Publica las ofertas desde el catálogo de Lúmina.',403);return render({title:'Crear oferta',body:offerEditor(actor,url)});}
        if (method==='GET' && path==='/planes') {
          const plans = listPlans(db,actor.kind==='AGENCY');
          const contracts = company ? contractsFor(db,company.id) : [];
          const view=target.searchParams.get('vista')||'catalogo';
          requireThat(['catalogo','acuerdos','contrataciones'].includes(view),'Vista no encontrada.',404);
          const orders=ordersFor(db,actor,company,integer(target.searchParams.get('pagina')||'0','página',{min:0,max:100000}));
          return render({title:'Paquetes y servicios',description:'Combina servicios mensuales y trabajos puntuales, con cada precio y cupo claro.',
            body:walletPriceCard(actor)+packagesPage({actor,company,url,plans,contracts,orders,view})});
        }
        if(method==='POST'&&path==='/planes/solicitar') {
          try{
            const id=submitOrder(db,actor,company,data);
            return redirect(res,url('/planes/pedidos/'+id));
          }catch(issue){
            if(!(issue instanceof Problem)||![400,409].includes(issue.status)||actor.kind!=='OWNER'||data.renewal)throw issue;
            return render({title:'Revisa tu selección',body:packagesPage({actor,company,url,plans:listPlans(db),contracts:[],orders:{rows:[],page:0,more:false},view:'catalogo',values:data,error:issue.message})},issue.status);
          }
        }
        const orderMatch=path.match(/^\/planes\/pedidos\/([^/]+)(?:\/(cotizar|aceptar|activar|cancelar))?$/);
        if(orderMatch&&isId(orderMatch[1])) {
          const [,id,action]=orderMatch;
          const order=getOrder(db,actor,company,id);
          if(method==='GET'&&!action)return render({title:'Tu combinación de servicios',description:company.name,
            body:orderPage({actor,company,url,order,audit:db.all("SELECT * FROM audit WHERE company_id=? AND subject='ORDER' AND subject_id=? ORDER BY seq DESC LIMIT 100",company.id,id)})});
          if(method==='POST'&&action) {
            try {
              await commercialTurn(company.id,async()=>{
                actor=getSession(db,cookie);requireThat(actor&&equal(actor.csrf,data._csrf),'Tu sesión cambió. Recarga para continuar.',403);
                requireOperating(db,company.id);
                const latest=getOrder(db,actor,company,id);
                if(['aceptar','activar'].includes(action)&&latest.lines.some(line=>line.wallet!=='NONE'||line.items?.some(item=>item.service==='WALLET'))) {
                  const account=actor.kind==='AGENCY'?await wallets.administration(actor,company.id,'account'):await wallets.account(actor);
                  const plan=account.membership?.plan;
                  requireThat(!plan?.recurring&&(!plan?.walletEndsOn||latest.lines.every(line=>line.starts_on>=plan.walletEndsOn)),'Wallet ya tiene una suscripción. Desactiva su renovación y programa el paquete después del período vigente para evitar cargos duplicados.',409);
                  requireOperating(db,company.id);
                }
                ({cotizar:offerOrder,aceptar:acceptOrder,activar:activateOrder,cancelar:cancelOrder})[action](db,actor,company,id,data);
              });
              return redirect(res,url('/planes/pedidos/'+id));
            } catch(issue) {
              if (!(issue instanceof Problem) || ![400,409].includes(issue.status)) throw issue;
              return render({title:'Revisa tu propuesta',body:orderPage({actor,company,url,order,
                values:action==='cotizar'?data:{revision:data.revision},error:issue.message,
                audit:db.all("SELECT * FROM audit WHERE company_id=? AND subject='ORDER' AND subject_id=? ORDER BY seq DESC LIMIT 100",company.id,id)})},issue.status);
            }
          }
        }
        if (method==='POST') {
          requireAgency(actor);
          if (path==='/planes') {try{createPlan(db,actor,data);}catch(issue){if(!(issue instanceof Problem)||![400,409].includes(issue.status)||data.catalog_version!=='SIMPLE')throw issue;return render({title:'Revisa la oferta',body:offerEditor(actor,url,data,issue.message)},issue.status);}}
          else if (path==='/planes/retirar') hidePlan(db,actor,data.plan);
          else if (path==='/planes/activar') throw new Problem('La contratación se activa desde una propuesta aceptada por el dueño en Paquetes y servicios.',410);
          else if (path==='/planes/cancelar') cancelContract(db,actor,company,data.contract,data.reason);
          else throw new Problem('Acción no encontrada.',404);
          return redirect(res,url('/planes'));
        }
      }
      if (path==='/reportes' && method==='GET') {
        requireThat(socialChannels.some(key=>can(actor,key)),'Tu acceso no incluye métricas de redes.',403);
        const report = analytics(db,actor,company.id,{from:target.searchParams.get('desde'),to:target.searchParams.get('hasta')});
        return render({title:'Métricas',description:'Seguimiento por canal y cobertura de las mediciones.',layout:'content',contentView:'metricas',body:metricsPage(actor,url,report)});
      }
      if (path.startsWith('/mapas')) {
        requireAccess(actor,'MAPS');
        if (path==='/mapas' && method==='GET') return render({title:'Google Maps',
          description:'Reseñas, borradores de respuesta y mediciones por ubicación.',
          body:mapsPage(actor,url,mapsData(db,actor,company.id))});
        if (method==='POST') {
          const action = {'/mapas/ubicacion':addLocation,'/mapas/medicion':addMapsMetric,'/mapas/resena':addReview}[path];
          requireThat(action,'Acción no encontrada.',404);
          action(db,actor,company,data);
          return redirect(res,url('/mapas'));
        }
      }
      throw new Problem('La página solicitada no existe.',404);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      securityHeaders(res);
      const expected = error instanceof Problem;
      const status = expected ? error.status : 500;
      if (!expected) process.stderr.write('Lúmina: fallo interno de solicitud.\n');
      const message = expected ? error.message : 'No se pudo completar la operación. Vuelve a intentarlo.';
      if (api) return json(res,status,{code:error.code || 'LUMINA_ACCESS',message:error.counterMessage || message});
      const back = actor ? (actor.kind==='AGENCY' ? '/clientes' : '/inicio') : '/';
      return render({title:status===404 ? 'Página no disponible' : 'Revisa la operación',
        body:card('Detalle',`<p role="alert">${esc(message)}</p><p>${localLink(back,'Volver al portal','btn secondary')}</p>`)},status);
    }
  });
  let retryRunning=false;
  const retry=()=>{if(retryRunning)return;retryRunning=true;controls.sweep().catch(()=>{}).finally(()=>{retryRunning=false;});};
  const timer=setInterval(retry,30000);timer.unref();server.once('listening',retry);server.once('close',()=>clearInterval(timer));
  return server;
}
