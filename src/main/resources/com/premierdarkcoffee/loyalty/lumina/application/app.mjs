import { requestAccessSql } from '../access/content-policy.mjs';
import { walletSections } from '../wallet/access-policy.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { activate, approveCompany, authenticate, can, changePassword, companyFor, createAgency, createSession, createTeamMember,
  getSession, limit, logout, manageAccount, register, requireAccess, requireAgency, requireOwner, teamList, teamMember, updateGrants } from '../access/accounts.mjs';
import { equal } from '../access/security.mjs';
import { activateContract, acceptQuote, cancelContract, contractsFor, createPlan, currentQuote, getPlan, hidePlan, listPlans, offerQuote } from '../memberships/billing.mjs';
import { channels, areas, integer, isId, now, Problem, requireThat, socialChannels, text } from '../shared/domain.mjs';
import { cashierAssets, createLoyaltyBridge } from '../wallet/bridge.mjs';
import { createWalletWorkspace } from '../wallet/wallet.mjs';
import { addEvidence, addPiece, addPublication, addVisit, createRequest, editPiece, finishVisit, getPiece, getRequest,
  requestCounts, reviewPiece, updateRequest, visibleRequests } from '../production/production.mjs';
import { addLocation, addMapsMetric, addReview, addSocialMetric, analytics, mapsData, publicationsFor } from '../analytics/reporting.mjs';
import { accountPage, invitePage, memberPage, publicPage, teamPage } from '../presentation/pages/account-pages.mjs';
import { card, esc, localLink, page, pathFor } from '../presentation/pages/components.mjs';
import { cookieFrom, json, readForm, readJson, redirect, securityHeaders, send, sessionCookie } from '../presentation/pages/http.mjs';
import { agendaPage, companiesPage, homePage, requestDetail, requestsPage } from '../presentation/pages/production-pages.mjs';
import { mapsPage, metricsPage, plansPage } from '../presentation/pages/service-pages.mjs';
import { loyaltyWorkspaceHtml, walletPage, walletReportPage } from '../presentation/pages/wallet-pages.mjs';
import { agencyAgenda, agencyOverview, agencyProduction, channelWorkspace, comingSoonPage } from '../presentation/pages/workspace-pages.mjs';

const assets = {
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
function cajaHtml() {
  const names = Object.keys(cashierAssets);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Loyalty · Caja de Lúmina</title>
    ${names.filter(name=>name.endsWith('.css')).map(name=>`<link rel="stylesheet" href="/caja-assets/${name}">`).join('')}
    ${names.filter(name=>name.endsWith('.js')).map(name=>`<script defer src="/caja-assets/${name}"></script>`).join('')}
    <script defer src="/assets/caja.js"></script></head><body><header><a class="brand" href="/inicio">Lúmina <span>Digital</span></a>
    <span class="pill">Loyalty · Caja</span><button id="exit" type="button" class="quiet" hidden>Volver al portal</button></header>
    <main id="app"><p>Abriendo Caja…</p></main><p id="notice" role="status" aria-live="polite"></p>
    <footer>Operaciones de Loyalty para la sucursal asignada</footer></body></html>`;
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
    body:requestDetail({actor,company,url,request,quote,pieces,visits,audit,contracts,plan})};
}

export function createPortal({ db, key, loyaltyUrl, publicOrigin = null, integration = {} }) {
  const bridge = createLoyaltyBridge({db,key,origin:loyaltyUrl});
  const wallets = createWalletWorkspace({db,key,origin:loyaltyUrl,integration});
  return createServer({requestTimeout:20_000,headersTimeout:10_000},async (req,res) => {
    let actor = null;
    let company = null;
    let path = '/';
    let cash = null;
    let api = false;
    const render = (view,status=200) => send(res,status,page({actor,company,path,cash,...view}));
    try {
      const origin = publicOrigin || `http://127.0.0.1:${req.socket.localPort}`;
      const trusted = new URL(origin);
      requireThat(req.headers.host === trusted.host && req.url?.startsWith('/') && !req.url.startsWith('//'),
        'Origen del portal inválido.',400);
      const target = new URL(req.url,origin);
      requireThat(target.origin === origin,'Ruta del portal inválida.');
      path = target.pathname;
      const method = req.method;
      api = path.startsWith('/api/') || path.startsWith('/wallet-api/');
      securityHeaders(res,['/caja','/platform','/wallet/gestion'].includes(path));
      requireThat(['GET','POST'].includes(method) || path.startsWith('/wallet-api/') && ['PUT','DELETE'].includes(method),'Método no permitido.',405);
      if (method!=='GET') requireThat(req.headers.origin === origin,'Esta acción requiere el formulario del portal.',403);
      if (method==='GET' && Object.hasOwn(sourceAssets,path)) {
        const asset = sourceAssets[path];
        return send(res,200,asset.body,asset.type);
      }
      if (method==='GET' && path==='/salud') return json(res,200,{status:'UP',service:'lumina-agency'});
      const cookie = cookieFrom(req);
      actor = getSession(db,cookie);
      const startSession = id => {
        if (actor) { wallets.forget(actor); logout(db,actor); }
        res.setHeader('Set-Cookie',sessionCookie(createSession(db,id),trusted.protocol==='https:'));
        return redirect(res,'/inicio');
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
        if (path==='/entrar') return startSession(await authenticate(db,data));
        if (path==='/registro') {
          const account=await register(db,key,data);
          const created=db.get('SELECT company_id FROM accounts WHERE id=?',account);
          try{await wallets.ensureCompany(created.company_id);}catch{} // Account survives an outage; opening Wallet retries the durable registration.
          return startSession(account);
        }
        if (path==='/activar') return startSession(await activate(db,data));
        return startSession(await createAgency(db,data));
      }
      if (!actor) {
        if (method==='GET' && !api) return redirect(res,'/');
        throw new Problem('Inicia sesión para continuar.',401);
      }
      if (actor.kind === 'COLLABORATOR') cash = db.get(
        "SELECT branch_name FROM cash_grants WHERE account_id=? AND company_id=? AND status='ACTIVE'",actor.id,actor.company_id);
      if (path.startsWith('/wallet-api/')) {
        const body=method==='GET'?undefined:await readJson(req);
        actor=getSession(db,cookie);
        requireThat(actor,'Tu sesión terminó. Ingresa nuevamente.',401);
        requireThat(equal(actor.csrf,req.headers['x-lumina-csrf']),'Tu sesión de Wallet cambió. Abre de nuevo Wallet.',403);
        if(req.headers['x-lumina-company'])actor={...actor,wallet_company:req.headers['x-lumina-company']};
        const result=await wallets.proxy(actor,path.slice('/wallet-api'.length),{method,body,query:target.search,key:req.headers['idempotency-key']});
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
      if (method==='GET' && path==='/wallet/gestion') {
        company=companyFor(db,actor,target.searchParams.get('empresa'));
        actor={...actor,wallet_company:company.id};
        const sections=walletSections(actor.kind==='AGENCY'?{...actor,kind:'OWNER'}:actor);
        requireThat(actor.kind!=='COLLABORATOR'||sections.length,'Tu cuenta no tiene áreas operativas de Wallet.',403);
        const section=target.searchParams.get('seccion')||(actor.kind==='COLLABORATOR'?sections[0]:'design');
        requireThat(actor.kind!=='COLLABORATOR'||sections.includes(section),'No tienes acceso a esta área de Wallet.',403);
        if(actor.kind==='COLLABORATOR'&&section==='reports') {
          const days=target.searchParams.get('dias')||'30';requireThat(['7','30','90','365'].includes(days),'Período inválido.');
          company=companyFor(db,actor);
          const result=await wallets.proxy(actor,'/api/staff/metrics',{query:'?days='+days});
          requireThat(result.status===200,'No se pudo consultar el informe.',result.status);
          return render({title:'Informes de fidelización',body:walletReportPage(JSON.parse(result.bytes))});
        }
        await wallets.validate(actor);
        return send(res,200,loyaltyWorkspaceHtml(actor,section,actor.kind==='COLLABORATOR'?sections:null,company));
      }
      if (method==='GET' && /^\/join\/[a-z0-9-]+$/.test(path)) {
        if(target.searchParams.has('empresa')){actor={...actor,wallet_company:target.searchParams.get('empresa')};target.searchParams.delete('empresa');}
        const dashboard=await wallets.validate(actor);
        requireThat((actor.kind==='AGENCY'&&actor.wallet_company||actor.kind==='OWNER'||actor.kind==='COLLABORATOR'&&(can(actor,'WALLET_CUSTOMERS','EDIT')||!target.search&&can(actor,'WALLET_DESIGN'))) && path==='/join/'+dashboard.business?.slug,'Negocio no encontrado.',404);
        return redirect(res,loyaltyUrl+path+target.search);
      }
      if (api) {
        const input = method==='POST' ? await readJson(req) : undefined;
        const idempotency = req.headers['idempotency-key'];
        requireThat(idempotency === undefined || /^[A-Za-z0-9_:-]{8,128}$/.test(idempotency),'Referencia de operación inválida.');
        return json(res,200,await bridge.proxy(actor,path,{method,body:input,query:target.searchParams,idempotency}));
      }
      if (method==='GET' && path==='/caja') {
        bridge.activeGrant(actor);
        return send(res,200,cajaHtml());
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
        requireThat(equal(actor.csrf,data._csrf),'El formulario venció. Abre la página y reintenta.',403);
      }
      if (path==='/salir' && method==='POST') {
        wallets.forget(actor);
        logout(db,actor);
        res.setHeader('Set-Cookie',sessionCookie('',trusted.protocol==='https:'));
        return redirect(res,'/');
      }
      if (['/wallet/conectar','/wallet/desconectar','/equipo/loyalty/vincular','/wallet/vincular'].includes(path))throw new Problem('El acceso ahora usa tu cuenta de Lúmina. Abre Fidelización digital.',410);
      if(path==='/wallet/reparar'&&method==='POST'){requireAgency(actor);company=companyFor(db,actor,target.searchParams.get('empresa'));await wallets.repair(actor,company,data);return redirect(res,'/wallet?empresa='+company.id);}
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
          body:walletPage({actor,company,contact,companies,data:information,error,blocked:actor.kind==='AGENCY'&&company?db.all("SELECT w.account_id,a.name FROM wallet_access w JOIN accounts a ON a.id=w.account_id WHERE w.company_id=? AND w.status='BLOCKED' AND a.active=1",company.id):[]})});
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
      if(method==='GET'&&(path==='/contenido'||path.startsWith('/servicios/'))) {
        const channel=path==='/contenido'?'SOCIAL':path.slice('/servicios/'.length).toUpperCase();
        requireThat(['SOCIAL','MAPS','WEB','BRAND'].includes(channel),'Área no encontrada.',404);requireAccess(actor,channel);
        if(actor.kind!=='AGENCY'||target.searchParams.get('empresa'))company=companyFor(db,actor,target.searchParams.get('empresa'));
        if(channel==='SOCIAL' && target.searchParams.has('plataforma')) return redirect(res,pathFor(actor,company)('/contenido'));
        const policy=requestAccessSql(actor);
        const rows=db.all(`SELECT r.*,c.name AS company_name FROM requests r JOIN companies c ON c.id=r.company_id WHERE r.channel=? AND ${policy.sql}
          AND (? IS NULL OR r.company_id=?)
          ORDER BY r.created_at DESC,r.id LIMIT 100`,channel,...policy.params,company?.id||null,company?.id||null);
        return render({title:areas[channel],description:channel==='SOCIAL'?'Solicitudes, producción y entregas en un solo lugar.':'Servicios, proyectos y seguimiento.',
          body:channelWorkspace(channel,rows,pathFor(actor,company),Boolean(company)&&can(actor,channel,'REQUEST'))});
      }
      if (path==='/cuenta' && method==='GET') return render({title:'Mi cuenta',body:accountPage(actor)});
      if (path==='/cuenta/clave' && method==='POST') {
        await changePassword(db,actor,data);
        return startSession(actor.id);
      }
      if (path==='/clientes' && method==='GET') {
        requireAgency(actor);
        const q = text(target.searchParams.get('q') || '','búsqueda',0,100);
        const companies = db.all(`SELECT id,name,approved,phone,created_at FROM companies
          WHERE instr(lower(name),lower(?))>0 OR ?='' ORDER BY approved,name,id LIMIT 100`,q,q);
        return render({title:'Clientes',description:'Verifica registros y abre el espacio de trabajo de cada negocio.',body:companiesPage(companies,q)});
      }
      const companyId = target.searchParams.get('empresa');
      const catalog = ['/planes','/planes/retirar'].includes(path);
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
        return render({title:'Panel de trabajo',description:'Sigue el avance de los servicios y las actividades de tu negocio.',
          body:homePage({actor,company,url,groups,upcoming,courtesy,cash,
            videoRequested:videos.reduce((sum,row)=>sum+row.quantity,0),videoDelivered:videos.reduce((sum,row)=>sum+row.delivered,0)})});
      }
      if (path==='/clientes/verificar' && method==='POST') {
        approveCompany(db,actor,company);
        return redirect(res,url('/inicio'));
      }
      if (path==='/equipo' && method==='GET') {
        return render({title:'Equipo y accesos',description:'Asigna áreas, tareas y permisos de Caja por persona.',
          body:teamPage(actor,company,teamList(db,actor))});
      }
      if (path==='/equipo' && method==='POST') {
        const result = createTeamMember(db,actor,data);
        return render(teamInvitation(db,actor,result.id,result.code),201);
      }
      const teamMatch = path.match(/^\/equipo\/([^/]+)(?:\/(permisos|invitar|desactivar|caja\/(?:sucursales|guardar|revocar)))?$/);
      if (teamMatch && isId(teamMatch[1])) {
        const [,id,action] = teamMatch;
        const member = teamMember(db,actor,id);
        if (method==='GET' && !action) return render({title:member.name,body:memberPage(actor,company,member)});
        if (method==='POST') {
          if (action==='permisos') updateGrants(db,actor,id,data);
          if (action==='invitar') return render(teamInvitation(db,actor,id,manageAccount(db,actor,id,'INVITE')));
          if (action==='desactivar') {
            requireThat(data.confirm==='yes','Confirma la baja del acceso.');
            manageAccount(db,actor,id,'DISABLE');
          }
          if (action?.startsWith('caja/')) limit(db,'loyalty:'+actor.id,40);
          if (action==='caja/sucursales') {
            const branches = await bridge.branches(actor,await wallets.ownerCredential(actor));
            return render({title:member.name,body:memberPage(actor,company,member,branches)});
          }
          if (action==='caja/guardar') await bridge.configure(actor,id,{...data,credential:await wallets.ownerCredential(actor)});
          if (action==='caja/revocar') await bridge.revoke(actor,id,{...data,credential:await wallets.ownerCredential(actor)});
          requireThat(action,'Acción no encontrada.',404);
          return redirect(res,'/equipo/'+id);
        }
      }
      if (path==='/solicitudes') {
        if (method==='POST') {
          const id = createRequest(db,actor,company,data);
          return redirect(res,url('/solicitudes/'+id));
        }
        requireThat(Object.keys(channels).some(key=>can(actor,key)),'Tu acceso no incluye solicitudes de marketing.',403);
        const channel = target.searchParams.get('canal') || '';
        const currentPage = integer(target.searchParams.get('pagina') || '0','página',{max:10000});
        const items = visibleRequests(db,actor,company.id,channel,currentPage);
        return render({title:'Solicitudes',description:'Cotizaciones, contenido y visitas de tu negocio.',
          body:requestsPage({actor,url,...items,channel,page:currentPage})});
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
        if (method==='GET' && path==='/planes') {
          const plans = listPlans(db,actor.kind==='AGENCY');
          const contracts = company ? contractsFor(db,company.id) : [];
          return render({title:'Planes y servicios',description:'Membresías, acuerdos a medida y servicios individuales.',
            body:plansPage({actor,company,url,plans,contracts})});
        }
        if (method==='POST') {
          requireAgency(actor);
          if (path==='/planes') createPlan(db,actor,data);
          else if (path==='/planes/retirar') hidePlan(db,actor,data.plan);
          else if (path==='/planes/activar') activateContract(db,actor,company,data);
          else if (path==='/planes/cancelar') cancelContract(db,actor,company,data.contract,data.reason);
          else throw new Problem('Acción no encontrada.',404);
          return redirect(res,url('/planes'));
        }
      }
      if (path==='/reportes' && method==='GET') {
        requireThat(socialChannels.some(key=>can(actor,key)),'Tu acceso no incluye métricas de redes.',403);
        const report = analytics(db,actor,company.id,{from:target.searchParams.get('desde'),to:target.searchParams.get('hasta')});
        return render({title:'Métricas',description:'Seguimiento por canal y cobertura de las mediciones.',body:metricsPage(actor,url,report)});
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
}
