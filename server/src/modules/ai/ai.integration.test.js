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
import { Task } from '../tasks/task.model.js';
import { taskStore } from '../tasks/task.store.js';
import { User } from '../users/user.model.js';
import { userStore } from '../users/user.store.js';
import { TOOL_DEFINITIONS, runTool } from './ai.tools.js';

// The AI tools and assistant route against MongoDB, with the real stores. Runs only when
// MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';
const stores = { customers: customerStore, orders: orderStore, tasks: taskStore };

describe.skipIf(!uri)('AI tools against MongoDB', () => {
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

  async function seed(organizationId, name) {
    const customer = await customerStore.create(organizationId, { name });
    const order = await orderStore.create(organizationId, {
      customerId: customer.id,
      description: `${name} supplies`,
      status: 'pending',
      totalAmount: 100,
      currency: 'INR',
    });
    await taskStore.create(organizationId, { title: `Call ${name}`, status: 'todo', priority: 'medium', customerId: customer.id, orderId: order.id });
  }

  it('reads only the given organization’s records, whatever the input says', async () => {
    const acme = new mongoose.Types.ObjectId().toString();
    const globex = new mongoose.Types.ObjectId().toString();
    await seed(acme, 'Initech');
    await seed(globex, 'Umbrella');

    const results = {};
    for (const { name } of TOOL_DEFINITIONS) {
      results[name] = await runTool(stores, acme, name, { organizationId: globex, limit: 50 });
    }

    expect(results.list_customers.map((customer) => customer.name)).toEqual(['Initech']);
    expect(results.list_orders.map((order) => [order.description, order.customerName])).toEqual([['Initech supplies', 'Initech']]);
    expect(results.list_tasks.map((task) => [task.title, task.customerName, task.orderDescription])).toEqual([
      ['Call Initech', 'Initech', 'Initech supplies'],
    ]);
    expect(JSON.stringify(results)).not.toContain('Umbrella');
  });

  it('serves the assistant only to members, and its tools only the member’s organization', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const provider = {
      name: 'test',
      async respond({ tools, runTool: run }) {
        const names = [];
        for (const tool of tools) names.push(...(await run(tool.name)).map((record) => record.name ?? record.description ?? record.title));
        return { status: 'completed', text: names.join(', ') };
      },
    };
    const app = createApp({
      logger: captureLogger(),
      clientOrigin: ORIGIN,
      auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
      organizationStores: { organizations: organizationStore, memberships: membershipStore, withTransaction },
      ...stores,
      aiProvider: provider,
    });
    const post = (path, cookie, body) => request(app).post(`/api/v1${path}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
    async function ownerOf(email, slug, customerName) {
      const { cookie } = await signUp(app, { origin: ORIGIN, email });
      const organizationId = (await post('/organizations', cookie, { name: slug, slug })).body.organization.id;
      await seed(organizationId, customerName);
      return { cookie, organizationId };
    }
    const ada = await ownerOf('ada@example.com', 'acme', 'Initech');
    const grace = await ownerOf('grace@example.com', 'globex', 'Umbrella');

    const own = await post(`/organizations/${ada.organizationId}/ai/assistant`, ada.cookie, {
      message: 'Summarize',
      organizationId: grace.organizationId,
    });
    const foreign = await post(`/organizations/${grace.organizationId}/ai/assistant`, ada.cookie, { message: 'Summarize' });

    expect(own.status).toBe(200);
    expect(own.body.reply.text).toBe('Initech, Initech supplies, Call Initech');
    expect(foreign.status).toBe(404);
    expect(foreign.text).not.toContain('Umbrella');
  });
});
