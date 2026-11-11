import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomCode } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/security.mjs';
import { uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
import { cashierAssets } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/wallet/bridge.mjs';
import { close, listen } from './helpers.mjs';

export async function fakeLoyalty(t,webFolder = null) {
  const business = {id:uuid(),name:'Negocio conectado',slug:'negocio-conectado',timezone:'America/Guayaquil',currency:'USD'};
  const other = {id:uuid(),name:'Otro Loyalty',slug:'otro-loyalty',timezone:'America/Guayaquil',currency:'USD'};
  const branch = {id:uuid(),name:'Sucursal Centro',code:'CENTRO'};
  const secondBranch = {id:uuid(),name:'Sucursal Norte',code:'NORTE'};
  const foreignBranch = {id:uuid(),name:'Otra sucursal',code:'OTRA'};
  const branches = new Map([[business.id,[branch,secondBranch]],[other.id,[foreignBranch]]]);
  const staff = new Map();
  const tokens = new Map();
  const calls = [];
  let dropNextCreate = false;
  const issue = person => {
    if (person.token) tokens.delete(person.token);
    person.token = randomCode();
    tokens.set(person.token,person);
    return person.token;
  };
  const createOwner = company => {
    const person = {id:uuid(),role:'OWNER',branchId:null,name:'Dueño',contact:'',permissions:{purchases:true,rewards:true},
      version:1,state:'ACTIVE',company,requestId:null,token:null};
    staff.set(person.id,person);
    return issue(person);
  };
  const ownerToken = createOwner(business);
  const foreignToken = createOwner(other);
  const platformToken=randomCode();
  const health={configuration:{apple:true,google:true},summary:{total:2,attention:1,pending:1,accepted:1,unissued:0},items:[{name:'Cliente de prueba',provider:'APPLE',state:'PENDING',lastAcceptedAt:null}],hasMore:false};
  const json = (res,status,data) => {
    res.writeHead(status,{'Content-Type':'application/json'});
    res.end(JSON.stringify(data));
  };
  const fail = (res,status,code) => json(res,status,{code,message:code});
  const server = createServer(async (req,res)=>{
    const path = new URL(req.url,'http://127.0.0.1').pathname;
    const asset = path.slice(1);
    if (req.method==='GET' && webFolder && Object.hasOwn(cashierAssets,asset)) {
      res.writeHead(200,{'Content-Type':cashierAssets[asset]});
      return res.end(readFileSync(join(webFolder,asset)));
    }
    if(req.headers.authorization==='Bearer '+platformToken && path.startsWith('/api/platform/')) {
      calls.push({path,method:req.method,role:'PLATFORM'});
      if(path==='/api/platform/wallet/status')return json(res,200,{configuration:{apple:'CONFIGURED_DEVICE_TEST_REQUIRED',google:'CONFIGURED_DEVICE_TEST_REQUIRED'},passes:1});
      if(path==='/api/platform/overview')return json(res,200,{businesses:[{...business,clients:1,branches:2,state:'ACTIVE'}],summary:{businesses:1}});
      if(path==='/api/platform/tenants')return json(res,200,{items:[business,other]});
      const match=path.match(/^\/api\/platform\/tenants\/([^/]+)\/(branches|credentials|team)(?:\/([^/]+)\/actions)?$/);
      if(match) {
        const company=[business,other].find(b=>b.id===match[1]);if(!company)return fail(res,404,'NOT_FOUND');
        if(match[2]==='branches')return json(res,200,{business:company,branches:branches.get(company.id)});
        if(req.method==='GET'&&match[2]==='team')return json(res,200,{users:[...staff.values()].filter(u=>u.company.id===company.id).map(({token,company,requestId,...row})=>row)});
        let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);
        if(match[2]==='credentials') {
          const prior=[...staff.values()].find(u=>u.company.id===company.id&&u.requestId===data.requestId);
          if(prior)return json(res,201,{id:prior.id,replayed:true,credentialIssued:false});
          if(data.role!=='OWNER')return fail(res,400,'INVALID_ROLE');
          const entry={id:uuid(),role:'OWNER',name:data.name,branchId:null,contact:'',permissions:{purchases:true,rewards:true},version:1,state:'ACTIVE',company,requestId:data.requestId};
          staff.set(entry.id,entry);const token=issue(entry);
          if(dropNextCreate){dropNextCreate=false;return res.destroy();}
          return json(res,201,{id:entry.id,token,version:1,credentialIssued:true});
        }
        const target=staff.get(match[3]);if(!target||target.company.id!==company.id)return fail(res,404,'NOT_FOUND');
        if(target.version!==data.expectedVersion||!['ACTIVE','INACTIVE'].includes(target.state)||!['ROTATE','REACTIVATE'].includes(data.action))return fail(res,409,'VERSION_CONFLICT');
        target.state='ACTIVE';return json(res,200,{id:target.id,token:issue(target),version:++target.version,credentialIssued:true});
      }
      return json(res,200,{items:[]});
    }
    const p = tokens.get((req.headers.authorization || '').replace(/^Bearer /,''));
    calls.push({path,method:req.method,role:p?.role || null,actorId:p?.id || null});
    if (!p || p.state!=='ACTIVE') return fail(res,401,'UNAUTHORIZED');
    const b = branches.get(p.company.id);
    if (req.method==='GET' && path==='/api/staff/dashboard') return json(res,200,{
      business:p.company,role:p.role,branchId:p.branchId,permissions:p.permissions,
      branches:p.branchId ? b.filter(item=>item.id===p.branchId) : b,programs:[],rewards:[],
    });
    if (req.method==='GET' && path==='/api/staff/metrics' && p.role==='OWNER')return json(res,200,{days:30,fromDate:'2026-10-13',throughDate:'2026-11-11',totalClients:5,newClients:2,activeClients:3,repeatClients:1,purchases:7,redemptions:1,salesMinor:10500,branches:[],daily:[],topRewards:[]});
    if (req.method==='GET' && path==='/api/staff/wallet-health' && p.role==='OWNER')return json(res,200,health);
    if (req.method==='GET' && path==='/api/staff/wallet-design' && p.role==='OWNER')return json(res,200,{version:1,company:p.company.id});
    if (req.method==='GET' && path==='/api/staff/team' && p.role==='OWNER') return json(res,200,{
      users:[...staff.values()].filter(u=>u.company.id===p.company.id).map(({token,company,requestId,...row})=>row),
      currentUserId:p.id,branches:b,
    });
    if (req.method==='GET' && path==='/api/staff/access') return json(res,200,{canOperate:true});
    if (req.method==='GET' && path==='/api/staff/member-suggestions') return json(res,200,{items:[]});
    if (!['POST','PUT'].includes(req.method)) return fail(res,404,'NOT_FOUND');
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    if (path==='/api/staff/wallet/restore' && p.role==='OWNER')return json(res,200,{path:'/join/'+p.company.slug+'?restore=ficticio',qrData:'RklDVElDSU8='});
    if (path==='/api/staff/wallet-design' && p.role==='OWNER')return json(res,200,{version:data.version,company:p.company.id});
    if (path==='/api/staff/credentials' && p.role==='OWNER') {
      const prior = [...staff.values()].find(u=>u.company.id===p.company.id && u.requestId===data.requestId);
      if (prior) return json(res,201,{id:prior.id,credentialIssued:false,replayed:true});
      if (data.role!=='CASHIER' || !b.some(branch=>branch.id===data.branchId) ||
        !(data.permissions?.purchases || data.permissions?.rewards)) return fail(res,422,'BAD_GRANT');
      const entry = {id:uuid(),name:data.name,contact:'',role:data.role,branchId:data.branchId,permissions:data.permissions,
        version:1,state:'ACTIVE',company:p.company,requestId:data.requestId};
      staff.set(entry.id,entry);
      const token = issue(entry);
      if (dropNextCreate) { dropNextCreate = false; return res.destroy(); }
      return json(res,201,{id:entry.id,token,version:1,credentialIssued:true});
    }
    if (path.startsWith('/api/staff/team/') && p.role==='OWNER') {
      const target = staff.get(path.split('/')[4]);
      if (target?.company.id!==p.company.id) return fail(res,404,'NOT_FOUND');
      if (data.expectedVersion!==target.version) return fail(res,409,'VERSION_CONFLICT');
      if (req.method==='PUT') {
        if (data.role!=='CASHIER' || !b.some(branch=>branch.id===data.branchId)) return fail(res,403,'SCOPE');
        target.branchId = data.branchId;
        target.permissions = data.permissions;
        return json(res,200,{id:target.id,version:++target.version});
      }
      if (data.confirmed!==true) return fail(res,400,'CONFIRMATION_REQUIRED');
      if (data.action==='DEACTIVATE') {
        target.state = 'INACTIVE';
        tokens.delete(target.token);
        return json(res,200,{id:target.id,version:++target.version,credentialIssued:false});
      }
      if (data.action==='ROTATE' || data.action==='REACTIVATE') {
        target.state = 'ACTIVE';
        return json(res,200,{id:target.id,version:++target.version,token:issue(target),credentialIssued:true});
      }
    }
    if (path==='/api/staff/members/lookup') return json(res,200,{member:{id:uuid(),name:'Cliente de prueba',cardCode:'ficticio',revision:0},balances:[],rewards:[]});
    if (path==='/api/staff/purchases' && data.branchId===p.branchId && p.permissions.purchases) {
      return json(res,200,{purchaseId:uuid(),earned:[],recordedAt:new Date().toISOString(),amountMinor:data.amountMinor});
    }
    if (path==='/api/staff/counter-redemptions' && data.branchId===p.branchId && p.permissions.rewards) {
      return json(res,200,{redemptionId:uuid()});
    }
    return fail(res,403,'FORBIDDEN');
  });
  const origin = await listen(server);
  t.after(()=>close(server));
  return {origin,ownerToken,foreignToken,platformToken,branch,secondBranch,foreignBranch,staff,calls,business,
    loseCreateResponse:()=>{dropNextCreate = true;}};
}
