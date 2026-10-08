import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase, withTransaction } from '../../lib/database.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { signUp } from '../../testing/signUp.js';
import { Membership } from '../organizations/membership.model.js';
import { membershipStore } from '../organizations/membership.store.js';
import { Organization } from '../organizations/organization.model.js';
import { organizationStore } from '../organizations/organization.store.js';
import { User } from '../users/user.model.js';
import { userStore } from '../users/user.store.js';
import { Customer } from './customer.model.js';
import { customerStore } from './customer.store.js';

// The customer routes end to end against MongoDB, with the real stores. Runs only when
// MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';

describe.skipIf(!uri)('/api/v1/organizations/:organizationId/customers against MongoDB', () => {
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
    await Promise.all([User.deleteMany({}), Organization.deleteMany({}), Membership.deleteMany({}), Customer.deleteMany({})]);
  });

  // Ada owns Acme and Grace owns Globex.
  async function setup() {
    const app = createApp({
      logger: captureLogger(),
      clientOrigin: ORIGIN,
      auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
      organizationStores: { organizations: organizationStore, memberships: membershipStore, withTransaction },
      customers: customerStore,
    });

    async function ownerOf(email, slug) {
      const { cookie } = await signUp(app, { origin: ORIGIN, email });
      const response = await request(app)
        .post('/api/v1/organizations')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ name: slug, slug });
      return { cookie, organizationId: response.body.organization.id };
    }

    return { app, ada: await ownerOf('ada@example.com', 'acme'), grace: await ownerOf('grace@example.com', 'globex') };
  }

  const path = (organizationId) => `/api/v1/organizations/${organizationId}/customers`;
  const create = (app, { organizationId, cookie }, body) =>
    request(app).post(path(organizationId)).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const list = (app, organizationId, cookie) => request(app).get(path(organizationId)).set('Cookie', cookie);

  it('stores the customer under the route’s organization and lists it back', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();

    const created = await create(app, ada, {
      name: ' Initech ',
      email: 'Buyer@Initech.Example',
      organizationId: grace.organizationId,
    });
    const listed = await list(app, ada.organizationId, ada.cookie);

    expect(created.status).toBe(201);
    expect(listed.body).toEqual({ customers: [created.body.customer] });
    expect(created.body.customer).toMatchObject({ name: 'Initech', email: 'buyer@initech.example', phone: null });

    const [stored] = await Customer.find().lean();
    expect(stored.organizationId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(stored.organizationId.toString()).toBe(ada.organizationId);
    expect(stored).not.toHaveProperty('phone');
  });

  it('lists only the requested organization’s customers, newest first', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();
    await create(app, ada, { name: 'Older' });
    await create(app, grace, { name: 'Hooli' });
    await create(app, ada, { name: 'Newer' });

    const adaList = await list(app, ada.organizationId, ada.cookie);
    const crossTenant = await list(app, grace.organizationId, ada.cookie);

    expect(adaList.body.customers.map((customer) => customer.name)).toEqual(['Newer', 'Older']);
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.text).not.toContain('Hooli');
  });

  it('allows the same customer email in two organizations', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();

    const first = await create(app, ada, { name: 'Initech', email: 'buyer@initech.example' });
    const second = await create(app, grace, { name: 'Initech', email: 'buyer@initech.example' });

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await Customer.countDocuments()).toBe(2);
  });

  it('indexes customers by organization first', async () => {
    await Customer.init();

    const indexes = await Customer.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({ organizationId: 1, createdAt: -1, _id: -1 });
  });
});
