import { requireAgency } from '../access/accounts.mjs';
import { event, requireThat, socialChannels } from '../shared/domain.mjs';
import { platformTargets } from '../access/content-policy.mjs';
export function addTargets(db,actor,company,request,data) {
  requireAgency(actor);
  requireThat(request.channel==='SOCIAL' && request.status!=='CANCELLED','La solicitud no admite plataformas.',409);
  requireThat(String(request.revision)===data.revision,'La solicitud cambió. Recarga la ficha.',409);
  const selected=socialChannels.filter(p=>data['platform.'+p]==='yes');
  requireThat(selected.length,'Selecciona al menos una plataforma.');
  const additions=selected.filter(p=>!platformTargets(db,request).includes(p));
  if(!additions.length)return;
  db.transaction(()=>{
    for(const p of additions)db.run('INSERT INTO request_platforms VALUES(?,?,?)',company.id,request.id,p);
    db.run('UPDATE requests SET revision=revision+1 WHERE id=?',request.id);
    event(db,actor,company.id,'REQUEST',request.id,'PLATAFORMAS_AÑADIDAS',additions.join(', '),'SOCIAL');
  });
}
