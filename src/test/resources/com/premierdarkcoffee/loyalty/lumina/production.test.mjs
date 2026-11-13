import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,writeFileSync,readFileSync,rmSync,chmodSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { productionGuard,productionReadiness,portalBindings,stableOrigin } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/production.mjs';
import { openDatabase } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/database.mjs';
import { createSession, getSession } from '../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/access/accounts.mjs';
const infra=new URL('../../../../../../main/resources/com/premierdarkcoffee/loyalty/lumina/infrastructure/',import.meta.url);
const hash=v=>createHash('sha256').update(v).digest('hex');
function fixture(t) {
 // macOS can expose the system temporary directory through /var → /private/var.
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'lumina-production-test-')));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const key=Buffer.alloc(32,5);writeFileSync(join(dir,'agency.key'),key,{mode:0o600});const db=openDatabase(join(dir,'agency.sqlite'));chmodSync(join(dir,'agency.sqlite'),0o600);
 db.run("INSERT INTO accounts(id,name,email,kind,password) VALUES('agency','Agencia','a@example.test','AGENCY','fictional')");
 const env={LUMINA_PROFILE:'production',LUMINA_ORIGIN:'https://portal.example.com',LUMINA_DATA_DIR:dir,LUMINA_LOYALTY_ADMIN_TOKEN:'A'.repeat(48),PRODUCTION_IDENTITY_PATH:join(dir,'identity.json'),SOURCE_SHA:'a'.repeat(64)};
 const sql={'lumina/infrastructure/schema.sql':hash(readFileSync(new URL('schema.sql',infra)))};
 for(const f of readdirSync(new URL('migrations/',infra)))if(f.endsWith('.sql'))sql['lumina/infrastructure/migrations/'+f]=hash(readFileSync(new URL('migrations/'+f,infra)));
 const seal={format:1,portal:{...Object.fromEntries(portalBindings.map(k=>[k,hash(env[k])])),agency_key:hash(key),agency_id:hash('agency')},sql};
 const save=()=>writeFileSync(env.PRODUCTION_IDENTITY_PATH,JSON.stringify(seal),{mode:0o600});save();
 return {dir,db,env,seal,save};
}
test('producción exige configuración explícita sin crear datos',()=>{assert.equal(productionGuard({}),null);assert.throws(()=>productionGuard({LUMINA_PROFILE:'production'}),/CONFIGURATION_REQUIRED/);});
test('producción conserva una sesión existente después de reiniciar',t=>{const w=fixture(t),token=createSession(w.db,'agency');w.db.close();productionGuard(w.env);const db=openDatabase(join(w.dir,'agency.sqlite'));assert.equal(getSession(db,token).id,'agency');db.close();});
test('producción bloquea cambios de origen, clave y datos del portal',t=>{const w=fixture(t);w.db.close();for(const k of portalBindings)assert.throws(()=>productionGuard({...w.env,[k]:k==='LUMINA_ORIGIN'?'https://otro.example.com':'changed'}));writeFileSync(join(w.dir,'agency.key'),Buffer.alloc(32,8));assert.throws(()=>productionGuard(w.env),/KEY_CHANGED/);});
test('producción rechaza esquemas pendientes sin migrar la base',t=>{const w=fixture(t);w.db.run('PRAGMA user_version=5');w.db.close();assert.throws(()=>productionGuard(w.env),/SCHEMA_CHANGE/);const {DatabaseSync}=process.getBuiltinModule('node:sqlite');const db=new DatabaseSync(join(w.dir,'agency.sqlite'),{readOnly:true});assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);db.close();});
test('producción rechaza SQL cambiado y otro registro de agencia',t=>{const w=fixture(t);w.seal.sql['lumina/infrastructure/schema.sql']='changed';w.save();assert.throws(()=>productionGuard(w.env),/SCHEMA_SOURCE_CHANGED/);w.db.close();});
test('orígenes temporales, rutas y credenciales no son aceptables para producción',()=>{for(const s of ['https://bad_host.example.com','https://-bad.example.com','https://wallet.example.com.','http://wallet.example.com','https://a.trycloudflare.com','https://127.0.0.1','https://wallet.example.com/path','https://wallet.example.com?x=1','https://user:pass@wallet.example.com'])assert.equal(stableOrigin(s),false,s);assert.equal(stableOrigin('https://wallet.example.com'),true);});
test('readiness exige ambas wallets y la misma versión',async t=>{
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);const db={get:()=>1};
 for(const native of [{status:'UP',wallet:{apple:true,google:false},release:'v'},{status:'UP',wallet:{apple:true,google:true},release:'old'}]){globalThis.fetch=async()=>({ok:true,json:async()=>native});await assert.rejects(()=>productionReadiness(db,'http://127.0.0.1:9101','v'));}
 globalThis.fetch=async()=>({ok:true,json:async()=>({status:'UP',wallet:{apple:true,google:true},release:'v'})});assert.equal((await productionReadiness(db,'http://127.0.0.1:9101','v')).status,'UP');
});
