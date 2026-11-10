import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, chmodSync, lstatSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

export function dataDirectory() {
  const folder = resolve(process.env.LUMINA_DATA_DIR || resolve(homedir(), '.lumina-digital', 'agency'));
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const stat = lstatSync(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Selecciona una carpeta de datos privada de Lúmina.');
  const files = readdirSync(folder);
  const known = ['agency.key','agency.sqlite','agency.sqlite-wal','agency.sqlite-shm'];
  if (files.some(file => !known.includes(file))) throw new Error('Usa una carpeta exclusiva para los datos de Lúmina.');
  chmodSync(folder, 0o700);
  return folder;
}
export function openDatabase(path) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) { db.close(); throw new Error('Esta versión de Lúmina no reconoce el esquema de datos.'); }
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
  return {
    all: (sql, ...values) => db.prepare(sql).all(...values),
    get: (sql, ...values) => db.prepare(sql).get(...values),
    run: (sql, ...values) => db.prepare(sql).run(...values),
    transaction,
    close: () => db.close(),
  };
}
