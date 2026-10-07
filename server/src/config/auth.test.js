import { describe, expect, it } from 'vitest';
import { readAuthConfig } from './auth.js';

const SECRET = 'a'.repeat(32);

describe('readAuthConfig: CLIENT_ORIGIN', () => {
  it('defaults to the Vite dev server outside production', () => {
    expect(readAuthConfig({}, 'development', { databaseEnabled: false })).toEqual({
      clientOrigin: 'http://localhost:5173',
      auth: { jwtSecret: null },
      errors: [],
    });
  });

  it('is required in production', () => {
    const { errors } = readAuthConfig({ JWT_SECRET: SECRET }, 'production', { databaseEnabled: true });

    expect(errors).toEqual(['CLIENT_ORIGIN is required when NODE_ENV is production']);
  });

  it.each(['localhost:5173', 'http://localhost:5173/', 'https://app.example.com/login', 'ftp://app.example.com'])(
    'rejects %s',
    (origin) => {
      const { errors } = readAuthConfig({ CLIENT_ORIGIN: origin }, 'development', { databaseEnabled: false });

      expect(errors[0]).toMatch(/^CLIENT_ORIGIN must be an origin/);
    },
  );

  it('requires https in production', () => {
    const { errors } = readAuthConfig({ CLIENT_ORIGIN: 'http://app.example.com', JWT_SECRET: SECRET }, 'production', {
      databaseEnabled: true,
    });

    expect(errors).toEqual(['CLIENT_ORIGIN must use https in production']);
  });
});

describe('readAuthConfig: JWT_SECRET', () => {
  it('is required when the database (and therefore authentication) is enabled', () => {
    const { errors } = readAuthConfig({}, 'development', { databaseEnabled: true });

    expect(errors).toEqual(['JWT_SECRET must be at least 32 characters when MONGODB_URI is set']);
  });

  it('rejects a short secret without repeating it', () => {
    const { errors } = readAuthConfig({ JWT_SECRET: 'too-short-secret' }, 'development', { databaseEnabled: true });

    expect(errors).toHaveLength(1);
    expect(errors.join()).not.toContain('too-short-secret');
  });

  it('is read when authentication is enabled', () => {
    expect(readAuthConfig({ JWT_SECRET: SECRET }, 'development', { databaseEnabled: true }).auth).toEqual({
      jwtSecret: SECRET,
    });
  });

  it('is ignored without a database', () => {
    expect(readAuthConfig({ JWT_SECRET: 'short' }, 'development', { databaseEnabled: false })).toMatchObject({
      auth: { jwtSecret: null },
      errors: [],
    });
  });
});
