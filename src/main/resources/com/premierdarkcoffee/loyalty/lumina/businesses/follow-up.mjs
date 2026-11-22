import { requireAgency } from '../access/accounts.mjs';
import { operatingSql } from './operation-state.mjs';
import { dateOnly, integer, isId, localDay, now, Problem, requireThat, text } from '../shared/domain.mjs';
import { accountOutlook, upcomingCut } from '../memberships/cut-outlook.mjs';

export async function agencyCut(db,wallets,actor,params) {
  requireAgency(actor);
  const q=text(params.get('q')||'','negocio',0,100),company=params.get('company')||'';
  const requested=integer(params.get('page')||'0','página',{max:100000});
  const today=localDay(),latest=upcomingCut(today);
  const month=params.get('month')||latest.slice(0,7);
  requireThat(/^\d{4}-\d{2}$/.test(month),'Selecciona un mes de corte.');
  const cut=dateOnly(month+'-01');
  requireThat(cut>='2027-02-01'&&cut<=latest,'Selecciona un corte disponible.');
  const where="FROM companies c WHERE instr(search_text(c.name),search_text(?))>0 AND (?='' OR c.id=?)";
  const total=db.get('SELECT count(*) n '+where,q,company,company).n;
  const size=12,page=Math.min(requested,Math.max(0,Math.ceil(total/size)-1)),rows=[];
  const amounts={expected:0,issued:0,paid:0,pending:0,unknownExpected:0,unknownBills:0};
  for(let offset=0;offset<total;offset+=12){
    const businesses=db.all('SELECT c.id,c.name,c.loyalty_tenant '+where+' ORDER BY search_text(c.name),c.id LIMIT 12 OFFSET ?',q,company,company,offset);
    for(let i=0;i<businesses.length;i+=4){
      const batch=await Promise.all(businesses.slice(i,i+4).map(async business=>{
        const outlook=await accountOutlook(db,wallets,actor,business,today,cut);
        const expected=outlook.available&&outlook.referenceAvailable!==false?outlook.lines.reduce((v,l)=>v+l.walletMinor,0):null;
        const bills=outlook.available&&Array.isArray(outlook.bills)?outlook.bills.filter(b=>!b.void):null;
        const issued=bills?.reduce((v,b)=>v+b.issued,0)??null,paid=bills?.reduce((v,b)=>v+b.paid,0)??null;
        return {...business,outlook,expected,issued,paid,pending:issued===null?null:issued-paid};
      }));
      for(const row of batch){
        if(row.expected===null)amounts.unknownExpected++;else amounts.expected+=row.expected;
        if(row.issued===null)amounts.unknownBills++;else{amounts.issued+=row.issued;amounts.paid+=row.paid;amounts.pending+=row.pending;}
        if(offset===page*size)rows.push(row);
      }
    }
  }
  return {q,company,total,page,size,rows,cut,latest,amounts};
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
    return withContacts(db,{q,view,total,page,size,rows,unavailable});
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
  return withContacts(db,{q,view,total,page,size,rows:rows.slice(page*size,(page+1)*size),unavailable});
}

function withContacts(db,data) {
  for(const row of data.rows){
    row.caseId=data.view==='courtesy'?row.request:row.loyalty_tenant;
    row.contacts=db.all('SELECT * FROM follow_up_contacts WHERE company_id=? AND kind=? AND case_id=? ORDER BY happened_at DESC,rowid DESC LIMIT 10',row.id,data.view,row.caseId);
  }
  return data;
}
export async function recordContact(db,wallets,actor,data) {
  requireAgency(actor);
  const kind=data.kind,company=data.company,caseId=data.case_id,key=data.request_key;
  requireThat(['courtesy','wallet'].includes(kind)&&[company,caseId,key].every(isId),'Abre de nuevo el caso.');
  const note=text(data.note,'acuerdo',2,500);
  const next=data.next_on?dateOnly(data.next_on,'próximo contacto'):null;
  function replay(){
    const prior=db.get('SELECT * FROM follow_up_contacts WHERE id=?',key);
    if(prior)requireThat(prior.company_id===company&&prior.kind===kind&&prior.case_id===caseId&&prior.actor_id===actor.id&&prior.note===note&&prior.next_on===next,'Ese contacto ya se guardó con otros datos.',409);
    return Boolean(prior);
  }
  if(replay())return;
  requireThat(!next||next>=localDay(),'Elige hoy o una fecha posterior.');
  const scope=operatingSql('c.id');
  const walletCase=()=>db.get(`SELECT 1 FROM companies c JOIN company_services s ON s.company_id=c.id WHERE c.id=? AND c.loyalty_tenant=? AND ${scope} AND s.service='WALLET' AND s.status='ACTIVE'`,company,caseId);
  if(kind==='wallet'){
    requireThat(walletCase(),'Este negocio ya no está en seguimiento.',409);
    const state=(await wallets.firstPurchases(actor,[caseId])).find(r=>r.tenant===caseId);
    requireThat(state&&state.active&&!state.purchased,'La primera compra ya se registró o Wallet está pendiente de verificación.',409);
  }
  db.transaction(()=>{
    if(replay())return;
    if(kind==='wallet')requireThat(walletCase(),'El negocio cambió durante la consulta.',409);
    if(kind==='courtesy')requireThat(db.get(`SELECT 1 FROM requests r JOIN companies c ON c.id=r.company_id WHERE c.id=? AND r.id=? AND ${scope} AND r.type='COURTESY' AND r.status NOT IN ('DELIVERED','CANCELLED') AND NOT EXISTS(SELECT 1 FROM courtesy_deliveries d WHERE d.company_id=c.id)`,company,caseId),'Este video ya salió de seguimiento.',409);
    const last=db.get('SELECT id FROM follow_up_contacts WHERE company_id=? AND kind=? AND case_id=? ORDER BY happened_at DESC,rowid DESC LIMIT 1',company,kind,caseId);
    requireThat((data.previous||'')===(last?.id||''),'Otra persona registró un contacto. Revisa el último acuerdo antes de guardar.',409);
    db.run('INSERT INTO follow_up_contacts VALUES(?,?,?,?,?,?,?,?,?)',key,company,kind,caseId,actor.id,actor.name,note,next,now());
  });
}
