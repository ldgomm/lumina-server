import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { setupCode } from './accounts/accounts.mjs';
import { loadKey } from './accounts/security.mjs';
import { createPortal } from './app.mjs';
import { dataDirectory, openDatabase } from './database.mjs';
import { loyaltyOrigin } from './loyalty/bridge.mjs';

process.umask(0o077);
const port = Number(process.env.LUMINA_PORT || 8099);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto LUMINA_PORT inválido.');
const loyaltyUrl = loyaltyOrigin(process.env.LUMINA_LOYALTY_URL);
if (new URL(loyaltyUrl).port === String(port)) throw new Error('Usa puertos distintos para Lúmina y Loyalty.');
const publicOrigin = process.env.LUMINA_ORIGIN || null;
if (publicOrigin) {
  const parsed = new URL(publicOrigin);
  if (parsed.protocol !== 'https:' || parsed.origin !== publicOrigin) throw new Error('LUMINA_ORIGIN debe ser un origen HTTPS sin rutas.');
}
const directory = dataDirectory();
const databasePath = join(directory,'agency.sqlite');
const exists = existsSync(databasePath);
if (exists && !lstatSync(databasePath).isFile()) throw new Error('La base de Lúmina debe ser un archivo privado.');
const key = loadKey(directory,exists);
const db = openDatabase(databasePath);
const server = createPortal({db,key,loyaltyUrl,publicOrigin});
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
