import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn,spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCode,createAgency,createSession,getSession } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
import { loadKey } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/security.mjs';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import { fakeLoyalty } from './loyalty-fixture.mjs';
import { password } from './helpers.mjs';

const root=fileURLToPath(new URL('../../../../../../../',import.meta.url));
const namespace='src/main/resources/com/premierdarkcoffee/loyalty/lumina';
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),'lumina-real-start-'));
  const project=join(directory,'project'),data=join(directory,'agency');
  mkdirSync(project,{mode:0o700});
  cpSync(join(root,namespace),join(project,namespace),{recursive:true});
  cpSync(join(root,namespace,'../businesses'),join(project,namespace,'../businesses'),{recursive:true});
  mkdirSync(join(project,'lumina-agency/src'),{recursive:true});
  cpSync(join(root,'lumina-agency/src/server.mjs'),join(project,'lumina-agency/src/server.mjs'));
  writeFileSync(join(project,'settings.gradle.kts'),'rootProject.name = "loyalty-test"\n');
  return {directory,project,data,entry:join(project,'lumina-agency/src/server.mjs')};
}
async function freePort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function launch(f,port,loyaltyPort=8097){
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('LUMINA_'))delete env[key];
  const child=spawn(process.execPath,[f.entry],{cwd:f.project,env:{...env,LUMINA_PORT:String(port),LUMINA_DATA_DIR:f.data,LUMINA_LOYALTY_URL:'http://127.0.0.1:'+loyaltyPort},stdio:['ignore','pipe','pipe']});
  let output='';const done=once(child,'exit');
  child.stdout.on('data',bytes=>{output=(output+bytes).slice(-16000);});child.stderr.on('data',bytes=>{output=(output+bytes).slice(-16000);});
  const ready=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('El portal no anunció su inicio.')),12000);
    child.stdout.on('data',()=>{if(output.includes('Lúmina Digital disponible en')){clearTimeout(timer);resolve();}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',(code)=>{
      clearTimeout(timer);
      const cause=output.includes('El puerto de Lúmina ya está ocupado.')?'PORT_IN_USE':
        output.includes('ERR_MODULE_NOT_FOUND')?'MODULE_NOT_FOUND':
        output.includes('SyntaxError')?'SYNTAX_ERROR':
        output.includes('no tiene el formato admitido')?'INVALID_CONFIGURATION':'STARTUP_FAILURE';
      const error=new Error('El portal terminó antes de iniciar: '+code+' '+cause);error.startupCause=cause;reject(error);
    });
  });
  ready.catch(()=>{});
  return {child,done,ready,output:()=>output};
}
async function stop(process){if(!process)return;if(process.child.exitCode===null&&process.child.signalCode===null)process.child.kill('SIGTERM');const timer=setTimeout(()=>process.child.kill('SIGKILL'),2000);await process.done;clearTimeout(timer);}

// A released ephemeral port can be taken by another concurrently running test.
// Retry only the explicit bind collision, never a configuration/module failure.
async function launchOnFreePort(f,loyaltyPort,firstPort=null){
  for(let attempt=0;attempt<3;attempt++){
    const port=attempt===0&&firstPort?firstPort:await freePort(),process=launch(f,port,loyaltyPort);
    try{await process.ready;return {process,port,attempts:attempt+1};}
    catch(error){await stop(process);if(error.startupCause!=='PORT_IN_USE'||attempt===2)throw error;}
  }
}

test('arranque real con .env generado por staging conserva clave, sesión y credencial de 48 caracteres',async t=>{
  const f=fixture();let process;
  try{
    const generated=spawnSync('python3',['-c',
      "import importlib.util,pathlib,sys; p=pathlib.Path(sys.argv[1]); s=importlib.util.spec_from_file_location('stage_fixture',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.init_config(pathlib.Path(sys.argv[2]),8097,False)",join(root,'scripts/staging.py'),f.project],{encoding:'utf8'});
    assert.equal(generated.status,0,'El generador real de configuración debe terminar correctamente.');
    const config=join(f.project,'.env');let contents=readFileSync(config,'utf8');
    const token=contents.match(/^STAGING_ADMIN_TOKEN=(.+)$/m)?.[1];assert.equal(token?.length,48);
    const loyalty=await fakeLoyalty(t,null,{platformToken:token});const port=Number(new URL(loyalty.origin).port);
    contents=contents.replace(/^LOYALTY_HTTP_PORT=\d+$/m,'LOYALTY_HTTP_PORT='+port);writeFileSync(config,contents,{mode:0o600});
    mkdirSync(f.data,{mode:0o700});loadKey(f.data,false);const originalKey=readFileSync(join(f.data,'agency.key'));
    let db=openDatabase(join(f.data,'agency.sqlite'));
    const account=await createAgency(db,{code:setupCode(db),name:'Agencia persistente',document:'1724323843',password});
    const session=createSession(db,account),csrf=getSession(db,session).csrf;db.close();
    const started=await launchOnFreePort(f,port);process=started.process;const luminaPort=started.port;
    const origin='http://127.0.0.1:'+luminaPort;
    assert.equal((await fetch(origin+'/salud')).status,200);
    const response=await fetch(origin+'/wallet-api/api/platform/wallet/status',{headers:{Cookie:'lumina_session='+session,'X-Lumina-CSRF':csrf}});
    assert.equal(response.status,200);assert.equal((await response.json()).configuration.apple,'CONFIGURED_DEVICE_TEST_REQUIRED');
    assert.ok(loyalty.calls.some(call=>call.role==='PLATFORM'));
    assert.ok(!process.output().includes(token),'La credencial no se imprime.');
    await stop(process);process=null;
    assert.deepEqual(readFileSync(join(f.data,'agency.key')),originalKey);
    assert.equal(readFileSync(config,'utf8'),contents);
    db=openDatabase(join(f.data,'agency.sqlite'));assert.equal(getSession(db,session).id,account);assert.equal(db.get('SELECT count(*) AS n FROM accounts').n,1);db.close();
  }finally{await stop(process);rmSync(f.directory,{recursive:true,force:true});}
});
test('una colisión de puerto efímero se recupera sin omitir la comprobación real de arranque',async()=>{
  const f=fixture(),blocker=createServer();let process;
  try{
    blocker.listen(0,'127.0.0.1');await once(blocker,'listening');
    writeFileSync(join(f.project,'.env'),'STAGING_ADMIN_TOKEN='+'F'.repeat(48)+'\nLOYALTY_HTTP_PORT=8097\n',{mode:0o600});
    const started=await launchOnFreePort(f,8097,blocker.address().port);process=started.process;
    assert.equal(started.attempts,2);assert.notEqual(started.port,blocker.address().port);
    assert.equal((await fetch('http://127.0.0.1:'+started.port+'/salud')).status,200);
  }finally{await stop(process);await new Promise(resolve=>blocker.close(resolve));rmSync(f.directory,{recursive:true,force:true});}
});
test('una configuración inválida falla antes de crear o migrar la base de datos',async()=>{
  const f=fixture();let process;
  try{
    writeFileSync(join(f.project,'.env'),'STAGING_ADMIN_TOKEN=demasiado_corto\nLOYALTY_HTTP_PORT=8097\n',{mode:0o600});
    process=launch(f,await freePort());const [code]=await process.done;
    assert.notEqual(code,0);assert.ok(process.output().includes('no tiene el formato admitido'));
    assert.ok(!process.output().includes('Lúmina Digital disponible en'));
    assert.ok(!existsSync(f.data),'No debe tocar la base antes de validar la configuración.');
  }finally{await stop(process);rmSync(f.directory,{recursive:true,force:true});}
});
