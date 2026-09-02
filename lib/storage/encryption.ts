import 'server-only';
import { encryptFile as encryptFileWith, decryptFile as decryptFileWith } from '../../src/encryption.mjs';

const masterKeyHex = process.env.FILE_ENCRYPTION_MASTER_KEY;
if (!masterKeyHex || masterKeyHex.length !== 64) {
  throw new Error(
    'FILE_ENCRYPTION_MASTER_KEY must be set to 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32'
  );
}
const masterKey = Buffer.from(masterKeyHex, 'hex');

export function encryptFile(plaintext: Buffer): { ciphertext: Buffer; wrappedKey: Buffer } {
  return encryptFileWith(masterKey, plaintext);
}

export function decryptFile(ciphertext: Buffer, wrappedKey: Buffer): Buffer {
  return decryptFileWith(masterKey, ciphertext, wrappedKey);
}
