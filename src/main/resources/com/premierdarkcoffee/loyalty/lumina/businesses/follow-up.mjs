import { requireAgency } from '../access/accounts.mjs';
import { operatingSql } from './operation-state.mjs';
import { integer, localDay, Problem, requireThat, text } from '../shared/domain.mjs';
import { accountOutlook, upcomingCut } from '../memberships/cut-outlook.mjs';

export async function agencyCut(db,wallets,actor,params) {
  requireAgency(actor);
  const q=text(params.get('q')||'','negocio',0,100),company=params.get('company')||'';
  const requested=integer(params.get('page')||'0','página',{max:100000});
  const where="FROM companies c WHERE instr(search_text(c.name),search_text(?))>0 AND (?='' OR c.id=?)";
  const total=db.get('SELECT count(*) n '+where,q,company,company).n;
  const size=12,page=Math.min(requested,Math.max(0,Math.ceil(total/size)-1));
  const companies=db.all('SELECT c.id,c.name,c.loyalty_tenant '+where+' ORDER BY search_text(c.name),c.id LIMIT ? OFFSET ?',q,company,company,size,page*size);
  const rows=[];
  for(let index=0;index<companies.length;index+=4){
    const part=await Promise.all(companies.slice(index,index+4).map(async business=>({...business,outlook:await accountOutlook(db,wallets,actor,business)})));
    rows.push(...part);
  }
  return {q,company,total,page,size,rows,cut:upcomingCut()};
}

export async function followUp(db,wallets,actor,params) {
  requireAgency(actor);
  const q=text(params.get('q')||'','negocio',0,100),view=params.get('view')||'courtesy';
  requireThat(['courtesy','wallet'].includes(view),'Vista de seguimiento no disponible.');
  const requested=integer(params.get('page')||'0','página',{max:100000});
  const scope=`${operatingSql('c.id')} AND instr(search_text(c.name),search_text(?))>0`;
  const size=25;
  let rows=[],unavailable=0,total;
  if(view==='courtesy'){
    const from=`FROM requests r JOIN companies c ON c.id=r.company_id
      WHERE ${scope} AND r.type='COURTESY' AND r.status NOT IN ('DELIVERED','CANCELLED')
      AND NOT EXISTS(SELECT 1 FROM courtesy_deliveries d WHERE d.company_id=c.id)`;
    total=db.get('SELECT count(*) n '+from,q).n;
    const page=Math.min(requested,Math.max(0,Math.ceil(total/size)-1));
    rows=db.all(`SELECT c.id,c.name,r.id AS request,
      coalesce((SELECT a.happened_at FROM audit a WHERE a.company_id=c.id AND a.subject_id=r.id AND a.action='CORTESIA_SOLICITADA_DE_NUEVO' ORDER BY a.seq DESC LIMIT 1),r.created_at) AS since ${from}
      ORDER BY since,c.name,c.id LIMIT ? OFFSET ?`,q,size,page*size);
    return {q,view,total,page,size,rows,unavailable};
  }
  const day=localDay();
  const candidates=db.all(`SELECT c.id,c.name,c.loyalty_tenant,
      (SELECT min(w.starts_on) FROM wallet_schedules w WHERE w.company_id=c.id AND w.consent_on IS NOT NULL AND w.starts_on<=?) AS first_paid,
      coalesce((SELECT a.happened_at FROM audit a WHERE a.company_id=c.id AND a.action='PRUEBA_ACTIVADA' ORDER BY a.seq DESC LIMIT 1),s.activated_at) AS since
    FROM companies c JOIN company_services s ON s.company_id=c.id
    WHERE ${scope} AND s.service='WALLET' AND s.status='ACTIVE' ORDER BY since,c.name,c.id`,day,q);
  for(let offset=0;offset<candidates.length;offset+=100){
    const group=candidates.slice(offset,offset+100),linked=group.filter(r=>r.loyalty_tenant);
    let states;
    try{states=new Map((linked.length?await wallets.firstPurchases(actor,linked.map(r=>r.loyalty_tenant)):[]).map(r=>[r.tenant,r]));}
    catch(e){
      if(!(e instanceof Problem)||![404,409,502,503].includes(e.status))throw e;
      states=new Map();
    }
    for(const row of group){
      const state=states.get(row.loyalty_tenant);
      if(!state){unavailable++;continue;}
      if(state.active&&state.purchased===false){
        // Post-trial accounts start a new paid period; the wait starts at the actual activation.
        if(row.first_paid&&row.first_paid>localDay(new Date(row.since)))row.since=row.first_paid+'T05:00:00.000Z';
        rows.push(row);
      }
    }
  }
  rows.sort((a,b)=>a.since.localeCompare(b.since)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  total=rows.length;
  const page=Math.min(requested,Math.max(0,Math.ceil(total/size)-1));
  return {q,view,total,page,size,rows:rows.slice(page*size,(page+1)*size),unavailable};
}
