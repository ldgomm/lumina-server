import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { requireThat } from '../shared/domain.mjs';

const derive = promisify(scrypt);
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummySalt = randomBytes(16);
export const randomCode = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const equal = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function loadKey(directory, existingDatabase) {
  const file = join(directory, 'agency.key');
  try {
    const info = lstatSync(file);
    requireThat(info.isFile() && (info.mode & 0o077) === 0, 'Revisa los permisos de agency.key.');
    const key = readFileSync(file);
    requireThat(key.length === 32, 'La clave de Lúmina es inválida.');
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  requireThat(!existingDatabase, 'Falta la clave de la base de Lúmina. Restaura la copia original de agency.key.');
  const key = randomBytes(32);
  writeFileSync(file, key, { flag: 'wx', mode: 0o600 });
  return key;
}
export function fingerprint(key, type, value) {
  return createHmac('sha256', key).update(type + '\0' + value).digest('hex');
}
export async function hashPassword(password) {
  requireThat(typeof password === 'string' && password.length >= 12 && password.length <= 128 &&
    Buffer.byteLength(password) <= 512, 'Elige una contraseña de 12 a 128 caracteres.');
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32, parameters);
  return salt.toString('hex') + ':' + hash.toString('hex');
}
export async function verifyPassword(password, record) {
  if (typeof password !== 'string' || password.length > 128 || Buffer.byteLength(password) > 512) return false;
  const [salt, expected] = (record || '').split(':');
  const hash = await derive(password, salt ? Buffer.from(salt, 'hex') : dummySalt, 32, parameters);
  return Boolean(expected && equal(hash.toString('hex'), expected));
}
export function seal(key, context, secret) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([nonce, cipher.update(secret, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}
export function unseal(key, context, encrypted) {
  const data = Buffer.from(encrypted, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString('utf8');
}
