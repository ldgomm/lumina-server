import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { activate, approveCompany, authenticate, can, changePassword, companyFor, createAgency, createSession, createTeamMember,
  getSession, limit, logout, manageAccount, register, requireAccess, requireAgency, requireOwner, teamList, teamMember, updateGrants } from './accounts/accounts.mjs';
import { equal } from './accounts/security.mjs';
import { activateContract, acceptQuote, cancelContract, contractsFor, createPlan, currentQuote, getPlan, hidePlan, listPlans, offerQuote } from './billing/billing.mjs';
import { channels, integer, isId, now, Problem, requireThat, socialChannels, text } from './domain.mjs';
import { cashierAssets, createLoyaltyBridge } from './loyalty/bridge.mjs';
import { addEvidence, addPiece, addPublication, addVisit, createRequest, editPiece, finishVisit, getPiece, getRequest,
  requestCounts, reviewPiece, updateRequest, visibleRequests } from './production/production.mjs';
import { addLocation, addMapsMetric, addReview, addSocialMetric, analytics, mapsData, publicationsFor } from './reporting/reporting.mjs';
import { accountPage, invitePage, memberPage, publicPage, teamPage } from './web/account-pages.mjs';
import { card, esc, localLink, page, pathFor } from './web/components.mjs';
import { cookieFrom, json, readForm, readJson, redirect, securityHeaders, send, sessionCookie } from './web/http.mjs';
import { agendaPage, companiesPage, homePage, requestDetail, requestsPage } from './web/production-pages.mjs';
import { mapsPage, metricsPage, plansPage } from './web/service-pages.mjs';

const assets = {
  '/assets/lumina.css': ['lumina.css','text/css; charset=utf-8'],
  '/assets/lumina.js': ['lumina.js','text/javascript; charset=utf-8'],
  '/assets/caja.js': ['caja.js','text/javascript; charset=utf-8'],
};
const sourceAssets = Object.fromEntries(Object.entries(assets).map(([path,[file,type]]) =>
  [path,{body:readFileSync(new URL('../public/'+file,import.meta.url)),type}]));
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
function visibleVisit(actor, row) {
  return can(actor,row.channel) && (actor.kind!=='COLLABORATOR' || !['QUOTE','COURTESY','PLAN'].includes(row.type));
}
function agendaRows(db,actor,companyId) {
  const scopes = Object.keys(channels).filter(channel=>can(actor,channel));
  if (!scopes.length) return [];
  return db.all(`SELECT v.*,r.title FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
    WHERE v.company_id=? AND r.channel IN (${scopes.map(()=>'?').join(',')})
    AND (?=0 OR r.type NOT IN ('QUOTE','COURTESY','PLAN'))
    ORDER BY CASE WHEN v.status='SCHEDULED' THEN 0 ELSE 1 END,
    CASE WHEN v.status='SCHEDULED' THEN v.starts_at END, v.starts_at DESC,v.id LIMIT 100`,
  companyId,...scopes,Number(actor.kind==='COLLABORATOR'));
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

export function createPortal({ db, key, loyaltyUrl, publicOrigin = null }) {
  const bridge = createLoyaltyBridge({db,key,origin:loyaltyUrl});
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
      api = path.startsWith('/api/');
      securityHeaders(res,path==='/caja');
      requireThat(['GET','POST'].includes(method),'Método no permitido.',405);
      if (method==='POST') requireThat(req.headers.origin === origin,'Esta acción requiere el formulario del portal.',403);
      if (method==='GET' && Object.hasOwn(sourceAssets,path)) {
        const asset = sourceAssets[path];
        return send(res,200,asset.body,asset.type);
      }
      if (method==='GET' && path==='/salud') return json(res,200,{status:'UP',service:'lumina-agency'});
      const cookie = cookieFrom(req);
      actor = getSession(db,cookie);
      const startSession = id => {
        if (actor) logout(db,actor);
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
        if (path==='/registro') return startSession(await register(db,key,data));
        if (path==='/activar') return startSession(await activate(db,data));
        return startSession(await createAgency(db,data));
      }
      if (!actor) {
        if (method==='GET' && !api) return redirect(res,'/');
        throw new Problem('Inicia sesión para continuar.',401);
      }
      if (actor.kind === 'COLLABORATOR') cash = db.get(
        "SELECT branch_name FROM cash_grants WHERE account_id=? AND company_id=? AND status='ACTIVE'",actor.id,actor.company_id);
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
        logout(db,actor);
        res.setHeader('Set-Cookie',sessionCookie('',trusted.protocol==='https:'));
        return redirect(res,'/');
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
        if (method==='GET' && path==='/inicio') return redirect(res,'/clientes');
        throw new Problem('Selecciona un negocio desde Clientes.',404);
      }
      if (actor.kind!=='AGENCY' || companyId) company = companyFor(db,actor,companyId);
      const url = pathFor(actor,company);
      if (path==='/inicio' && method==='GET') {
        const groups = requestCounts(db,actor,company.id);
        const videos = db.all(`SELECT r.channel,r.type,r.status,r.quantity,
          (SELECT count(*) FROM pieces p WHERE p.company_id=r.company_id AND p.request_id=r.id AND p.status='DELIVERED') AS delivered
          FROM requests r WHERE r.company_id=? AND r.service IN ('VIDEO','REEL','SHORT') AND r.type<>'VISIT'`,company.id)
          .filter(row=>visibleVisit(actor,row) && row.status!=='CANCELLED');
        const upcoming = db.all(`SELECT r.channel,r.type,count(*) AS count FROM visits v
          JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
          WHERE v.company_id=? AND v.status='SCHEDULED' AND v.starts_at>=? GROUP BY r.channel,r.type`,company.id,now())
          .filter(row=>visibleVisit(actor,row)).reduce((sum,row)=>sum+row.count,0);
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
        return render({title:'Equipo y accesos',description:'Asigna canales, acciones y permisos de Caja por persona.',
          body:teamPage(actor,company,teamList(db,actor))});
      }
      if (path==='/equipo' && method==='POST') {
        const result = createTeamMember(db,actor,data);
        return render(teamInvitation(db,actor,result.id,result.code),201);
      }
      if (path==='/equipo/loyalty/vincular' && method==='POST') {
        requireOwner(actor);
        limit(db,'loyalty:'+actor.id,40);
        await bridge.link(actor,data);
        return redirect(res,'/equipo');
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
            const branches = await bridge.branches(actor,data.credential);
            return render({title:member.name,body:memberPage(actor,company,member,branches)});
          }
          if (action==='caja/guardar') await bridge.configure(actor,id,data);
          if (action==='caja/revocar') await bridge.revoke(actor,id,data);
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
