import { afterEach, describe, expect, it, vi } from 'vitest';
import { User } from './user.model.js';
import { userStore } from './user.store.js';

// Only the store's own logic is covered here; queries against a real database are not.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('userStore.create', () => {
  it('returns a plain user without the password hash', async () => {
    const createdAt = new Date();
    vi.spyOn(User, 'create').mockResolvedValue(
      new User({ email: 'ada@example.com', passwordHash: '$argon2id$hash', createdAt }),
    );

    const user = await userStore.create({ email: 'ada@example.com', passwordHash: '$argon2id$hash' });

    expect(user).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/), email: 'ada@example.com', tokenVersion: 0, createdAt });
  });

  it('returns null when the unique email index rejects the insert', async () => {
    vi.spyOn(User, 'create').mockRejectedValue(Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }));

    await expect(userStore.create({ email: 'ada@example.com', passwordHash: 'x' })).resolves.toBeNull();
  });

  it('passes other errors through', async () => {
    vi.spyOn(User, 'create').mockRejectedValue(new Error('network timeout'));

    await expect(userStore.create({ email: 'ada@example.com', passwordHash: 'x' })).rejects.toThrow('network timeout');
  });
});
