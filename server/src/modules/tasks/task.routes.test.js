import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryCustomerStore } from '../../testing/memoryCustomerStore.js';
import { createMemoryOrderStore } from '../../testing/memoryOrderStore.js';
import { createMemoryOrganizationStores } from '../../testing/memoryOrganizationStores.js';
import { createMemoryTaskStore } from '../../testing/memoryTaskStore.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { signUp } from '../../testing/signUp.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';
const LEAK_PATTERN = /organizationId|userId|_id|__v|password|tokenVersion|role/;
const MISSING_ID = 'f'.repeat(24);

// Ada owns Acme with customers Initech (which has an order) and Hooli; Grace owns Globex with the
// customer Umbrella and its order. Everything is created through the API.
async function setup() {
  const users = createMemoryUserStore();
  const stores = createMemoryOrganizationStores();
  const customers = createMemoryCustomerStore();
  const orders = createMemoryOrderStore();
  const tasks = createMemoryTaskStore();
  const logs = captureLogger();
  const app = createApp({
    logger: logs,
    clientOrigin: ORIGIN,
    auth: { users, secret: SECRET, secureCookie: false },
    organizationStores: stores,
    customers,
    orders,
    tasks,
  });

  const post = (path, cookie, body) => request(app).post(`/api/v1${path}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

  async function ownerOf(email, slug, customerNames) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    const organizationId = (await post('/organizations', cookie, { name: slug, slug })).body.organization.id;
    const created = [];
    for (const name of customerNames) {
      created.push((await post(`/organizations/${organizationId}/customers`, cookie, { name })).body.customer);
    }
    const order = (
      await post(`/organizations/${organizationId}/orders`, cookie, {
        customerId: created[0].id,
        description: `${created[0].name} supplies`,
        status: 'confirmed',
        totalAmount: 100,
      })
    ).body.order;
    return { user, cookie, organizationId, customer: created[0], otherCustomer: created[1], order };
  }

  const ada = await ownerOf('ada@example.com', 'acme', ['Initech', 'Hooli']);
  const grace = await ownerOf('grace@example.com', 'globex', ['Umbrella']);
  return { app, logs, stores, tasks, ada, grace };
}

const tasksPath = (organizationId) => `/api/v1/organizations/${organizationId}/tasks`;

function createTask(app, organizationId, cookie, body) {
  const req = request(app).post(tasksPath(organizationId)).set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

function listTasks(app, organizationId, cookie) {
  const req = request(app).get(tasksPath(organizationId));
  return cookie ? req.set('Cookie', cookie) : req;
}

function updateTask(app, organizationId, taskId, cookie, body) {
  const req = request(app).patch(`${tasksPath(organizationId)}/${taskId}`).set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

describe('POST /api/v1/organizations/:organizationId/tasks', () => {
  it('creates a task with only a title, defaulting to To do and medium priority', async () => {
    const { app, tasks, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, { title: 'Call the supplier' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      task: {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        title: 'Call the supplier',
        description: null,
        status: 'todo',
        priority: 'medium',
        customerId: null,
        customerName: null,
        orderId: null,
        orderDescription: null,
        dueDate: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    expect(tasks.records).toHaveLength(1);
    expect(tasks.records[0].organizationId).toBe(ada.organizationId);
    expect(response.text).not.toMatch(LEAK_PATTERN);
  });

  it('creates a task linked to the organization’s customer and that customer’s order', async () => {
    const { app, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, {
      title: '  Confirm delivery date  ',
      description: '  Ask about the loading dock.  ',
      status: 'in_progress',
      priority: 'high',
      customerId: ada.customer.id,
      orderId: ada.order.id,
      dueDate: '2026-10-31',
    });

    expect(response.status).toBe(201);
    expect(response.body.task).toMatchObject({
      title: 'Confirm delivery date',
      description: 'Ask about the loading dock.',
      status: 'in_progress',
      priority: 'high',
      customerId: ada.customer.id,
      customerName: 'Initech',
      orderId: ada.order.id,
      orderDescription: 'Initech supplies',
      dueDate: '2026-10-31',
    });
  });

  it.each([
    ['only a customer', (ada) => ({ customerId: ada.customer.id }), { customerName: 'Initech', orderId: null }],
    ['only an order', (ada) => ({ orderId: ada.order.id }), { customerId: null, orderDescription: 'Initech supplies' }],
  ])('accepts %s', async (_, links, expected) => {
    const { app, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up', ...links(ada) });

    expect(response.status).toBe(201);
    expect(response.body.task).toMatchObject(expected);
  });

  it.each([
    ['empty strings', { description: '', customerId: '', orderId: '', dueDate: '' }],
    ['nulls', { description: null, customerId: null, orderId: null, dueDate: null }],
    ['a blank description', { description: '   ' }],
  ])('treats optional fields given as %s as not given', async (_, fields) => {
    const { app, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up', ...fields });

    expect(response.status).toBe(201);
    expect(response.body.task).toMatchObject({ description: null, customerId: null, orderId: null, dueDate: null });
  });

  it.each([
    ['a missing title', { title: undefined }, 'Title must be between 1 and 200 characters'],
    ['a blank title', { title: '   ' }, 'Title must be between 1 and 200 characters'],
    ['a title over 200 characters', { title: 'a'.repeat(201) }, 'Title must be between 1 and 200 characters'],
    ['a numeric title', { title: 42 }, 'Title must be between 1 and 200 characters'],
    ['a description over 2000 characters', { description: 'a'.repeat(2001) }, 'Description must be at most 2000 characters'],
    ['a numeric description', { description: 42 }, 'Description must be text'],
    ['an unknown status', { status: 'done' }, 'Status must be one of todo, in_progress, completed'],
    ['a null status', { status: null }, 'Status must be one of todo, in_progress, completed'],
    ['an unknown priority', { priority: 'urgent' }, 'Priority must be one of low, medium, high'],
    ['a priority in the wrong case', { priority: 'High' }, 'Priority must be one of low, medium, high'],
    ['a malformed customer ID', { customerId: 'not-an-id' }, 'Customer ID is not valid'],
    ['an operator object as customer ID', { customerId: { $ne: null } }, 'Customer ID is not valid'],
    ['a malformed order ID', { orderId: '1234' }, 'Order ID is not valid'],
    ['a numeric order ID', { orderId: 42 }, 'Order ID is not valid'],
    ['a due date that is not a date', { dueDate: 'next week' }, 'Due date must be a date like 2026-10-31'],
    ['a due date that does not exist', { dueDate: '2026-02-30' }, 'Due date must be a date like 2026-10-31'],
    ['a due date with a time', { dueDate: '2026-10-31T09:00:00Z' }, 'Due date must be a date like 2026-10-31'],
    ['a numeric due date', { dueDate: 1798675200000 }, 'Due date must be a date like 2026-10-31'],
  ])('rejects %s', async (_, fields, message) => {
    const { app, tasks, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up', ...fields });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message, requestId: response.headers['x-request-id'] });
    expect(tasks.records).toHaveLength(0);
  });

  it('accepts a title of exactly 200 characters and a description of exactly 2000', async () => {
    const { app, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, { title: 'a'.repeat(200), description: 'b'.repeat(2000) });

    expect(response.status).toBe(201);
  });

  it('rejects a body that is not a JSON object', async () => {
    const { app, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, [{ title: 'Follow up' }]);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses another organization’s customer with the same 404 as a customer that does not exist', async () => {
    const { app, tasks, ada, grace } = await setup();

    const otherCustomer = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up', customerId: grace.customer.id });
    const missingCustomer = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up', customerId: MISSING_ID });

    for (const response of [otherCustomer, missingCustomer]) {
      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }
    expect(otherCustomer.text).not.toContain('Umbrella');
    expect(tasks.records).toHaveLength(0);
  });

  it('refuses another organization’s order with the same 404 as an order that does not exist', async () => {
    const { app, tasks, ada, grace } = await setup();

    const otherOrder = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up', orderId: grace.order.id });
    const missingOrder = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up', orderId: MISSING_ID });

    for (const response of [otherOrder, missingOrder]) {
      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    expect(otherOrder.text).not.toContain('Umbrella');
    expect(tasks.records).toHaveLength(0);
  });

  it('refuses a mix of the organization’s customer and another organization’s order', async () => {
    const { app, tasks, ada, grace } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, {
      title: 'Follow up',
      customerId: ada.customer.id,
      orderId: grace.order.id,
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
    expect(tasks.records).toHaveLength(0);
  });

  it('refuses an order that belongs to a different customer than the one given', async () => {
    const { app, tasks, ada } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, {
      title: 'Follow up',
      customerId: ada.otherCustomer.id,
      orderId: ada.order.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'The order belongs to a different customer' });
    expect(tasks.records).toHaveLength(0);
  });

  it('cannot attach another organization’s records by naming that organization in the body, query or headers', async () => {
    const { app, tasks, ada, grace } = await setup();

    const response = await request(app)
      .post(`${tasksPath(ada.organizationId)}?organizationId=${grace.organizationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', ada.cookie)
      .set('X-Organization-Id', grace.organizationId)
      .send({ title: 'Follow up', customerId: grace.customer.id, orderId: grace.order.id, organizationId: grace.organizationId });

    expect(response.status).toBe(404);
    expect(tasks.records).toHaveLength(0);
  });

  it('ignores an organization ID, or any other server-controlled field, in the body', async () => {
    const { app, tasks, ada, grace } = await setup();

    const response = await createTask(app, ada.organizationId, ada.cookie, {
      title: 'Follow up',
      organizationId: grace.organizationId,
      customerName: 'Someone else',
      id: MISSING_ID,
      createdAt: '2000-01-01T00:00:00.000Z',
      assignee: grace.user.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.task).toMatchObject({ customerName: null });
    expect(response.body.task.id).not.toBe(MISSING_ID);
    expect(response.body.task.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(Object.keys(tasks.records[0])).not.toContain('assignee');
    expect(tasks.records.map((record) => record.organizationId)).toEqual([ada.organizationId]);
  });

  it('gives a non-member the same 404 as a missing organization, before validating anything', async () => {
    const { app, tasks, ada, grace } = await setup();

    const otherOrganization = await createTask(app, grace.organizationId, ada.cookie, { title: 'Follow up' });
    const invalidBody = await createTask(app, grace.organizationId, ada.cookie, { title: 42 });

    expect(otherOrganization.status).toBe(404);
    expect(otherOrganization.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    expect(invalidBody.status).toBe(404);
    expect(tasks.records).toHaveLength(0);
  });

  it('rejects a request from another origin before creating anything', async () => {
    const { app, tasks, ada } = await setup();

    const response = await request(app)
      .post(tasksPath(ada.organizationId))
      .set('Origin', 'https://evil.example')
      .set('Cookie', ada.cookie)
      .send({ title: 'Follow up' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(tasks.records).toHaveLength(0);
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, logs, tasks, ada } = await setup();
    tasks.create = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await createTask(app, ada.organizationId, ada.cookie, { title: 'Follow up' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: response.headers['x-request-id'] },
    });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });
});

describe('GET /api/v1/organizations/:organizationId/tasks', () => {
  it('returns an empty list for an organization without tasks', async () => {
    const { app, ada } = await setup();

    const response = await listTasks(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ tasks: [] });
  });

  it('returns the organization’s tasks newest first, with linked names and only task fields', async () => {
    const { app, ada } = await setup();
    const created = [];
    for (const [title, links] of [
      ['First', {}],
      ['Second', { customerId: ada.customer.id }],
      ['Third', { customerId: ada.customer.id, orderId: ada.order.id }],
    ]) {
      created.push((await createTask(app, ada.organizationId, ada.cookie, { title, ...links })).body.task);
    }

    const response = await listTasks(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tasks: created.reverse() });
    expect(response.body.tasks.map(({ title, customerName, orderDescription }) => [title, customerName, orderDescription])).toEqual([
      ['Third', 'Initech', 'Initech supplies'],
      ['Second', 'Initech', null],
      ['First', null, null],
    ]);
    expect(Object.keys(response.body.tasks[0]).sort()).toEqual([
      'createdAt',
      'customerId',
      'customerName',
      'description',
      'dueDate',
      'id',
      'orderDescription',
      'orderId',
      'priority',
      'status',
      'title',
      'updatedAt',
    ]);
    expect(response.text).not.toMatch(LEAK_PATTERN);
  });

  it('returns at most the 50 newest tasks', async () => {
    const { app, ada } = await setup();
    for (let i = 1; i <= 52; i += 1) {
      await createTask(app, ada.organizationId, ada.cookie, { title: `Task ${i}` });
    }

    const response = await listTasks(app, ada.organizationId, ada.cookie);

    expect(response.body.tasks).toHaveLength(50);
    expect(response.body.tasks[0].title).toBe('Task 52');
    expect(response.body.tasks.at(-1).title).toBe('Task 3');
  });

  it('keeps each organization’s tasks apart', async () => {
    const { app, ada, grace } = await setup();
    await createTask(app, ada.organizationId, ada.cookie, { title: 'Acme task' });
    await createTask(app, grace.organizationId, grace.cookie, { title: 'Globex task' });

    const adaList = await listTasks(app, ada.organizationId, ada.cookie);
    const graceList = await listTasks(app, grace.organizationId, grace.cookie);

    expect(adaList.body.tasks.map((task) => task.title)).toEqual(['Acme task']);
    expect(graceList.body.tasks.map((task) => task.title)).toEqual(['Globex task']);
  });

  it('gives a non-member 404 for another organization’s tasks', async () => {
    const { app, ada, grace } = await setup();
    await createTask(app, grace.organizationId, grace.cookie, { title: 'Globex task' });

    const response = await listTasks(app, grace.organizationId, ada.cookie);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    expect(response.text).not.toContain('Globex task');
  });

  it('cannot be pointed at another organization through the query, headers or body', async () => {
    const { app, ada, grace } = await setup();
    await createTask(app, grace.organizationId, grace.cookie, { title: 'Globex task' });

    const response = await request(app)
      .get(`${tasksPath(ada.organizationId)}?organizationId=${grace.organizationId}`)
      .set('Cookie', ada.cookie)
      .set('X-Organization-Id', grace.organizationId)
      .send({ organizationId: grace.organizationId });

    expect(response.status).toBe(200);
    expect(response.body.tasks).toEqual([]);
  });

  it('handles a store failure through the central error handler without leaking details', async () => {
    const { app, tasks, ada } = await setup();
    tasks.listForOrganization = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await listTasks(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
  });
});

describe('PATCH /api/v1/organizations/:organizationId/tasks/:taskId', () => {
  async function setupWithTask() {
    const context = await setup();
    const { ada } = context;
    const task = (
      await createTask(context.app, ada.organizationId, ada.cookie, {
        title: 'Confirm delivery date',
        description: 'Ask about the loading dock.',
        customerId: ada.customer.id,
        orderId: ada.order.id,
        dueDate: '2026-10-31',
      })
    ).body.task;
    return { ...context, task };
  }

  it('updates the status and returns the whole task, with linked names', async () => {
    const { app, ada, task } = await setupWithTask();

    const response = await updateTask(app, ada.organizationId, task.id, ada.cookie, { status: 'completed' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      task: { ...task, status: 'completed', updatedAt: expect.any(String) },
    });
    expect((await listTasks(app, ada.organizationId, ada.cookie)).body.tasks[0].status).toBe('completed');
  });

  it('updates the priority and due date together, and can clear the due date', async () => {
    const { app, ada, task } = await setupWithTask();

    const changed = await updateTask(app, ada.organizationId, task.id, ada.cookie, { priority: 'high', dueDate: '2026-11-15' });
    const cleared = await updateTask(app, ada.organizationId, task.id, ada.cookie, { dueDate: null });

    expect(changed.body.task).toMatchObject({ priority: 'high', dueDate: '2026-11-15', status: 'todo' });
    expect(cleared.body.task).toMatchObject({ priority: 'high', dueDate: null });
  });

  it('changes only status, priority and due date, whatever else the body says', async () => {
    const { app, tasks, ada, grace, task } = await setupWithTask();

    const response = await updateTask(app, ada.organizationId, task.id, ada.cookie, {
      status: 'in_progress',
      title: 'Renamed',
      description: 'Rewritten',
      customerId: ada.otherCustomer.id,
      orderId: grace.order.id,
      organizationId: grace.organizationId,
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    expect(response.status).toBe(200);
    expect(response.body.task).toMatchObject({
      status: 'in_progress',
      title: task.title,
      description: task.description,
      customerId: task.customerId,
      orderId: task.orderId,
      createdAt: task.createdAt,
    });
    expect(tasks.records[0].organizationId).toBe(ada.organizationId);
  });

  it.each([
    ['nothing that can change', { title: 'Renamed' }, 'Send a status, priority or dueDate to change'],
    ['an empty body', {}, 'Send a status, priority or dueDate to change'],
    ['an unknown status', { status: 'done' }, 'Status must be one of todo, in_progress, completed'],
    ['an unknown priority', { priority: 'urgent' }, 'Priority must be one of low, medium, high'],
    ['an invalid due date', { dueDate: '2026-13-01' }, 'Due date must be a date like 2026-10-31'],
  ])('rejects %s', async (_, body, message) => {
    const { app, tasks, ada, task } = await setupWithTask();

    const response = await updateTask(app, ada.organizationId, task.id, ada.cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message });
    expect(tasks.records[0]).toMatchObject({ status: 'todo', priority: 'medium', title: task.title });
  });

  it('rejects a malformed task ID with 400', async () => {
    const { app, ada } = await setupWithTask();

    const response = await updateTask(app, ada.organizationId, 'not-an-id', ada.cookie, { status: 'completed' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Task ID is not valid' });
  });

  it('gives another organization’s task the same 404 as a task that does not exist, and changes nothing', async () => {
    const { app, tasks, grace, task } = await setupWithTask();

    const otherTask = await updateTask(app, grace.organizationId, task.id, grace.cookie, { status: 'completed' });
    const missingTask = await updateTask(app, grace.organizationId, MISSING_ID, grace.cookie, { status: 'completed' });

    for (const response of [otherTask, missingTask]) {
      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({ code: 'TASK_NOT_FOUND', message: 'Task not found' });
    }
    expect(otherTask.text).not.toContain(task.title);
    expect(tasks.records[0].status).toBe('todo');
  });

  it('cannot be pointed at another organization through the query, headers or body', async () => {
    const { app, tasks, ada, grace, task } = await setupWithTask();

    const response = await request(app)
      .patch(`${tasksPath(grace.organizationId)}/${task.id}?organizationId=${ada.organizationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', grace.cookie)
      .set('X-Organization-Id', ada.organizationId)
      .send({ status: 'completed', organizationId: ada.organizationId });

    expect(response.status).toBe(404);
    expect(tasks.records[0].status).toBe('todo');
  });

  it('gives a non-member 404 for the organization, before looking at the task', async () => {
    const { app, tasks, ada, grace, task } = await setupWithTask();

    const response = await updateTask(app, ada.organizationId, task.id, grace.cookie, { status: 'completed' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(tasks.records[0].status).toBe('todo');
  });

  it('rejects a request from another origin before changing anything', async () => {
    const { app, tasks, ada, task } = await setupWithTask();

    const response = await request(app)
      .patch(`${tasksPath(ada.organizationId)}/${task.id}`)
      .set('Origin', 'https://evil.example')
      .set('Cookie', ada.cookie)
      .send({ status: 'completed' });

    expect(response.status).toBe(403);
    expect(tasks.records[0].status).toBe('todo');
  });
});

describe('task routes for every role and session state', () => {
  it.each(['owner', 'admin', 'member'])('let an organization %s create, list and update tasks', async (role) => {
    const { app, stores, ada, grace } = await setup();
    await stores.memberships.create({ organizationId: grace.organizationId, userId: ada.user.id, role });

    const created = await createTask(app, grace.organizationId, ada.cookie, { title: 'Follow up', customerId: grace.customer.id });
    const updated = await updateTask(app, grace.organizationId, created.body.task.id, ada.cookie, { status: 'completed' });
    const listed = await listTasks(app, grace.organizationId, ada.cookie);

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(listed.body.tasks.map(({ customerName, status }) => [customerName, status])).toEqual([['Umbrella', 'completed']]);
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
    const { app, tasks, ada } = await setup();
    const cookie = await getCookie(app, ada);

    const responses = [
      await createTask(app, ada.organizationId, cookie, { title: 42 }),
      await listTasks(app, ada.organizationId, cookie),
      await updateTask(app, ada.organizationId, 'not-an-id', cookie, {}),
      await listTasks(app, 'not-an-id', cookie),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    expect(tasks.records).toHaveLength(0);
  });

  it('rejects a malformed organization ID with 400', async () => {
    const { app, ada } = await setup();

    const response = await listTasks(app, 'not-an-id', ada.cookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Organization ID is not valid' });
  });
});
