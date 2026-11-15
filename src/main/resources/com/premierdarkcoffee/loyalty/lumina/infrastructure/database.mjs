import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, chmodSync, lstatSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

export function dataDirectory() {
  const folder = resolve(process.env.LUMINA_DATA_DIR || resolve(homedir(), '.lumina-digital', 'agency'));
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const stat = lstatSync(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Selecciona una carpeta de datos privada de Lúmina.');
  const files = readdirSync(folder);
  const known = ['agency.key','agency.sqlite','agency.sqlite-wal','agency.sqlite-shm','migrations','uploads'];
  if (files.some(file => !known.includes(file))) throw new Error('Usa una carpeta exclusiva para los datos de Lúmina.');
  chmodSync(folder, 0o700);
  return folder;
}
export function openDatabase(path) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.function('search_text', { deterministic: true }, value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 12) { db.close(); throw new Error('Esta versión de Lúmina no reconoce el esquema de datos.'); }
  const transaction = work => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = work();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  if (version === 0) {
    transaction(() => {
      db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
      db.exec('PRAGMA user_version=1');
    });
  }
  for (const [target,file] of [[2,'002_unified.sql'],[3,'003_onboarding.sql'],[4,'004_packages.sql'],[5,'005_request_contact.sql'],[6,'006_black_friday.sql'],[7,'007_wallet_onboarding.sql'],[8,'008_business_control.sql'],[9,'009_identity_services.sql'],[10,'010_person_contact.sql'],[11,'011_delivery_workspace.sql'],[12,'012_administration.sql']]) {
    if (db.prepare('PRAGMA user_version').get().user_version >= target) continue;
    // One coherent private snapshot of the original database precedes all pending migrations.
    if (version > 0 && path !== ':memory:' && target===version+1) {
      const folder=join(dirname(resolve(path)),'migrations');
      mkdirSync(folder,{recursive:true,mode:0o700});
      const stat=lstatSync(folder);
      if(!stat.isDirectory()||stat.isSymbolicLink()){db.close();throw new Error('Carpeta de respaldo inválida.');}
      chmodSync(folder,0o700);
      const backup=join(folder,'before-v'+target+'-'+randomUUID()+'.sqlite');
      db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");chmodSync(backup,0o600);
    }
    transaction(()=>{
      db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
      db.exec('PRAGMA user_version='+target);
    });
  }
  return {
    all: (sql, ...values) => db.prepare(sql).all(...values),
    get: (sql, ...values) => db.prepare(sql).get(...values),
    run: (sql, ...values) => db.prepare(sql).run(...values),
    transaction,
    close: () => db.close(),
  };
}
