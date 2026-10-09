import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryAuditLogStore } from '../../testing/memoryAuditLogStore.js';
import { createMemoryOrganizationStores } from '../../testing/memoryOrganizationStores.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { signUp } from '../../testing/signUp.js';
import { recordAuditEvent } from './audit.service.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';

// Ada owns Acme and Grace owns Globex; each renamed their organization once through the API.
async function setup() {
  const users = createMemoryUserStore();
  const stores = createMemoryOrganizationStores();
  const auditLogs = createMemoryAuditLogStore();
  const logs = captureLogger();
  const app = createApp({
    logger: logs,
    clientOrigin: ORIGIN,
    auth: { users, secret: SECRET, secureCookie: false },
    organizationStores: stores,
    auditLogs,
  });

  async function ownerOf(email, slug, newName) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    const created = await request(app).post('/api/v1/organizations').set('Origin', ORIGIN).set('Cookie', cookie).send({ name: slug, slug });
    const organizationId = created.body.organization.id;
    await request(app).patch(`/api/v1/organizations/${organizationId}`).set('Origin', ORIGIN).set('Cookie', cookie).send({ name: newName });
    return { user, cookie, organizationId };
  }

  // Signs up another user and adds them to `organizationId` with `role`.
  async function memberOf(organizationId, email, role) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    await stores.memberships.create({ organizationId, userId: user.id, role });
    return { user, cookie };
  }

  const ada = await ownerOf('ada@example.com', 'acme', 'Acme Logistics');
  const grace = await ownerOf('grace@example.com', 'globex', 'Globex Corporation');
  return { app, logs, users, stores, auditLogs, ada, grace, memberOf };
}

const auditPath = (organizationId) => `/api/v1/organizations/${organizationId}/audit-logs`;

function listAuditLogs(app, organizationId, cookie, query = '') {
  const req = request(app).get(`${auditPath(organizationId)}${query}`);
  return cookie ? req.set('Cookie', cookie) : req;
}

describe('GET /api/v1/organizations/:organizationId/audit-logs', () => {
  it('returns the organization’s audit events, with who did what', async () => {
    const { app, ada } = await setup();

    const response = await listAuditLogs(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      auditLogs: [
        {
          id: expect.any(String),
          actorType: 'user',
          actorEmail: 'ada@example.com',
          action: 'organization.updated',
          resourceType: 'organization',
          resourceId: ada.organizationId,
          details: { previousName: 'acme', name: 'Acme Logistics' },
          createdAt: expect.any(String),
        },
      ],
      page: 1,
      limit: 25,
      hasMore: false,
    });
  });

  it('returns an empty list for an organization with no events', async () => {
    const { app, stores, ada } = await setup();
    const created = await request(app)
      .post('/api/v1/organizations')
      .set('Origin', ORIGIN)
      .set('Cookie', ada.cookie)
      .send({ name: 'Quiet', slug: 'quiet' });
    expect(stores.organizations.records.size).toBe(3);

    const response = await listAuditLogs(app, created.body.organization.id, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ auditLogs: [], page: 1, limit: 25, hasMore: false });
  });

  it('lists entries newest first', async () => {
    const { app, ada } = await setup();
    for (const name of ['Second', 'Third']) {
      await request(app).patch(`/api/v1/organizations/${ada.organizationId}`).set('Origin', ORIGIN).set('Cookie', ada.cookie).send({ name });
    }

    const response = await listAuditLogs(app, ada.organizationId, ada.cookie);

    expect(response.body.auditLogs.map((entry) => entry.details)).toEqual([
      { previousName: 'Second', name: 'Third' },
      { previousName: 'Acme Logistics', name: 'Second' },
      { previousName: 'acme', name: 'Acme Logistics' },
    ]);
  });

  it('pages through entries with page and limit', async () => {
    const { app, auditLogs, ada } = await setup();
    for (let index = 1; index <= 4; index += 1) {
      await recordAuditEvent(auditLogs, {
        organizationId: ada.organizationId,
        actor: { type: 'system' },
        action: 'organization.updated',
        resourceId: ada.organizationId,
        details: { name: `Name ${index}` },
      });
    }

    const first = await listAuditLogs(app, ada.organizationId, ada.cookie, '?limit=2');
    const second = await listAuditLogs(app, ada.organizationId, ada.cookie, '?page=2&limit=2');
    const third = await listAuditLogs(app, ada.organizationId, ada.cookie, '?page=3&limit=2');

    expect(first.body).toMatchObject({ page: 1, limit: 2, hasMore: true });
    expect(first.body.auditLogs.map((entry) => entry.details.name)).toEqual(['Name 4', 'Name 3']);
    expect(second.body).toMatchObject({ page: 2, limit: 2, hasMore: true });
    expect(second.body.auditLogs.map((entry) => entry.details.name)).toEqual(['Name 2', 'Name 1']);
    expect(third.body).toMatchObject({ page: 3, limit: 2, hasMore: false });
    expect(third.body.auditLogs.map((entry) => entry.details.name)).toEqual(['Acme Logistics']);
  });

  it('never returns more than 100 entries', async () => {
    const { app, auditLogs, ada } = await setup();
    for (let index = 0; index < 120; index += 1) {
      await recordAuditEvent(auditLogs, {
        organizationId: ada.organizationId,
        actor: { type: 'system' },
        action: 'organization.updated',
        resourceId: ada.organizationId,
      });
    }

    const response = await listAuditLogs(app, ada.organizationId, ada.cookie, '?limit=100');

    expect(response.body.auditLogs).toHaveLength(100);
    expect(response.body.hasMore).toBe(true);
  });

  it.each([
    ['a limit over 100', '?limit=101', 'Limit must be a whole number from 1 to 100'],
    ['a zero limit', '?limit=0', 'Limit must be a whole number from 1 to 100'],
    ['a negative limit', '?limit=-5', 'Limit must be a whole number from 1 to 100'],
    ['a fractional limit', '?limit=2.5', 'Limit must be a whole number from 1 to 100'],
    ['a text limit', '?limit=all', 'Limit must be a whole number from 1 to 100'],
    ['a repeated limit', '?limit=1&limit=2', 'Limit must be a whole number from 1 to 100'],
    ['a huge limit', '?limit=99999999999999999999', 'Limit must be a whole number from 1 to 100'],
    ['a zero page', '?page=0', 'Page must be a whole number from 1 to 1000'],
    ['a page past 1000', '?page=1001', 'Page must be a whole number from 1 to 1000'],
    ['an empty page', '?page=', 'Page must be a whole number from 1 to 1000'],
  ])('rejects %s with 400', async (_, query, message) => {
    const { app, ada } = await setup();

    const response = await listAuditLogs(app, ada.organizationId, ada.cookie, query);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message });
  });

  it('never returns another organization’s events', async () => {
    const { app, ada, grace } = await setup();

    const adaList = await listAuditLogs(app, ada.organizationId, ada.cookie);
    const graceList = await listAuditLogs(app, grace.organizationId, grace.cookie);

    expect(adaList.body.auditLogs.map((entry) => entry.details.name)).toEqual(['Acme Logistics']);
    expect(graceList.body.auditLogs.map((entry) => entry.details.name)).toEqual(['Globex Corporation']);
    expect(adaList.text).not.toContain('Globex');
    expect(graceList.text).not.toContain('Acme');
  });

  it('cannot be pointed at another organization through the query, headers or body', async () => {
    const { app, ada, grace } = await setup();

    const response = await request(app)
      .get(`${auditPath(grace.organizationId)}?organizationId=${ada.organizationId}`)
      .set('Cookie', grace.cookie)
      .set('X-Organization-Id', ada.organizationId)
      .send({ organizationId: ada.organizationId });

    expect(response.status).toBe(200);
    expect(response.body.auditLogs.map((entry) => entry.resourceId)).toEqual([grace.organizationId]);
  });

  it('gives a non-member the same 404 as an organization that does not exist', async () => {
    const { app, ada, grace } = await setup();

    const otherOrganization = await listAuditLogs(app, ada.organizationId, grace.cookie);
    const missingOrganization = await listAuditLogs(app, 'f'.repeat(24), grace.cookie);

    for (const response of [otherOrganization, missingOrganization]) {
      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    }
    expect(otherOrganization.text).not.toContain('Acme');
  });

  it.each(['owner', 'admin'])('lets an organization %s read the log', async (role) => {
    const { app, ada, memberOf } = await setup();
    const reader = await memberOf(ada.organizationId, `${role}@example.com`, role);

    const response = await listAuditLogs(app, ada.organizationId, reader.cookie);

    expect(response.status).toBe(200);
    expect(response.body.auditLogs).toHaveLength(1);
  });

  it('refuses a member with 403, revealing no entries', async () => {
    const { app, ada, memberOf } = await setup();
    const member = await memberOf(ada.organizationId, 'member@example.com', 'member');

    const response = await listAuditLogs(app, ada.organizationId, member.cookie);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'You do not have permission to do this' });
    expect(response.text).not.toContain('Acme Logistics');
  });

  it.each([
    ['without a session cookie', undefined],
    ['with an invalid session token', 'opspilot_session=not-a-jwt'],
  ])('rejects a request %s with 401', async (_, cookie) => {
    const { app, ada } = await setup();

    const response = await listAuditLogs(app, ada.organizationId, cookie);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed organization ID with 400', async () => {
    const { app, ada } = await setup();

    const response = await listAuditLogs(app, 'not-an-id', ada.cookie);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns only display fields, never internal IDs, credentials or the session', async () => {
    const { app, users, ada } = await setup();

    const response = await listAuditLogs(app, ada.organizationId, ada.cookie);

    expect(Object.keys(response.body).sort()).toEqual(['auditLogs', 'hasMore', 'limit', 'page']);
    expect(Object.keys(response.body.auditLogs[0]).sort()).toEqual([
      'action',
      'actorEmail',
      'actorType',
      'createdAt',
      'details',
      'id',
      'resourceId',
      'resourceType',
    ]);
    const account = users.records.get(ada.user.id);
    expect(response.text).not.toContain(account.passwordHash);
    expect(response.text).not.toContain(ada.cookie.split('=')[1]);
    expect(response.text).not.toContain(ada.user.id);
    expect(response.text).not.toMatch(/organizationId|actorUserId|userId|_id|__v|password|tokenVersion/);
  });

  it('has no way to write entries over HTTP', async () => {
    const { app, auditLogs, ada } = await setup();

    for (const method of ['post', 'put', 'patch', 'delete']) {
      const response = await request(app)
        [method](auditPath(ada.organizationId))
        .set('Origin', ORIGIN)
        .set('Cookie', ada.cookie)
        .send({ actorType: 'ai', action: 'organization.updated', details: { name: 'Forged' } });

      expect(response.status).toBe(404);
    }
    expect(auditLogs.records).toHaveLength(2);
    expect(JSON.stringify(auditLogs.records)).not.toContain('Forged');
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, logs, auditLogs, ada } = await setup();
    auditLogs.listForOrganization = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await listAuditLogs(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });
});
