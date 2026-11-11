import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireThat } from '../shared/domain.mjs';
// Match scripts/staging.py read_config: existing tokens are opaque, 32–128 base64url characters.
const platformTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;
export function loadIntegration(origin,root=process.env.LUMINA_PROJECT_ROOT) {
  const explicit=process.env.LUMINA_LOYALTY_ADMIN_TOKEN;
  if(explicit) { requireThat(platformTokenPattern.test(explicit),'Configuración interna de Loyalty inválida.');return {platformToken:explicit}; }
  let folder=root?resolve(root):dirname(fileURLToPath(import.meta.url));
  if(!root)while(!existsSync(join(folder,'settings.gradle.kts'))&&dirname(folder)!==folder)folder=dirname(folder);
  const path=join(folder,'.env');
  let stat;try{stat=lstatSync(path);}catch(error){if(error.code==='ENOENT')return {};throw error;}
  requireThat(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o077),'La configuración .env de Loyalty debe ser privada (0600).');
  const values={};
  for(const line of readFileSync(path,'utf8').split(/\r?\n/)) {
    const match=line.match(/^(STAGING_ADMIN_TOKEN|LOYALTY_HTTP_PORT)=(.*)$/);
    if(match)values[match[1]]=match[2].trim().replace(/^(["'])(.*)\1$/,'$2');
  }
  requireThat(new URL(origin).port===String(values.LOYALTY_HTTP_PORT||8097),'El puerto privado de Loyalty no coincide con .env.');
  requireThat(values.STAGING_ADMIN_TOKEN,'Falta la configuración interna de Loyalty.');
  requireThat(platformTokenPattern.test(values.STAGING_ADMIN_TOKEN),'La configuración interna de Loyalty no tiene el formato admitido. Conserva la credencial original.');
  return {platformToken:values.STAGING_ADMIN_TOKEN};
}
