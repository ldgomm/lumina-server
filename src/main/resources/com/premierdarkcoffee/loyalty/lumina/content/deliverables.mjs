import { canRequest } from '../access/content-policy.mjs';
import { requireOperating } from '../businesses/control.mjs';
import { requireService } from '../businesses/services.mjs';
import { checkRevision } from '../shared/revision.mjs';
import { event, isId, now, requireThat, text, uuid } from '../shared/domain.mjs';
import { getPiece, getRequest } from '../production/production.mjs';

export function fileDetails(db,company,piece) {
  const files=db.all('SELECT * FROM content_files WHERE company_id=? AND piece_id=? ORDER BY created_at DESC,version DESC,id',company,piece);
  const comments=db.all(`SELECT c.*,m.seconds,f.label AS file_label,f.version AS file_version, f.asset_id, x.comment_id AS correction, x.resolved_file, x.resolved_name, x.resolved_at, fixed.version AS resolved_version, fixed.label AS resolved_label FROM piece_comments c
    LEFT JOIN piece_corrections x ON x.comment_id=c.id
    LEFT JOIN content_files fixed ON fixed.id=x.resolved_file
    LEFT JOIN video_comment_moments m ON m.comment_id=c.id
    LEFT JOIN content_files f ON f.id=c.file_id AND f.company_id=c.company_id AND f.piece_id=c.piece_id
    WHERE c.company_id=? AND c.piece_id=? AND ((x.comment_id IS NOT NULL AND x.resolved_file IS NULL) OR c.id IN (SELECT id FROM piece_comments WHERE company_id=c.company_id AND piece_id=c.piece_id ORDER BY created_at DESC,id DESC LIMIT 100))
    ORDER BY (x.comment_id IS NOT NULL AND x.resolved_file IS NULL) DESC,c.created_at DESC,c.id DESC`,company,piece);
  const reviews=db.all(`SELECT revision,decision,note,actor_name,reviewed_at FROM piece_reviews
    WHERE company_id=? AND piece_id=? ORDER BY revision DESC`,company,piece);
  return {files,comments,reviews};
}
export function canComment(actor,request) {
  return actor.kind==='AGENCY'?!actor.readOnlyCompany:
    canRequest(actor,request,'REQUEST')||canRequest(actor,request,'APPROVE');
}
export function saveFile(db,actor,company,requestId,pieceId,upload) {
  requireThat(actor.kind==='AGENCY'&&actor.agencyWork&&!actor.readOnlyCompany,'Solo Lúmina puede adjuntar entregables desde Producción.',403);
  const data=upload.fields,label=text(data.label||upload.name,'nombre del archivo',2,100),asset=data.asset||'';
  requireThat(isId(data.request_key)&&(!asset||isId(asset)),'Abre de nuevo el formulario de carga.');
  return db.transaction(()=>{
    requireOperating(db,company.id);
    const request=getRequest(db,actor,company.id,requestId),piece=getPiece(db,company.id,request.id,pieceId);
    const old=db.get('SELECT * FROM content_files WHERE request_key=?',data.request_key);
    if(old){
      requireThat(old.company_id===company.id&&old.piece_id===piece.id&&old.actor_id===actor.id&&old.sha256===upload.sha256&&old.label===label&&old.original_name===upload.name&&(!asset||old.asset_id===asset),'Este formulario ya guardó otro archivo.',409);
      return {id:old.id,duplicate:true};
    }
    requireThat(company.approved&&request.status==='PRODUCTION'&&!['CANCELLED','DELIVERED'].includes(piece.status),'Este entregable ya no admite cambios. Revisa su estado.',409);
    requireThat(data.revision!==undefined,'Reabre el entregable antes de cargar una versión.',409);checkRevision(piece,data);
    const total=db.get('SELECT coalesce(sum(byte_size),0) n FROM content_files WHERE company_id=?',company.id).n;
    requireThat(total+upload.size<=5*1024**3,'El negocio alcanzó los 5 GB de entregas. Contacta con Lúmina para ampliar su almacenamiento.',413);
    const previous=asset?db.get('SELECT max(version) version FROM content_files WHERE company_id=? AND piece_id=? AND asset_id=?',company.id,piece.id,asset):null;
    requireThat(!asset||previous?.version,'La versión anterior no pertenece a este entregable.',404);
    db.run(`INSERT INTO content_files(id,company_id,piece_id,asset_id,version,original_name,label,media_type,byte_size,sha256,actor_id,request_key,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,upload.id,company.id,piece.id,asset||upload.id,(previous?.version||0)+1,upload.name,label,upload.mediaType,upload.size,upload.sha256,actor.id,data.request_key,now());
    db.run("UPDATE pieces SET revision=revision+1,status=CASE WHEN status='APPROVED' THEN 'REVIEW' ELSE status END WHERE id=? AND company_id=?",piece.id,company.id);
    event(db,actor,company.id,'REQUEST',request.id,'ARCHIVO_ADJUNTADO',label+' · versión '+((previous?.version||0)+1),request.channel);
    return {id:upload.id,duplicate:false};
  });
}
export function commentPiece(db,actor,company,request,piece,data) {
  requireThat(canComment(actor,request),'Tu acceso permite consultar esta entrega.',403);
  requireOperating(db,company.id);
  if(actor.kind!=='AGENCY')requireService(db,company.id,request.channel);
  const body=text(data.comment,'comentario',1,2000),fileId=data.file||null;
  const raw=data.seconds??'';
  const seconds=raw===''?null:Number(raw);
  requireThat(seconds===null||(/^\d+$/.test(raw)&&Number.isSafeInteger(seconds)&&fileId),'Selecciona un momento del video.');
  requireThat(isId(data.request_key),'Abre de nuevo el formulario de comentarios.');
  return db.transaction(()=>{
    const prior=db.get('SELECT c.*,m.seconds,x.requested AS originally_requested FROM piece_comments c LEFT JOIN piece_corrections x ON x.comment_id=c.id LEFT JOIN video_comment_moments m ON m.comment_id=c.id WHERE c.request_key=?',data.request_key);
    if(prior){requireThat(prior.company_id===company.id&&prior.piece_id===piece.id&&prior.actor_id===actor.id&&prior.body===body&&prior.file_id===fileId&&prior.seconds===seconds&&Boolean(prior.originally_requested)===(data.correction==='yes'),'Este comentario ya se envió con otros datos.',409);return;}
    const file=fileId&&db.get('SELECT media_type FROM content_files WHERE id=? AND piece_id=? AND company_id=?',fileId,piece.id,company.id);
    requireThat(!fileId||file,'Archivo no encontrado.',404);
    requireThat(seconds===null||file.media_type.startsWith('video/'),'Ese momento debe pertenecer a un video.');
    requireThat(request.status!=='CANCELLED'&&piece.status!=='CANCELLED','Esta entrega está cancelada.',409);
    if(data.correction==='yes')requireThat(request.status==='PRODUCTION'&&piece.status!=='DELIVERED','Esta entrega ya no está en producción.',409);
    const id=uuid();
    db.run('INSERT INTO piece_comments VALUES(?,?,?,?,?,?,?,?,?)',id,company.id,piece.id,fileId,actor.id,actor.name,body,data.request_key,now());
    if(data.correction==='yes')db.run('INSERT INTO piece_corrections(comment_id) VALUES(?)',id);
    if(seconds!==null)db.run('INSERT INTO video_comment_moments(comment_id,seconds) VALUES(?,?)',id,seconds);
    event(db,actor,company.id,'REQUEST',request.id,'COMENTARIO_ENTREGA',piece.title,request.channel);
  });
}

export function trackCorrection(db,actor,company,request,piece,data) {
  requireThat(actor.kind==='AGENCY'&&actor.agencyWork&&!actor.readOnlyCompany,'Solo el equipo de producción puede dar seguimiento a una observación.',403);
  requireThat(isId(data.comment_id),'Abre el comentario que deseas seguir.');
  db.transaction(()=>{
    requireOperating(db,company.id);
    const comment=db.get('SELECT id FROM piece_comments WHERE id=? AND company_id=? AND piece_id=?',data.comment_id,company.id,piece.id);
    requireThat(comment,'Comentario no encontrado.',404);
    if(db.get('SELECT 1 FROM piece_corrections WHERE comment_id=?',comment.id))return;
    requireThat(request.status==='PRODUCTION'&&!['DELIVERED','CANCELLED'].includes(piece.status),'La entrega ya salió de producción.',409);
    db.run('INSERT INTO piece_corrections(comment_id,requested) VALUES(?,0)',comment.id);
    event(db,actor,company.id,'REQUEST',request.id,'CORRECCION_SOLICITADA',piece.title,request.channel);
  });
}

export function resolveComment(db,actor,company,request,piece,data) {
  requireThat(actor.kind==='AGENCY'&&actor.agencyWork&&!actor.readOnlyCompany,'Solo el equipo de producción puede resolver una corrección.',403);
  requireThat(isId(data.comment_id)&&isId(data.file),'Elige la versión corregida.');
  db.transaction(()=>{
    requireOperating(db,company.id);
    const comment=db.get(`SELECT c.*,x.resolved_file,f.asset_id,f.version FROM piece_comments c
      JOIN piece_corrections x ON x.comment_id=c.id LEFT JOIN content_files f ON f.id=c.file_id
      WHERE c.id=? AND c.company_id=? AND c.piece_id=?`,data.comment_id,company.id,piece.id);
    requireThat(comment,'Corrección no encontrada.',404);
    if(comment.resolved_file){requireThat(comment.resolved_file===data.file,'Esta corrección ya se vinculó a otra versión.',409);return;}
    requireThat(piece.status!=='CANCELLED'&&['PRODUCTION','DELIVERED'].includes(request.status),'Esta entrega ya no admite seguimiento.',409);
    const fixed=db.get('SELECT * FROM content_files WHERE id=? AND company_id=? AND piece_id=?',data.file,company.id,piece.id);
    requireThat(fixed&&(comment.file_id?fixed.asset_id===comment.asset_id&&fixed.version>comment.version:fixed.created_at>=comment.created_at),'Selecciona una versión posterior de esta entrega.');
    db.run('UPDATE piece_corrections SET resolved_file=?,resolved_by=?,resolved_name=?,resolved_at=? WHERE comment_id=?',fixed.id,actor.id,actor.name,now(),comment.id);
    event(db,actor,company.id,'REQUEST',request.id,'CORRECCION_RESUELTA',fixed.label+' · versión '+fixed.version,request.channel);
  });
}
