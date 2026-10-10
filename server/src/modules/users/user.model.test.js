import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeName, User } from './user.model.js';

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

  it('only stores account and authentication fields', () => {
    expect(Object.keys(User.schema.paths).sort()).toEqual(
      ['__v', '_id', 'createdAt', 'email', 'name', 'passwordHash', 'tokenVersion', 'updatedAt'].sort(),
    );
  });

  it('keeps a name within 2 to 80 characters, and allows none for older accounts', async () => {
    const valid = new User({ email: 'ada@example.com', name: '  Ada Lovelace ', passwordHash: '$argon2id$hash' });
    const withoutName = new User({ email: 'ada@example.com', passwordHash: '$argon2id$hash' });
    const tooShort = await new User({ email: 'ada@example.com', name: 'A', passwordHash: 'x' }).validate().catch((caught) => caught);
    const tooLong = await new User({ email: 'ada@example.com', name: 'A'.repeat(81), passwordHash: 'x' }).validate().catch((caught) => caught);

    await expect(valid.validate()).resolves.toBeUndefined();
    expect(valid.name).toBe('Ada Lovelace');
    await expect(withoutName.validate()).resolves.toBeUndefined();
    expect(tooShort.errors.name).toBeDefined();
    expect(tooLong.errors.name).toBeDefined();
  });
});

describe('normalizeName', () => {
  it('trims, joins whitespace and composes accents', () => {
    expect(normalizeName('  Zoe\u0301 \t  Ange\u0300le\n')).toBe('Zoé Angèle');
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ada@Example.COM\n')).toBe('ada@example.com');
  });
});
