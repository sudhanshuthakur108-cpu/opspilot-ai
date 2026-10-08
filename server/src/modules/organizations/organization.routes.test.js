import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryOrganizationStores } from '../../testing/memoryOrganizationStores.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { signUp } from '../../testing/signUp.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';
const ACME = { name: 'Acme Logistics', slug: 'acme-logistics' };

function setup({ memberships } = {}) {
  const users = createMemoryUserStore();
  const stores = createMemoryOrganizationStores();
  const logs = captureLogger();
  const app = createApp({
    logger: logs,
    clientOrigin: ORIGIN,
    auth: { users, secret: SECRET, secureCookie: false },
    organizationStores: { ...stores, memberships: memberships ?? stores.memberships },
  });
  return { app, users, stores, logs };
}

function createOrganization(app, cookie, body) {
  const req = request(app).post('/api/v1/organizations').set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

describe('POST /api/v1/organizations', () => {
  it('creates an organization owned by the signed-in user', async () => {
    const { app, stores } = setup();
    const { user, cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, ACME);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      organization: {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        name: 'Acme Logistics',
        slug: 'acme-logistics',
        createdAt: expect.any(String),
      },
      membership: {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        organizationId: response.body.organization.id,
        userId: user.id,
        role: 'owner',
        createdAt: expect.any(String),
      },
    });
    expect(stores.organizations.records.size).toBe(1);
    expect(stores.memberships.records.size).toBe(1);
  });

  it('normalizes the name and slug the same way the model does', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, { name: '  Acme  ', slug: ' Acme-Logistics ' });

    expect(response.status).toBe(201);
    expect(response.body.organization).toMatchObject({ name: 'Acme', slug: 'acme-logistics' });
  });

  it('makes the caller the owner even when the body names someone else', async () => {
    const { app, stores } = setup();
    const other = await signUp(app, { origin: ORIGIN, email: 'mallory@example.com' });
    const { user, cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, {
      ...ACME,
      ownerUserId: other.user.id,
      userId: other.user.id,
      role: 'member',
    });

    expect(response.status).toBe(201);
    expect(response.body.membership).toMatchObject({ userId: user.id, role: 'owner' });
    expect([...stores.memberships.records.values()].map((record) => record.userId)).toEqual([user.id]);
  });

  it.each([
    ['without a session cookie', async () => undefined],
    ['with an invalid session token', async () => 'opspilot_session=not-a-jwt'],
    [
      'after logging out',
      async (app) => {
        const { cookie } = await signUp(app, { origin: ORIGIN });
        await request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie);
        return cookie;
      },
    ],
  ])('rejects a request %s with 401', async (_, getCookie) => {
    const { app, stores } = setup();

    const response = await createOrganization(app, await getCookie(app), ACME);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(stores.organizations.records.size).toBe(0);
  });

  it('checks authentication before validating the body', async () => {
    const { app } = setup();

    const response = await createOrganization(app, undefined, { name: 42 });

    expect(response.status).toBe(401);
  });

  it.each([
    ['a missing name', { slug: 'acme' }],
    ['an empty name', { name: '', slug: 'acme' }],
    ['a blank name', { name: '   ', slug: 'acme' }],
    ['a name over 100 characters', { name: 'a'.repeat(101), slug: 'acme' }],
    ['a numeric name', { name: 42, slug: 'acme' }],
    ['a null name', { name: null, slug: 'acme' }],
    ['an array name', { name: ['Acme'], slug: 'acme' }],
  ])('rejects %s', async (_, body) => {
    const { app, stores } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Name must be between 1 and 100 characters',
      requestId: response.headers['x-request-id'],
    });
    expect(stores.organizations.records.size).toBe(0);
  });

  it.each([
    ['a missing slug', { name: 'Acme' }],
    ['an empty slug', { name: 'Acme', slug: '' }],
    ['a slug with spaces', { name: 'Acme', slug: 'acme logistics' }],
    ['a slug with underscores', { name: 'Acme', slug: 'acme_logistics' }],
    ['a slug with a leading hyphen', { name: 'Acme', slug: '-acme' }],
    ['a slug with doubled hyphens', { name: 'Acme', slug: 'acme--logistics' }],
    ['a slug with non-ASCII letters', { name: 'Acme', slug: 'ácme' }],
    ['a slug over 60 characters', { name: 'Acme', slug: 'a'.repeat(61) }],
    ['a numeric slug', { name: 'Acme', slug: 42 }],
    ['an object slug', { name: 'Acme', slug: { $ne: null } }],
  ])('rejects %s', async (_, body) => {
    const { app, stores } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Slug must be up to 60 lowercase letters and numbers, in words separated by single hyphens',
    });
    expect(stores.organizations.records.size).toBe(0);
  });

  it('rejects a body that is not a JSON object', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, [ACME]);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects malformed JSON through the central error handler', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await request(app)
      .post('/api/v1/organizations')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'INVALID_JSON', requestId: response.headers['x-request-id'] });
  });

  it('returns 409 for a slug that is already taken, in any case, without writing anything', async () => {
    const { app, stores } = setup();
    const first = await signUp(app, { origin: ORIGIN });
    const second = await signUp(app, { origin: ORIGIN, email: 'grace@example.com' });
    await createOrganization(app, first.cookie, ACME);

    const response = await createOrganization(app, second.cookie, { name: 'Another Acme', slug: 'ACME-Logistics' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'SLUG_UNAVAILABLE',
        message: 'This organization address is already taken',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(stores.organizations.records.size).toBe(1);
    expect(stores.memberships.records.size).toBe(1);
  });

  it('returns only organization and membership fields', async () => {
    const { app, users } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, ACME);

    expect(Object.keys(response.body.organization).sort()).toEqual(['createdAt', 'id', 'name', 'slug']);
    expect(Object.keys(response.body.membership).sort()).toEqual(['createdAt', 'id', 'organizationId', 'role', 'userId']);
    expect(response.headers['set-cookie']).toBeUndefined();

    const [account] = users.records.values();
    expect(response.text).not.toContain(account.passwordHash);
    expect(response.text).not.toContain(cookie.split('=')[1]);
    expect(response.text).not.toMatch(/password|tokenVersion|email/i);
  });

  it('handles an unexpected failure through the central error handler without leaking details', async () => {
    const failingMemberships = {
      create: async () => {
        throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
      },
    };
    const { app, logs } = setup({ memberships: failingMemberships });
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, ACME);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });

  it('rejects a request from another origin before creating anything', async () => {
    const { app, stores } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await request(app)
      .post('/api/v1/organizations')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie)
      .send(ACME);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(stores.organizations.records.size).toBe(0);
  });
});

describe('GET /api/v1/organizations', () => {
  function listOrganizations(app, cookie) {
    const req = request(app).get('/api/v1/organizations');
    return cookie ? req.set('Cookie', cookie) : req;
  }

  it('returns an empty list for a user without organizations', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await listOrganizations(app, cookie);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ organizations: [] });
  });

  it('returns the organizations the user belongs to, with their role', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });
    const created = await createOrganization(app, cookie, ACME);

    const response = await listOrganizations(app, cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      organizations: [{ ...created.body.organization, role: 'owner' }],
    });
  });

  it('includes organizations the user joined with another role', async () => {
    const { app, stores } = setup();
    const owner = await signUp(app, { origin: ORIGIN, email: 'grace@example.com' });
    const { user, cookie } = await signUp(app, { origin: ORIGIN });
    const created = await createOrganization(app, owner.cookie, ACME);
    await stores.memberships.create({
      organizationId: created.body.organization.id,
      userId: user.id,
      role: 'admin',
    });

    const response = await listOrganizations(app, cookie);

    expect(response.body.organizations).toEqual([{ ...created.body.organization, role: 'admin' }]);
  });

  // Documented order: newest first by createdAt, ties broken by ID (later IDs are newer).
  it('returns several organizations newest first', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });
    for (const slug of ['first', 'second', 'third']) {
      await createOrganization(app, cookie, { name: slug, slug });
    }

    const response = await listOrganizations(app, cookie);

    expect(response.body.organizations.map((organization) => organization.slug)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });

  it('never returns an organization of another user, whatever the request says', async () => {
    const { app } = setup();
    const ada = await signUp(app, { origin: ORIGIN });
    const grace = await signUp(app, { origin: ORIGIN, email: 'grace@example.com' });
    await createOrganization(app, ada.cookie, { name: 'Ada Co', slug: 'ada-co' });
    await createOrganization(app, grace.cookie, { name: 'Grace Co', slug: 'grace-co' });

    const response = await request(app)
      .get(`/api/v1/organizations?userId=${grace.user.id}`)
      .set('Cookie', ada.cookie)
      .set('X-User-Id', grace.user.id)
      .send({ userId: grace.user.id });

    expect(response.status).toBe(200);
    expect(response.body.organizations.map((organization) => organization.slug)).toEqual(['ada-co']);
  });

  it.each([
    ['without a session cookie', undefined],
    ['with an invalid session token', 'opspilot_session=not-a-jwt'],
  ])('rejects a request %s with 401', async (_, cookie) => {
    const { app } = setup();

    const response = await listOrganizations(app, cookie);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('returns only the listed organization fields', async () => {
    const { app, users } = setup();
    const { cookie } = await signUp(app, { origin: ORIGIN });
    await createOrganization(app, cookie, ACME);

    const response = await listOrganizations(app, cookie);

    expect(Object.keys(response.body)).toEqual(['organizations']);
    expect(Object.keys(response.body.organizations[0]).sort()).toEqual(['createdAt', 'id', 'name', 'role', 'slug']);
    expect(response.headers['set-cookie']).toBeUndefined();

    const [account] = users.records.values();
    expect(response.text).not.toContain(account.passwordHash);
    expect(response.text).not.toContain(cookie.split('=')[1]);
    expect(response.text).not.toMatch(/password|tokenVersion|email|userId|_id|__v/i);
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, stores, logs } = setup();
    stores.memberships.listForUser = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await listOrganizations(app, cookie);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });
});
