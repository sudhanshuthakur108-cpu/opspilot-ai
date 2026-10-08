import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase, withTransaction } from '../../lib/database.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { signUp } from '../../testing/signUp.js';
import { Customer } from '../customers/customer.model.js';
import { customerStore } from '../customers/customer.store.js';
import { Membership } from '../organizations/membership.model.js';
import { membershipStore } from '../organizations/membership.store.js';
import { Organization } from '../organizations/organization.model.js';
import { organizationStore } from '../organizations/organization.store.js';
import { User } from '../users/user.model.js';
import { userStore } from '../users/user.store.js';
import { Order } from './order.model.js';
import { orderStore } from './order.store.js';

// The order routes end to end against MongoDB, with the real stores. Runs only when
// MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';

describe.skipIf(!uri)('/api/v1/organizations/:organizationId/orders against MongoDB', () => {
  let transactionsAvailable = false;

  beforeAll(async () => {
    await connectDatabase(uri, { dbName: `opspilot_test_${randomBytes(6).toString('hex')}` });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all(
      [User, Organization, Membership, Customer, Order].map((model) => model.deleteMany({})),
    );
  });

  // Ada owns Acme with the customer Initech; Grace owns Globex with the customer Hooli.
  async function setup() {
    const app = createApp({
      logger: captureLogger(),
      clientOrigin: ORIGIN,
      auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
      organizationStores: { organizations: organizationStore, memberships: membershipStore, withTransaction },
      customers: customerStore,
      orders: orderStore,
    });

    async function ownerOf(email, slug, customerName) {
      const { cookie } = await signUp(app, { origin: ORIGIN, email });
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
      return { cookie, organizationId, customerId: customer.body.customer.id };
    }

    return {
      app,
      ada: await ownerOf('ada@example.com', 'acme', 'Initech'),
      grace: await ownerOf('grace@example.com', 'globex', 'Hooli'),
    };
  }

  const path = (organizationId) => `/api/v1/organizations/${organizationId}/orders`;
  const create = (app, { organizationId, cookie }, body) =>
    request(app).post(path(organizationId)).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const list = (app, organizationId, cookie) => request(app).get(path(organizationId)).set('Cookie', cookie);
  const order = (customerId, overrides = {}) => ({
    customerId,
    description: 'Quarterly supplies',
    status: 'confirmed',
    totalAmount: 1250.5,
    ...overrides,
  });

  it('stores the order under the route’s organization and lists it back with the customer’s name', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();

    const created = await create(app, ada, { ...order(ada.customerId, { currency: 'usd' }), organizationId: grace.organizationId });
    const listed = await list(app, ada.organizationId, ada.cookie);

    expect(created.status).toBe(201);
    expect(created.body.order).toMatchObject({ customerName: 'Initech', currency: 'USD', totalAmount: 1250.5, status: 'confirmed' });
    expect(listed.body).toEqual({ orders: [created.body.order] });

    const [stored] = await Order.find().lean();
    expect(stored.organizationId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(stored.organizationId.toString()).toBe(ada.organizationId);
    expect(stored.customerId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(stored.customerId.toString()).toBe(ada.customerId);
  });

  it('refuses another organization’s customer and stores nothing', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();

    const response = await create(app, ada, order(grace.customerId));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    expect(response.text).not.toContain('Hooli');
    expect(await Order.countDocuments()).toBe(0);
  });

  it('lists only the requested organization’s orders, newest first', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();
    await create(app, ada, order(ada.customerId, { description: 'Older' }));
    await create(app, grace, order(grace.customerId, { description: 'Globex order' }));
    await create(app, ada, order(ada.customerId, { description: 'Newer' }));

    const adaList = await list(app, ada.organizationId, ada.cookie);
    const crossTenant = await list(app, grace.organizationId, ada.cookie);

    expect(adaList.body.orders.map(({ description, customerName }) => ({ description, customerName }))).toEqual([
      { description: 'Newer', customerName: 'Initech' },
      { description: 'Older', customerName: 'Initech' },
    ]);
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.text).not.toContain('Globex order');
  });

  it('only finds customers through their own organization', async () => {
    const organizationA = new mongoose.Types.ObjectId().toString();
    const organizationB = new mongoose.Types.ObjectId().toString();
    const customer = await customerStore.create(organizationA, { name: 'Initech' });

    expect(await customerStore.findById(organizationA, customer.id)).toMatchObject({ name: 'Initech' });
    expect(await customerStore.findById(organizationB, customer.id)).toBeNull();
    expect(await customerStore.findByIds(organizationB, [customer.id])).toEqual([]);
  });

  it('indexes orders by organization first', async () => {
    await Order.init();

    const indexes = await Order.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({ organizationId: 1, createdAt: -1, _id: -1 });
  });
});
