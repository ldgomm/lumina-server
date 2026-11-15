import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { agency, colleague, documentFor, owner, portal, listen, close } from './helpers.mjs';
import { createFileStore, maximumFileBytes } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/content/file-store.mjs';
import { Readable } from 'node:stream';
import { createPortal } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/application/app.mjs';
import { uuid } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/shared/domain.mjs';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64');
const selected=(path,id)=>'/agency'+path+'?company='+id;
async function setup(t){
 const dir=await mkdtemp(join(tmpdir(),'lumina-files-'));await chmod(dir,0o700);t.after(()=>rm(dir,{recursive:true,force:true}));
 const key=Buffer.alloc(32,17),store=createFileStore(join(dir,'uploads')),w=await portal(t,undefined,{}, {fileStore:store,key}),admin=await agency(w),business=await owner(w,'Entregas privadas','uploads');
 await admin.post(selected('/businesses/verify',business.id));
 const res=await business.client.post('/requests',{type:'CONTENT',channel:'SOCIAL',service:'VIDEO',quantity:'1',title:'Video de la cocina',brief:'Preparación del plato.',phone:'0991234567'});
 await admin.post(selected(res.location+'/state',business.id),{status:'APPROVED'});
 await admin.post(selected(res.location+'/pieces',business.id),{title:'Video principal'});
 const piece=w.db.get('SELECT * FROM pieces WHERE request_id=?',res.location.split('/').at(-1));
 const revision=()=>String(w.db.get('SELECT revision FROM pieces WHERE id=?',piece.id).revision),path=res.location+'/pieces/'+piece.id;
 const upload=async({actor=admin,values={},bytes=image,name='cocina.png',target=selected(path+'/upload',business.id),extra=false}={})=>{
   const form=new FormData();for(const [key,value] of Object.entries({_csrf:actor.csrf,revision:revision(),label:'Video de la cocina',asset:'',request_key:uuid(),...values}))form.append(key,value);
   form.append('file',new Blob([bytes]),name);if(extra)form.append('label','duplicado');
   const response=await fetch(w.origin+target,{method:'POST',headers:{Cookie:actor.cookie,Origin:w.origin},body:form,redirect:'manual'});
   return {status:response.status,body:await response.text(),location:response.headers.get('location')};
 };
 return {...w,...business,dir,admin,key,requestPath:res.location,piece,path,revision,upload};
}
const files=w=>w.db.all('SELECT * FROM content_files ORDER BY version,id');
const filePath=(w,f)=>w.requestPath+'/files/'+f.id;

test('upload is private, hashed, downloadable, and supports a single byte range',async t=>{
 const w=await setup(t),r=await w.upload();assert.equal(r.status,303,r.body);const f=files(w)[0];assert.equal(f.media_type,'image/png');assert.equal(f.byte_size,image.length);assert.equal(f.sha256,createHash('sha256').update(image).digest('hex'));assert.deepEqual(await readFile(join(w.dir,'uploads',f.id)),image);
 const anonymous=await fetch(w.origin+filePath(w,f),{redirect:'manual'});assert.equal(anonymous.status,303);
 const response=await fetch(w.origin+filePath(w,f),{headers:{Cookie:w.client.cookie,Range:'bytes=0-7'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 0-7/'+image.length);assert.deepEqual(Buffer.from(await response.arrayBuffer()),image.subarray(0,8));assert.match(response.headers.get('cache-control'),/no-store/);
 const full=await fetch(w.origin+filePath(w,f)+'?download=1',{headers:{Cookie:w.client.cookie}});assert.equal(full.status,200);assert.match(full.headers.get('content-disposition'),/^attachment/);await full.arrayBuffer();
 const invalid=await w.client.get(filePath(w,f),{headers:{Range:'bytes=999999-'}});assert.equal(invalid.status,416);
});
test('files cannot be read or uploaded across businesses, by owners, or from agency consultation',async t=>{
 const w=await setup(t);await w.upload();const f=files(w)[0],other=await owner(w,'Otro negocio','files-other');
 assert.equal((await other.client.get(filePath(w,f))).status,404);
 assert.equal((await w.upload({actor:w.client,target:w.path+'/upload'})).status,403);
 assert.equal((await w.upload({target:w.path+'/upload?company='+w.id})).status,403);
 assert.equal((await w.upload({target:selected(w.path+'/upload',other.id)})).status,404);
 assert.equal(files(w).length,1);
});
test('csrf, unsupported signatures and duplicate fields leave no stored files',async t=>{
 const w=await setup(t);
 for(const input of [{values:{_csrf:'incorrect'}},{bytes:Buffer.from('<html>malicious</html>'),name:'image.png'},{extra:true}])assert.ok([400,403].includes((await w.upload(input)).status));
 assert.equal(files(w).length,0);assert.deepEqual(await readdir(join(w.dir,'uploads')),[]);
});
test('retry of the same upload is idempotent and changed payload is rejected',async t=>{
 const w=await setup(t),key=uuid(),old=w.revision(),data={request_key:key,revision:old};
 assert.equal((await w.upload({values:data})).status,303);const history=w.db.all('SELECT * FROM audit');
 assert.equal((await w.upload({values:data})).status,303);assert.equal(files(w).length,1);assert.deepEqual(w.db.all('SELECT * FROM audit'),history);
 assert.equal((await w.upload({values:{...data,label:'Different'}})).status,409);assert.equal((await readdir(join(w.dir,'uploads'))).length,1);
});
test('new versions preserve old files and invalidate stale approval forms',async t=>{
 const w=await setup(t);await w.upload();const first=files(w)[0];
 await w.admin.post(selected(w.path+'/edit',w.id),{status:'REVIEW',revision:w.revision()});const stale=w.revision();
 assert.equal((await w.upload({values:{asset:first.asset_id}})).status,303);assert.deepEqual(files(w).map(f=>f.version),[1,2]);
 assert.equal((await w.client.post(w.path+'/review',{status:'APPROVED',revision:stale})).status,409);
 assert.equal((await w.client.post(w.path+'/review',{status:'APPROVED',revision:w.revision()})).status,303);
 assert.equal((await w.upload({values:{asset:first.asset_id}})).status,303);assert.equal(w.db.get('SELECT status FROM pieces WHERE id=?',w.piece.id).status,'REVIEW');
 const page=await w.client.get(w.requestPath);assert.match(page.body,/Versión 3/);assert.match(page.body,/Versiones anteriores \(2\)/);assert.equal((await w.client.get(filePath(w,first))).status,200);
});
test('stale upload, unrelated asset and closed delivery do not change files',async t=>{
 const w=await setup(t);await w.upload();const before=w.db.all('SELECT * FROM audit');
 assert.equal((await w.upload({values:{revision:'-1'}})).status,409);assert.equal((await w.upload({values:{asset:uuid()}})).status,404);assert.deepEqual(w.db.all('SELECT * FROM audit'),before);
 await w.admin.post(selected(w.path+'/edit',w.id),{status:'REVIEW',revision:w.revision()});await w.client.post(w.path+'/review',{status:'APPROVED',revision:w.revision()});await w.admin.post(selected(w.path+'/edit',w.id),{status:'DELIVERED',revision:w.revision()});
 assert.equal((await w.upload()).status,409);assert.equal(files(w).length,1);
});
test('comments refer to the exact version, escape text and reject replay with changes',async t=>{
 const w=await setup(t);await w.upload();const f=files(w)[0],key=uuid(),comment={request_key:key,file:f.id,comment:'<script>Comentario de prueba</script>'};
 assert.equal((await w.client.post(w.path+'/comment',comment)).status,303);assert.equal((await w.client.post(w.path+'/comment',comment)).status,303);
 assert.equal((await w.client.post(w.path+'/comment',{...comment,comment:'Cambió'})).status,409);assert.equal(w.db.get('SELECT count(*) n FROM piece_comments').n,1);
 const page=await w.client.get(w.requestPath);assert.match(page.body,/&lt;script&gt;Comentario/);assert.doesNotMatch(page.body,/<script>Comentario/);assert.match(page.body,/versión 1/);
});
test('read-only collaborators cannot comment and revoked permissions affect the open session',async t=>{
 const w=await setup(t);await w.upload();const f=files(w)[0],person=await colleague(w,w.client,{name:'Editor de negocio',document:documentFor('file-reviewer'),'SOCIAL.VIEW':'yes','SOCIAL.APPROVE':'yes'});
 assert.equal((await person.session.get(filePath(w,f))).status,200);assert.equal((await person.session.post(w.path+'/comment',{request_key:uuid(),comment:'Cambiar el cierre.'})).status,303);
 await w.client.post('/team/'+person.id+'/permissions',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',person.id).revision),'SOCIAL.VIEW':'yes'});
 assert.equal((await person.session.post(w.path+'/comment',{request_key:uuid(),comment:'No autorizado.'})).status,403);
 await w.client.post('/team/'+person.id+'/permissions',{revision:String(w.db.get('SELECT revision FROM accounts WHERE id=?',person.id).revision)});
 assert.equal((await person.session.get(filePath(w,f))).status,404);
});
test('comment targets cannot reference another piece or business and agency remains read-only in consultation',async t=>{
 const w=await setup(t);assert.equal((await w.client.post(w.path+'/comment',{request_key:uuid(),comment:'Comentario',file:uuid()})).status,404);
 assert.equal((await w.admin.post(w.path+'/comment?company='+w.id,{request_key:uuid(),comment:'Consulta'})).status,403);
 assert.equal((await w.admin.post(selected(w.path+'/comment',w.id),{request_key:uuid(),comment:'Archivo listo para revisar.'})).status,303);
});
test('PDFs download instead of embedding and videos have inline playback with metadata-only loading',async t=>{
 const w=await setup(t);assert.equal((await w.upload({bytes:Buffer.from('%PDF-1.7\nfixture'),name:'brief.pdf'})).status,303);const f=files(w)[0];const response=await w.client.get(filePath(w,f));assert.match(response.headers.get('content-disposition'),/^attachment/);
 const video=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(32)]);assert.equal((await w.upload({bytes:video,name:'video.mp4'})).status,303);const page=await w.client.get(w.requestPath);assert.match(page.body,/<video controls playsinline preload="metadata"/);assert.match(page.headers.get('content-security-policy'),/media-src 'self' blob:/);
});
test('symbolic links and truncated private files are never served',async t=>{
 const w=await setup(t);await w.upload();const f=files(w)[0],path=join(w.dir,'uploads',f.id);await rm(path);await symlink('/etc/passwd',path);assert.equal((await w.client.get(filePath(w,f))).status,503);
});
test('content, comments, permissions and session visibility survive a persistent snapshot and restart',async t=>{
 const {openDatabase}=await import('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs');
 const w=await setup(t);await w.upload();const file=files(w)[0];
 await w.client.post(w.path+'/comment',{request_key:uuid(),file:file.id,comment:'Esta es la versión aprobada para revisar.'});
 const path=join(w.dir,'agency.sqlite');w.db.run('VACUUM INTO ?',path);
 const db=openDatabase(path),server=createPortal({db,key:w.key,loyaltyUrl:'http://127.0.0.1:65533',fileStore:createFileStore(join(w.dir,'uploads'))});
 const origin=await listen(server);try{
   assert.equal(db.get('PRAGMA user_version').user_version,12);assert.deepEqual(db.all('PRAGMA foreign_key_check'),[]);
   assert.deepEqual(db.all('SELECT * FROM content_files'),files(w));assert.equal(db.get('SELECT count(*) n FROM piece_comments').n,1);
   const response=await fetch(origin+filePath(w,file),{headers:{Cookie:w.client.cookie}});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
   const detail=await fetch(origin+w.requestPath,{headers:{Cookie:w.client.cookie}});assert.match(await detail.text(),/Esta es la versión aprobada/);
 }finally{await close(server);db.close();}
});
test('fragmented multipart boundaries preserve file bytes and truncated uploads are removed',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'lumina-parser-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=createFileStore(dir),boundary='SafeBoundary';
 const data=Buffer.concat([image,Buffer.from('\r\n--'+boundary+'XXinside')]);
 const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\n\r\n'),data,Buffer.from('\r\n--'+boundary+'--\r\n')]);
 const request=bytes=>{const stream=Readable.from([...bytes].map(b=>Buffer.from([b])));stream.headers={'content-type':'multipart/form-data; boundary='+boundary};return stream;};
 const upload=await store.receive(request(body));await upload.commit();assert.deepEqual(await readFile(join(dir,upload.id)),data);await upload.remove();
 await assert.rejects(store.receive(request(body.subarray(0,-10))));assert.deepEqual(await readdir(dir),[]);
});
test('size limits reject declared and streamed oversized files without leaving temporary data',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'lumina-limit-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=createFileStore(dir),boundary='SizeBoundary';
 const oversized=Readable.from([]);oversized.headers={'content-type':'multipart/form-data; boundary='+boundary,'content-length':String(maximumFileBytes+65537)};
 await assert.rejects(store.receive(oversized),error=>error.status===413);
 const request=Readable.from((async function*(){yield Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="too-big.mp4"\r\n\r\n');for(let i=0;i<=100;i++)yield Buffer.alloc(1024*1024);})());
 request.headers={'content-type':'multipart/form-data; boundary='+boundary};await assert.rejects(store.receive(request),error=>error.status===413);assert.deepEqual(await readdir(dir),[]);
});
test('content cards count one asset per version family, not each revision',async t=>{
 const {contentData}=await import('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/content/workspace.mjs');
 const w=await setup(t);await w.upload();await w.upload({values:{asset:files(w)[0].asset_id}});
 const actor={...w.db.get("SELECT * FROM accounts WHERE company_id=? AND kind='OWNER'",w.id),grants:[]};
 const data=contentData(w.db,actor,w.db.get('SELECT * FROM companies WHERE id=?',w.id),new URLSearchParams({view:'production'}));assert.equal(data.rows[0].evidence_count,1);
});
