import { createHash } from 'node:crypto';
import { requestAccessSql } from '../access/content-policy.mjs';
import { requireBusinessActor } from '../access/accounts.mjs';
import { businessOverview, attentionRows } from './overview.mjs';
import { integer, now, requireThat, text } from '../shared/domain.mjs';

export const notificationKinds={deliveries:'Entregas por revisar',quotes:'Cotizaciones',proposals:'Propuestas',visits:'Grabaciones próximas',payments:'Pagos pendientes'};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function notificationRows(db,actor,companyId,account=null) {
  requireBusinessActor(actor,{id:companyId});
  const result=attentionRows(businessOverview(db,actor,companyId)).map(row=>{
    let version;
    if(row.kind==='deliveries'){
      version=db.all("SELECT id,revision FROM pieces WHERE company_id=? AND request_id=? AND status='REVIEW' ORDER BY id",companyId,row.id);
      row={...row,path:row.path+'#piece-'+version[0].id};
    }else if(row.kind==='quotes')version=db.get("SELECT id,revision FROM quotes WHERE company_id=? AND request_id=? AND status='OFFERED'",companyId,row.id);
    else version=db.get('SELECT revision FROM package_orders WHERE company_id=? AND id=?',companyId,row.id);
    return {...row,key:row.kind+':'+row.id,fingerprint:fingerprint(version)};
  });
  const policy=requestAccessSql(actor),start=now(),end=new Date(Date.now()+7*86400000).toISOString();
  const visits=db.all(`SELECT v.id,v.revision,v.starts_at,v.place,r.title,r.id request_id FROM visits v
    JOIN requests r ON r.id=v.request_id AND r.company_id=v.company_id
    WHERE v.company_id=? AND v.status='SCHEDULED' AND v.starts_at>=? AND v.starts_at<?
    AND r.status<>'CANCELLED' AND ${policy.sql} ORDER BY v.starts_at,v.id`,companyId,start,end,...policy.params);
  for(const v of visits)result.push({key:'visits:'+v.id,kind:'visits',title:v.title,detail:v.place,created_at:v.starts_at,
    path:'/requests/'+v.request_id+'#visits',fingerprint:fingerprint([v.revision,v.starts_at,v.place])});
  if(actor.kind==='OWNER'&&account?.summary?.balanceMinor>0)result.push({key:'payments:balance',kind:'payments',title:'Tienes un saldo pendiente',
    amount:account.summary.balanceMinor,created_at:account.summary.nextDueOn?account.summary.nextDueOn+'T12:00:00-05:00':start,path:'/billing?view=charges',
    fingerprint:fingerprint([account.summary,...(account.invoices||[]).map(i=>[i.id,i.status,i.remainingMinor])])});
  const seen=new Map(db.all('SELECT notification_key,fingerprint FROM attention_seen WHERE account_id=?',actor.id).map(r=>[r.notification_key,r.fingerprint]));
  return result.map(row=>({...row,seen:seen.get(row.key)===row.fingerprint})).sort((a,b)=>Number(a.seen)-Number(b.seen)||a.created_at.localeCompare(b.created_at)||a.key.localeCompare(b.key));
}
export function notifications(db,actor,companyId,params=new URLSearchParams(),account=null) {
  const view=params.get('view')||'all',state=params.get('state')||'all',q=text(params.get('q')||'','búsqueda',0,100);
  requireThat(view==='all'||Object.hasOwn(notificationKinds,view),'Vista de pendientes no disponible.');
  requireThat(['all','new','seen'].includes(state),'Filtro de avisos inválido.');
  const requested=integer(params.get('page')||'0','página',{max:10000}),all=notificationRows(db,actor,companyId,account);
  const counts={all:all.length,...Object.fromEntries(Object.keys(notificationKinds).map(k=>[k,all.filter(r=>r.kind===k).length]))};
  const fold=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const filtered=all.filter(r=>(view==='all'||r.kind===view)&&(state==='all'||r.seen===(state==='seen'))&&fold(r.title).includes(fold(q)));
  const total=filtered.length,page=Math.min(requested,Math.max(0,Math.ceil(total/20)-1));
  return {view,state,q,counts,total,page,newCount:all.filter(r=>!r.seen).length,rows:filtered.slice(page*20,(page+1)*20)};
}
export function seeNotification(db,actor,companyId,data,account=null) {
  const row=notificationRows(db,actor,companyId,account).find(r=>r.key===data.key);
  requireThat(row&&row.fingerprint===data.fingerprint,'Este pendiente cambió. Actualiza la bandeja.',409);
  db.run(`INSERT INTO attention_seen VALUES(?,?,?,?) ON CONFLICT(account_id,notification_key)
    DO UPDATE SET fingerprint=excluded.fingerprint,seen_at=excluded.seen_at`,actor.id,row.key,row.fingerprint,now());
}
