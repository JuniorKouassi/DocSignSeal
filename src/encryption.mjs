import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/* Per-file envelope encryption. Each file gets its own random 256-bit data
   encryption key (DEK); the DEK is what actually encrypts the file bytes,
   and the DEK itself is encrypted ("wrapped") with a master key before it's
   stored in files.encrypted_key.

   Pure functions, master key passed in explicitly: the caller (lib/storage/
   encryption.ts) owns reading FILE_ENCRYPTION_MASTER_KEY from the
   environment. Swapping this for a real KMS later means rewriting seal()/
   unseal()'s key source there, not anything that calls encryptFile/
   decryptFile. Deleting the master key (or a real KMS's key) is the fast
   path for honouring an erasure request across every file it wrapped. */

function seal(key, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function unseal(key, sealed) {
  const iv = sealed.subarray(0, 12);
  const authTag = sealed.subarray(12, 28);
  const ciphertext = sealed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptFile(masterKey, plaintext) {
  const dek = randomBytes(32);
  return {
    ciphertext: seal(dek, plaintext),
    wrappedKey: seal(masterKey, dek),
  };
}

export function decryptFile(masterKey, ciphertext, wrappedKey) {
  const dek = unseal(masterKey, wrappedKey);
  return unseal(dek, ciphertext);
}
