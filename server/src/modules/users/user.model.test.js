import { describe, expect, it } from 'vitest';
import { normalizeEmail, User } from './user.model.js';

// These run without a database: Mongoose validates and transforms documents locally.
describe('User model', () => {
  it('normalizes the email and defaults the token version', async () => {
    const user = new User({ email: '  Ada@Example.COM ', passwordHash: '$argon2id$hash' });

    await expect(user.validate()).resolves.toBeUndefined();
    expect(user.email).toBe('ada@example.com');
    expect(user.tokenVersion).toBe(0);
  });

  it('requires an email and a password hash', async () => {
    const error = await new User({}).validate().catch((caught) => caught);

    expect(Object.keys(error.errors).sort()).toEqual(['email', 'passwordHash']);
  });

  it('rejects a malformed email', async () => {
    const error = await new User({ email: 'not-an-email', passwordHash: '$argon2id$hash' })
      .validate()
      .catch((caught) => caught);

    expect(error.errors.email).toBeDefined();
  });

  it('declares a unique index on email', () => {
    expect(User.schema.indexes()).toContainEqual([{ email: 1 }, expect.objectContaining({ unique: true })]);
  });

  it('keeps the password hash out of queries and JSON', () => {
    expect(User.schema.path('passwordHash').options.select).toBe(false);

    const json = new User({ email: 'ada@example.com', passwordHash: '$argon2id$hash' }).toJSON();
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('__v');
  });

  it('only stores authentication fields', () => {
    expect(Object.keys(User.schema.paths).sort()).toEqual(
      ['__v', '_id', 'createdAt', 'email', 'passwordHash', 'tokenVersion', 'updatedAt'].sort(),
    );
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ada@Example.COM\n')).toBe('ada@example.com');
  });
});
