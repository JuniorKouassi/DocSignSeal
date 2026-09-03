import 'server-only';
import { encryptFile as encryptFileWith, decryptFile as decryptFileWith } from '../../src/encryption.mjs';

/* Lazy: see lib/db/client.ts's comment for why. Next.js's build-time
   page-data collection imports every route module without calling any
   handler; validating FILE_ENCRYPTION_MASTER_KEY at module scope meant no
   route could build until it existed, even ones that never touch files. */

let masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (masterKey) return masterKey;
  const hex = process.env.FILE_ENCRYPTION_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'FILE_ENCRYPTION_MASTER_KEY must be set to 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32'
    );
  }
  masterKey = Buffer.from(hex, 'hex');
  return masterKey;
}

export function encryptFile(plaintext: Buffer): { ciphertext: Buffer; wrappedKey: Buffer } {
  return encryptFileWith(getMasterKey(), plaintext);
}

export function decryptFile(ciphertext: Buffer, wrappedKey: Buffer): Buffer {
  return decryptFileWith(getMasterKey(), ciphertext, wrappedKey);
}
