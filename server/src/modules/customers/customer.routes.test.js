import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryCustomerStore } from '../../testing/memoryCustomerStore.js';
import { createMemoryOrganizationStores } from '../../testing/memoryOrganizationStores.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { signUp } from '../../testing/signUp.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';
const LEAK_PATTERN = /organizationId|userId|_id|__v|password|tokenVersion|role/;

// Ada owns Acme and Grace owns Globex, both created through the API.
async function setup() {
  const users = createMemoryUserStore();
  const stores = createMemoryOrganizationStores();
  const customers = createMemoryCustomerStore();
  const logs = captureLogger();
  const app = createApp({
    logger: logs,
    clientOrigin: ORIGIN,
    auth: { users, secret: SECRET, secureCookie: false },
    organizationStores: stores,
    customers,
  });

  async function ownerOf(email, name, slug) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    const response = await request(app)
      .post('/api/v1/organizations')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name, slug });
    return { user, cookie, organizationId: response.body.organization.id };
  }

  const ada = await ownerOf('ada@example.com', 'Acme', 'acme');
  const grace = await ownerOf('grace@example.com', 'Globex', 'globex');
  return { app, logs, stores, customers, ada, grace };
}

const customersPath = (organizationId) => `/api/v1/organizations/${organizationId}/customers`;

function createCustomer(app, organizationId, cookie, body) {
  const req = request(app).post(customersPath(organizationId)).set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

function listCustomers(app, organizationId, cookie) {
  const req = request(app).get(customersPath(organizationId));
  return cookie ? req.set('Cookie', cookie) : req;
}

describe('POST /api/v1/organizations/:organizationId/customers', () => {
  it('creates a customer in the organization from the route', async () => {
    const { app, customers, ada } = await setup();

    const response = await createCustomer(app, ada.organizationId, ada.cookie, {
      name: 'Initech',
      email: 'buyer@initech.example',
      phone: '+1 555 0100',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      customer: {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        name: 'Initech',
        email: 'buyer@initech.example',
        phone: '+1 555 0100',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    expect(customers.records).toHaveLength(1);
    expect(customers.records[0].organizationId).toBe(ada.organizationId);
  });

  it('trims the fields, lowercases the email and stores blank optional fields as empty', async () => {
    const { app, ada } = await setup();

    const full = await createCustomer(app, ada.organizationId, ada.cookie, {
      name: '  Initech  ',
      email: '  Buyer@Initech.Example ',
      phone: ' 555 0100 ',
    });
    const minimal = await createCustomer(app, ada.organizationId, ada.cookie, { name: 'Hooli', email: '   ', phone: null });

    expect(full.body.customer).toMatchObject({ name: 'Initech', email: 'buyer@initech.example', phone: '555 0100' });
    expect(minimal.status).toBe(201);
    expect(minimal.body.customer).toMatchObject({ name: 'Hooli', email: null, phone: null });
  });

  it('ignores an organization ID, or any other server-controlled field, in the body', async () => {
    const { app, customers, ada, grace } = await setup();

    const response = await createCustomer(app, ada.organizationId, ada.cookie, {
      name: 'Initech',
      organizationId: grace.organizationId,
      id: 'f'.repeat(24),
      createdAt: '2000-01-01T00:00:00.000Z',
      userId: grace.user.id,
      role: 'owner',
    });

    expect(response.status).toBe(201);
    expect(response.body.customer.id).not.toBe('f'.repeat(24));
    expect(response.body.customer.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(customers.records.map((record) => record.organizationId)).toEqual([ada.organizationId]);
    expect((await listCustomers(app, grace.organizationId, grace.cookie)).body.customers).toEqual([]);
  });

  it.each([
    ['a missing name', { email: 'buyer@initech.example' }],
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a name over 120 characters', { name: 'a'.repeat(121) }],
    ['a numeric name', { name: 42 }],
    ['an object name', { name: { $ne: null } }],
  ])('rejects %s', async (_, body) => {
    const { app, customers, ada } = await setup();

    const response = await createCustomer(app, ada.organizationId, ada.cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Name must be between 1 and 120 characters',
      requestId: response.headers['x-request-id'],
    });
    expect(customers.records).toHaveLength(0);
  });

  it('accepts a name of exactly 120 characters', async () => {
    const { app, ada } = await setup();

    const response = await createCustomer(app, ada.organizationId, ada.cookie, { name: 'a'.repeat(120) });

    expect(response.status).toBe(201);
  });

  it.each([
    ['without an @', 'buyer.initech.example', 'Enter a valid email address'],
    ['without a domain', 'buyer@', 'Enter a valid email address'],
    ['with spaces inside', 'buyer @initech.example', 'Enter a valid email address'],
    ['over 254 characters', `${'a'.repeat(245)}@example.com`, 'Enter a valid email address'],
    ['that is a number', 42, 'Email must be text'],
    ['that is an array', ['buyer@initech.example'], 'Email must be text'],
    ['that is an operator object', { $ne: null }, 'Email must be text'],
  ])('rejects an email %s', async (_, email, message) => {
    const { app, customers, ada } = await setup();

    const response = await createCustomer(app, ada.organizationId, ada.cookie, { name: 'Initech', email });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message });
    expect(customers.records).toHaveLength(0);
  });

  it.each([
    ['over 40 characters', '1'.repeat(41), 'Phone must be at most 40 characters'],
    ['that is a number', 5550100, 'Phone must be text'],
  ])('rejects a phone number %s', async (_, phone, message) => {
    const { app, ada } = await setup();

    const response = await createCustomer(app, ada.organizationId, ada.cookie, { name: 'Initech', phone });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message });
  });

  it('rejects a body that is not a JSON object', async () => {
    const { app, ada } = await setup();

    const response = await createCustomer(app, ada.organizationId, ada.cookie, [{ name: 'Initech' }]);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('gives a non-member the same 404 as a missing organization, and stores nothing', async () => {
    const { app, customers, ada, grace } = await setup();

    const otherOrganization = await createCustomer(app, grace.organizationId, ada.cookie, { name: 'Initech' });
    const missingOrganization = await createCustomer(app, 'f'.repeat(24), ada.cookie, { name: 'Initech' });

    expect(otherOrganization.status).toBe(404);
    expect(otherOrganization.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    expect(missingOrganization.status).toBe(404);
    expect(missingOrganization.body.error.message).toBe(otherOrganization.body.error.message);
    expect(customers.records).toHaveLength(0);
  });

  it('checks membership before validating the body', async () => {
    const { app, ada, grace } = await setup();

    const response = await createCustomer(app, grace.organizationId, ada.cookie, { name: 42 });

    expect(response.status).toBe(404);
  });

  it('rejects a request from another origin before creating anything', async () => {
    const { app, customers, ada } = await setup();

    const response = await request(app)
      .post(customersPath(ada.organizationId))
      .set('Origin', 'https://evil.example')
      .set('Cookie', ada.cookie)
      .send({ name: 'Initech' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(customers.records).toHaveLength(0);
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, logs, customers, ada } = await setup();
    customers.create = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await createCustomer(app, ada.organizationId, ada.cookie, { name: 'Initech' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: response.headers['x-request-id'] },
    });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });
});

describe('GET /api/v1/organizations/:organizationId/customers', () => {
  it('returns an empty list for an organization without customers', async () => {
    const { app, ada } = await setup();

    const response = await listCustomers(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ customers: [] });
  });

  it('returns the organization’s customers newest first, with only customer fields', async () => {
    const { app, ada } = await setup();
    const created = [];
    for (const name of ['First', 'Second', 'Third']) {
      created.push((await createCustomer(app, ada.organizationId, ada.cookie, { name })).body.customer);
    }

    const response = await listCustomers(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ customers: created.reverse() });
    expect(Object.keys(response.body.customers[0]).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'phone', 'updatedAt']);
    expect(response.text).not.toMatch(LEAK_PATTERN);
  });

  it('returns at most the 50 newest customers', async () => {
    const { app, ada } = await setup();
    for (let i = 1; i <= 52; i += 1) {
      await createCustomer(app, ada.organizationId, ada.cookie, { name: `Customer ${i}` });
    }

    const response = await listCustomers(app, ada.organizationId, ada.cookie);

    expect(response.body.customers).toHaveLength(50);
    expect(response.body.customers[0].name).toBe('Customer 52');
    expect(response.body.customers.at(-1).name).toBe('Customer 3');
  });

  it('keeps each organization’s customers apart', async () => {
    const { app, ada, grace } = await setup();
    await createCustomer(app, ada.organizationId, ada.cookie, { name: 'Initech' });
    await createCustomer(app, grace.organizationId, grace.cookie, { name: 'Hooli' });

    const adaList = await listCustomers(app, ada.organizationId, ada.cookie);
    const graceList = await listCustomers(app, grace.organizationId, grace.cookie);

    expect(adaList.body.customers.map((customer) => customer.name)).toEqual(['Initech']);
    expect(graceList.body.customers.map((customer) => customer.name)).toEqual(['Hooli']);
  });

  it('gives a non-member 404 for another organization’s customers', async () => {
    const { app, ada, grace } = await setup();
    await createCustomer(app, grace.organizationId, grace.cookie, { name: 'Hooli' });

    const response = await listCustomers(app, grace.organizationId, ada.cookie);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    expect(response.text).not.toContain('Hooli');
  });

  it('cannot be pointed at another organization through the query, headers or body', async () => {
    const { app, ada, grace } = await setup();
    await createCustomer(app, grace.organizationId, grace.cookie, { name: 'Hooli' });

    const response = await request(app)
      .get(`${customersPath(ada.organizationId)}?organizationId=${grace.organizationId}`)
      .set('Cookie', ada.cookie)
      .set('X-Organization-Id', grace.organizationId)
      .send({ organizationId: grace.organizationId });

    expect(response.status).toBe(200);
    expect(response.body.customers).toEqual([]);
  });

  it('notices a removed membership on the next request', async () => {
    const { app, stores, ada } = await setup();
    await createCustomer(app, ada.organizationId, ada.cookie, { name: 'Initech' });
    stores.memberships.records.clear();

    const response = await listCustomers(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(404);
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, customers, ada } = await setup();
    customers.listForOrganization = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await listCustomers(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
  });
});

describe('customer routes for every role and session state', () => {
  it.each(['owner', 'admin', 'member'])('let an organization %s list and create customers', async (role) => {
    const { app, stores, ada, grace } = await setup();
    await stores.memberships.create({ organizationId: grace.organizationId, userId: ada.user.id, role });

    const created = await createCustomer(app, grace.organizationId, ada.cookie, { name: 'Initech' });
    const listed = await listCustomers(app, grace.organizationId, ada.cookie);

    expect(created.status).toBe(201);
    expect(listed.status).toBe(200);
    expect(listed.body.customers.map((customer) => customer.name)).toEqual(['Initech']);
  });

  it.each([
    ['without a session cookie', async () => undefined],
    ['with an invalid session token', async () => 'opspilot_session=not-a-jwt'],
    [
      'after logging out',
      async (app, ada) => {
        await request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', ada.cookie);
        return ada.cookie;
      },
    ],
  ])('reject a request %s with 401, before anything else', async (_, getCookie) => {
    const { app, customers, ada } = await setup();
    const cookie = await getCookie(app, ada);

    const created = await createCustomer(app, ada.organizationId, cookie, { name: 42 });
    const listed = await listCustomers(app, ada.organizationId, cookie);
    const malformedId = await listCustomers(app, 'not-an-id', cookie);

    for (const response of [created, listed, malformedId]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    expect(customers.records).toHaveLength(0);
  });

  it('rejects a malformed organization ID with 400', async () => {
    const { app, ada } = await setup();

    const response = await listCustomers(app, 'not-an-id', ada.cookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Organization ID is not valid' });
  });
});
