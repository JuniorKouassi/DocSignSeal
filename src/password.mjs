import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

/* Password hashing, node:crypto scrypt. No bcrypt/argon2 dependency: scrypt is
   in the standard library and its cost parameters are tunable, which is what
   this needs. Encodes N, r, p and the salt alongside the hash so parameters
   can change later without breaking verification of existing hashes. */

const N = 16384, r = 8, p = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, salt, expected.length, {
    N: Number(nStr), r: Number(rStr), p: Number(pStr)
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
