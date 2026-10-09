import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryAuditLogStore } from '../../testing/memoryAuditLogStore.js';
import { createMemoryOrganizationStores } from '../../testing/memoryOrganizationStores.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { signUp } from '../../testing/signUp.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';

// Ada owns Acme and Grace owns Globex, both created through the API.
async function setup({ withAuditLogs = true } = {}) {
  const users = createMemoryUserStore();
  const stores = createMemoryOrganizationStores();
  const auditLogs = createMemoryAuditLogStore();
  const logs = captureLogger();
  const app = createApp({
    logger: logs,
    clientOrigin: ORIGIN,
    auth: { users, secret: SECRET, secureCookie: false },
    organizationStores: stores,
    auditLogs: withAuditLogs ? auditLogs : undefined,
  });

  async function ownerOf(email, name, slug) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    const created = await request(app).post('/api/v1/organizations').set('Origin', ORIGIN).set('Cookie', cookie).send({ name, slug });
    return { user, cookie, organization: created.body.organization, organizationId: created.body.organization.id };
  }

  // Signs up another user and adds them to `organizationId` with `role`.
  async function memberOf(organizationId, email, role) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    await stores.memberships.create({ organizationId, userId: user.id, role });
    return { user, cookie };
  }

  const ada = await ownerOf('ada@example.com', 'Acme', 'acme');
  const grace = await ownerOf('grace@example.com', 'Globex', 'globex');
  const storedName = (organizationId) => stores.organizations.records.get(organizationId).name;
  return { app, logs, users, stores, auditLogs, ada, grace, memberOf, storedName };
}

function updateOrganization(app, organizationId, cookie, body) {
  const req = request(app).patch(`/api/v1/organizations/${organizationId}`).set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

describe('PATCH /api/v1/organizations/:organizationId', () => {
  it('renames the organization and returns it', async () => {
    const { app, ada, storedName } = await setup();

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, { name: 'Acme Logistics' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ organization: { ...ada.organization, name: 'Acme Logistics' } });
    expect(storedName(ada.organizationId)).toBe('Acme Logistics');
  });

  it('records an organization.updated audit event with the signed-in user as the actor', async () => {
    const { app, auditLogs, ada } = await setup();

    await updateOrganization(app, ada.organizationId, ada.cookie, { name: 'Acme Logistics' });

    expect(auditLogs.records).toEqual([
      {
        id: expect.any(String),
        organizationId: ada.organizationId,
        actorType: 'user',
        actorUserId: ada.user.id,
        action: 'organization.updated',
        resourceType: 'organization',
        resourceId: ada.organizationId,
        details: { previousName: 'Acme', name: 'Acme Logistics' },
        createdAt: expect.any(Date),
      },
    ]);
  });

  it('takes the actor from the session, whatever the body claims', async () => {
    const { app, auditLogs, ada, grace } = await setup();

    await updateOrganization(app, ada.organizationId, ada.cookie, {
      name: 'Acme Logistics',
      actorType: 'ai',
      actor: { type: 'system' },
      actorUserId: grace.user.id,
      userId: grace.user.id,
      role: 'owner',
      details: { password: 'leaked' },
    });

    expect(auditLogs.records).toHaveLength(1);
    expect(auditLogs.records[0]).toMatchObject({ actorType: 'user', actorUserId: ada.user.id });
    expect(auditLogs.records[0].details).toEqual({ previousName: 'Acme', name: 'Acme Logistics' });
  });

  it('trims the name', async () => {
    const { app, ada } = await setup();

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, { name: '  Acme Logistics  ' });

    expect(response.body.organization.name).toBe('Acme Logistics');
  });

  it('accepts a name of exactly 100 characters', async () => {
    const { app, ada } = await setup();

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, { name: 'a'.repeat(100) });

    expect(response.status).toBe(200);
  });

  it('writes nothing and records no event when the name does not change', async () => {
    const { app, auditLogs, ada } = await setup();

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, { name: ' Acme ' });

    expect(response.status).toBe(200);
    expect(response.body.organization).toEqual(ada.organization);
    expect(auditLogs.records).toHaveLength(0);
  });

  it('changes only the name, whatever else the body says', async () => {
    const { app, stores, ada, grace } = await setup();

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, {
      name: 'Acme Logistics',
      slug: 'hijacked',
      id: grace.organizationId,
      _id: grace.organizationId,
      organizationId: grace.organizationId,
      ownerUserId: grace.user.id,
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    expect(response.status).toBe(200);
    expect(response.body.organization).toEqual({ ...ada.organization, name: 'Acme Logistics' });
    expect(stores.organizations.records.get(grace.organizationId)).toMatchObject({ name: 'Globex', slug: 'globex' });
    expect([...stores.memberships.records.values()].map(({ organizationId, userId, role }) => ({ organizationId, userId, role }))).toEqual([
      { organizationId: ada.organizationId, userId: ada.user.id, role: 'owner' },
      { organizationId: grace.organizationId, userId: grace.user.id, role: 'owner' },
    ]);
  });

  it.each([
    ['a missing name', {}],
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a name over 100 characters', { name: 'a'.repeat(101) }],
    ['a numeric name', { name: 42 }],
    ['a null name', { name: null }],
    ['an array name', { name: ['Acme Logistics'] }],
    ['an operator object', { name: { $ne: null } }],
    ['only a slug', { slug: 'acme-logistics' }],
  ])('rejects %s and changes nothing', async (_, body) => {
    const { app, auditLogs, ada, storedName } = await setup();

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Name must be between 1 and 100 characters' });
    expect(storedName(ada.organizationId)).toBe('Acme');
    expect(auditLogs.records).toHaveLength(0);
  });

  it.each(['owner', 'admin'])('lets an organization %s rename it', async (role) => {
    const { app, auditLogs, ada, memberOf, storedName } = await setup();
    const manager = await memberOf(ada.organizationId, `${role}@example.com`, role);

    const response = await updateOrganization(app, ada.organizationId, manager.cookie, { name: 'Acme Logistics' });

    expect(response.status).toBe(200);
    expect(storedName(ada.organizationId)).toBe('Acme Logistics');
    expect(auditLogs.records[0].actorUserId).toBe(manager.user.id);
  });

  it('refuses a member with 403 and changes nothing', async () => {
    const { app, auditLogs, ada, memberOf, storedName } = await setup();
    const member = await memberOf(ada.organizationId, 'member@example.com', 'member');

    const response = await updateOrganization(app, ada.organizationId, member.cookie, { name: 'Taken over', role: 'owner' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'You do not have permission to do this' });
    expect(storedName(ada.organizationId)).toBe('Acme');
    expect(auditLogs.records).toHaveLength(0);
  });

  it('gives a non-member the same 404 as an organization that does not exist, and changes nothing', async () => {
    const { app, auditLogs, ada, grace, storedName } = await setup();

    const otherOrganization = await updateOrganization(app, ada.organizationId, grace.cookie, { name: 'Renamed by Grace' });
    const missingOrganization = await updateOrganization(app, 'f'.repeat(24), grace.cookie, { name: 'Renamed by Grace' });

    for (const response of [otherOrganization, missingOrganization]) {
      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    }
    expect(storedName(ada.organizationId)).toBe('Acme');
    expect(auditLogs.records).toHaveLength(0);
  });

  it('cannot be pointed at another organization through the query, headers or body', async () => {
    const { app, auditLogs, ada, grace, storedName } = await setup();

    const response = await request(app)
      .patch(`/api/v1/organizations/${grace.organizationId}?organizationId=${ada.organizationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', grace.cookie)
      .set('X-Organization-Id', ada.organizationId)
      .send({ name: 'Globex Corporation', organizationId: ada.organizationId });

    expect(response.status).toBe(200);
    expect(response.body.organization.id).toBe(grace.organizationId);
    expect(storedName(grace.organizationId)).toBe('Globex Corporation');
    expect(storedName(ada.organizationId)).toBe('Acme');
    expect(auditLogs.records.map((entry) => entry.organizationId)).toEqual([grace.organizationId]);
  });

  it.each([
    ['without a session cookie', undefined],
    ['with an invalid session token', 'opspilot_session=not-a-jwt'],
  ])('rejects a request %s with 401, before reading the body', async (_, cookie) => {
    const { app, ada, storedName } = await setup();

    const response = await updateOrganization(app, ada.organizationId, cookie, { name: 42 });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(storedName(ada.organizationId)).toBe('Acme');
  });

  it('rejects a malformed organization ID with 400', async () => {
    const { app, ada } = await setup();

    const response = await updateOrganization(app, 'not-an-id', ada.cookie, { name: 'Acme Logistics' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Organization ID is not valid' });
  });

  it('rejects a request from another origin before changing anything', async () => {
    const { app, auditLogs, ada, storedName } = await setup();

    const response = await request(app)
      .patch(`/api/v1/organizations/${ada.organizationId}`)
      .set('Origin', 'https://evil.example')
      .set('Cookie', ada.cookie)
      .send({ name: 'Acme Logistics' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(storedName(ada.organizationId)).toBe('Acme');
    expect(auditLogs.records).toHaveLength(0);
  });

  it('returns only organization fields', async () => {
    const { app, users, ada } = await setup();

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, { name: 'Acme Logistics' });

    expect(Object.keys(response.body)).toEqual(['organization']);
    expect(Object.keys(response.body.organization).sort()).toEqual(['createdAt', 'id', 'name', 'slug']);
    expect(response.text).not.toContain(users.records.get(ada.user.id).passwordHash);
    expect(response.text).not.toMatch(/password|tokenVersion|email|userId|_id|__v/i);
  });

  it('is not available without an audit log, so no change goes unrecorded', async () => {
    const { app, ada, storedName } = await setup({ withAuditLogs: false });

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, { name: 'Acme Logistics' });

    expect(response.status).toBe(404);
    expect(storedName(ada.organizationId)).toBe('Acme');
  });

  it('handles an audit write failure through the central error handler without leaking details', async () => {
    const { app, logs, auditLogs, ada } = await setup();
    auditLogs.create = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await updateOrganization(app, ada.organizationId, ada.cookie, { name: 'Acme Logistics' });

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });
});
