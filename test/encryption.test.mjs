import { randomBytes } from 'node:crypto';
import { encryptFile, decryptFile } from '../src/encryption.mjs';

const masterKey = randomBytes(32);
const plaintext = Buffer.from('the quick brown fox jumps over the lazy dog, twice, in a PDF');

const { ciphertext, wrappedKey } = encryptFile(masterKey, plaintext);
console.log('1. ciphertext differs :', !ciphertext.equals(plaintext));
console.log('2. round trip         :', decryptFile(masterKey, ciphertext, wrappedKey).equals(plaintext));

const wrongKey = randomBytes(32);
let wrongKeyThrew = false;
try { decryptFile(wrongKey, ciphertext, wrappedKey); } catch { wrongKeyThrew = true; }
console.log('3. wrong master key   :', wrongKeyThrew);

let tamperedThrew = false;
const tampered = Buffer.from(ciphertext);
tampered[tampered.length - 1] ^= 0xff;
try { decryptFile(masterKey, tampered, wrappedKey); } catch { tamperedThrew = true; }
console.log('4. tampered ciphertext:', tamperedThrew);
