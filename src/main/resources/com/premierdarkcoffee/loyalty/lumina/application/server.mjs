import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { setupCode } from '../access/accounts.mjs';
import { loadKey } from '../access/security.mjs';
import { createPortal } from './app.mjs';
import { dataDirectory, openDatabase } from '../infrastructure/database.mjs';
import { loadIntegration } from '../wallet/integration.mjs';
import { loyaltyOrigin } from '../wallet/bridge.mjs';

import { productionGuard, productionReadiness } from '../infrastructure/production.mjs';

process.umask(0o077);
const production=productionGuard();
const port = Number(process.env.LUMINA_PORT || 8099);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto LUMINA_PORT inválido.');
const loyaltyUrl = loyaltyOrigin(process.env.LUMINA_LOYALTY_URL);
if (new URL(loyaltyUrl).port === String(port)) throw new Error('Usa puertos distintos para Lúmina y Loyalty.');
const publicOrigin = process.env.LUMINA_ORIGIN || null;
if (publicOrigin) {
  const parsed = new URL(publicOrigin);
  if (parsed.protocol !== 'https:' || parsed.origin !== publicOrigin) throw new Error('LUMINA_ORIGIN debe ser un origen HTTPS sin rutas.');
}
const integration=loadIntegration(loyaltyUrl);
const directory = dataDirectory();
const databasePath = join(directory,'agency.sqlite');
const exists = existsSync(databasePath);
if (exists && !lstatSync(databasePath).isFile()) throw new Error('La base de Lúmina debe ser un archivo privado.');
const key = loadKey(directory,exists);
const db = openDatabase(databasePath);
const readiness=production?()=>productionReadiness(db,loyaltyUrl,process.env.SOURCE_SHA):null;
if(readiness)try{await readiness();}catch(error){db.close();throw error;}
const server = createPortal({db,key,loyaltyUrl,publicOrigin,integration,readiness});
server.on('error',error=>{
  db.close();
  process.stderr.write(error.code==='EADDRINUSE' ? 'El puerto de Lúmina ya está ocupado.\n' : 'No se pudo iniciar Lúmina.\n');
  process.exitCode = 1;
});
server.listen(port,'127.0.0.1',()=>{
  const origin = publicOrigin || `http://127.0.0.1:${port}`;
  process.stdout.write(`Lúmina Digital disponible en ${origin}\n`);
  const code = setupCode(db);
  if (code) process.stdout.write(`Configuración inicial: ${origin}/configurar\nCódigo de un solo uso: ${code}\n`);
});
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close(()=>db.close()));
