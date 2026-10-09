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
import { Order } from '../orders/order.model.js';
import { orderStore } from '../orders/order.store.js';
import { Membership } from '../organizations/membership.model.js';
import { membershipStore } from '../organizations/membership.store.js';
import { Organization } from '../organizations/organization.model.js';
import { organizationStore } from '../organizations/organization.store.js';
import { User } from '../users/user.model.js';
import { userStore } from '../users/user.store.js';
import { Task } from './task.model.js';
import { taskStore } from './task.store.js';

// The task routes end to end against MongoDB, with the real stores. Runs only when
// MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';

describe.skipIf(!uri)('/api/v1/organizations/:organizationId/tasks against MongoDB', () => {
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
    await Promise.all([User, Organization, Membership, Customer, Order, Task].map((model) => model.deleteMany({})));
  });

  // Ada owns Acme with the customer Initech and its order; Grace owns Globex with Umbrella and its order.
  async function setup() {
    const app = createApp({
      logger: captureLogger(),
      clientOrigin: ORIGIN,
      auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
      organizationStores: { organizations: organizationStore, memberships: membershipStore, withTransaction },
      customers: customerStore,
      orders: orderStore,
      tasks: taskStore,
    });
    const post = (path, cookie, body) => request(app).post(`/api/v1${path}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

    async function ownerOf(email, slug, customerName) {
      const { cookie } = await signUp(app, { origin: ORIGIN, email });
      const organizationId = (await post('/organizations', cookie, { name: slug, slug })).body.organization.id;
      const customer = (await post(`/organizations/${organizationId}/customers`, cookie, { name: customerName })).body.customer;
      const order = (
        await post(`/organizations/${organizationId}/orders`, cookie, {
          customerId: customer.id,
          description: `${customerName} supplies`,
          status: 'pending',
          totalAmount: 100,
        })
      ).body.order;
      return { cookie, organizationId, customerId: customer.id, orderId: order.id };
    }

    return {
      app,
      post,
      ada: await ownerOf('ada@example.com', 'acme', 'Initech'),
      grace: await ownerOf('grace@example.com', 'globex', 'Umbrella'),
    };
  }

  const path = (organizationId) => `/api/v1/organizations/${organizationId}/tasks`;
  const list = (app, organizationId, cookie) => request(app).get(path(organizationId)).set('Cookie', cookie);
  const patch = (app, organizationId, taskId, cookie, body) =>
    request(app).patch(`${path(organizationId)}/${taskId}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

  it('stores a linked task under the route’s organization and lists it back with names', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, post, ada, grace } = await setup();

    const created = await post(`/organizations/${ada.organizationId}/tasks`, ada.cookie, {
      title: 'Confirm delivery date',
      customerId: ada.customerId,
      orderId: ada.orderId,
      dueDate: '2026-10-31',
      organizationId: grace.organizationId,
    });
    const listed = await list(app, ada.organizationId, ada.cookie);

    expect(created.status).toBe(201);
    expect(created.body.task).toMatchObject({
      customerName: 'Initech',
      orderDescription: 'Initech supplies',
      dueDate: '2026-10-31',
      status: 'todo',
      priority: 'medium',
    });
    expect(listed.body).toEqual({ tasks: [created.body.task] });

    const [stored] = await Task.find().lean();
    expect(stored.organizationId.toString()).toBe(ada.organizationId);
    expect(stored.customerId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(stored.orderId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(stored.dueDate.toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('refuses another organization’s customer or order and stores nothing', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { post, ada, grace } = await setup();

    const withCustomer = await post(`/organizations/${ada.organizationId}/tasks`, ada.cookie, { title: 'x', customerId: grace.customerId });
    const withOrder = await post(`/organizations/${ada.organizationId}/tasks`, ada.cookie, { title: 'x', orderId: grace.orderId });

    expect(withCustomer.status).toBe(404);
    expect(withCustomer.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    expect(withOrder.status).toBe(404);
    expect(withOrder.body.error.code).toBe('ORDER_NOT_FOUND');
    expect(await Task.countDocuments()).toBe(0);
  });

  it('updates status, priority and due date, and clears the due date', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, post, ada } = await setup();
    const { task } = (await post(`/organizations/${ada.organizationId}/tasks`, ada.cookie, { title: 'x', dueDate: '2026-10-31' })).body;

    const changed = await patch(app, ada.organizationId, task.id, ada.cookie, { status: 'completed', priority: 'low' });
    const cleared = await patch(app, ada.organizationId, task.id, ada.cookie, { dueDate: null });

    expect(changed.body.task).toMatchObject({ status: 'completed', priority: 'low', dueDate: '2026-10-31' });
    expect(new Date(changed.body.task.updatedAt) >= new Date(task.updatedAt)).toBe(true);
    expect(cleared.body.task).toMatchObject({ status: 'completed', dueDate: null });
    expect(await Task.findById(task.id).lean()).not.toHaveProperty('dueDate');
  });

  it('never updates or reveals another organization’s task', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, post, ada, grace } = await setup();
    const { task } = (await post(`/organizations/${ada.organizationId}/tasks`, ada.cookie, { title: 'Acme secret' })).body;

    const update = await patch(app, grace.organizationId, task.id, grace.cookie, { status: 'completed' });
    const graceList = await list(app, grace.organizationId, grace.cookie);

    expect(update.status).toBe(404);
    expect(update.body.error.code).toBe('TASK_NOT_FOUND');
    expect(graceList.body.tasks).toEqual([]);
    expect((await Task.findById(task.id).lean()).status).toBe('todo');
  });

  it('lists only the requested organization’s tasks, newest first', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, post, ada, grace } = await setup();
    await post(`/organizations/${ada.organizationId}/tasks`, ada.cookie, { title: 'Older' });
    await post(`/organizations/${grace.organizationId}/tasks`, grace.cookie, { title: 'Globex task' });
    await post(`/organizations/${ada.organizationId}/tasks`, ada.cookie, { title: 'Newer' });

    const adaList = await list(app, ada.organizationId, ada.cookie);

    expect(adaList.body.tasks.map((task) => task.title)).toEqual(['Newer', 'Older']);
  });

  it('only finds orders through their own organization', async () => {
    const organizationA = new mongoose.Types.ObjectId().toString();
    const organizationB = new mongoose.Types.ObjectId().toString();
    const order = await orderStore.create(organizationA, {
      customerId: new mongoose.Types.ObjectId().toString(),
      description: 'Supplies',
      status: 'pending',
      totalAmount: 1,
      currency: 'INR',
    });

    expect(await orderStore.findById(organizationA, order.id)).toMatchObject({ description: 'Supplies' });
    expect(await orderStore.findById(organizationB, order.id)).toBeNull();
    expect(await orderStore.findByIds(organizationB, [order.id])).toEqual([]);
  });

  it('indexes tasks by organization first', async () => {
    await Task.init();

    const indexes = await Task.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({ organizationId: 1, createdAt: -1, _id: -1 });
  });
});
