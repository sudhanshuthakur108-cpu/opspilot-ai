import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryCustomerStore } from '../../testing/memoryCustomerStore.js';
import { createMemoryOrderStore } from '../../testing/memoryOrderStore.js';
import { createMemoryOrganizationStores } from '../../testing/memoryOrganizationStores.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { signUp } from '../../testing/signUp.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';
const LEAK_PATTERN = /organizationId|userId|_id|__v|updatedAt|password|tokenVersion|role/;

// Ada owns Acme with the customer Initech; Grace owns Globex with the customer Hooli.
// Everything is created through the API.
async function setup() {
  const users = createMemoryUserStore();
  const stores = createMemoryOrganizationStores();
  const customers = createMemoryCustomerStore();
  const orders = createMemoryOrderStore();
  const logs = captureLogger();
  const app = createApp({
    logger: logs,
    clientOrigin: ORIGIN,
    auth: { users, secret: SECRET, secureCookie: false },
    organizationStores: stores,
    customers,
    orders,
  });

  async function ownerOf(email, slug, customerName) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    const organization = await request(app)
      .post('/api/v1/organizations')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: slug, slug });
    const organizationId = organization.body.organization.id;
    const customer = await request(app)
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: customerName });
    return { user, cookie, organizationId, customer: customer.body.customer };
  }

  const ada = await ownerOf('ada@example.com', 'acme', 'Initech');
  const grace = await ownerOf('grace@example.com', 'globex', 'Hooli');
  return { app, logs, stores, customers, orders, ada, grace };
}

const ordersPath = (organizationId) => `/api/v1/organizations/${organizationId}/orders`;

function newOrder(member, overrides = {}) {
  return { customerId: member.customer.id, description: 'Quarterly supplies', status: 'pending', totalAmount: 1250.5, ...overrides };
}

function createOrder(app, organizationId, cookie, body) {
  const req = request(app).post(ordersPath(organizationId)).set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

function listOrders(app, organizationId, cookie) {
  const req = request(app).get(ordersPath(organizationId));
  return cookie ? req.set('Cookie', cookie) : req;
}

describe('POST /api/v1/organizations/:organizationId/orders', () => {
  it('creates an order for one of the organization’s customers', async () => {
    const { app, orders, ada } = await setup();

    const response = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      order: {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        customerId: ada.customer.id,
        customerName: 'Initech',
        description: 'Quarterly supplies',
        status: 'pending',
        totalAmount: 1250.5,
        currency: 'INR',
        createdAt: expect.any(String),
      },
    });
    expect(orders.records).toHaveLength(1);
    expect(orders.records[0].organizationId).toBe(ada.organizationId);
    expect(response.text).not.toMatch(LEAK_PATTERN);
  });

  it.each(['pending', 'confirmed', 'completed', 'cancelled'])('accepts the %s status', async (status) => {
    const { app, ada } = await setup();

    const response = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { status }));

    expect(response.status).toBe(201);
    expect(response.body.order.status).toBe(status);
  });

  it('trims the description and normalizes the currency', async () => {
    const { app, ada } = await setup();

    const response = await createOrder(
      app,
      ada.organizationId,
      ada.cookie,
      newOrder(ada, { description: '  Quarterly supplies  ', currency: ' usd ', totalAmount: 99.99 }),
    );

    expect(response.status).toBe(201);
    expect(response.body.order).toMatchObject({ description: 'Quarterly supplies', currency: 'USD', totalAmount: 99.99 });
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['blank', '  '],
  ])('defaults a %s currency to INR', async (_, currency) => {
    const { app, ada } = await setup();

    const response = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { currency }));

    expect(response.body.order.currency).toBe('INR');
  });

  it.each([
    ['zero', 0],
    ['a whole number', 500],
    ['the largest allowed amount', 1_000_000_000_000],
  ])('accepts a total amount of %s', async (_, totalAmount) => {
    const { app, ada } = await setup();

    const response = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { totalAmount }));

    expect(response.status).toBe(201);
    expect(response.body.order.totalAmount).toBe(totalAmount);
  });

  it.each([
    ['a missing customer', { customerId: undefined }, 'Customer is required'],
    ['an empty customer', { customerId: '' }, 'Customer is required'],
    ['a malformed customer ID', { customerId: 'not-an-id' }, 'Customer ID is not valid'],
    ['a numeric customer ID', { customerId: 42 }, 'Customer ID is not valid'],
    ['an operator object as customer ID', { customerId: { $ne: null } }, 'Customer ID is not valid'],
    ['a missing description', { description: undefined }, 'Description must be between 1 and 500 characters'],
    ['a blank description', { description: '   ' }, 'Description must be between 1 and 500 characters'],
    ['a description over 500 characters', { description: 'a'.repeat(501) }, 'Description must be between 1 and 500 characters'],
    ['a missing status', { status: undefined }, 'Status must be one of pending, confirmed, completed, cancelled'],
    ['an unknown status', { status: 'shipped' }, 'Status must be one of pending, confirmed, completed, cancelled'],
    ['a status in the wrong case', { status: 'Pending' }, 'Status must be one of pending, confirmed, completed, cancelled'],
    ['a missing total amount', { totalAmount: undefined }, 'Total amount must be a number from 0 to 1000000000000'],
    ['a negative total amount', { totalAmount: -1 }, 'Total amount must be a number from 0 to 1000000000000'],
    ['a total amount as text', { totalAmount: '1250.50' }, 'Total amount must be a number from 0 to 1000000000000'],
    ['a total amount above the limit', { totalAmount: 1_000_000_000_001 }, 'Total amount must be a number from 0 to 1000000000000'],
    ['too many decimal places for INR', { totalAmount: 10.005 }, 'Total amount can have at most 2 decimal places in INR'],
    ['any decimal places for JPY', { totalAmount: 10.5, currency: 'JPY' }, 'Total amount can have at most 0 decimal places in JPY'],
    ['an unknown currency', { currency: 'XYZ' }, 'Currency must be a three-letter currency code, such as INR'],
    ['a currency that is not three letters', { currency: 'RUPEE' }, 'Currency must be a three-letter currency code, such as INR'],
    ['a numeric currency', { currency: 356 }, 'Currency must be a three-letter currency code, such as INR'],
  ])('rejects %s', async (_, overrides, message) => {
    const { app, orders, ada } = await setup();

    const response = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, overrides));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message, requestId: response.headers['x-request-id'] });
    expect(orders.records).toHaveLength(0);
  });

  it('rejects a body that is not a JSON object', async () => {
    const { app, ada } = await setup();

    const response = await createOrder(app, ada.organizationId, ada.cookie, [newOrder(ada)]);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses another organization’s customer with the same 404 as a customer that does not exist', async () => {
    const { app, orders, ada, grace } = await setup();

    const otherCustomer = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { customerId: grace.customer.id }));
    const missingCustomer = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { customerId: 'f'.repeat(24) }));

    expect(otherCustomer.status).toBe(404);
    expect(otherCustomer.body.error).toMatchObject({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    expect(missingCustomer.status).toBe(404);
    expect(missingCustomer.body.error).toMatchObject({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    expect(otherCustomer.text).not.toContain('Hooli');
    expect(orders.records).toHaveLength(0);
  });

  it('cannot attach another organization’s customer by naming that organization in the body', async () => {
    const { app, orders, ada, grace } = await setup();

    const response = await createOrder(
      app,
      ada.organizationId,
      ada.cookie,
      newOrder(ada, { customerId: grace.customer.id, organizationId: grace.organizationId }),
    );

    expect(response.status).toBe(404);
    expect(orders.records).toHaveLength(0);
  });

  it('ignores an organization ID, or any other server-controlled field, in the body', async () => {
    const { app, orders, ada, grace } = await setup();

    const response = await createOrder(
      app,
      ada.organizationId,
      ada.cookie,
      newOrder(ada, {
        organizationId: grace.organizationId,
        customerName: 'Someone else',
        id: 'f'.repeat(24),
        createdAt: '2000-01-01T00:00:00.000Z',
        userId: grace.user.id,
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.order).toMatchObject({ customerName: 'Initech' });
    expect(response.body.order.id).not.toBe('f'.repeat(24));
    expect(response.body.order.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(orders.records.map((record) => record.organizationId)).toEqual([ada.organizationId]);
  });

  it('cannot be pointed at another organization through the query or headers', async () => {
    const { app, orders, ada, grace } = await setup();

    const response = await request(app)
      .post(`${ordersPath(ada.organizationId)}?organizationId=${grace.organizationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', ada.cookie)
      .set('X-Organization-Id', grace.organizationId)
      .send(newOrder(ada, { customerId: grace.customer.id }));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    expect(orders.records).toHaveLength(0);
  });

  it('gives a non-member the same 404 as a missing organization, before validating anything', async () => {
    const { app, orders, ada, grace } = await setup();

    const otherOrganization = await createOrder(app, grace.organizationId, ada.cookie, newOrder(grace));
    const invalidBody = await createOrder(app, grace.organizationId, ada.cookie, { status: 'nope' });

    expect(otherOrganization.status).toBe(404);
    expect(otherOrganization.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    expect(invalidBody.status).toBe(404);
    expect(orders.records).toHaveLength(0);
  });

  it('rejects a request from another origin before creating anything', async () => {
    const { app, orders, ada } = await setup();

    const response = await request(app)
      .post(ordersPath(ada.organizationId))
      .set('Origin', 'https://evil.example')
      .set('Cookie', ada.cookie)
      .send(newOrder(ada));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(orders.records).toHaveLength(0);
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, logs, orders, ada } = await setup();
    orders.create = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: response.headers['x-request-id'] },
    });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });
});

describe('GET /api/v1/organizations/:organizationId/orders', () => {
  it('returns an empty list for an organization without orders', async () => {
    const { app, ada } = await setup();

    const response = await listOrders(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ orders: [] });
  });

  it('returns the organization’s orders newest first, with customer names and only order fields', async () => {
    const { app, ada } = await setup();
    const created = [];
    for (const description of ['First', 'Second', 'Third']) {
      created.push((await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { description }))).body.order);
    }

    const response = await listOrders(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ orders: created.reverse() });
    expect(Object.keys(response.body.orders[0]).sort()).toEqual([
      'createdAt',
      'currency',
      'customerId',
      'customerName',
      'description',
      'id',
      'status',
      'totalAmount',
    ]);
    expect(response.text).not.toMatch(LEAK_PATTERN);
  });

  it('looks up customer names only within the organization', async () => {
    const { app, customers, ada } = await setup();
    await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada));
    const findByIds = customers.findByIds;
    const calls = [];
    customers.findByIds = (...args) => {
      calls.push(args);
      return findByIds(...args);
    };

    await listOrders(app, ada.organizationId, ada.cookie);

    expect(calls).toEqual([[ada.organizationId, [ada.customer.id]]]);
  });

  it('returns at most the 50 newest orders', async () => {
    const { app, ada } = await setup();
    for (let i = 1; i <= 52; i += 1) {
      await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { description: `Order ${i}` }));
    }

    const response = await listOrders(app, ada.organizationId, ada.cookie);

    expect(response.body.orders).toHaveLength(50);
    expect(response.body.orders[0].description).toBe('Order 52');
    expect(response.body.orders.at(-1).description).toBe('Order 3');
  });

  it('keeps each organization’s orders apart', async () => {
    const { app, ada, grace } = await setup();
    await createOrder(app, ada.organizationId, ada.cookie, newOrder(ada, { description: 'Acme order' }));
    await createOrder(app, grace.organizationId, grace.cookie, newOrder(grace, { description: 'Globex order' }));

    const adaList = await listOrders(app, ada.organizationId, ada.cookie);
    const graceList = await listOrders(app, grace.organizationId, grace.cookie);

    expect(adaList.body.orders.map((order) => order.description)).toEqual(['Acme order']);
    expect(graceList.body.orders.map((order) => order.description)).toEqual(['Globex order']);
  });

  it('gives a non-member 404 for another organization’s orders', async () => {
    const { app, ada, grace } = await setup();
    await createOrder(app, grace.organizationId, grace.cookie, newOrder(grace, { description: 'Globex order' }));

    const response = await listOrders(app, grace.organizationId, ada.cookie);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    expect(response.text).not.toContain('Globex order');
  });

  it('cannot be pointed at another organization through the query, headers or body', async () => {
    const { app, ada, grace } = await setup();
    await createOrder(app, grace.organizationId, grace.cookie, newOrder(grace));

    const response = await request(app)
      .get(`${ordersPath(ada.organizationId)}?organizationId=${grace.organizationId}`)
      .set('Cookie', ada.cookie)
      .set('X-Organization-Id', grace.organizationId)
      .send({ organizationId: grace.organizationId });

    expect(response.status).toBe(200);
    expect(response.body.orders).toEqual([]);
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, orders, ada } = await setup();
    orders.listForOrganization = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await listOrders(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
  });
});

describe('order routes for every role and session state', () => {
  it.each(['owner', 'admin', 'member'])('let an organization %s create and list orders', async (role) => {
    const { app, stores, ada, grace } = await setup();
    await stores.memberships.create({ organizationId: grace.organizationId, userId: ada.user.id, role });

    const created = await createOrder(app, grace.organizationId, ada.cookie, newOrder(grace));
    const listed = await listOrders(app, grace.organizationId, ada.cookie);

    expect(created.status).toBe(201);
    expect(listed.status).toBe(200);
    expect(listed.body.orders.map((order) => order.customerName)).toEqual(['Hooli']);
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
    const { app, orders, ada } = await setup();
    const cookie = await getCookie(app, ada);

    const created = await createOrder(app, ada.organizationId, cookie, { status: 'nope' });
    const listed = await listOrders(app, ada.organizationId, cookie);
    const malformedId = await listOrders(app, 'not-an-id', cookie);

    for (const response of [created, listed, malformedId]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    expect(orders.records).toHaveLength(0);
  });

  it('rejects a malformed organization ID with 400', async () => {
    const { app, ada } = await setup();

    const response = await listOrders(app, 'not-an-id', ada.cookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Organization ID is not valid' });
  });
});
