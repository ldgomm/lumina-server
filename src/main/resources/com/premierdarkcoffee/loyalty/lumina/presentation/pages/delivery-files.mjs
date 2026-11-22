import { canComment } from '../../content/deliverables.mjs';
import { uuid } from '../../shared/domain.mjs';
import { button, esc, hidden, input, localLink, select, textarea, timestamp } from './components.mjs';

const momentLabel=seconds=>String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');

export function deliveryFiles({actor,request,piece,route,base,editable,feedback}) {
  const commentDraft=feedback?.action==='/pieces/'+piece.id+'/comment'?feedback.values:{};
  const files=piece.files||[],groups=new Map();
  for(const file of files){const group=groups.get(file.asset_id)||[];group.push(file);groups.set(file.asset_id,group);}
  const fileUrl=file=>base('/files/'+file.id);
  // base() may already include the agency company selector; preserve it on download.
  const download=file=>{const link=new URL(fileUrl(file),'http://localhost');link.searchParams.set('download','1');return localLink(link.pathname+link.search,'Descargar','btn secondary');};
  const allowComment=canComment(actor,request)&&request.status!=='CANCELLED'&&piece.status!=='CANCELLED';
  const preview=(file,previous=false)=>file.media_type.startsWith('video/')?`<div class="delivery-player"><video controls playsinline preload="${previous?'none':'metadata'}" id="video-${esc(file.id)}" src="${esc(fileUrl(file))}" aria-label="${esc(file.label)} · versión ${file.version}"></video>${allowComment?`<button type="button" class="btn secondary" data-capture-moment="${esc(file.id)}" hidden>Comentar este momento</button>`:''}</div>`:
    file.media_type.startsWith('image/')?`<img loading="lazy" src="${esc(fileUrl(file))}" alt="${esc(file.label)}">`:'';
  const cards=[...groups.values()].map(versions=>{
    versions.sort((a,b)=>b.version-a.version);const current=versions[0];
    return `<section class="delivery-asset"><div class="split"><h4>${esc(current.label)}</h4><span class="badge">Versión ${current.version}</span></div>${preview(current)}
      <div class="split"><small>${(current.byte_size/1024**2).toFixed(1)} MB · ${esc(timestamp(current.created_at))}</small>${download(current)}</div>
      ${versions.length>1?`<details class="disclosure"><summary>Versiones anteriores (${versions.length-1})</summary>${versions.slice(1).map(file=>`<div class="split"><span>Versión ${file.version} · ${esc(file.label)}</span>${download(file)}</div>${file.media_type.startsWith('video/')?preview(file,true):''}`).join('')}</details>`:''}</section>`;
  }).join('');
  const upload=editable?`<details class="disclosure"${feedback?.action==='/pieces/'+piece.id+'/upload'?' open':''}><summary>Subir archivo</summary><form method="post" enctype="multipart/form-data" action="${esc(route('/upload'))}" data-file-upload>
    ${hidden('_csrf',actor.csrf)+hidden('revision',piece.revision)+hidden('request_key',uuid())}
    ${input('label','Nombre de la entrega','text','required minlength="2" maxlength="100"',piece.title.slice(0,100))}
    ${select('asset','Guardar como',[['','Archivo nuevo'],...[...groups.values()].map(versions=>[versions[0].asset_id,'Nueva versión · '+versions[0].label])])}
    ${input('file','Archivo','file','required accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,application/pdf"')}
    <p class="muted">Hasta 100 MB · MP4, WebM, JPG, PNG, WebP o PDF</p><p role="status" data-upload-status hidden></p>${button('Subir archivo')}</form></details>`:'';
  const comments=piece.comments||[],commentForm=allowComment?`<form data-moment-form method="post" action="${esc(route('/comment'))}">
    ${hidden('_csrf',actor.csrf)+hidden('request_key',commentDraft.request_key||uuid())}${files.length?select('file','Sobre',[['','El entregable'],...files.map(f=>[f.id,f.label+' · versión '+f.version])],commentDraft.file||''):''}
    ${hidden('seconds',commentDraft.seconds||'')}<p data-draft-moment hidden><span role="status"></span> <button type="button" class="text-button" data-clear-moment>Quitar momento</button></p>
    ${textarea('comment','Comentario','required maxlength="2000" rows="3" placeholder="Escribe una observación sobre esta entrega…"',commentDraft.comment||'')}${request.status==='PRODUCTION'&&piece.status!=='DELIVERED'?`<label class="check"><input type="checkbox" name="correction" value="yes" ${commentDraft.correction==='yes'?'checked':''}> Solicitar una corrección</label>`:''}${button('Comentar')}</form>`:'';
  function correctionState(c) {
    if(!c.correction)return editable?`<form method="post" action="${esc(route('/track'))}">${hidden('_csrf',actor.csrf)+hidden('comment_id',c.id)}${button('Dar seguimiento como corrección','secondary')}</form>`:'';
    if(c.resolved_file)return '<p><strong>Resuelta</strong> · '+localLink(fileUrl({id:c.resolved_file}),'Ver '+c.resolved_label+' · versión '+c.resolved_version)+' · '+esc(c.resolved_name)+' · '+esc(timestamp(c.resolved_at))+'</p>';
    const versions=files.filter(f=>c.file_id?f.asset_id===c.asset_id&&f.version>c.file_version:f.created_at>=c.created_at);
    if(actor.kind!=='AGENCY'||!actor.agencyWork||actor.readOnlyCompany||!['PRODUCTION','DELIVERED'].includes(request.status)||piece.status==='CANCELLED'||!versions.length)return '<p class="badge">Corrección pendiente</p>';
    return `<form method="post" action="${esc(route('/resolve'))}">${hidden('_csrf',actor.csrf)+hidden('comment_id',c.id)}${select('file','Versión que corrige esta observación',versions.map(f=>[f.id,f.label+' · versión '+f.version]))}${button('Marcar como resuelta','secondary')}</form>`;
  }
  const pending=comments.filter(c=>c.correction&&!c.resolved_file).length;
  const thread=comments.length||commentForm?`<details class="disclosure delivery-comments"${comments.length||commentDraft.comment?' open':''}><summary>Comentarios${pending?' · '+pending+(pending===1?' corrección pendiente':' correcciones pendientes'):''}${comments.length?' · '+comments.length:''}</summary>
    ${commentForm}<ol>${comments.map(c=>`<li><div class="split"><strong>${esc(c.actor_name)}</strong><time datetime="${esc(c.created_at)}">${esc(timestamp(c.created_at))}</time></div>${c.file_label?`<small>${esc(c.file_label)} · versión ${c.file_version}</small>`:''}${Number.isSafeInteger(c.seconds)&&c.file_id?`<a class="video-time-link" href="${esc(fileUrl({id:c.file_id}))}#t=${c.seconds}" data-jump-file="${esc(c.file_id)}" data-seconds="${c.seconds}">Ver ${momentLabel(c.seconds)}</a>`:''}<p class="prewrap">${esc(c.body)}</p>${correctionState(c)}</li>`).join('')}</ol>${comments.length===100?'<p class="muted">Se muestran los comentarios recientes y las correcciones pendientes.</p>':''}</details>`:'';
  return `<div data-delivery-review><div class="delivery-assets">${cards}</div>${upload}${thread}</div>`;
}
