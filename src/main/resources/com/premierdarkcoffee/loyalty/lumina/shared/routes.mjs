import { readFileSync } from 'node:fs';
import { requireThat } from './domain.mjs';

// Legacy names are accepted only at the HTTP boundary. Generated navigation is English.
const legacy=JSON.parse(readFileSync(new URL('./legacy-routes.json',import.meta.url),'utf8'));
const roots=new Set(['entrar','registro','activar','configurar','acceso-anterior','bienvenida','salir','salud',
  'inicio','resumen','agencia','clientes','equipos','equipo','caja','contenido','solicitudes','produccion',
  'agenda','agenda-general','pendientes','planes','servicios','canales','mapas','reportes','proximamente',
  'cuenta','ayuda','mi-estado-cuenta','administracion','gestion']);
const own=(map,key)=>Object.hasOwn(map,key)?map[key]:key;
const parameters=new Set(Object.values(legacy.parameters));
const valueParameters=new Set(['view','period','saved','contact','state','section']);

export function canonicalPath(path){
  if(path==='/assets/caja.js')return '/assets/cashier.js';
  for(const [oldName,newName]of [['/caja-assets/','/cashier-assets/'],['/gestion-api/','/management-api/']]){
    if(path.startsWith(oldName))return newName+path.slice(oldName.length);
  }
  const parts=path.split('/');
  if(roots.has(parts[1]))return parts.map((part,index)=>index?own(legacy.routes,part):part).join('/');
  if(parts[1]==='wallet'&&parts.length===3&&Object.hasOwn(legacy.routes,parts[2]))return '/wallet/'+legacy.routes[parts[2]];
  return path;
}

export function canonicalTarget(target){
  const result=new URL(target);
  result.pathname=canonicalPath(target.pathname);
  // Provider routes, artwork URLs, public QR slugs and native API payloads remain opaque.
  const proxy=/^\/(?:api|wallet-api|management-api|join|loyalty-assets|cashier-assets)(?:\/|$)/.test(result.pathname);
  if(proxy)return result;
  const pairs=new URLSearchParams(),seen=new Map();let changed=false;
  for(const [key,value]of target.searchParams){
    const name=own(legacy.parameters,key);
    let translated=value;
    if(valueParameters.has(name))translated=own(legacy.values,value);
    if(name==='saved'||name==='section')translated=own(legacy.routes,translated);
    if(parameters.has(name)&&seen.has(name)){
      requireThat(seen.get(name)===translated,'El enlace contiene filtros contradictorios. Vuelve a abrir la sección.',400);
      changed=true;continue;
    }
    seen.set(name,translated);pairs.append(name,translated);
    changed||=name!==key||translated!==value;
  }
  if(changed)result.search=pairs.toString();
  return result;
}

export function legacyRedirectAllowed(path){
  // Existing probes and cached scripts must still receive their original response type.
  return !/^\/(?:health|assets|api|wallet-api|management-api|loyalty-assets|cashier-assets)(?:\/|$)/.test(path);
}
