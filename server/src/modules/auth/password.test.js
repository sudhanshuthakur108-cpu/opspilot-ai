import { describe, expect, it } from 'vitest';
import { hashPassword, verifyDummyPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('produces salted Argon2id hashes with the configured cost', async () => {
    const first = await hashPassword('correct horse battery');
    const second = await hashPassword('correct horse battery');

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('correct horse battery');
  });

  it('verifies only the matching password', async () => {
    const passwordHash = await hashPassword('correct horse battery');

    await expect(verifyPassword(passwordHash, 'correct horse battery')).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, 'Correct horse battery')).resolves.toBe(false);
  });

  it('runs a dummy verification for unknown accounts', async () => {
    await expect(verifyDummyPassword('anything')).resolves.toBeUndefined();
  });
});
