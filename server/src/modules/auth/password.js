import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Argon2id (the library's default algorithm) at OWASP's minimum settings: 19 MiB of memory,
// 2 iterations, 1 lane. Each hash records its own settings, so they can be raised later
// without breaking existing passwords.
const HASH_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password) {
  return hash(password, HASH_OPTIONS);
}

export function verifyPassword(passwordHash, password) {
  return verify(passwordHash, password);
}

let dummyHash;

// Does the same work as a real verification against a throwaway hash. Used when no account
// matches, so a failed login takes about as long whether or not the email is registered.
export async function verifyDummyPassword(password) {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  await verify(await dummyHash, password);
}
