import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryCustomerStore } from '../../testing/memoryCustomerStore.js';
import { createMemoryOrderStore } from '../../testing/memoryOrderStore.js';
import { createMemoryTaskStore } from '../../testing/memoryTaskStore.js';
import { createAiProvider } from './ai.provider.js';
import { TOOL_DEFINITIONS, runTool } from './ai.tools.js';
import { ASSISTANT_INSTRUCTIONS } from './assistant.instructions.js';
import { developmentProvider } from './development.provider.js';
import { MAX_MODEL_ROUNDS, MAX_TOOL_CALLS, TOOL_OUTPUT_MAX_LENGTH, createOpenAiProvider } from './openai.provider.js';

const API_KEY = 'sk-test-secret-key-do-not-leak';
const MODEL = 'gpt-5.4-mini';
const ACME = '1'.repeat(24);
const GLOBEX = '2'.repeat(24);

// Response payloads shaped like the Responses API's.
const answer = (text) => ({
  status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
});
let nextCallId = 0;
const functionCall = (name, args) => ({ type: 'function_call', call_id: `call_${++nextCallId}`, name, arguments: args });
const toolRequest = (...calls) => ({
  status: 'completed',
  output: [{ type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' }, ...calls],
});

// A stand-in for the SDK client that returns (or throws) the given results in order.
function fakeClient(...results) {
  const create = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { responses: { create } };
}

// Acme has Initech, its order and a task; Globex has Umbrella, its order and a task.
async function seededStores() {
  const stores = { customers: createMemoryCustomerStore(), orders: createMemoryOrderStore(), tasks: createMemoryTaskStore() };
  for (const [organizationId, name] of [
    [ACME, 'Initech'],
    [GLOBEX, 'Umbrella'],
  ]) {
    const customer = await stores.customers.create(organizationId, { name, email: `ops@${name.toLowerCase()}.example` });
    const order = await stores.orders.create(organizationId, {
      customerId: customer.id,
      description: `${name} supplies`,
      status: 'pending',
      totalAmount: 100,
      currency: 'INR',
    });
    await stores.tasks.create(organizationId, { title: `Call ${name}`, status: 'todo', priority: 'high', customerId: customer.id, orderId: order.id });
  }
  return stores;
}

// What the AI service passes in: the tool definitions and runTool bound to Acme.
async function respondWith(client, message = 'Which orders are pending?', { stores } = {}) {
  const scopedStores = stores ?? (await seededStores());
  const logs = captureLogger();
  const provider = createOpenAiProvider({ apiKey: API_KEY, model: MODEL, logger: logs, client });
  const toolRunner = vi.fn((name, input) => runTool(scopedStores, ACME, name, input));
  const result = provider.respond({ message, tools: TOOL_DEFINITIONS, runTool: toolRunner });
  return { result, toolRunner, logs, stores: scopedStores };
}

const requestBody = (client, call) => client.responses.create.mock.calls[call][0];
const toolOutputs = (body) => body.input.filter((item) => item.type === 'function_call_output');

describe('createAiProvider', () => {
  const logger = captureLogger();

  it('returns the development provider for AI_PROVIDER=development', () => {
    expect(createAiProvider({ provider: 'development', openai: null }, { logger })).toBe(developmentProvider);
  });

  it('returns the OpenAI provider for AI_PROVIDER=openai', () => {
    const provider = createAiProvider({ provider: 'openai', openai: { apiKey: API_KEY, model: MODEL } }, { logger });

    expect(provider.name).toBe('openai');
    expect(JSON.stringify(provider)).not.toContain(API_KEY);
  });

  it('refuses an unknown provider instead of falling back', () => {
    expect(() => createAiProvider({ provider: 'gpt', openai: null }, { logger })).toThrow('Unknown AI provider "gpt"');
  });
});

describe('OpenAI provider without an API key', () => {
  it.each([null, undefined, ''])('reports not configured for key %j, without calling OpenAI', async (apiKey) => {
    const client = fakeClient(answer('should not be used'));
    const provider = createOpenAiProvider({ apiKey, model: MODEL, logger: captureLogger(), client });

    expect(provider.name).toBe('openai');
    expect(await provider.respond({ message: 'hello', tools: TOOL_DEFINITIONS, runTool: vi.fn() })).toEqual({ status: 'not_configured' });
    expect(client.responses.create).not.toHaveBeenCalled();
  });
});

describe('OpenAI provider requests', () => {
  it('sends the model, the fixed instructions, the message and the read-only tools, without storing the response', async () => {
    const client = fakeClient(answer('No orders are pending.'));

    const { result } = await respondWith(client, 'Which orders are pending?');
    await result;

    const [body, options] = client.responses.create.mock.calls[0];
    expect(body).toEqual({
      model: MODEL,
      instructions: ASSISTANT_INSTRUCTIONS,
      input: [{ role: 'user', content: 'Which orders are pending?' }],
      tools: TOOL_DEFINITIONS.map(({ name, description, parameters }) => ({ type: 'function', name, description, parameters, strict: false })),
      tool_choice: 'auto',
      store: false,
      include: ['reasoning.encrypted_content'],
      max_output_tokens: 4000,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('never sends the organization, the API key or anything executable', async () => {
    const client = fakeClient(toolRequest(functionCall('list_customers', '{}')), answer('Initech is your newest customer.'));

    const { result } = await respondWith(client);
    await result;

    for (const [body] of client.responses.create.mock.calls) {
      const sent = JSON.stringify(body);
      expect(sent).not.toContain(ACME);
      expect(sent).not.toContain(API_KEY);
      expect(sent).not.toMatch(/organizationId/);
      expect(() => structuredClone(body)).not.toThrow();
    }
  });

  it('keeps the instructions free of organization or record data, and read-only', () => {
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/OpsPilot AI/);
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/Never invent customers, orders, tasks/);
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/cannot create, change or delete anything/);
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/approval/);
    expect(ASSISTANT_INSTRUCTIONS).not.toMatch(/[0-9a-f]{24}/);
  });
});

describe('OpenAI provider answers', () => {
  it('returns the model’s text', async () => {
    const { result, toolRunner } = await respondWith(fakeClient(answer('No orders are pending.')));

    expect(await result).toEqual({ status: 'completed', text: 'No orders are pending.' });
    expect(toolRunner).not.toHaveBeenCalled();
  });

  it('joins the text of every output message', async () => {
    const response = {
      status: 'completed',
      output: [
        { type: 'reasoning', id: 'rs_1', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: 'Two tasks ' }, { type: 'refusal', refusal: 'x' }] },
        { type: 'message', content: [{ type: 'output_text', text: 'are due.' }] },
      ],
    };

    const { result } = await respondWith(fakeClient(response));

    expect(await result).toEqual({ status: 'completed', text: 'Two tasks are due.' });
  });

  it.each([
    ['no response', null],
    ['a response without output', { status: 'completed' }],
    ['output that is not a list', { status: 'completed', output: 'Hello' }],
    ['an incomplete response', { ...answer('Two orders are'), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }],
    ['a failed response', { ...answer(''), status: 'failed' }],
  ])('treats %s as a provider failure', async (_, response) => {
    const { result } = await respondWith(fakeClient(response));

    await expect(result).rejects.toMatchObject({ status: 502, code: 'AI_PROVIDER_ERROR', message: 'The assistant could not produce a reply' });
  });
});

describe('OpenAI provider tool calls', () => {
  it('runs a requested tool through runTool and sends its result back for the final answer', async () => {
    const call = functionCall('list_customers', '{"limit":5}');
    const client = fakeClient(toolRequest(call), answer('Your newest customer is Initech.'));

    const { result, toolRunner } = await respondWith(client);

    expect(await result).toEqual({ status: 'completed', text: 'Your newest customer is Initech.' });
    expect(toolRunner).toHaveBeenCalledExactlyOnceWith('list_customers', { limit: 5 });
    const second = requestBody(client, 1);
    expect(second.input.slice(0, 3)).toEqual([
      { role: 'user', content: 'Which orders are pending?' },
      { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' },
      call,
    ]);
    const [output] = toolOutputs(second);
    expect(output.call_id).toBe(call.call_id);
    expect(JSON.parse(output.output)).toEqual({
      records: [{ id: expect.any(String), name: 'Initech', email: 'ops@initech.example', phone: null, createdAt: expect.any(String) }],
    });
  });

  it('runs several tool calls from one round, in order, and answers once', async () => {
    const client = fakeClient(
      toolRequest(functionCall('list_orders', '{}'), functionCall('list_tasks', '{"limit":10}')),
      answer('Initech has a pending order and a high-priority task.'),
    );

    const { result, toolRunner } = await respondWith(client);

    expect((await result).status).toBe('completed');
    expect(toolRunner.mock.calls).toEqual([
      ['list_orders', {}],
      ['list_tasks', { limit: 10 }],
    ]);
    const outputs = toolOutputs(requestBody(client, 1)).map((item) => JSON.parse(item.output).records);
    expect(outputs[0]).toEqual([
      {
        id: expect.any(String),
        customerId: expect.any(String),
        customerName: 'Initech',
        description: 'Initech supplies',
        status: 'pending',
        totalAmount: 100,
        currency: 'INR',
        createdAt: expect.any(String),
      },
    ]);
    expect(outputs[1].map((task) => [task.title, task.priority, task.customerName, task.orderDescription])).toEqual([
      ['Call Initech', 'high', 'Initech', 'Initech supplies'],
    ]);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
  });

  it('reads tools for the bound organization only, ignoring an organizationId from the model', async () => {
    const client = fakeClient(
      toolRequest(
        functionCall('list_customers', JSON.stringify({ organizationId: GLOBEX })),
        functionCall('list_orders', JSON.stringify({ organizationId: GLOBEX, limit: 50 })),
        functionCall('list_tasks', JSON.stringify({ organization: GLOBEX, organizationId: { $ne: null } })),
      ),
      answer('Done.'),
    );

    const { result } = await respondWith(client);
    await result;

    const sent = JSON.stringify(toolOutputs(requestBody(client, 1)));
    expect(sent).toContain('Initech');
    expect(sent).not.toContain('Umbrella');
    expect(sent).not.toContain(GLOBEX);
  });

  it.each([
    ['an unknown tool', functionCall('delete_customers', '{}'), 'There is no tool with this name'],
    ['a write tool', functionCall('create_task', '{"title":"x"}'), 'There is no tool with this name'],
    ['malformed arguments', functionCall('list_tasks', '{"limit": 5'), 'Tool arguments must be a JSON object'],
    ['arguments that are not an object', functionCall('list_tasks', '"all"'), 'Tool input must be an object'],
    ['an out-of-range limit', functionCall('list_tasks', '{"limit": 500}'), 'limit must be a whole number from 1 to 50'],
  ])('reports %s back to the model as an error, touching no data', async (_, call, error) => {
    const client = fakeClient(toolRequest(call), answer('I could not look that up.'));
    const stores = await seededStores();
    const before = JSON.stringify(stores);

    const { result } = await respondWith(client, 'hello', { stores });

    expect(await result).toEqual({ status: 'completed', text: 'I could not look that up.' });
    expect(toolOutputs(requestBody(client, 1))).toEqual([{ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error }) }]);
    expect(JSON.stringify(stores)).toBe(before);
  });

  it('ends the request when a tool fails, without sending the failure to the model', async () => {
    const stores = await seededStores();
    stores.tasks.listForOrganization = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };
    const client = fakeClient(toolRequest(functionCall('list_tasks', '{}')), answer('unused'));

    const { result } = await respondWith(client, 'hello', { stores });

    await expect(result).rejects.toThrow('connection lost');
    expect(client.responses.create).toHaveBeenCalledTimes(1);
  });

  it(`stops after ${MAX_MODEL_ROUNDS} model rounds, with tools switched off in the last one`, async () => {
    const rounds = Array.from({ length: MAX_MODEL_ROUNDS + 2 }, () => toolRequest(functionCall('list_tasks', '{"limit":1}')));
    const client = fakeClient(...rounds);

    const { result, toolRunner, logs } = await respondWith(client);

    await expect(result).rejects.toMatchObject({ status: 502, code: 'AI_PROVIDER_ERROR' });
    expect(client.responses.create).toHaveBeenCalledTimes(MAX_MODEL_ROUNDS);
    expect(client.responses.create.mock.calls.map(([body]) => body.tool_choice)).toEqual(['auto', 'auto', 'auto', 'none']);
    expect(toolRunner).toHaveBeenCalledTimes(MAX_MODEL_ROUNDS - 1);
    expect(logs.entries).toContainEqual(expect.objectContaining({ level: 'error', message: 'openai tool call limit reached' }));
  });

  it(`refuses more than ${MAX_TOOL_CALLS} tool calls in one request, before running them`, async () => {
    const calls = Array.from({ length: MAX_TOOL_CALLS + 1 }, () => functionCall('list_customers', '{}'));
    const client = fakeClient(toolRequest(...calls), answer('unused'));

    const { result, toolRunner } = await respondWith(client);

    await expect(result).rejects.toMatchObject({ status: 502, code: 'AI_PROVIDER_ERROR' });
    expect(toolRunner).not.toHaveBeenCalled();
  });

  it(`keeps each tool result under ${TOOL_OUTPUT_MAX_LENGTH} characters by dropping the oldest records`, async () => {
    const stores = await seededStores();
    for (let i = 0; i < 50; i += 1) {
      await stores.tasks.create(ACME, { title: `Task ${i}`, description: 'x'.repeat(2000), status: 'todo', priority: 'low' });
    }
    const client = fakeClient(toolRequest(functionCall('list_tasks', '{"limit":50}')), answer('Lots of tasks.'));

    const { result } = await respondWith(client, 'hello', { stores });
    await result;

    const [output] = toolOutputs(requestBody(client, 1));
    expect(output.output.length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_LENGTH);
    const parsed = JSON.parse(output.output);
    expect(parsed.truncated).toBe(true);
    expect(parsed.records.length).toBeGreaterThan(0);
    expect(parsed.records[0].title).toBe('Task 49');
  });
});

describe('OpenAI provider failures', () => {
  const headers = new Headers();
  const leaky = `Incorrect API key provided: ${API_KEY}. Prompt: Which orders are pending?`;

  it.each([
    ['a rate limit', new RateLimitError(429, { message: leaky }, leaky, headers), 503, 'AI_PROVIDER_UNAVAILABLE'],
    ['a timeout', new APIConnectionTimeoutError({ message: leaky }), 503, 'AI_PROVIDER_UNAVAILABLE'],
    ['a network failure', new APIConnectionError({ message: leaky }), 503, 'AI_PROVIDER_UNAVAILABLE'],
    ['the overall deadline', new APIUserAbortError({ message: leaky }), 503, 'AI_PROVIDER_UNAVAILABLE'],
    ['an OpenAI server error', new InternalServerError(500, { message: leaky }, leaky, headers), 503, 'AI_PROVIDER_UNAVAILABLE'],
    ['a rejected API key', new AuthenticationError(401, { message: leaky, code: 'invalid_api_key' }, leaky, headers), 502, 'AI_PROVIDER_ERROR'],
    ['a key without access', new PermissionDeniedError(403, { message: leaky }, leaky, headers), 502, 'AI_PROVIDER_ERROR'],
    ['an unknown model', new NotFoundError(404, { message: leaky, code: 'model_not_found' }, leaky, headers), 502, 'AI_PROVIDER_ERROR'],
    ['a bad request', new BadRequestError(400, { message: leaky }, leaky, headers), 502, 'AI_PROVIDER_ERROR'],
  ])('turns %s into a safe %s error, logging only its classification', async (_, error, status, code) => {
    const { result, logs } = await respondWith(fakeClient(error));

    const thrown = await result.catch((caught) => caught);

    expect(thrown).toMatchObject({ name: 'HttpError', status, code });
    expect(thrown.message).not.toContain(API_KEY);
    expect(logs.entries).toEqual([
      expect.objectContaining({ level: 'error', message: 'openai request failed', error: expect.objectContaining({ name: error.constructor.name }) }),
    ]);
    expect(JSON.stringify(logs.entries)).not.toMatch(/sk-test|Which orders/);
  });

  it('fails a tool round the same way', async () => {
    const client = fakeClient(toolRequest(functionCall('list_tasks', '{}')), new RateLimitError(429, {}, 'slow down', headers));

    const { result } = await respondWith(client);

    await expect(result).rejects.toMatchObject({ status: 503, code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('lets an unexpected error through unchanged, for the generic 500', async () => {
    const { result, logs } = await respondWith(fakeClient(new TypeError('bug')));

    await expect(result).rejects.toThrow(TypeError);
    expect(logs.entries).toEqual([]);
  });
});
