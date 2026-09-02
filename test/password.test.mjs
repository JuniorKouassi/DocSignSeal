import { hashPassword, verifyPassword } from '../src/password.mjs';

const hash = await hashPassword('correct horse battery staple');
console.log('1. hash is scrypt$   :', hash.startsWith('scrypt$16384$8$1$'));
console.log('2. correct password  :', await verifyPassword('correct horse battery staple', hash));
console.log('3. wrong password    :', await verifyPassword('wrong password', hash));
console.log('4. malformed hash    :', await verifyPassword('anything', 'not-a-real-hash'));
console.log('5. two hashes differ :', hash !== await hashPassword('correct horse battery staple'));
