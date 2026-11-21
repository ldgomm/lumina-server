import { requireAgency, requireOwner } from '../access/accounts.mjs';
import { requireOperating } from '../businesses/control.mjs';
import { event, httpsUrl, now, requireThat, uuid } from '../shared/domain.mjs';

export function courtesyState(db,companyId,accountId=null) {
  const request=db.get("SELECT id,title,status,revision FROM requests WHERE company_id=? AND type='COURTESY'",companyId);
  const delivery=db.get('SELECT delivered_at,video_url FROM courtesy_deliveries WHERE company_id=?',companyId);
  let status='available';
  if(delivery || request?.status==='DELIVERED')status='delivered';
  else if(request)status=request.status==='CANCELLED'?'cancelled':'requested';
  const compact=Boolean(accountId&&db.get('SELECT 1 FROM courtesy_display WHERE account_id=?',accountId));
  return {request,delivery,status,compact};
}

export function setCourtesyDisplay(db,actor,compact) {
  requireOwner(actor);
  requireThat(['0','1'].includes(compact),'Elige cómo mostrar tu video de cortesía.');
  if(compact==='1')db.run('INSERT INTO courtesy_display(account_id) VALUES(?) ON CONFLICT DO NOTHING',actor.id);
  else db.run('DELETE FROM courtesy_display WHERE account_id=?',actor.id);
  return compact==='1';
}

export function markCourtesyDelivered(db,actor,company,data) {
  requireAgency(actor);
  return db.transaction(()=>{
    requireOperating(db,company.id);
    const {request,status}=courtesyState(db,company.id);
    if(status==='delivered')return;
    requireThat(data.confirm==='yes','Confirma que el negocio ya recibió el video.');
    requireThat(data.request_id===(request?.id||'') && data.revision===String(request?.revision||0),
      'La solicitud cambió. Revisa el estado actual antes de confirmar la entrega.',409);
    const link=data.video_url?.trim()?httpsUrl(data.video_url):'';
    const deliveredAt=now();
    db.run('INSERT INTO courtesy_deliveries(company_id,request_id,actor_id,delivered_at,video_url) VALUES(?,?,?,?,?)',company.id,request?.id||null,actor.id,deliveredAt,link);
    if(request) {
      // An external handoff does not approve drafts on the customer's behalf.
      const approved=db.get("SELECT id FROM pieces WHERE company_id=? AND request_id=? AND status='APPROVED'",company.id,request.id);
      db.run("UPDATE pieces SET status='CANCELLED',revision=revision+1 WHERE company_id=? AND request_id=? AND status IN ('PRODUCTION','REVIEW')",company.id,request.id);
      const pieceId=approved?.id||uuid();
      if(approved)db.run("UPDATE pieces SET status='DELIVERED',revision=revision+1 WHERE id=?",pieceId);
      else db.run("INSERT INTO pieces(id,company_id,request_id,title,service,status,observations,created_at) VALUES(?,?,?,?,?,'DELIVERED',?,?)",
        pieceId,company.id,request.id,request.title,'VIDEO','Lúmina confirmó la entrega del video al negocio.',deliveredAt);
      if(link&&!db.get('SELECT id FROM evidence WHERE company_id=? AND piece_id=? AND url=?',company.id,pieceId,link))
        db.run('INSERT INTO evidence VALUES(?,?,?,?,?,?)',uuid(),company.id,pieceId,'Video de cortesía',link,deliveredAt);
      db.run("UPDATE visits SET status='CANCELLED',revision=revision+1 WHERE company_id=? AND request_id=? AND status='SCHEDULED'",company.id,request.id);
      db.run("UPDATE requests SET status='DELIVERED',revision=revision+1 WHERE company_id=? AND id=?",company.id,request.id);
    }
    event(db,actor,company.id,request?'REQUEST':'COMPANY',request?.id||company.id,'CORTESIA_ENTREGADA','Entrega del video de cortesía registrada por Lúmina.','SOCIAL');
  });
}
