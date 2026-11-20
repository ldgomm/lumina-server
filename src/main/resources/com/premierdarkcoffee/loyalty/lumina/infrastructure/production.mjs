import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const hash=value=>createHash('sha256').update(value).digest('hex');
export const portalBindings=['LUMINA_ORIGIN','LUMINA_DATA_DIR','LUMINA_LOYALTY_ADMIN_TOKEN'];
export function stableOrigin(value) {
  try {
    const u=new URL(value),host=u.hostname;
    return u.protocol==='https:'&&u.origin===value&&!u.port&&!/^[0-9.]+$/.test(host)&&host.includes('.')&&host.length<=253&&host.split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s))&&
      !['localhost','local','test','invalid','trycloudflare.com','ngrok.io','ngrok-free.app','localtunnel.me'].some(s=>host===s||host.endsWith('.'+s));
  }catch{return false;}
}
function privateFile(path,read=true) {
  if(!isAbsolute(path))throw new Error('PRODUCTION_ABSOLUTE_PATH_REQUIRED');
  for(let p=path;;p=dirname(p)) {if(lstatSync(p).isSymbolicLink())throw new Error('PRODUCTION_SYMLINK_FORBIDDEN');if(dirname(p)===p)break;}
  const s=lstatSync(path);
  if(!s.isFile()||(s.mode&0o077))throw new Error('PRODUCTION_PRIVATE_FILE_REQUIRED');
  return read?readFileSync(path):null;
}
export function productionGuard(env=process.env) {
  if(env.LUMINA_PROFILE!=='production')return null;
  if(!stableOrigin(env.LUMINA_ORIGIN)||!env.LUMINA_DATA_DIR||!env.PRODUCTION_IDENTITY_PATH||!env.LUMINA_LOYALTY_ADMIN_TOKEN)throw new Error('PRODUCTION_CONFIGURATION_REQUIRED');
  if(Object.keys(env).some(k=>k.startsWith('STAGING_')||k.startsWith('DEMO_')))throw new Error('PRODUCTION_DEMO_CONFIG_FORBIDDEN');
  const seal=JSON.parse(privateFile(env.PRODUCTION_IDENTITY_PATH));
  if(!/^[a-f0-9]{64}$/.test(env.SOURCE_SHA||''))throw new Error('PRODUCTION_RELEASE_REQUIRED');
  if(seal.format!==1)throw new Error('PRODUCTION_SEAL_INVALID');
  for(const key of portalBindings)if(seal.portal?.[key]!==hash(env[key]))throw new Error('PRODUCTION_IDENTITY_MISMATCH:'+key);
  const folder=new URL('./',import.meta.url);
  const current={'lumina/infrastructure/schema.sql':hash(readFileSync(new URL('schema.sql',folder)))};
  for(const file of readdirSync(new URL('migrations/',folder)).filter(f=>f.endsWith('.sql')))current['lumina/infrastructure/migrations/'+file]=hash(readFileSync(new URL('migrations/'+file,folder)));
  const expected=Object.fromEntries(Object.entries(seal.sql||{}).filter(([k])=>k.startsWith('lumina/infrastructure/')));
  const extensions=['membership-calendar','subscription-periods'].map(name=>{
    const path='lumina/infrastructure/extensions/'+name+'.sql';
    const checksum=hash(readFileSync(new URL('extensions/'+name+'.sql',folder)));
    if(expected[path])current[path]=checksum;
    return [name,checksum];
  });
  if(Object.keys(current).length!==Object.keys(expected).length||Object.entries(current).some(([k,v])=>expected[k]!==v))throw new Error('PRODUCTION_SCHEMA_SOURCE_CHANGED');
  const key=privateFile(join(env.LUMINA_DATA_DIR,'agency.key'));
  if(key.length!==32||hash(key)!==seal.portal.agency_key)throw new Error('PRODUCTION_AGENCY_KEY_CHANGED');
  const dbPath=join(env.LUMINA_DATA_DIR,'agency.sqlite');
  privateFile(dbPath,false);
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try {
    if(db.prepare('PRAGMA user_version').get().user_version!==12)throw new Error('PRODUCTION_SCHEMA_CHANGE_REQUIRES_PLANNED_MIGRATION');
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='lumina_extensions'").get() ||
      extensions.some(([name,checksum])=>db.prepare("SELECT checksum FROM lumina_extensions WHERE name=?").get(name)?.checksum!==checksum))
      throw new Error('MEMBERSHIP_SCHEMA_MISMATCH');
    const agency=db.prepare("SELECT id FROM accounts WHERE kind='AGENCY' ORDER BY id LIMIT 1").get();
    if(!agency||hash(agency.id)!==seal.portal.agency_id)throw new Error('PRODUCTION_DATABASE_CHANGED');
  }finally{db.close();}
  return seal;
}
export async function productionReadiness(db,loyaltyUrl,release) {
  db.get('SELECT 1');
  const response=await fetch(loyaltyUrl+'/health/ready',{redirect:'error',signal:AbortSignal.timeout(2500)});
  const native=await response.json();
  if(!response.ok||native.status!=='UP'||native.wallet?.apple!==true||native.wallet?.google!==true||native.release!==release)throw new Error('PRODUCTION_WALLET_NOT_READY');
  return {status:'UP',service:'lumina-agency',release};
}
