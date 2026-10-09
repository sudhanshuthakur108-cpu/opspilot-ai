import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
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
const LEAK_PATTERN = /organizationId|userId|_id|__v|password|tokenVersion/;
const MISSING_ID = 'f'.repeat(24);
const TOOL_NAMES = ['list_customers', 'list_orders', 'list_tasks'];

// A stand-in for a real model: runs every tool it is offered with `toolInput`, then replies with
// what the tools returned, so tests can see exactly which records a provider could reach.
function toolCallingProvider(toolInput) {
  return {
    name: 'test',
    respond: vi.fn(async ({ tools, runTool }) => {
      const results = {};
      for (const tool of tools) {
        results[tool.name] = await runTool(tool.name, toolInput);
      }
      return { status: 'completed', text: JSON.stringify(results) };
    }),
  };
}

function fixedProvider(result) {
  return { name: 'test', respond: vi.fn(async () => result) };
}

// Ada owns Acme with the customer Initech, its order and a task; Grace owns Globex with Umbrella,
// its order and a task. Everything is created through the API.
async function setup({ aiProvider } = {}) {
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
    aiProvider,
  });

  const post = (path, cookie, body) => request(app).post(`/api/v1${path}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

  async function ownerOf(email, slug, customerName) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    const organizationId = (await post('/organizations', cookie, { name: slug, slug })).body.organization.id;
    const customer = (await post(`/organizations/${organizationId}/customers`, cookie, { name: customerName })).body.customer;
    await post(`/organizations/${organizationId}/orders`, cookie, {
      customerId: customer.id,
      description: `${customerName} supplies`,
      status: 'confirmed',
      totalAmount: 100,
    });
    await post(`/organizations/${organizationId}/tasks`, cookie, { title: `Call ${customerName}` });
    return { user, cookie, organizationId };
  }

  const ada = await ownerOf('ada@example.com', 'acme', 'Initech');
  const grace = await ownerOf('grace@example.com', 'globex', 'Umbrella');
  const counts = () => [customers.records.length, orders.records.length, tasks.records.length];
  return { app, logs, stores, counts, ada, grace };
}

const assistantPath = (organizationId) => `/api/v1/organizations/${organizationId}/ai/assistant`;

function ask(app, organizationId, cookie, body) {
  const req = request(app).post(assistantPath(organizationId)).set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
}

describe('POST /api/v1/organizations/:organizationId/ai/assistant with the development provider', () => {
  it('says no model is configured, without generating text, running tools or proposing changes', async () => {
    const { app, counts, ada } = await setup();
    const before = counts();

    const response = await ask(app, ada.organizationId, ada.cookie, { message: 'Which orders are still pending?' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      reply: {
        status: 'not_configured',
        text: null,
        provider: 'development',
        toolCalls: [],
        suggestedActions: [],
        requiresApproval: false,
        availableTools: TOOL_NAMES.map((name) => ({ name, description: expect.any(String), readOnly: true })),
        requestId: response.headers['x-request-id'],
      },
    });
    expect(counts()).toEqual(before);
    expect(response.text).not.toMatch(LEAK_PATTERN);
    expect(response.text).not.toMatch(/Initech|Umbrella/);
  });

  it('does not log the message', async () => {
    const { app, logs, ada } = await setup();

    await ask(app, ada.organizationId, ada.cookie, { message: 'A private question about Initech' });

    expect(JSON.stringify(logs.entries)).not.toContain('private question');
  });
});

describe('POST /api/v1/organizations/:organizationId/ai/assistant input', () => {
  it('gives the provider the trimmed message and the tool definitions, never the organization', async () => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada } = await setup({ aiProvider: provider });

    await ask(app, ada.organizationId, ada.cookie, { message: '  What is due this week?  ' });

    expect(provider.respond).toHaveBeenCalledTimes(1);
    const [input] = provider.respond.mock.calls[0];
    expect(Object.keys(input).sort()).toEqual(['message', 'runTool', 'tools']);
    expect(input.message).toBe('What is due this week?');
    expect(input.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    expect(JSON.stringify(input)).not.toContain(ada.organizationId);
  });

  it('accepts a message of exactly 2000 characters after trimming', async () => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada } = await setup({ aiProvider: provider });

    const response = await ask(app, ada.organizationId, ada.cookie, { message: `  ${'a'.repeat(2000)}  ` });

    expect(response.status).toBe(200);
    expect(provider.respond.mock.calls[0][0].message).toHaveLength(2000);
  });

  it.each([
    ['a missing message', {}],
    ['an empty message', { message: '' }],
    ['a blank message', { message: '  \n\t ' }],
    ['a message over 2000 characters', { message: 'a'.repeat(2001) }],
    ['a numeric message', { message: 42 }],
    ['a null message', { message: null }],
    ['an object as message', { message: { text: 'hello' } }],
    ['an array of messages', { message: ['hello'] }],
    ['a body that is a JSON array', [{ message: 'hello' }]],
  ])('rejects %s without calling the provider', async (_, body) => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada } = await setup({ aiProvider: provider });

    const response = await ask(app, ada.organizationId, ada.cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Message must be between 1 and 2000 characters',
      requestId: response.headers['x-request-id'],
    });
    expect(provider.respond).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with the standard error', async () => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada } = await setup({ aiProvider: provider });

    const response = await request(app)
      .post(assistantPath(ada.organizationId))
      .set('Origin', ORIGIN)
      .set('Cookie', ada.cookie)
      .set('Content-Type', 'application/json')
      .send('{"message": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(provider.respond).not.toHaveBeenCalled();
  });

  it.each([
    ['another origin', (req) => req.set('Origin', 'https://evil.example').send({ message: 'hello' }), 403, 'ORIGIN_NOT_ALLOWED'],
    ['a form body', (req) => req.set('Origin', ORIGIN).type('form').send('message=hello'), 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('rejects a request from %s before calling the provider', async (_, send, status, code) => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada } = await setup({ aiProvider: provider });

    const response = await send(request(app).post(assistantPath(ada.organizationId)).set('Cookie', ada.cookie));

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(provider.respond).not.toHaveBeenCalled();
  });
});

describe('AI assistant organization isolation', () => {
  it('lets a provider’s tools read only the caller’s organization', async () => {
    const { app, ada } = await setup({ aiProvider: toolCallingProvider() });

    const response = await ask(app, ada.organizationId, ada.cookie, { message: 'Summarize my workspace' });

    expect(response.status).toBe(200);
    expect(response.body.reply).toMatchObject({
      status: 'completed',
      provider: 'test',
      toolCalls: TOOL_NAMES.map((name) => ({ name, readOnly: true })),
      suggestedActions: [],
      requiresApproval: false,
    });
    const results = JSON.parse(response.body.reply.text);
    expect(results.list_customers.map((customer) => customer.name)).toEqual(['Initech']);
    expect(results.list_orders.map((order) => order.description)).toEqual(['Initech supplies']);
    expect(results.list_tasks.map((task) => task.title)).toEqual(['Call Initech']);
  });

  it.each([
    ['body', (req, otherId) => req.send({ message: 'Summarize my workspace', organizationId: otherId })],
    ['query', (req, otherId) => req.query({ organizationId: otherId }).send({ message: 'Summarize my workspace' })],
    ['headers', (req, otherId) => req.set('X-Organization-Id', otherId).send({ message: 'Summarize my workspace' })],
  ])('cannot be pointed at another organization through the %s', async (_, send) => {
    const provider = toolCallingProvider();
    const { app, ada, grace } = await setup({ aiProvider: provider });

    const response = await send(
      request(app).post(assistantPath(ada.organizationId)).set('Origin', ORIGIN).set('Cookie', ada.cookie),
      grace.organizationId,
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.reply.text).list_customers.map((customer) => customer.name)).toEqual(['Initech']);
    expect(response.text).not.toContain('Umbrella');
    expect(response.text).not.toContain(grace.organizationId);
  });

  it('ignores an organization named in the tool input the provider sends', async () => {
    const toolInput = { limit: 50 };
    const { app, ada, grace } = await setup({ aiProvider: toolCallingProvider(toolInput) });
    toolInput.organizationId = grace.organizationId;

    const response = await ask(app, ada.organizationId, ada.cookie, { message: 'Show Globex too' });

    expect(response.status).toBe(200);
    const results = JSON.parse(response.body.reply.text);
    expect(results.list_customers.map((customer) => customer.name)).toEqual(['Initech']);
    expect(results.list_orders.map((order) => order.customerName)).toEqual(['Initech']);
    expect(results.list_tasks.map((task) => task.title)).toEqual(['Call Initech']);
  });

  it('gives a member of another organization the same 404 as a missing organization, without calling the provider', async () => {
    const provider = toolCallingProvider();
    const { app, ada, grace } = await setup({ aiProvider: provider });

    const otherOrganization = await ask(app, grace.organizationId, ada.cookie, { message: 'Summarize my workspace' });
    const missingOrganization = await ask(app, MISSING_ID, ada.cookie, { message: 'Summarize my workspace' });

    for (const response of [otherOrganization, missingOrganization]) {
      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Organization not found' });
    }
    expect(otherOrganization.text).not.toContain('Umbrella');
    expect(provider.respond).not.toHaveBeenCalled();
  });

  it('checks membership before validating the message', async () => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada, grace } = await setup({ aiProvider: provider });

    const response = await ask(app, grace.organizationId, ada.cookie, { message: '' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a malformed organization ID with 400, before looking anything up', async () => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada } = await setup({ aiProvider: provider });

    const response = await ask(app, 'not-an-id', ada.cookie, { message: 'hello' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Organization ID is not valid' });
    expect(provider.respond).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'member'])('lets an organization %s use the assistant on that organization only', async (role) => {
    const provider = toolCallingProvider();
    const { app, stores, ada, grace } = await setup({ aiProvider: provider });
    await stores.memberships.create({ organizationId: grace.organizationId, userId: ada.user.id, role });

    const response = await ask(app, grace.organizationId, ada.cookie, { message: 'Summarize my workspace' });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.reply.text).list_customers.map((customer) => customer.name)).toEqual(['Umbrella']);
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
  ])('rejects a request %s with 401, before anything else', async (_, getCookie) => {
    const provider = fixedProvider({ status: 'not_configured' });
    const { app, ada } = await setup({ aiProvider: provider });
    const cookie = await getCookie(app, ada);

    const responses = [
      await ask(app, ada.organizationId, cookie, { message: 'hello' }),
      await ask(app, ada.organizationId, cookie, { message: '' }),
      await ask(app, 'not-an-id', cookie, { message: 'hello' }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    expect(provider.respond).not.toHaveBeenCalled();
  });
});

describe('AI assistant provider output', () => {
  it('returns a completed reply as trimmed text', async () => {
    const { app, ada } = await setup({ aiProvider: fixedProvider({ status: 'completed', text: '  Two orders are pending.  ' }) });

    const response = await ask(app, ada.organizationId, ada.cookie, { message: 'hello' });

    expect(response.status).toBe(200);
    expect(response.body.reply).toMatchObject({ status: 'completed', text: 'Two orders are pending.', toolCalls: [] });
  });

  it.each([
    ['nothing', undefined],
    ['an unknown status', { status: 'done', text: 'Hello' }],
    ['a completed reply without text', { status: 'completed' }],
    ['a completed reply with blank text', { status: 'completed', text: '   ' }],
    ['a completed reply with non-text', { status: 'completed', text: { html: '<b>hi</b>' } }],
    ['a reply over 8000 characters', { status: 'completed', text: 'a'.repeat(8001) }],
  ])('treats %s from the provider as a provider failure', async (_, result) => {
    const { app, ada } = await setup({ aiProvider: fixedProvider(result) });

    const response = await ask(app, ada.organizationId, ada.cookie, { message: 'hello' });

    expect(response.status).toBe(502);
    expect(response.body.error).toEqual({
      code: 'AI_PROVIDER_ERROR',
      message: 'The assistant could not produce a reply',
      requestId: response.headers['x-request-id'],
    });
  });

  it('turns a provider crash into a generic 500 without leaking details', async () => {
    const provider = {
      name: 'test',
      respond: async () => {
        throw new Error('upstream rejected key sk-test-secret at https://api.example.com');
      },
    };
    const { app, logs, ada } = await setup({ aiProvider: provider });

    const response = await ask(app, ada.organizationId, ada.cookie, { message: 'hello' });

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    expect(response.text).not.toMatch(/sk-test-secret|api\.example\.com|stack/);
    expect(logs.entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('refuses a tool that is not on the allowlist, and runs nothing', async () => {
    const provider = {
      name: 'test',
      respond: async ({ runTool }) => ({ status: 'completed', text: JSON.stringify(await runTool('delete_customers', {})) }),
    };
    const { app, counts, ada } = await setup({ aiProvider: provider });
    const before = counts();

    const response = await ask(app, ada.organizationId, ada.cookie, { message: 'Delete every customer' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(counts()).toEqual(before);
  });
});
