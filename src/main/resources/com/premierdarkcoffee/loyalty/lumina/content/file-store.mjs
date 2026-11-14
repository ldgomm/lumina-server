import { constants } from 'node:fs';
import { mkdir, lstat, chmod, open, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Problem, isId, requireThat } from '../shared/domain.mjs';

export const maximumFileBytes=100*1024*1024;
const allowedFields=new Set(['_csrf','revision','label','asset','request_key']);
const invalid=()=>new Problem('No se pudo leer el archivo. Selecciónalo de nuevo.');
export function detectMedia(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(bytes.toString('ascii',4,8)==='ftyp')return 'video/mp4';
  if(bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))return 'video/webm';
  if(bytes.toString('ascii',0,5)==='%PDF-')return 'application/pdf';
  throw new Problem('Usa un video MP4 o WebM, una imagen JPG, PNG o WebP, o un PDF.');
}

// Files are immutable and private. No caller-supplied path or filename reaches disk.
export function createFileStore(directory) {
  const filePath=id=>{requireThat(isId(id),'Archivo no encontrado.',404);return join(directory,id);};
  async function prepare() {
    await mkdir(directory,{recursive:true,mode:0o700});
    const stat=await lstat(directory);
    requireThat(stat.isDirectory()&&!stat.isSymbolicLink(),'La carpeta de entregas no está disponible.',503);
    await chmod(directory,0o700);
  }
  return {
    async receive(req) {
      await prepare();
      const type=req.headers['content-type']||'';
      const match=type.match(/^multipart\/form-data;\s*boundary=(?:"([\w'()+,./:=?-]{1,70})"|([\w'()+,./:=?-]{1,70}))$/i);
      requireThat(match,'Selecciona el archivo desde el formulario de entrega.',415);
      requireThat(!req.headers['content-encoding'],'La carga comprimida no está permitida.',415);
      requireThat(!req.headers['content-length']||Number(req.headers['content-length'])<=maximumFileBytes+65536,'El archivo supera los 100 MB.',413);
      const boundary=Buffer.from('--'+(match[1]||match[2])),separator=Buffer.concat([Buffer.from('\r\n'),boundary]);
      const id=randomUUID(),temporary=join(directory,'.upload-'+id),fields={};
      let handle,buffer=Buffer.alloc(0),stage='first',part=null,total=0,count=0,size=0,name='',prefix=Buffer.alloc(0),done=false;
      const hash=createHash('sha256');
      const emit=async bytes=>{
        if(!bytes.length)return;
        if(part.file){
          size+=bytes.length;requireThat(size<=maximumFileBytes,'El archivo supera los 100 MB.',413);
          if(prefix.length<32)prefix=Buffer.concat([prefix,bytes.subarray(0,32-prefix.length)]);
          hash.update(bytes);
          let offset=0;while(offset<bytes.length){const out=await handle.write(bytes,offset);offset+=out.bytesWritten;}
        }else{part.size+=bytes.length;requireThat(part.size<=4096,'Un campo del formulario es demasiado largo.',413);part.chunks.push(bytes);}
      };
      try {
        for await(const chunk of req.iterator({destroyOnReturn:false})) {
          total+=chunk.length;requireThat(total<=maximumFileBytes+65536,'El archivo supera los 100 MB.',413);
          buffer=Buffer.concat([buffer,chunk]);
          while(true) {
            if(stage==='first'){
              if(buffer.length<boundary.length+2)break;
              requireThat(buffer.subarray(0,boundary.length+2).equals(Buffer.concat([boundary,Buffer.from('\r\n')])),invalid().message);
              buffer=buffer.subarray(boundary.length+2);stage='headers';
            }else if(stage==='headers'){
              const end=buffer.indexOf('\r\n\r\n');if(end<0){requireThat(buffer.length<=8192,invalid().message);break;}
              requireThat(++count<=6&&end<=8192,invalid().message);
              const headers=buffer.toString('utf8',0,end).split('\r\n');buffer=buffer.subarray(end+4);
              const disposition=headers.filter(h=>/^content-disposition:/i.test(h));
              requireThat(disposition.length===1,invalid().message);
              const field=disposition[0].match(/^content-disposition:\s*form-data;\s*name="([a-z_]+)"(?:;\s*filename="([^"\r\n]*)")?$/i);
              requireThat(field,invalid().message);
              const key=field[1],file=field[2]!==undefined;
              if(file){
                requireThat(key==='file'&&!handle, 'Selecciona un solo archivo por carga.');
                name=field[2].split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g,'').slice(0,180);
                requireThat(name,'Selecciona un archivo.');
                handle=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
              }else requireThat(allowedFields.has(key)&&!Object.hasOwn(fields,key),'El formulario contiene campos repetidos o desconocidos.');
              part={key,file,size:0,chunks:[]};stage='body';
            }else if(stage==='body'){
              const end=buffer.indexOf(separator);
              if(end<0){const emitUntil=Math.max(0,buffer.length-separator.length-2);await emit(buffer.subarray(0,emitUntil));buffer=buffer.subarray(emitUntil);break;}
              if(buffer.length<end+separator.length+2)break;
              const tail=buffer.toString('ascii',end+separator.length,end+separator.length+2);
              if(tail!=='--'&&tail!=='\r\n'){await emit(buffer.subarray(0,end+2));buffer=buffer.subarray(end+2);continue;}
              await emit(buffer.subarray(0,end));
              if(!part.file)fields[part.key]=Buffer.concat(part.chunks).toString('utf8');
              buffer=buffer.subarray(end+separator.length+2);stage=tail==='--'?'done':'headers';
            }else{
              requireThat(buffer.length<=2&&(buffer.length===0||buffer[0]===13)&&(buffer.length<2||buffer[1]===10),invalid().message);done=true;break;
            }
          }
        }
        requireThat(done&&handle&&size>0,invalid().message);
        const mediaType=detectMedia(prefix);await handle.sync();await handle.close();handle=null;
        let committed=false;
        return {id,fields,name,size,mediaType,sha256:hash.digest('hex'),
          async commit(){await rename(temporary,filePath(id));committed=true;},
          async remove(){await unlink(committed?filePath(id):temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}};
      }catch(error){
        if(handle)await handle.close().catch(()=>{});
        await unlink(temporary).catch(()=>{});req.resume();throw error;
      }
    },
    async serve(req,res,file) {
      await prepare();
      let handle;
      try{handle=await open(filePath(file.id),constants.O_RDONLY|constants.O_NOFOLLOW);}catch{throw new Problem('El archivo no está disponible. Contacta con Lúmina.',503);}
      const stat=await handle.stat();
      if(!stat.isFile()||stat.size!==file.byte_size){await handle.close();throw new Problem('El archivo no está disponible.',503);}
      let start=0,end=stat.size-1,status=200;
      if(req.headers.range){
        const range=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
        if(!range||!range[1]&&!range[2]){await handle.close();res.writeHead(416,{'Content-Range':'bytes */'+stat.size});return res.end();}
        if(range[1]){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;}
        else start=Math.max(0,stat.size-Number(range[2]));
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){await handle.close();res.writeHead(416,{'Content-Range':'bytes */'+stat.size});return res.end();}
        status=206;
      }
      const download=new URL(req.url,'http://localhost').searchParams.has('download')||file.media_type==='application/pdf';
      const headers={'Content-Type':file.media_type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',
        'Content-Disposition':(download?'attachment':'inline')+"; filename*=UTF-8''"+encodeURIComponent(file.original_name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16)),
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'};
      if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
      res.writeHead(status,headers);
      const stream=handle.createReadStream({start,end,autoClose:true});
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    },
  };
}
