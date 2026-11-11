import { can } from './accounts.mjs';
import { areas, socialChannels } from '../shared/domain.mjs';
export function platformTargets(db,request) {
  return db.all('SELECT platform FROM request_platforms WHERE company_id=? AND request_id=? ORDER BY platform',request.company_id,request.id).map(row=>row.platform);
}
export function canRequest(actor,request,action='VIEW') {
  if (actor.kind!=='COLLABORATOR') return true;
  if (['PLAN','QUOTE','COURTESY'].includes(request.type)) return false;
  if (request.channel!=='SOCIAL') return can(actor,request.channel,action);
  if (actor.grants.some(g=>g.scope==='SOCIAL' && g.action===action)) return true;
  const targets=request.platforms || [];
  return targets.length>0 && (action==='VIEW' ? targets.some(p=>can(actor,p,action)) : targets.every(p=>can(actor,p,action)));
}
export function requestAccessSql(actor,alias='r') {
  if(actor.kind!=='COLLABORATOR')return {sql:'1=1',params:[]};
  const areasAllowed=Object.keys(areas).filter(scope=>scope!=='SOCIAL'&&can(actor,scope));
  const platforms=socialChannels.filter(scope=>can(actor,scope));
  const whole=actor.grants.some(g=>g.scope==='SOCIAL'&&g.action==='VIEW');
  const social=whole ? `${alias}.channel='SOCIAL'` : platforms.length ?
    `(${alias}.channel='SOCIAL' AND EXISTS(SELECT 1 FROM request_platforms rp WHERE rp.company_id=${alias}.company_id AND rp.request_id=${alias}.id AND rp.platform IN (${platforms.map(()=>'?').join(',')})))` : '0=1';
  const ordinary=areasAllowed.length?`${alias}.channel IN (${areasAllowed.map(()=>'?').join(',')})`:'0=1';
  return {sql:`(${alias}.type NOT IN ('PLAN','QUOTE','COURTESY') AND (${ordinary} OR ${social}))`,params:[...areasAllowed,...(whole?[]:platforms)]};
}
