import { accountOutlook, planComparison, pricedContracts } from '../memberships/cut-outlook.mjs';
import { agencyCut, followUp } from '../businesses/follow-up.mjs';
import { agencyOutlookPage, followUpPage } from '../presentation/pages/agency-follow-up.mjs';
import { planComparisonPanel } from '../presentation/pages/plan-comparison.mjs';
import { requestProgressSql } from '../production/request-progress.mjs';
import { operationState, operatingSql, requestBusinessSql } from '../businesses/operation-state.mjs';
import { teamAdministrator } from '../access/team-administration.mjs';
import { teamRoutes } from './team-routes.mjs';
import { fileDetails, saveFile, commentPiece } from '../content/deliverables.mjs';
import { contractSummary } from '../presentation/pages/contract-summary.mjs';
import { notificationFilters, notificationReturn, notifications, seeNotification, reopenNotification } from '../production/notifications.mjs';
import { calendarVisit, visitCalendar } from '../production/calendar-file.mjs';
import { accessShell } from '../presentation/pages/public-shell.mjs';
import { homepage } from '../presentation/pages/homepage.mjs';
import { canonicalTarget, legacyRedirectAllowed } from '../shared/routes.mjs';
import { serviceState, requireService, serviceCatalog, beginService, completeWalletActivation, finishWelcome, routeService } from '../businesses/services.mjs';
import { serviceStatus } from '../businesses/service-status.mjs';
import { businessStatusPage, collaboratorServicesPage } from '../presentation/pages/service-status-pages.mjs';
import { walletHomeEntry, walletPaymentReminder, walletTrialReminder } from '../presentation/pages/wallet-reminders.mjs';
import { welcomePage, servicesPage, inactiveServicePage } from '../presentation/pages/welcome-pages.mjs';
import { courtesyState, markCourtesyDelivered, setCourtesyDisplay } from '../production/courtesy.mjs';
import { courtesyNotice, courtesyOwnerPage, courtesyAdminPage } from '../presentation/pages/courtesy-pages.mjs';
import { businessWorkSummary } from '../businesses/work-summary.mjs';
import { businessDirectory } from '../businesses/directory.mjs';
import { businessDirectoryPage } from '../presentation/pages/business-directory-pages.mjs';
import { receiptPage, receiptText } from '../presentation/pages/billing-account-pages.mjs';
import { businessControl, requireOperating, requestBusinessChange, createBusinessControlSync, businessStates } from '../businesses/control.mjs';
import { controlPage, accountPage as billingAccountPage } from '../presentation/pages/business-control-pages.mjs';
import { paymentInput, chargeInput, emptyAccount } from '../billing/payment-input.mjs';
import { walletComparison } from '../presentation/pages/wallet-benefits.mjs';
import { campaignPage, campaignBanner } from '../presentation/pages/campaign-pages.mjs';
import { campaignBases, createCampaignOffer } from '../campaigns/offers.mjs';
import { legalProfile, saveLegalProfile } from '../billing/subscription.mjs';
import { subscriptionPage, legalProfilePage } from '../presentation/pages/subscription-pages.mjs';
import { openWalletOrders, walletPlanContext } from '../memberships/wallet-overview.mjs';
import { walletCheckoutPage } from '../presentation/pages/wallet-checkout-pages.mjs';
import { confirmedBranchCount, inTrial, paidFrom, paidWallet, setChoice, standardIds, trialChoice, trialOffer } from '../memberships/trial.mjs';
import { advanceCalendar, stopSchedule, syncCalendars, expiryAlerts } from '../memberships/calendar.mjs';
import { includesWallet, walletCheckout, validateWalletCheckout, confirmWalletCheckout } from '../memberships/wallet-checkout.mjs';
import { canReadFidelityReport, centralPaths, managementSections, managementTitles } from '../wallet/management-policy.mjs';
import { managementPage, managementFramePage, managementDocument } from '../presentation/pages/management-pages.mjs';
import { offerEditor } from '../presentation/pages/offer-editor.mjs';
import { agendaData } from '../production/agenda.mjs';
import { agencyProductionData } from '../production/agency-work.mjs';
import { attentionPage, workdayAgenda } from '../presentation/pages/workday-pages.mjs';
import { businessOverview, attentionData } from '../production/overview.mjs';
import { requestAccessSql } from '../access/content-policy.mjs';
import { walletSections } from '../wallet/access-policy.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { activate, approveCompany, authenticate, authenticateLegacy, claimIdentity, can, changePassword, companyFor, createAgency, createSession, createTeamMember,
  getSession, limit, logout, manageAccount, register, requireAccess, requireAgency, requireOwner, teamMember, updateGrants, updateMember, updateContact } from '../access/accounts.mjs';
import { teamDirectory, teamHistory } from '../access/team-directory.mjs';
import { consultTeams } from '../access/team-consultation.mjs';
import { teamsConsultationPage } from '../presentation/pages/team-consultation-pages.mjs';
import { saveTeamAccess } from '../access/team-access.mjs';
import { equal } from '../access/security.mjs';
import { acceptQuote, cancelContract, contractsFor, createPlan, currentQuote, getPlan, hidePlan, listPlans, offerQuote } from '../memberships/billing.mjs';
import { event, channels, areas, integer, isId, now, localDay, Problem, requireThat, socialChannels, text } from '../shared/domain.mjs';
import { cashierAssets, createLoyaltyBridge } from '../wallet/bridge.mjs';
import { createWalletWorkspace } from '../wallet/wallet.mjs';
import { addEvidence, addPiece, addPublication, addVisit, createRequest, editPiece, finishVisit, getPiece, getRequest,
  requestCounts, reviewPiece, updateRequest, visibleRequests } from '../production/production.mjs';
import { addLocation, addMapsMetric, addReview, addSocialMetric, analytics, mapsData, publicationsFor } from '../analytics/reporting.mjs';
import { accountPage, publicPage, identityMigrationPage } from '../presentation/pages/account-pages.mjs';
import { invitePage, memberPage, newMemberPage, teamPage } from '../presentation/pages/team-pages.mjs';
import { card, esc, localLink, page, pathFor } from '../presentation/pages/components.mjs';
import { cookieFrom, json, readForm, readJson, redirect, securityHeaders, send, sessionCookie } from '../presentation/pages/http.mjs';
import { homePage, requestDetail, requestsPage } from '../presentation/pages/production-pages.mjs';
import { mapsPage, metricsPage } from '../presentation/pages/service-pages.mjs';
import { cashierHtml, loyaltyWorkspaceHtml, walletPage, walletReportPage } from '../presentation/pages/wallet-pages.mjs';
import { agencyOverview, agencyProduction, channelWorkspace } from '../presentation/pages/workspace-pages.mjs';

import { contentData } from '../content/workspace.mjs';
import { contentShell } from '../presentation/pages/content-shell.mjs';
import { recordingForm } from '../presentation/pages/content-forms.mjs';
import { newRequestPage } from '../presentation/pages/request-composer.mjs';
import { contentPage } from '../presentation/pages/content-pages.mjs';
import { packagesPage, orderPage } from '../presentation/pages/package-pages.mjs';
import { withEligibility, legacySelection } from '../memberships/coverage.mjs';
import { ordersFor, getOrder, submitOrder, offerOrder, acceptOrder, activateOrder, cancelOrder, inclusiveEnd } from '../memberships/orders.mjs';

const assets = {
  '/assets/studio.webp':['studio.webp','image/webp'],
  '/assets/studio-small.webp':['studio-small.webp','image/webp'],
  '/assets/lumina-2.css':['lumina-2.css','text/css; charset=utf-8'],
  '/assets/access.css':['access.css','text/css; charset=utf-8'],
  '/assets/homepage.js':['homepage.js','text/javascript; charset=utf-8'],
  '/assets/homepage.css':['homepage.css','text/css; charset=utf-8'],
  '/assets/deliveries.css':['deliveries.css','text/css; charset=utf-8'],
  '/assets/deliveries.js':['deliveries.js','text/javascript; charset=utf-8'],
  '/assets/welcome.css':['welcome.css','text/css; charset=utf-8'],
  '/assets/identity.js':['identity.js','text/javascript; charset=utf-8'],
  '/assets/identity-rules.mjs':['identity-rules.mjs','text/javascript; charset=utf-8'],
  '/assets/billing-workspace.css':['billing-workspace.css','text/css; charset=utf-8'],
  '/assets/billing-workspace.js':['billing-workspace.js','text/javascript; charset=utf-8'],
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
  '/assets/cashier.js': ['cashier.js','text/javascript; charset=utf-8'],
  '/assets/workspace.css': ['workspace.css','text/css; charset=utf-8'],
  '/assets/loyalty-workspace.css': ['loyalty-workspace.css','text/css; charset=utf-8'],
  '/assets/loyalty-context.js': ['loyalty-context.js','text/javascript; charset=utf-8'],
  '/assets/loyalty-launch.js': ['loyalty-launch.js','text/javascript; charset=utf-8'],
};
const sourceAssets = Object.fromEntries(Object.entries(assets).map(([path,[file,type]]) =>
  [path,{body:readFileSync(new URL('../presentation/assets/'+file,import.meta.url)),type}]));
const operations = {
  '/state':updateRequest, '/quote':offerQuote,
  '/accept':(db,actor,company,request,data)=>acceptQuote(db,actor,company,request,data.quote),
  '/visits':addVisit, '/visits/close':finishVisit, '/pieces':addPiece,
};
const pieceOperations = {
  edit:editPiece, review:reviewPiece, evidence:addEvidence, publication:addPublication, measure:addSocialMetric, comment:commentPiece,
};
function getRequestPage(db,actor,company,url,request,feedback=null) {
  const pieces = db.all('SELECT * FROM pieces WHERE company_id=? AND request_id=? ORDER BY created_at,id',company.id,request.id)
    .map(piece=>({...fileDetails(db,company.id,piece.id),
      ...piece,
      evidence:db.all('SELECT * FROM evidence WHERE company_id=? AND piece_id=? ORDER BY created_at,id',company.id,piece.id),
      publications:publicationsFor(db,actor,company.id,piece.id),
    }));
  const visits = db.all('SELECT * FROM visits WHERE company_id=? AND request_id=? ORDER BY starts_at,id',company.id,request.id);
  const audit = db.all("SELECT * FROM audit WHERE company_id=? AND subject='REQUEST' AND subject_id=? ORDER BY seq DESC LIMIT 100",company.id,request.id);
  const quote = actor.kind === 'COLLABORATOR' ? null : currentQuote(db,company.id,request.id);
  const plan = request.plan_id ? getPlan(db,request.plan_id) : null;
  const contracts = actor.kind === 'AGENCY' ? contractsFor(db,company.id) : [];
  return {title:request.title,description:'',
    layout:request.channel==='SOCIAL'&&(actor.kind!=='OWNER'||can(actor,'SOCIAL'))?'content':undefined,contentView:'requests',
    omitCourtesy:request.type==='COURTESY',
    body:requestDetail({actor,company,url,request,quote,pieces,visits,audit,contracts,plan,feedback})};
}

export function createPortal({ db, key, loyaltyUrl, publicOrigin = null, integration = {}, readiness = null, fileStore = null }) {
  let uploadsInProgress=0;
  const wallets = createWalletWorkspace({db,key,origin:loyaltyUrl,integration});
  const bridge = createLoyaltyBridge({db,key,origin:loyaltyUrl,administration:wallets.teamAdministration});
  const commercialWork=new Map();
  const commercialTurn=async(companyId,work)=>{const previous=commercialWork.get(companyId)||Promise.resolve();const next=previous.catch(()=>{}).then(work);commercialWork.set(companyId,next);try{return await next;}finally{if(commercialWork.get(companyId)===next)commercialWork.delete(companyId);}};
  const controls=createBusinessControlSync({db,remote:wallets.controlRemote,ensureCompany:wallets.ensureCompany});
  const server=createServer({requestTimeout:300_000,headersTimeout:10_000},async (req,res) => {
    let actor = null;
    let company = null;
    let path = '/';
    let cash = null;
    let api = false;
    let agencyWork=false;
    const render = (view,status=200) => {
      if(actor?.kind==='OWNER' && (path==='/home' || path==='/content' || path==='/services/web' || path==='/billing')){
        const alerts=expiryAlerts(db,actor.company_id);
        if(alerts.length)view={...view,body:alerts.map(a=>`<aside class="notice" role="status"><strong>${esc(a.name)}</strong> · Vigente hasta el ${esc(inclusiveEnd(a.ends_before))}. Por favor, realiza el pago para renovar. ${localLink('/plans?view=agreements','Ver mi suscripción')}</aside>`).join('')+view.body};
      }
      const businessState=company?.id?operationState(db,company.id):actor?.businessState;
      const blocked=Boolean(businessState&&businessState!=='ACTIVE');
      const viewer=actor?{...actor,agencyWork,businessState,businessBlocked:blocked,
        readOnlyCompany:actor.kind==='AGENCY'&&Boolean(company)&&(!agencyWork||blocked)}:null;
      if(status===200 && viewer?.kind==='OWNER' && viewer.document && !blocked && !view.omitCourtesy && view.layout!=='access') {
        const state=courtesyState(db,viewer.company_id,viewer.id);
        view={...view,body:courtesyNotice(viewer,state,req.url)+view.body};
      }
      return send(res,status,(view.layout==='content'?contentShell:view.layout==='access'?accessShell:page)({actor:viewer,company,path,cash,...view}));
    };
    try {
      const origin = publicOrigin || `http://127.0.0.1:${req.socket.localPort}`;
      const trusted = new URL(origin);
      requireThat(req.headers.host === trusted.host && req.url?.startsWith('/') && !req.url.startsWith('//'),
        'Origen del portal inválido.',400);
      const originalTarget = new URL(req.url,origin);
      const target = canonicalTarget(originalTarget);
      requireThat(target.origin === origin,'Ruta del portal inválida.');
      path = target.pathname;
      const method = req.method;
      api = path.startsWith('/api/') || path.startsWith('/wallet-api/') || path.startsWith('/management-api/');
      securityHeaders(res,['/cashier','/platform','/wallet','/wallet/management','/management/view'].includes(path),path.startsWith('/management'));
      requireThat(['GET','POST'].includes(method) || (path.startsWith('/wallet-api/')||path.startsWith('/management-api/')) && ['PUT','DELETE'].includes(method),'Método no permitido.',405);
      if (method!=='GET') requireThat(req.headers.origin === origin,'Esta acción requiere el formulario del portal.',403);
      if(method==='GET'&&target.href!==originalTarget.href&&legacyRedirectAllowed(path))return redirect(res,target.pathname+target.search);
      if (method==='GET' && Object.hasOwn(sourceAssets,path)) {
        const asset = sourceAssets[path];
        return send(res,200,asset.body,asset.type);
      }
      if(method==='GET'&&path==='/health/ready'){
        try {return json(res,200,readiness?await readiness():(db.get('SELECT 1'),{status:'UP',service:'lumina-agency'}));}
        catch {return json(res,503,{status:'UNAVAILABLE',service:'lumina-agency'});}
      }
      if (method==='GET' && path==='/health') return json(res,200,{status:'UP',service:'lumina-agency'});
      const cookie = cookieFrom(req);
      actor = getSession(db,cookie);
      const startSession = (id,destination='/home') => {
        if (actor) { wallets.forget(actor); logout(db,actor); }
        res.setHeader('Set-Cookie',sessionCookie(createSession(db,id),trusted.protocol==='https:'));
        return redirect(res,destination);
      };
      if (method==='GET' && path==='/') return send(res,200,homepage({signedIn:Boolean(actor)}));
      if (path==='/coming-soon') throw new Problem('Página no encontrada.',404);
      const publicPaths = ['/login','/register','/activate','/setup','/legacy-login'];
      if (method==='GET' && publicPaths.includes(path)) {
        if (actor) return redirect(res,!actor.document&&['/login','/legacy-login'].includes(path)?'/account/identity':'/home');
        const setupAvailable = !db.get("SELECT id FROM accounts WHERE kind='AGENCY'");
        if (path==='/setup') requireThat(setupAvailable,'La cuenta de agencia ya está configurada.',404);
        return render(publicPage(path,setupAvailable));
      }
      if (method==='POST' && ['/login','/register','/activate','/setup','/legacy-login'].includes(path)) {
        requireThat(!actor,'Cierra la sesión actual para usar otra cuenta.',409);
        limit(db,path+':'+req.socket.remoteAddress,path==='/login' ? 50 : 16);
        const data = await readForm(req);
        try {
          if (path==='/login') {
            const id=await authenticate(db,data),account=db.get('SELECT kind,document,welcome_done FROM accounts WHERE id=?',id);
            return startSession(id,!account.document?'/account/identity':account.kind==='AGENCY'?'/dashboard':account.welcome_done?'/home':'/welcome');
          }
          if(path==='/legacy-login')return startSession(await authenticateLegacy(db,data),'/account/identity');
          if (path==='/register') {
            const account=await register(db,key,data);
            return startSession(account,'/welcome');
          }
          if (path==='/activate') return startSession(await activate(db,data),'/welcome');
          return startSession(await createAgency(db,data));
        } catch(issue) {
          if (!(issue instanceof Problem) || !([400,401,409].includes(issue.status) || path==='/activate'&&issue.status===403)) throw issue;
          const setupAvailable=!db.get("SELECT id FROM accounts WHERE kind='AGENCY'");
          return render(publicPage(path,setupAvailable,{values:data,error:issue.message}),issue.status);
        }
      }
      if (!actor) {
        if (method==='GET' && !api) return redirect(res,'/login');
        throw new Problem('Inicia sesión para continuar.',401);
      }
      const serviceAllowed=()=>path==='/logout'||path.startsWith('/account')||path==='/help'||(method==='GET'&&(path==='/billing'||path.startsWith('/billing/payments/')))||path==='/plans/wallet/cancel'||method==='GET'&&(path.startsWith('/plans/wallet')||path==='/home'||path==='/services'||path==='/wallet/benefits');
      const scopedCompany=actor.kind==='AGENCY'?(target.searchParams.get('company')||req.headers['x-lumina-company']):actor.company_id;
      if(scopedCompany) {
        const state=businessControl(db,scopedCompany);
        if(actor.kind!=='AGENCY'&&(state.state!=='ACTIVE'||state.pending_id||state.archived_at)) {
          const permitted=serviceAllowed();
          if(method==='GET'&&!api&&(!permitted||path==='/home'||path==='/services')) {
            company=companyFor(db,actor);
            return render({title:'Estado de tus servicios',body:businessStatusPage(actor,serviceStatus(db,actor,company.id))},permitted?200:423);
          }
          if(!permitted)requireOperating(db,scopedCompany);
        }
        if(actor.kind==='AGENCY'&&method!=='GET')requireOperating(db,scopedCompany);
      }
      if(path.startsWith('/agency/')) {
        requireAgency(actor);
        requireThat(/^\/agency\/(home|content|requests|calendar|plans|maps|businesses\/verify)(\/|$)/.test(path),'Área de trabajo no encontrada.',404);
        agencyWork=true;path=path.slice('/agency'.length);
      }
      const businessState=scopedCompany?operationState(db,scopedCompany):null;
      actor={...actor,agencyWork,businessState,businessBlocked:Boolean(businessState&&businessState!=='ACTIVE'),
        readOnlyCompany:actor.kind==='AGENCY'&&Boolean(target.searchParams.get('company'))&&(!agencyWork||businessState!=='ACTIVE')};
      if(actor.kind!=='AGENCY') {
        const scope=routeService(path);
        if(scope&&path!=='/wallet/benefits'&&serviceState(db,actor.company_id,scope)!=='ACTIVE') {
          if(path==='/wallet'&&method==='GET'&&actor.kind==='OWNER')return redirect(res,'/plans/wallet');
          if(method==='GET'&&!api){company=companyFor(db,actor);return render({title:serviceCatalog[scope].name,body:inactiveServicePage(actor,scope)},409);}
          requireService(db,actor.company_id,scope);
        }
      }

      if (actor.kind === 'COLLABORATOR') cash = db.get(
        "SELECT branch_name,purchases,rewards FROM cash_grants WHERE account_id=? AND company_id=? AND status='ACTIVE'",actor.id,actor.company_id);
      if (path.startsWith('/wallet-api/')||path.startsWith('/management-api/')) {
        const management=path.startsWith('/management-api/');
        const body=method==='GET'?undefined:await readJson(req);
        actor=getSession(db,cookie);
        requireThat(actor,'Tu sesión terminó. Ingresa nuevamente.',401);
        requireThat(equal(actor.csrf,req.headers['x-lumina-csrf']),'Tu sesión de Wallet cambió. Abre de nuevo Wallet.',403);
        if(req.headers['x-lumina-company'])actor={...actor,wallet_company:req.headers['x-lumina-company']};
        const result=await wallets.proxy(actor,path.slice((management?'/management-api':'/wallet-api').length),{method,body,query:target.search,key:req.headers['idempotency-key'],surface:management?'management':'wallet'});
        return send(res,result.status,result.bytes,result.type);
      }
      if (method==='GET' && (path.startsWith('/wallet/art/') || path.startsWith('/wallet/brand/') || /^\/api\/public\/[a-z0-9-]+\/qr$/.test(path))) {
        if(target.searchParams.has('company')){actor={...actor,wallet_company:target.searchParams.get('company')};target.searchParams.delete('company');}
        const result=await wallets.artwork(actor,path,target.search);return send(res,200,result.bytes,result.type);
      }
      if (method==='GET' && path.startsWith('/loyalty-assets/')) {
        const name=path.slice('/loyalty-assets/'.length);
        return send(res,200,await wallets.asset(actor,name),cashierAssets[name]);
      }
      if(method==='GET' && path==='/platform')return redirect(res,'/wallet');
      if (method==='GET' && (path==='/wallet/management' || path==='/wallet' && actor.kind!=='AGENCY' && (walletSections(actor).length || cash))) {
        if(actor.kind==='COLLABORATOR'&&cash&&path==='/wallet'&&!target.searchParams.has('section'))return redirect(res,'/cashier');
        requireThat(actor.kind!=='AGENCY','La agencia solo puede consultar Wallet desde la ficha del negocio.',403);
        company=companyFor(db,actor,target.searchParams.get('company'));
        actor={...actor,wallet_company:company.id};
        const sections=walletSections(actor);
        requireThat(actor.kind!=='COLLABORATOR'||sections.length,'Tu cuenta no tiene áreas operativas de Wallet.',403);
        const section=target.searchParams.get('section')||(actor.kind==='COLLABORATOR'?sections[0]:path==='/wallet'?'overview':'design');
        if(Object.hasOwn(centralPaths,section)){requireThat(actor.kind==='OWNER'||section==='reports'&&canReadFidelityReport(actor),'No tienes acceso a esta área.',403);return redirect(res,centralPaths[section]);}
        requireThat(sections.includes(section),'No tienes acceso a esta área de Wallet.',403);
        try { await wallets.validate(actor); }
        catch(issue) {
          if(!(issue instanceof Problem))throw issue;
          if(issue.status===423)return render({title:'Wallet suspendida',body:card('Wallet suspendida',actor.kind==='OWNER'?'<p>Consulta el estado de tu suscripción y los cargos de Wallet que requieren atención.</p>'+localLink('/plans/wallet','Revisar mi suscripción','btn'):'<p>Comunícate con el dueño del negocio para revisar la suscripción.</p>')},423);
          const blocked=actor.kind==='OWNER'?db.all("SELECT w.account_id,a.name,a.revision FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE w.company_id=? AND w.status='BLOCKED' AND a.active=1 AND a.kind IN ('OWNER','COLLABORATOR')",company.id):[];
          return render({title:'Abrir Wallet',body:walletPage({actor,company,error:issue.status>=500?'Wallet no está disponible en este momento. Tu cuenta y tus tarjetas se conservan. Vuelve a intentarlo en unos minutos.':issue.message,blocked})},issue.status);
        }
        company=companyFor(db,actor,company.id);
        return send(res,200,loyaltyWorkspaceHtml(actor,section,sections,company,cash));
      }
      if (method==='GET' && /^\/join\/[a-z0-9-]+$/.test(path)) {
        if(target.searchParams.has('company')){actor={...actor,wallet_company:target.searchParams.get('company')};target.searchParams.delete('company');}
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
      if (method==='GET' && path==='/cashier') {
        const grant=bridge.activeGrant(actor);
        await bridge.proxy(actor,'/api/staff/dashboard',{method:'GET'});
        return send(res,200,cashierHtml(actor,companyFor(db,actor),grant));
      }
      if (method==='GET' && path.startsWith('/cashier-assets/')) {
        const name = path.slice('/cashier-assets/'.length);
        return send(res,200,await bridge.asset(actor,name),cashierAssets[name]);
      }
      const uploadMatch=path.match(/^\/requests\/([^/]+)\/pieces\/([^/]+)\/upload$/);
      if(method==='POST'&&uploadMatch) {
        requireThat(actor.kind==='AGENCY'&&agencyWork&&!actor.readOnlyCompany,'Solo Lúmina adjunta entregables desde Producción.',403);
        requireThat(fileStore,'Las cargas de archivos aún no están configuradas.',503);
        company=companyFor(db,actor,target.searchParams.get('company'));
        requireOperating(db,company.id);
        requireThat(isId(uploadMatch[1])&&isId(uploadMatch[2]),'Entregable no encontrado.',404);
        getPiece(db,company.id,getRequest(db,actor,company.id,uploadMatch[1]).id,uploadMatch[2]);
        limit(db,'upload:'+actor.id,30);
        requireThat(uploadsInProgress<2,'Hay otras cargas en curso. Reintenta en un momento.',503);
        uploadsInProgress++;
        try {
        const upload=await fileStore.receive(req);
        let keep=false;
        try {
          requireThat(equal(actor.csrf,upload.fields._csrf),'El formulario venció. Abre la entrega y reintenta.',403);
          await upload.commit();
          actor=getSession(db,cookie);
          requireThat(actor,'Tu sesión terminó. Ingresa nuevamente.',401);
          actor={...actor,agencyWork,readOnlyCompany:false};
          requireThat(equal(actor.csrf,upload.fields._csrf),'Tu sesión cambió. Reintenta desde la entrega.',403);
          company=companyFor(db,actor,target.searchParams.get('company'));
          const saved=saveFile(db,actor,company,uploadMatch[1],uploadMatch[2],upload);
          keep=!saved.duplicate;
          return redirect(res,pathFor(actor,company)('/requests/'+uploadMatch[1])+'#piece-'+uploadMatch[2]);
        }finally{if(!keep)await upload.remove();}
        }catch(issue){
          if(!(issue instanceof Problem)||![400,409,413,415].includes(issue.status))throw issue;
          actor=getSession(db,cookie);requireThat(actor&&actor.kind==='AGENCY','Tu sesión terminó. Ingresa nuevamente.',401);
          actor={...actor,agencyWork,readOnlyCompany:false};company=companyFor(db,actor,target.searchParams.get('company'));
          requireOperating(db,company.id);
          const latest=getRequest(db,actor,company.id,uploadMatch[1]);
          return render(getRequestPage(db,actor,company,pathFor(actor,company),latest,{action:'/pieces/'+uploadMatch[2]+'/upload',values:{},error:issue.message+' Selecciona el archivo de nuevo para reintentar.'}),issue.status);
        }finally{uploadsInProgress--;}
      }
      let data;
      if (method==='POST') {
        data = await readForm(req);
        actor = getSession(db,cookie);
        requireThat(actor,'Tu sesión terminó. Vuelve a iniciar sesión.',401);
        const businessState=scopedCompany?operationState(db,scopedCompany):null;
        actor={...actor,agencyWork,businessState,businessBlocked:Boolean(businessState&&businessState!=='ACTIVE'),
          readOnlyCompany:actor.kind==='AGENCY'&&Boolean(target.searchParams.get('company'))&&(!agencyWork||businessState!=='ACTIVE')};
        requireThat(equal(actor.csrf,data._csrf),'El formulario venció. Abre la página y reintenta.',403);
        if(!serviceAllowed())requireOperating(db,actor.kind==='AGENCY'?target.searchParams.get('company'):actor.company_id);
      }
      if(method==='POST'&&actor.kind==='AGENCY'&&target.searchParams.get('company')&&!agencyWork&&!['/logout','/account/password'].includes(path)) {
        throw new Problem('La ficha del negocio es de solo lectura para la agencia.',403);
      }
      if (path==='/logout' && method==='POST') {
        wallets.forget(actor);
        logout(db,actor);
        res.setHeader('Set-Cookie',sessionCookie('',trusted.protocol==='https:'));
        return redirect(res,'/');
      }
      if(path==='/account/contact' && method==='POST') {
        try { updateContact(db,actor,data);return redirect(res,'/account?contact=saved'); }
        catch(issue){if(!(issue instanceof Problem))throw issue;return render({title:'Mi cuenta',body:accountPage(actor,{contactValues:data,contactError:issue.message})},issue.status);}
      }
      if(path==='/account/identity') {
        if(actor.document)return redirect(res,'/account');
        if(method==='POST') {
          try { limit(db,'claim-identity:'+actor.id,6);return startSession(await claimIdentity(db,actor,data),'/account'); }
          catch(issue){if(!(issue instanceof Problem))throw issue;return render({title:'Actualiza tu acceso',body:identityMigrationPage(actor,data,issue.message)},issue.status);}
        }
        return render({title:'Actualiza tu acceso',body:identityMigrationPage(actor)});
      }
      if(path==='/courtesy'&&method==='GET') {
        requireOwner(actor);company=companyFor(db,actor);
        const state=courtesyState(db,company.id);
        if(state.status==='requested')return redirect(res,'/requests/'+state.request.id);
        return render(courtesyOwnerPage(actor,company,state));
      }
      if(path==='/courtesy/display'&&method==='POST') {
        requireOwner(actor);
        const compact=setCourtesyDisplay(db,actor,data.compact);
        if(req.headers.accept==='application/json')return json(res,200,{compact});
        const raw=data.return_to||'';
        const destination=/^\/[a-z]/i.test(raw)&&!/[\\\x00-\x1f]/.test(raw)?new URL(raw,origin):null;
        return redirect(res,destination?.origin===origin&&/^\/[a-z]/i.test(destination.pathname)?destination.pathname+destination.search:'/home');
      }
      if(path==='/services'||path==='/services/activate'||path==='/welcome') {
        requireThat(actor.kind!=='AGENCY','Esta bienvenida pertenece al negocio y su equipo.',403);
        company=companyFor(db,actor);
        if(path==='/welcome') {
          if(method==='GET')return render({title:'Bienvenido a Lúmina',body:welcomePage(actor,{cash})});
          if(actor.kind==='COLLABORATOR'){requireThat(!data.service,'Solo el dueño activa servicios.',403);finishWelcome(db,actor);return redirect(res,'/home');}
          if(data.service==='LATER'){finishWelcome(db,actor);return redirect(res,'/home');}
          beginService(db,actor,data.service);finishWelcome(db,actor);
          return redirect(res,data.service==='WALLET'?'/plans/wallet':serviceCatalog[data.service].path);
        }
        if(path==='/services'&&method==='GET')return render({title:'Mis servicios',body:actor.kind==='OWNER'?servicesPage(db,actor):collaboratorServicesPage(serviceStatus(db,actor,company.id))});
        requireOwner(actor);
        requireThat(path==='/services/activate'&&method==='POST','Acción no encontrada.',404);
        beginService(db,actor,data.service);
        return redirect(res,data.service==='WALLET'?'/plans/wallet':serviceCatalog[data.service].path);
      }
      if(path==='/wallet/benefits'&&method==='GET')return render({title:'Lúmina Wallet',body:walletComparison(actor)});
      if(path==='/help'&&method==='GET'&&target.searchParams.get('topic')==='payment'){
        requireOwner(actor);
        const provider=legalProfile(db);
        const contact=provider ? `<div class="actions"><a class="btn" href="mailto:${esc(provider.email)}?subject=Consulta%20de%20pago">Escribir a Lúmina</a><a class="btn secondary" href="tel:${esc(provider.phone.replace(/[^+0-9]/g,''))}">Llamar a Lúmina</a></div>`
          : '<p>Comunícate con la persona de Lúmina que atiende tu negocio.</p>';
        return render({title:'Consultar mi pago',body:card('¿Ya realizaste el pago?','<p>Indica el nombre de tu negocio, el importe, la fecha y la referencia del pago. Cuando Lúmina lo registre podrás consultar el comprobante en tu cuenta.</p>'+contact)+localLink('/billing?view=charges','Volver a mis cargos')});
      }
      if(path==='/help'&&method==='GET') {
        const provider=legalProfile(db);
        return render({title:'Ayuda de Lúmina',body:card('Soporte prioritario de Wallet',`<p>Indica el negocio, la sucursal y qué operación necesitas resolver. Damos prioridad a incidencias que impiden registrar compras o canjear.</p>${provider?`<div class="actions"><a class="btn" href="mailto:${esc(provider.email)}?subject=Soporte%20Wallet">${esc(provider.email)}</a><a class="btn secondary" href="tel:${esc(provider.phone.replace(/[^+0-9]/g,''))}">${esc(provider.phone)}</a></div>`:'<p>El contacto de Lúmina está pendiente de configuración.</p>'}<p class="muted">No compartas contraseñas ni datos completos de clientes.</p>`)});
      }
      const billingView=()=>{
        const offset=Number(target.searchParams.get('offset')||0);
        const view=target.searchParams.get('view')||(offset?'charges':'overview');
        requireThat(Number.isSafeInteger(offset)&&offset>=0&&offset<=1_000_000&&(['overview','charges','payments'].includes(view)||view==='wallet'&&actor.kind==='AGENCY'),'Página inválida.');
        return {offset:view==='overview'?0:offset,view};
      };
      const paymentReceipt=path.match(/^\/(billing|admin\/businesses\/([0-9a-f-]{36}))\/payments\/([0-9a-f-]{36})(\.txt)?$/i);
      if(paymentReceipt) {
        requireThat(method==='GET','Consulta no disponible.',405);
        const administration=Boolean(paymentReceipt[2]);
        if(administration)requireAgency(actor);else requireOwner(actor);
        company=companyFor(db,actor,paymentReceipt[2]);
        const receipt=administration?await wallets.administration(actor,company.id,'receipt',{id:paymentReceipt[3]}):await wallets.receipt(actor,paymentReceipt[3]);
        requireThat(receipt.payment?.id===paymentReceipt[3]&&receipt.business?.id===company.loyalty_tenant,'No se pudo verificar el comprobante.',502);
        const provider=legalProfile(db),base='/'+paymentReceipt[1];
        if(paymentReceipt[4]){res.setHeader('Content-Disposition','attachment; filename="comprobante-'+receipt.payment.id+'.txt"');return send(res,200,receiptText(receipt,provider),'text/plain; charset=utf-8');}
        return render({title:'Comprobante de pago',body:receiptPage(actor,receipt,base,provider)});
      }
      if(path==='/billing'&&method==='GET') {
        requireOwner(actor);company=companyFor(db,actor);
        const {offset,view}=billingView();
        const contracts=await pricedContracts(db,wallets,actor,company,contractsFor(db,company.id));
        let account;
        try{account=company.loyalty_tenant?await wallets.account(actor,offset):emptyAccount(company,localDay());}
        catch(error){if(!(error instanceof Problem))throw error;return render({title:'Mi cuenta y pagos',body:card('Saldo no disponible','<p>No pudimos consultar los cargos y pagos. Tus registros se conservan.</p>'+localLink('/billing','Reintentar','btn secondary'))+contractSummary(contracts,localDay())},503);}
        return render({title:'Mi cuenta y pagos',body:billingAccountPage(actor,account,'/billing','',{},{view,contracts,trial:inTrial()?trialChoice(db,company.id):null})});
      }
      const adminCourtesy=path.match(/^\/admin\/businesses\/([0-9a-f-]{36})\/courtesy$/i);
      if(adminCourtesy) {
        requireAgency(actor);company=companyFor(db,actor,adminCourtesy[1]);
        const show=(status=200,error='')=>render(courtesyAdminPage(actor,company,courtesyState(db,company.id),
          operationState(db,company.id)==='ACTIVE',data,error),status);
        if(method==='GET')return show();
        try {markCourtesyDelivered(db,actor,company,data);return redirect(res,path);}
        catch(issue){if(!(issue instanceof Problem)||![400,409].includes(issue.status))throw issue;return show(issue.status,issue.message);}
      }
      const administrationTeam=path.match(/^\/admin\/businesses\/([0-9a-f-]{36})\/team(?:\/|$)/i);
      if(administrationTeam) {
        requireAgency(actor);company=companyFor(db,actor,administrationTeam[1]);
        const freshActor=()=>teamAdministrator(db,getSession(db,cookie),company.id);
        return await teamRoutes({db,bridge,wallets,actor:freshActor(),company,path,method,data,query:target.searchParams,
          render,redirect:location=>redirect(res,location),freshActor});
      }
      const administration=path.match(/^\/admin\/businesses\/([0-9a-f-]{36})(?:\/(state|delete|restore|retry|payment|reverse|charge|void))?$/i);
      if(administration) {
        requireAgency(actor);company=companyFor(db,actor,administration[1]);
        const base='/admin/businesses/'+company.id;let issueText='';
        const panel=billingView();
        const view=async(status=200)=>{
          company=companyFor(db,actor,company.id);
          let account=company.loyalty_tenant?null:emptyAccount(company,localDay());if(company.loyalty_tenant)try{account=await wallets.administration(actor,company.id,'account',{offset:panel.offset});}catch(error){issueText=issueText||error.message;}
          const walletOnly=panel.view==='wallet';
          const commands=walletOnly?[]:db.all('SELECT * FROM business_commands WHERE company_id=? ORDER BY created_at DESC LIMIT 50',company.id);
          const details=walletOnly?{}:{courtesy:courtesyState(db,company.id),work:businessWorkSummary(db,actor,company.id),serviceStatus:serviceStatus(db,actor,company.id,{nativeAccess:account?.access??null}),contracts:await pricedContracts(db,wallets,actor,company,contractsFor(db,company.id))};
          return render({title:walletOnly?'Cobros de Wallet · '+company.name:'Administrar negocio',body:controlPage(actor,company,businessControl(db,company.id),commands,account,issueText,data||{},{...details,view:panel.view,action:method==='POST'?administration[2]:'',notice:{charge:'Cargo registrado.',reverse:'Registro de pago revertido.',void:'Cargo anulado.',state:'Estado actualizado.',delete:'Negocio eliminado. Su historial se conserva.',restore:'Negocio restaurado.',retry:'Sincronización confirmada.'}[target.searchParams.get('saved')]||''})},status);
        };
        if(method==='POST')try {
          let savedPayment=null;
          if(['payment','reverse','charge','void'].includes(administration[2])&&isId(data.requestKey)&&!db.get("SELECT seq FROM audit WHERE subject='BILLING_ATTEMPT' AND subject_id=? AND company_id=?",data.requestKey,company.id))event(db,actor,company.id,'BILLING_ATTEMPT',data.requestKey,'CUENTA_SOLICITADA',JSON.stringify({action:administration[2],invoice:data.invoiceId||null,payment:data.paymentId||null,reference:data.reference||null,reason:data.reason||null}),'WALLET');
          if(['state','delete','restore'].includes(administration[2])){
            requestBusinessChange(db,actor,company.id,{...data,operation:administration[2]==='delete'?'DELETE':administration[2]==='restore'?'RESTORE':'STATE',state:administration[2]==='delete'?'CLOSED':administration[2]==='restore'?'ACTIVE':data.state});await controls.sync(company.id);
          }
          else if(administration[2]==='retry'){requireThat(data.confirm==='yes','Confirma que deseas aplicar el cambio pendiente.');await controls.reconcile(company.id);}
          else if(administration[2]==='payment'){const payment=paymentInput(data);savedPayment=await wallets.administration(actor,company.id,'payments',{method:'POST',body:payment,key:data.requestKey});requireThat(isId(savedPayment.id),'No se pudo confirmar el comprobante. Reintenta el mismo pago.',502);}
          else if(administration[2]==='reverse'){requireThat(data.confirm==='yes'&&isId(data.paymentId)&&isId(data.requestKey),'Confirma la corrección.');await wallets.administration(actor,company.id,'reverse',{id:data.paymentId,method:'POST',body:{reason:text(data.reason,'motivo',5,500)},key:data.requestKey});}
          else if(administration[2]==='charge'){await wallets.administration(actor,company.id,'charges',{method:'POST',body:chargeInput(data),key:data.requestKey});}
          else if(administration[2]==='void'){requireThat(data.confirm==='yes'&&isId(data.invoiceId)&&isId(data.requestKey),'Confirma la anulación.');await wallets.administration(actor,company.id,'void',{id:data.invoiceId,method:'POST',body:{reason:text(data.reason,'motivo',5,500)},key:data.requestKey});}
          else throw new Problem('Acción no encontrada.',404);
          if(['payment','reverse','charge','void'].includes(administration[2])&&!db.get("SELECT seq FROM audit WHERE subject='BILLING' AND subject_id=? AND company_id=?",data.requestKey,company.id))event(db,actor,company.id,'BILLING',data.requestKey,'CUENTA_'+({payment:'PAGO',reverse:'REVERTIR',charge:'CARGO',void:'ANULAR'}[administration[2]]),JSON.stringify({invoice:data.invoiceId||null,payment:data.paymentId||null,reference:data.reference||null,reason:data.reason||null}),'WALLET');
          return redirect(res,savedPayment?base+'/payments/'+savedPayment.id:base+'?'+new URLSearchParams({view:administration[2]==='reverse'?'payments':['charge','void'].includes(administration[2])?'charges':'overview',saved:administration[2]}));
        }catch(issue){if(!(issue instanceof Problem))throw issue;issueText=issue.message;if(panel.view!=='wallet')panel.view=['payment','charge','void'].includes(administration[2])?'charges':administration[2]==='reverse'?'payments':panel.view;return view(issue.status);}
        requireThat(!administration[2],'Página no encontrada.',404);
        company=companyFor(db,actor,company.id);
        return view();
      }
      if(path==='/account/provider') {
        requireAgency(actor);
        if(method==='GET')return render({title:'Datos de Lúmina',body:legalProfilePage(actor,legalProfile(db))});
        try{saveLegalProfile(db,actor,data);return redirect(res,'/account');}
        catch(issue){if(!(issue instanceof Problem))throw issue;return render({title:'Revisa los datos',body:legalProfilePage(actor,data,issue.message)},issue.status);}
      }
      const showWalletPlans=(context=null,selectionError='',status=200)=>{
        if(inTrial())return render({title:'Mi suscripción de Wallet',body:walletCheckoutPage({actor,company,trial:trialChoice(db,company.id),error:selectionError,
          pending:Boolean(db.get('SELECT 1 FROM wallet_calendar_sync WHERE company_id=? AND sent<revision',company.id))})},status);
        const {account}=context;
        const filter=['wallet','packages'].includes(target.searchParams.get('offers'))?target.searchParams.get('offers'):'all';
        const plans=withEligibility(db,company.id,listPlans(db),account?.membership);
        const orders=openWalletOrders(db,company.id);
        return render({title:'Mi suscripción de Wallet',body:walletCheckoutPage({actor,company,...context,plans,orders,filter,selectionError})},status);
      };
      if(path.startsWith('/plans/wallet')) {
        requireOwner(actor);company=companyFor(db,actor);
        if(path==='/plans/wallet/choice' && method==='POST'){
          await commercialTurn(company.id,async()=>{
            const {choice}=data;
            requireThat(['start','stop','later'].includes(choice),'Elige una opción.');
            if(choice==='start'){
              requireThat(inTrial(),'La prueba gratuita terminó. Elige tu plan para continuar.',409);
              await wallets.prepareActivation(actor);
            }
            actor=getSession(db,cookie);requireThat(actor?.kind==='OWNER'&&actor.company_id===company.id&&equal(actor.csrf,data._csrf),'Tu sesión cambió. Vuelve a ingresar.',403);
            requireOperating(db,company.id);
            setChoice(db,actor,choice);
            if(choice!=='later')await syncCalendars(db,wallets.controlRemote);
          });
          const syncing=db.get('SELECT 1 FROM wallet_calendar_sync WHERE company_id=? AND sent<revision',company.id);
          return redirect(res,data.choice==='later'?'/home':data.choice==='start'&&!syncing?'/wallet':'/plans/wallet');
        }
        if(path==='/plans/wallet/stop'&&method==='POST') {
          requireThat(data.confirm==='yes','Confirma que deseas detener la renovación.');
          db.transaction(()=>{
            if(stopSchedule(db,company.id,data.schedule,localDay()))event(db,actor,company.id,'CONTRACT',data.schedule,'RENOVACIÓN_DETENIDA','Solicitud del dueño.');
          });
          await syncCalendars(db,wallets.controlRemote);
          return redirect(res,'/plans/wallet');
        }
        if(path==='/plans/wallet/resume'&&method==='POST') {
          await commercialTurn(company.id,async()=>{
            requireThat(data.confirm==='yes','Confirma la activación.');
            let nativeUntil=null;
            const hasAgreement=async()=>{
              if(inTrial())return trialChoice(db,company.id).enabled;
              if(paidWallet(db,company.id))return true;
              if(!company.loyalty_tenant)return false;
              const status=await wallets.subscription(actor);
              nativeUntil=status.endsOn||status.coveredUntil;
              return status.agreement?.activationOn>=paidFrom && nativeUntil>localDay();
            };
            requireThat(await hasAgreement(),'No hay un acuerdo Wallet vigente. Elige una oferta publicada.',409);
            await wallets.prepareActivation(actor);
            actor=getSession(db,cookie);requireThat(actor&&equal(actor.csrf,data._csrf),'Tu sesión cambió.',403);
            requireThat(await hasAgreement(),'El acuerdo cambió. Revisa tus servicios.',409);
            if(nativeUntil)db.run('INSERT INTO wallet_choices(company_id,legacy_until) VALUES(?,?) ON CONFLICT(company_id) DO UPDATE SET legacy_until=excluded.legacy_until',company.id,nativeUntil);
            beginService(db,actor,'WALLET');completeWalletActivation(db,actor);
          });
          return redirect(res,'/wallet');
        }
        // Historical signed subscriptions remain readable/cancellable. No new fixed
        // price subscription is offered alongside the agency's published catalogue.
        if(path==='/plans/wallet/accept')throw new Problem('La contratación de Wallet ahora usa las ofertas publicadas en Paquetes y servicios. Revisa y confirma tu selección allí.',409);
        if(path==='/plans/wallet/cancel'&&method==='POST') {
          requireThat(/^[0-9a-f-]{36}$/i.test(data.requestKey||''),'Recarga el formulario antes de continuar.');
          await commercialTurn(company.id,()=>wallets.subscription(actor,'cancel',{expectedVersion:Number(data.version),confirmed:data.confirm==='yes'},data.requestKey));
          return redirect(res,'/plans/wallet/legacy');
        }
        requireThat(method==='GET','Acción no encontrada.',404);
        if(['/plans/wallet/legacy','/plans/wallet/terms'].includes(path)) {
          requireThat(company.loyalty_tenant,'No hay un acuerdo anterior de Wallet.',404);
          const status=await wallets.subscription(actor);
          requireThat(status.accepted||status.legacy,'No hay un acuerdo anterior de Wallet. Elige una oferta publicada.',404);
          if(path==='/plans/wallet/terms') {
            requireThat(status.agreement&&!target.searchParams.has('offer'),'No hay condiciones aceptadas para descargar.',409);
            res.setHeader('Content-Disposition','attachment; filename="condiciones-wallet-lumina.txt"');
            return send(res,200,status.agreement.terms,'text/plain; charset=utf-8');
          }
          return render({title:'Tu acuerdo Wallet',body:subscriptionPage(actor,status,null,'',serviceState(db,company.id,'WALLET')==='ACTIVE')});
        }
        requireThat(['/plans/wallet','/plans/wallet/state'].includes(path),'Página no encontrada.',404);
        if(inTrial()){
          const trial=trialChoice(db,company.id);
          if(path==='/plans/wallet/state')return json(res,200,{active:trial.enabled,kind:'TRIAL',reminder:walletTrialReminder(trial.enabled),description:trial.enabled?'Prueba gratuita hasta el 31 de diciembre':'Prueba gratuita disponible'});
          return showWalletPlans();
        }
        const context=await walletPlanContext(db,wallets,actor,company);
        const {contracts,booked,active,legacy,error,account,pending}=context;
        if(path==='/plans/wallet/state') {
          if(error)return json(res,503,{description:error});
          const reminder=walletPaymentReminder(account);
          const description=reminder?reminder.title:contracts.length?'Wallet incluida en '+contracts.map(c=>c.name).join(', '):active?'Wallet activa':legacy?'Tu acuerdo anterior se conserva.':'Elige un plan para activar Wallet.';
          return json(res,200,{active,reminder,kind:contracts.length?'CATALOG':legacy?'LEGACY':'NONE',description});
        }
        return showWalletPlans(context);
      }
      if (['/wallet/connect','/wallet/disconnect','/team/loyalty/link','/wallet/link'].includes(path))throw new Problem('El acceso ahora usa tu cuenta de Lúmina. Abre Fidelización digital.',410);
      if(path==='/wallet/access'&&method==='GET') {
        requireOwner(actor);company=companyFor(db,actor,target.searchParams.get('company'));
        const blocked=db.all("SELECT w.account_id,a.name,a.revision FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE w.company_id=? AND w.status='BLOCKED' AND a.active=1 AND a.kind IN ('OWNER','COLLABORATOR')",company.id);
        return render({title:'Accesos de Wallet',body:walletPage({actor,company,blocked})});
      }
      if(path==='/wallet/repair'&&method==='POST'){requireOwner(actor);company=companyFor(db,actor,target.searchParams.get('company'));await wallets.repair(actor,company,data);return redirect(res,'/wallet');}
      if (path==='/wallet' && method==='GET') {
        requireThat(can(actor,'WALLET'),'No tienes permiso para consultar Wallet.',403);
        if(actor.kind!=='AGENCY'||target.searchParams.get('company'))company=companyFor(db,actor,target.searchParams.get('company'));
        let information=null,error='';
        if(company)actor={...actor,wallet_company:company.id};
        if(actor.kind==='AGENCY'||actor.kind==='OWNER'||walletSections(actor).length)try{
          information=await wallets.summary(actor);
          if(company)company=companyFor(db,actor,company.id);
        }catch(issue){if(!(issue instanceof Problem))throw issue;error=issue.message;}
        const companies=actor.kind==='AGENCY'&&!company?db.all('SELECT id,name FROM companies ORDER BY name,id'):[];
        const contact=company?db.get("SELECT a.name,c.phone FROM accounts a JOIN companies c ON c.id=a.company_id WHERE c.id=? AND a.kind='OWNER'",company.id):null;
        return render({title:'Fidelización digital',description:'Wallet de tu negocio, integrado en Lúmina.',
          body:walletPage({actor,company,contact,companies,data:information,error,blocked:actor.kind==='OWNER'&&company?db.all("SELECT w.account_id,a.name,a.revision FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE w.company_id=? AND w.status='BLOCKED' AND a.active=1 AND a.kind IN ('OWNER','COLLABORATOR')",company.id):[]})});
      }
      if (method==='GET' && ['/dashboard','/production','/agency-calendar'].includes(path)) {
        if(path==='/dashboard'&&actor.kind!=='AGENCY')return redirect(res,'/home');
        requireAgency(actor);
        if(path==='/production')return render({title:'Producción',description:'Busca trabajos por cliente, servicio o etapa.',body:agencyProduction(agencyProductionData(db,actor,target.searchParams))});
        if(path==='/agency-calendar')return render({title:'Agenda',body:workdayAgenda({actor,data:agendaData(db,actor,null,target.searchParams),url:pathFor(actor,null),global:true})});
        const instant=now();
        const visits=db.all(`SELECT v.*,r.title,c.name AS company_name FROM visits v JOIN requests r ON r.id=v.request_id AND r.company_id=v.company_id
          JOIN companies c ON c.id=v.company_id WHERE ${operatingSql()} AND v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at>=? ORDER BY v.starts_at,v.id LIMIT 5`,instant);
        const recent=db.all(`SELECT r.*,${requestBusinessSql},c.name AS company_name FROM requests r JOIN companies c ON c.id=r.company_id
          WHERE ${operatingSql()} ORDER BY r.created_at DESC,r.id DESC LIMIT 6`);
        const counts=db.get(`SELECT (SELECT count(*) FROM companies c WHERE ${operatingSql('c.id')}) AS companies,(SELECT count(*) FROM companies c WHERE approved=0 AND ${operatingSql('c.id')}) AS pending,
          (SELECT count(*) FROM requests r WHERE ${operatingSql()} AND status NOT IN ('CANCELLED','DELIVERED')) AS open,((SELECT count(*) FROM pieces WHERE status='DELIVERED')+(SELECT count(*) FROM courtesy_deliveries WHERE request_id IS NULL)) AS delivered,
          (SELECT count(*) FROM requests r WHERE NOT ${operatingSql()} AND status NOT IN ('CANCELLED','DELIVERED')) AS blocked,
          (SELECT count(*) FROM visits v JOIN requests r ON r.id=v.request_id AND r.company_id=v.company_id WHERE ${operatingSql()} AND v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at<?) AS missed,
          (SELECT count(*) FROM visits v JOIN requests r ON r.id=v.request_id AND r.company_id=v.company_id WHERE ${operatingSql()} AND v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at>=?) AS visits`,instant,instant);
        const pipeline=db.all(`SELECT status,count(*) AS count FROM requests r WHERE ${operatingSql()} GROUP BY status`);
        return render({title:'Jornada de la agencia',body:agencyOverview({counts,pipeline,visits,recent})});
      }
      if(method==='GET' && path.startsWith('/channels/')) {
        const channel=path.slice('/channels/'.length).toUpperCase();requireThat(Object.hasOwn(channels,channel),'Área no encontrada.',404);
        requireThat(can(actor,channel),'No tienes acceso a esta área.',403);
        if(actor.kind!=='AGENCY'||target.searchParams.get('company'))company=companyFor(db,actor,target.searchParams.get('company'));
        return redirect(res,pathFor(actor,company)(socialChannels.includes(channel)?'/content':channel==='WALLET'?'/wallet':'/services/'+channel.toLowerCase()));
      }
      if(method==='GET'&&path==='/content/recording') {
        requireAccess(actor,'SOCIAL','REQUEST');company=companyFor(db,actor);
        return render({layout:'content',contentView:'calendar',title:'Solicitar una grabación',body:card('Coordinemos la visita',recordingForm(actor,pathFor(actor,company),company.phone))});
      }
      if(method==='GET'&&path==='/content') {
        requireAccess(actor,'SOCIAL');
        if(actor.kind!=='AGENCY'||target.searchParams.get('company'))company=companyFor(db,actor,target.searchParams.get('company'));
        const url=pathFor(actor,company);
        if(target.searchParams.has('platform'))return redirect(res,url('/content'));
        const data=contentData(db,actor,company,target.searchParams);
        const agendaParams=new URLSearchParams(target.searchParams);agendaParams.set('view',target.searchParams.get('period')||'upcoming');
        const calendar=data.view==='calendar'?agendaData(db,actor,company?.id||null,agendaParams,true):null;
        const metricsHtml=data.view==='metrics'&&company?metricsPage(actor,url,analytics(db,actor,company.id,
          {from:target.searchParams.get('from'),to:target.searchParams.get('to')}),'/content'):'';
        return render({layout:'content',contentView:data.view,title:data.view==='overview'?'Tu espacio de contenido':data.title,description:'De la idea a la entrega, en un solo lugar.',body:contentPage({actor,company,url,data,metricsHtml,calendar,plans:actor.kind==='OWNER'?listPlans(db):[],contracts:actor.kind==='OWNER'&&company?contractsFor(db,company.id):[]})});
      }
      if(method==='GET'&&path.startsWith('/services/')) {
        const channel=path==='/content'?'SOCIAL':path.slice('/services/'.length).toUpperCase();
        requireThat(['SOCIAL','MAPS','WEB','BRAND'].includes(channel),'Área no encontrada.',404);requireAccess(actor,channel);
        if(actor.kind!=='AGENCY'||target.searchParams.get('company'))company=companyFor(db,actor,target.searchParams.get('company'));
        if(channel==='SOCIAL') return redirect(res,pathFor(actor,company)('/content'));
        const policy=requestAccessSql(actor);
        const rows=db.all(`SELECT r.*,${requestProgressSql},${requestBusinessSql},c.name AS company_name FROM requests r JOIN companies c ON c.id=r.company_id WHERE ${company?'1=1':operatingSql()} AND r.channel=? AND ${policy.sql}
          AND (? IS NULL OR r.company_id=?)
          ORDER BY r.created_at DESC,r.id LIMIT 100`,channel,...policy.params,company?.id||null,company?.id||null);
        return render({title:areas[channel],description:channel==='SOCIAL'?'Solicitudes, producción y entregas en un solo lugar.':'Servicios, proyectos y seguimiento.',
          body:channelWorkspace(channel,rows,pathFor(actor,company),Boolean(company)&&can(actor,channel,'REQUEST'),actor,company)});
      }
      const accountView=options=>({title:'Mi cuenta',body:(actor.kind==='AGENCY'?'<section class="card"><h2>Datos del proveedor</h2><a href="/account/provider" class="btn secondary">Identificación legal de Lúmina</a></section>':'')+accountPage(actor,{otherSessions:db.get('SELECT count(*) n FROM sessions WHERE account_id=? AND digest<>? AND expires_at>?',actor.id,actor.session_id,now()).n,...options})});
      if (path==='/account' && method==='GET') return render(accountView({notice:target.searchParams.get('contact')==='saved'?'Teléfono guardado.':target.searchParams.get('state')==='password'?'Contraseña actualizada.':target.searchParams.get('state')==='sessions'?'Se cerraron tus otras sesiones.':''}));
      if (path==='/account/sessions/close' && method==='POST') {
        db.run('DELETE FROM sessions WHERE account_id=? AND digest<>?',actor.id,actor.session_id);
        return redirect(res,'/account?state=sessions');
      }
      if (path==='/account/password' && method==='POST') {
        try {
          limit(db,'account-password:'+actor.id,6);
          requireThat(data.confirmation===data.password,'Las contraseñas nuevas no coinciden.');
          await changePassword(db,actor,data);
          return startSession(actor.id,'/account?state=password');
        } catch(error) {
          if(!(error instanceof Problem))throw error;
          return render(accountView({error:error.message}),error.status);
        }
      }
      if(path==='/businesses/wallet-outlook'||path==='/businesses/follow-up'){
        requireAgency(actor);
        requireThat(method==='GET','Esta consulta es de solo lectura.',405);
        const forecast=path.endsWith('wallet-outlook');
        const info=forecast?await agencyCut(db,wallets,actor,target.searchParams):await followUp(db,wallets,actor,target.searchParams);
        actor=getSession(db,cookie);requireThat(actor?.kind==='AGENCY','La sesión de la agencia cambió.',403);
        return render({title:forecast?'Previsión de cobros de Wallet':'Seguimiento de negocios',body:forecast?agencyOutlookPage(info):followUpPage(info)});
      }
      if (path==='/businesses' && method==='GET') {
        requireAgency(actor);
        return render({title:'Clientes',description:'Negocios, estados y contactos en un solo lugar.',body:businessDirectoryPage(businessDirectory(db,actor,target.searchParams))});
      }
      if (path==='/teams') {
        if(actor.kind==='OWNER'&&method==='GET')return redirect(res,'/team');
        requireAgency(actor);
        requireThat(method==='GET','La consulta de equipos es de solo lectura.',405);
        const directory=consultTeams(db,actor,target.searchParams);
        company=directory.company;
        return render({title:'Equipos y roles',body:teamsConsultationPage(directory)});
      }
      const calendarDownload=/^\/calendar\/visits\/([^/]+)\.ics$/.exec(path);
      if(calendarDownload) {
        requireThat(method==='GET','Descarga no disponible para esta acción.',405);
        const selected=actor.kind==='AGENCY'?target.searchParams.get('company'):actor.company_id;
        const visit=calendarVisit(db,actor,selected,calendarDownload[1]);
        res.setHeader('Content-Disposition','attachment; filename="recording-'+visit.id+'.ics"');
        return send(res,200,visitCalendar(visit),'text/calendar; charset=utf-8');
      }
      const companyId = target.searchParams.get('company');
      if(path==='/team'||path.startsWith('/team/'))requireOwner(actor);
      const catalog = ['/plans','/plans/withdraw','/plans/new','/plans/black-friday'].includes(path);
      if (actor.kind==='AGENCY' && !companyId && !catalog) {
        if (method==='GET' && path==='/home') return redirect(res,'/dashboard');
        throw new Problem('Selecciona un negocio desde Clientes.',404);
      }
      if (actor.kind!=='AGENCY' || companyId) company = companyFor(db,actor,companyId);
      const url = pathFor(actor,company);
      if(['/attention','/attention/seen','/attention/new'].includes(path)) {
        requireThat(actor.kind!=='AGENCY','Esta bandeja corresponde al negocio.',403);
        const mutation=path!=='/attention';
        requireThat(method===(mutation?'POST':'GET'),'Acción no disponible.',405);
        const params=mutation?new URLSearchParams(data):target.searchParams;
        const filters=notificationFilters(params);
        let account=null,billingUnavailable=false;
        if(actor.kind==='OWNER'&&company.loyalty_tenant)try{account=await wallets.account(actor);}catch{billingUnavailable=true;}
        actor=getSession(db,cookie);
        requireThat(actor&&actor.kind!=='AGENCY'&&actor.company_id===company.id,'Tu sesión cambió. Ingresa nuevamente.',403);
        requireOperating(db,company.id);
        if(mutation){
          requireThat(equal(actor.csrf,data._csrf),'Tu sesión cambió. Ingresa nuevamente.',403);
          (path==='/attention/seen'?seeNotification:reopenNotification)(db,actor,company.id,data,account);
          const result=notifications(db,actor,company.id,params,account);
          return redirect(res,notificationReturn({...filters,page:result.page}));
        }
        return render({title:'Pendientes',description:'Lo que necesita tu atención.',body:attentionPage({actor,data:{...notifications(db,actor,company.id,target.searchParams,account),billingUnavailable},url})});
      }
      if (path==='/home' && method==='GET') {
        if(!actor.welcome_done)return redirect(res,'/welcome');
        if(actor.kind==='AGENCY'&&actor.businessBlocked)return render({title:'Historial del negocio',
          body:card('Información conservada',`<p>Consulta las solicitudes y entregas anteriores de ${esc(company.name)}.</p><div class="actions">${localLink(url('/requests'),'Ver solicitudes','btn')}${localLink(url('/content',{view:'deliveries'}),'Ver entregas','btn secondary')}${localLink(url('/calendar',{view:'blocked'}),'Ver visitas detenidas','btn secondary')}</div>`) });
        const groups = requestCounts(db,actor,company.id);
        const policy=requestAccessSql(actor);
        const videos=db.all(`SELECT r.quantity,(SELECT count(*) FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='DELIVERED') AS delivered
          FROM requests r WHERE r.company_id=? AND ${policy.sql} AND r.service IN ('VIDEO','REEL','SHORT') AND r.type<>'VISIT' AND r.status<>'CANCELLED'
          UNION ALL SELECT 0 AS quantity,1 AS delivered FROM courtesy_deliveries WHERE company_id=? AND request_id IS NULL AND ?<>'COLLABORATOR'`,company.id,...policy.params,company.id,actor.kind);
        const upcoming=db.get(`SELECT count(*) AS count FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
          WHERE v.company_id=? AND ${policy.sql} AND v.status='SCHEDULED' AND r.status<>'CANCELLED' AND v.starts_at>=?`,company.id,...policy.params,now()).count;
        return render({title:actor.kind==='AGENCY'?'Información del negocio':'Mi jornada',
          body:(actor.kind==='OWNER'?campaignBanner(listPlans(db),url):'')+homePage({actor,company,url,groups,upcoming,cash,walletEntry:actor.kind==='OWNER'?walletHomeEntry(db,company):null,overview:actor.kind!=='AGENCY'?businessOverview(db,actor,company.id):null,
            videoRequested:videos.reduce((sum,row)=>sum+row.quantity,0),videoDelivered:videos.reduce((sum,row)=>sum+row.delivered,0)})});
      }
      if (path==='/businesses/verify' && method==='POST') {
        approveCompany(db,actor,company);
        return redirect(res,url('/home'));
      }
      if(method==='GET'&&path.startsWith('/management')) {
        if(path==='/management/reports'&&actor.kind==='COLLABORATOR') {
          requireThat(canReadFidelityReport(actor),'Tu acceso no incluye informes de fidelización.',403);
          const days=target.searchParams.get('days')||'30';requireThat(['7','30','90','365'].includes(days),'Período inválido.');
          const result=await wallets.proxy(actor,'/api/staff/metrics',{query:'?days='+days,surface:'management'});
          requireThat(result.status===200,'No se pudo consultar el informe.',result.status);
          return render({title:'Informes de fidelización',body:walletReportPage(JSON.parse(result.bytes))});
        }
        requireOwner(actor);
        if(path==='/management')return render({title:'Administración',body:managementPage()});
        if(path==='/management/view') {
          const section=target.searchParams.get('section');requireThat(Object.hasOwn(managementSections,section),'Sección no disponible.',404);
          await wallets.validate(actor);return send(res,200,managementDocument(actor,company,section));
        }
        const slug=path.slice('/management/'.length);requireThat(Object.hasOwn(managementTitles,slug),'Sección no disponible.',404);
        return render({title:managementTitles[slug],description:'Administración del negocio desde Lúmina.',body:managementFramePage(slug,target.searchParams)});
      }
      if(path==='/team'||path.startsWith('/team/'))return await teamRoutes({db,bridge,wallets,actor,company,path,method,data,
        query:target.searchParams,render,redirect:location=>redirect(res,location),freshActor:()=>getSession(db,cookie)});
      if(path==='/requests/new'&&method==='GET') {
        requireThat(actor.kind!=='AGENCY','Las solicitudes las realiza el negocio.',403);
        const area=target.searchParams.get('area')||'';
        requireThat(!area||Object.hasOwn(areas,area),'Servicio no disponible.',404);
        if(area)requireAccess(actor,area,'REQUEST');
        return render({layout:area==='SOCIAL'?'content':undefined,contentView:'requests',title:'Nueva solicitud',description:'Elige un servicio y cuéntanos tu idea.',body:newRequestPage({actor,url,area,values:{phone:company.phone},plans:actor.kind==='OWNER'?listPlans(db):[],contracts:actor.kind==='OWNER'?contractsFor(db,company.id):[]})});
      }
      if (path==='/requests') {
        if (method==='POST') {
          try {
            const id = createRequest(db,actor,company,data);
            return redirect(res,url('/requests/'+id));
          } catch(issue) {
            if(issue instanceof Problem && [400,409].includes(issue.status) && actor.kind==='OWNER' && data.type==='COURTESY') {
              const state=courtesyState(db,company.id);
              if(state.status==='delivered')return redirect(res,'/courtesy');
              if(state.status==='requested')return redirect(res,'/requests/'+state.request.id);
              return render(courtesyOwnerPage(actor,company,state,data,issue.message),issue.status);
            }
            if(!(issue instanceof Problem)||![400,409].includes(issue.status)||actor.kind==='AGENCY'||!Object.hasOwn(areas,data.channel)||!can(actor,data.channel,'REQUEST')||data.type==='PLAN')throw issue;
            return render({layout:data.channel==='SOCIAL'?'content':undefined,contentView:'requests',title:'Revisa tu solicitud',body:newRequestPage({actor,url,area:data.channel,plans:actor.kind==='OWNER'?listPlans(db):[],contracts:actor.kind==='OWNER'?contractsFor(db,company.id):[],values:data,error:issue.message})},issue.status);
          }
        }
        requireThat(Object.keys(channels).some(key=>can(actor,key)),'Tu acceso no incluye solicitudes de marketing.',403);
        const channel = target.searchParams.get('channel') || '';
        const currentPage = integer(target.searchParams.get('page') || '0','página',{max:10000});
        const q=text(target.searchParams.get('q')||'','búsqueda',0,100),state=target.searchParams.get('state')||'';
        const view=target.searchParams.get('view')||'all';
        const items = visibleRequests(db,actor,company.id,channel,currentPage,{q,state,view});
        return render({title:'Solicitudes',description:'Cotizaciones, contenido y visitas de tu negocio.',
          body:requestsPage({actor,url,...items,channel,q,state,view})});
      }
      const requestMatch = path.match(/^\/requests\/([^/]+)(.*)$/);
      if (requestMatch && isId(requestMatch[1])) {
        const [,requestId,rest] = requestMatch;
        const request = getRequest(db,actor,company.id,requestId);
        if (method==='GET' && !rest) return render(getRequestPage(db,actor,company,url,request));
        const fileMatch=rest.match(/^\/files\/([^/]+)$/);
        if(method==='GET'&&fileMatch&&isId(fileMatch[1])) {
          const file=db.get('SELECT f.* FROM content_files f JOIN pieces p ON p.id=f.piece_id AND p.company_id=f.company_id WHERE f.id=? AND f.company_id=? AND p.request_id=?',fileMatch[1],company.id,request.id);
          requireThat(file,'Archivo no encontrado.',404);requireThat(fileStore,'Las entregas no están disponibles.',503);
          return await fileStore.serve(req,res,file);
        }
        if (method==='POST') {
          const pieceMatch = rest.match(/^\/pieces\/([^/]+)\/(edit|review|evidence|publication|measure|comment)$/);
          try {
            if (Object.hasOwn(operations,rest)) operations[rest](db,actor,company,request,data);
            else if (pieceMatch && isId(pieceMatch[1])) {
              const piece = getPiece(db,company.id,request.id,pieceMatch[1]);
              pieceOperations[pieceMatch[2]](db,actor,company,request,piece,data);
            } else throw new Problem('Acción no encontrada.',404);
          } catch(issue) {
            // Access failures keep the generic response; only an authorized form
            // can recover its values, against a fresh, tenant-scoped request.
            if (!(issue instanceof Problem) || ![400,409].includes(issue.status)) throw issue;
            const latest=getRequest(db,actor,company.id,request.id);
            return render(getRequestPage(db,actor,company,url,latest,{action:rest,values:data,error:issue.message}),issue.status);
          }
          const anchor=pieceMatch?'#piece-'+pieceMatch[1]:rest.startsWith('/visits')?'#visits':rest==='/quote'||rest==='/accept'?'#quote':rest==='/pieces'?'#deliverables':'#details';
          return redirect(res,url('/requests/'+request.id)+anchor);
        }
      }
      if (path==='/calendar' && method==='GET') {
        requireThat(Object.keys(channels).some(key=>can(actor,key)),'Tu acceso no incluye agenda.',403);
        return render({title:'Agenda',body:workdayAgenda({actor,data:agendaData(db,actor,company.id,target.searchParams),url})});
      }
      if (path.startsWith('/plans')) {
        requireThat(actor.kind!=='COLLABORATOR','Tu acceso no incluye contratos ni precios.',403);
        if(path==='/plans/black-friday') {
          const screen=(values={},error='')=>campaignPage({actor,company,url,plans:actor.kind==='AGENCY'?listPlans(db,true):listPlans(db).map(p=>trialOffer(p)).filter(Boolean),bases:actor.kind==='AGENCY'?campaignBases(db):[],values,error});
          if(method==='GET')return render({title:'Viernes Negro',body:screen({base:target.searchParams.get('base')||''})});
          requireAgency(actor);requireThat(!actor.readOnlyCompany,'Publica desde el catálogo de Lúmina.',403);
          try { createCampaignOffer(db,actor,data);return redirect(res,url('/plans/black-friday')); }
          catch(issue){if(!(issue instanceof Problem)||![400,409].includes(issue.status))throw issue;return render({title:'Revisa tu promoción',body:screen(data,issue.message)},issue.status);}
        }
        if(method==='GET'&&path==='/plans/new') {requireAgency(actor);requireThat(!actor.readOnlyCompany,'Publica las ofertas desde el catálogo de Lúmina.',403);return render({title:'Crear oferta',body:offerEditor(actor,url)});}
        if (method==='GET' && path==='/plans') {
          let plans = listPlans(db,actor.kind==='AGENCY');
          const contracts = company ? contractsFor(db,company.id) : [];
          const view=target.searchParams.get('view')||'catalog';
          if(view==='catalog'&&actor.kind==='OWNER'){
            let native=null,unavailable=false,branches=company.loyalty_tenant?null:1;
            if(!inTrial() && company.loyalty_tenant && plans.some(p=>p.wallet!=='NONE'))try {
              const status=await wallets.subscription(actor);
              if(Array.isArray(status.branches)&&status.branches.length)branches=status.branches.length;
              if(status.agreement?.activationOn>=paidFrom || status.legacy&&status.recurring&&status.startsOn>=paidFrom)native={membership:{coveredUntil:status.coveredUntil,nextChargeOn:status.nextChargeOn,
                plan:{recurring:status.recurring,walletEndsOn:status.endsOn,intervalMonths:status.intervalMonths||(status.cycle==='ANNUAL'?12:1)}}};
            } catch(issue) {
              if(!(issue instanceof Problem) || ![404,503].includes(issue.status))throw issue;
              unavailable=true;
            }
            plans=withEligibility(db,company.id,plans.map(p=>trialOffer(p)).filter(Boolean),native?.membership).map(p=>standardIds.includes(p.id)?{...p,registeredBranches:branches}:p);
            if(unavailable)plans=plans.map(p=>p.wallet==='NONE'?p:{...p,blockedNow:'No se pudo consultar tu Wallet. Vuelve a intentarlo.',blockedNext:'No se pudo consultar tu Wallet. Vuelve a intentarlo.'});
          }
          requireThat(['catalog','agreements','orders'].includes(view),'Vista no encontrada.',404);
          const orders=ordersFor(db,actor,company,integer(target.searchParams.get('page')||'0','página',{min:0,max:100000}),target.searchParams.get('history')==='trial');
          return render({title:'Paquetes y servicios',description:'Combina servicios mensuales y trabajos puntuales, con cada precio y cupo claro.',
            body:packagesPage({actor,company,url,plans,contracts:view==='agreements'&&company?await pricedContracts(db,wallets,actor,company,contracts):contracts,orders,view})});
        }
        if(method==='POST'&&path==='/plans/request') {
          try{
            let walletNotBefore=null;
            if(!inTrial() && actor.kind==='OWNER' && company.loyalty_tenant) {
              const selected=listPlans(db).filter(p=>Number(data['qty_'+p.id])>0 && p.items.some(i=>i.service==='WALLET'));
              if(selected.length && !db.get('SELECT id FROM package_orders WHERE company_id=? AND submission_key=?',company.id,data.key||'')){
                const membership=(await wallets.account(actor)).membership;
                for(const line of selected){
                  const check=legacySelection(membership,line);
                  const message=data.start_when==='NEXT_MONTH'?check.next:check.now;
                  requireThat(!message,message,409);
                  walletNotBefore=check.until||null;
                }
                actor=getSession(db,cookie);
                requireThat(actor && equal(actor.csrf,data._csrf),'Tu sesión cambió. Vuelve a entrar.',403);
                requireOperating(db,company.id);
              }
            }
            const id=submitOrder(db,actor,company,data,walletNotBefore);
            return redirect(res,url('/plans/orders/'+id));
          }catch(issue){
            if(!(issue instanceof Problem)||actor?.kind!=='OWNER'||data.renewal)throw issue;
            if(data.source==='wallet' && [400,409,502,503].includes(issue.status)){
              const context=inTrial()?null:await walletPlanContext(db,wallets,actor,company);
              return showWalletPlans(context,issue.message,issue.status);
            }
            if(![400,409].includes(issue.status))throw issue;
            return render({title:'Revisa tu selección',body:packagesPage({actor,company,url,plans:withEligibility(db,company.id,listPlans(db).map(p=>trialOffer(p)).filter(Boolean)),contracts:contractsFor(db,company.id),orders:{rows:[],page:0,more:false},view:'catalog',values:data,error:issue.message})},issue.status);
          }
        }
        const orderMatch=path.match(/^\/plans\/orders\/([^/]+)(?:\/(quote|accept|activate|cancel))?$/);
        if(orderMatch&&isId(orderMatch[1])) {
          const [,id,action]=orderMatch;
          const order=getOrder(db,actor,company,id);
          const currentBranches=async()=>order.lines.some(l=>standardIds.includes(l.plan_id))&&['REQUESTED','QUOTED'].includes(order.status)&&company.loyalty_tenant?
            confirmedBranchCount(actor.kind==='AGENCY'?await wallets.administration(actor,company.id,'account'):await wallets.account(actor)):order.initial_branches||1;
          const reviewPage=async(candidate,options={})=>{
            const reviewed=walletCheckout(db,candidate,await currentBranches())||candidate;
            let comparison='';
            if(actor.kind==='OWNER'&&!reviewed.trial_archive&&['REQUESTED','QUOTED','ACCEPTED'].includes(reviewed.status)){
              const outlook=await accountOutlook(db,wallets,actor,company);
              comparison=planComparisonPanel(planComparison(db,company,reviewed,outlook));
            }
            return orderPage({actor,company,url,order:reviewed,comparison,...options,
              campaignLive:actor.kind==='OWNER'&&listPlans(db).some(p=>p.campaign&&trialOffer(p)),
              audit:db.all("SELECT * FROM audit WHERE company_id=? AND subject='ORDER' AND subject_id=? ORDER BY seq DESC LIMIT 100",company.id,id)});
          };
          if(method==='GET'&&!action){
            let walletAvailable=false,walletScheduled=false;
            if(actor.kind==='OWNER' && order.status==='ACTIVE' && includesWallet(order)){
              const seed=db.all(`SELECT c.id,c.schedule_id,c.order_line_id FROM contracts c
                JOIN package_order_lines l ON l.id=c.order_line_id WHERE c.company_id=? AND l.order_id=? AND c.cancelled_at IS NULL`,company.id,order.id);
              if(seed.length){
                const context=await walletPlanContext(db,wallets,actor,company);
                const belongsToOrder=contract=>seed.some(initial=>initial.id===contract.id || initial.schedule_id && initial.schedule_id===contract.schedule_id);
                walletScheduled=context.booked.some(belongsToOrder);
                walletAvailable=!actor.businessBlocked && context.active && !context.error && !context.pending && context.contracts.some(belongsToOrder);
              }
            }
            return render({title:order.lines.length===1&&includesWallet(order)?'Mi plan de Wallet':'Tu combinación de servicios',
            body:await reviewPage(order,{walletAvailable,walletScheduled})});
          }
          if(method==='POST'&&action) {
            try {
              await commercialTurn(company.id,async()=>{
                actor=getSession(db,cookie);requireThat(actor&&equal(actor.csrf,data._csrf),'Tu sesión cambió. Recarga para continuar.',403);
                requireOperating(db,company.id);
                const latest=getOrder(db,actor,company,id);
                if(action==='accept'&&(includesWallet(latest)||walletCheckout(db,latest))) {
                  let branches=await currentBranches();
                  const reviewed=validateWalletCheckout(db,actor,company,id,data,branches);
                  if(latest.status!=='ACTIVE'&&includesWallet(latest)) {
                    const account=await wallets.prepareActivation(actor);
                    if(latest.lines.some(line=>standardIds.includes(line.plan_id)))branches=confirmedBranchCount(account);
                    const raw=account.membership?.plan;
                    const previous=raw && (raw.walletAgreement?.activationOn||raw.startedOn||paidFrom)>=paidFrom?raw:null;
                    const coveredUntil=previous?.walletEndsOn || account.membership?.coveredUntil || account.membership?.nextChargeOn;
                    const duplicate=reviewed.lines.some(l=>legacySelection(account.membership,l).next);
                    requireThat(!duplicate,'Tu suscripción Wallet ya incluye esta modalidad.',409);
                    const replacement=latest.start_when==='NEXT_MONTH' && reviewed.lines.filter(l=>l.items.some(i=>i.service==='WALLET')).every(l=>!coveredUntil || l.starts_on>=coveredUntil);
                    requireThat(!previous||replacement||!previous.recurring&&previous.walletEndsOn&&previous.walletEndsOn<=localDay(),'Ya existe un acuerdo anterior de Wallet. Revísalo antes de contratar otro para evitar cargos duplicados.',409);
                  }
                  actor=getSession(db,cookie);requireThat(actor&&equal(actor.csrf,data._csrf),'Tu sesión cambió. Recarga para continuar.',403);
                  confirmWalletCheckout(db,actor,company,id,data,branches);
                  advanceCalendar(db);
                  await syncCalendars(db,wallets.controlRemote);
                  return;
                }
                if(company.loyalty_tenant&&['accept','activate'].includes(action)&&latest.lines.some(line=>line.wallet!=='NONE'||line.items?.some(item=>item.service==='WALLET'))) {
                  const account=actor.kind==='AGENCY'?await wallets.administration(actor,company.id,'account'):await wallets.account(actor);
                  const plan=account.membership?.plan;
                  requireThat(!plan?.recurring&&(!plan?.walletEndsOn||latest.lines.every(line=>line.starts_on>=plan.walletEndsOn)),'Wallet ya tiene una suscripción. Desactiva su renovación y programa el paquete después del período vigente para evitar cargos duplicados.',409);
                  requireOperating(db,company.id);
                }
                ({quote:offerOrder,accept:acceptOrder,activate:activateOrder,cancel:cancelOrder})[action](db,actor,company,id,data);
                if(action==='activate')advanceCalendar(db);
              });
              if(actor.kind==='OWNER'&&includesWallet(order)){
                if(action==='cancel'&&data.source==='wallet')return redirect(res,'/plans/wallet');
                if(action==='accept'){
                  const pendingSync=db.get('SELECT 1 FROM wallet_calendar_sync WHERE company_id=? AND sent<revision',company.id);
                  if(pendingSync)return redirect(res,'/plans/wallet');
                  if(data.source!=='wallet')return redirect(res,order.start_when==='NEXT_MONTH'?'/plans/wallet':'/wallet');
                }
              }
              return redirect(res,url('/plans/orders/'+id));
            } catch(issue) {
              if (!(issue instanceof Problem) || ![400,409,503].includes(issue.status)) throw issue;
              const refreshed=getOrder(db,actor,company,id);
              return render({title:refreshed.lines.length===1&&includesWallet(refreshed)?'Mi plan de Wallet':'Revisa tu propuesta',body:await reviewPage(refreshed,{values:action==='quote'?data:{revision:data.revision},error:issue.message})},issue.status);
            }
          }
        }
        if (method==='POST') {
          requireAgency(actor);
          if (path==='/plans') {try{createPlan(db,actor,data);}catch(issue){if(!(issue instanceof Problem)||![400,409].includes(issue.status)||data.catalog_version!=='SIMPLE')throw issue;return render({title:'Revisa la oferta',body:offerEditor(actor,url,data,issue.message)},issue.status);}}
          else if (path==='/plans/withdraw') hidePlan(db,actor,data.plan);
          else if (path==='/plans/activate') throw new Problem('La contratación se activa desde una propuesta aceptada por el dueño en Paquetes y servicios.',410);
          else if (path==='/plans/cancel') cancelContract(db,actor,company,data.contract,data.reason);
          else throw new Problem('Acción no encontrada.',404);
          return redirect(res,url('/plans'));
        }
      }
      if (path==='/reports' && method==='GET') {
        requireThat(socialChannels.some(key=>can(actor,key)),'Tu acceso no incluye métricas de redes.',403);
        const report = analytics(db,actor,company.id,{from:target.searchParams.get('from'),to:target.searchParams.get('to')});
        return render({title:'Métricas',description:'Seguimiento por canal y cobertura de las mediciones.',layout:'content',contentView:'metrics',body:metricsPage(actor,url,report)});
      }
      if (path.startsWith('/maps')) {
        requireAccess(actor,'MAPS');
        if (path==='/maps' && method==='GET') return render({title:'Google Maps',
          description:'Reseñas, borradores de respuesta y mediciones por ubicación.',
          body:mapsPage(actor,url,mapsData(db,actor,company.id))});
        if (method==='POST') {
          const action = {'/maps/location':addLocation,'/maps/measurement':addMapsMetric,'/maps/review':addReview}[path];
          requireThat(action,'Acción no encontrada.',404);
          action(db,actor,company,data);
          return redirect(res,url('/maps'));
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
      const back = actor ? (actor.kind==='AGENCY' ? '/dashboard' : '/home') : '/login';
      const title=status===404?'Página no disponible':status===403?'Acceso restringido':'Revisa la operación';
      return render({title,body:`<section class="card access-error"><p role="alert">${esc(message)}</p><div class="actions">${localLink(back,actor?'Volver a mi espacio':'Ingresar a Lúmina','btn')}${actor?localLink('/help','Ver ayuda','btn secondary'):''}</div></section>`},status);
    }
  });
  let retryRunning=false;
  const retry=()=>{if(retryRunning)return;retryRunning=true;Promise.resolve().then(()=>advanceCalendar(db)).then(()=>syncCalendars(db,wallets.controlRemote)).finally(()=>controls.sweep()).catch(()=>{}).finally(()=>{retryRunning=false;});};
  const timer=setInterval(retry,30000);timer.unref();server.once('listening',retry);server.once('close',()=>clearInterval(timer));
  return server;
}
