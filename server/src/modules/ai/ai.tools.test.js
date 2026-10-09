import { describe, expect, it, vi } from 'vitest';
import { createMemoryCustomerStore } from '../../testing/memoryCustomerStore.js';
import { createMemoryOrderStore } from '../../testing/memoryOrderStore.js';
import { createMemoryTaskStore } from '../../testing/memoryTaskStore.js';
import { AiToolError, TOOL_DEFINITIONS, runTool } from './ai.tools.js';

const ACME = '1'.repeat(24);
const GLOBEX = '2'.repeat(24);

// Acme has Initech, its order and a linked task; Globex has Umbrella, its order and a linked task.
async function seededStores() {
  const stores = { customers: createMemoryCustomerStore(), orders: createMemoryOrderStore(), tasks: createMemoryTaskStore() };
  for (const [organizationId, name] of [
    [ACME, 'Initech'],
    [GLOBEX, 'Umbrella'],
  ]) {
    const customer = await stores.customers.create(organizationId, { name });
    const order = await stores.orders.create(organizationId, {
      customerId: customer.id,
      description: `${name} supplies`,
      status: 'pending',
      totalAmount: 100,
      currency: 'INR',
    });
    await stores.tasks.create(organizationId, {
      title: `Call ${name}`,
      status: 'todo',
      priority: 'medium',
      customerId: customer.id,
      orderId: order.id,
    });
  }
  return stores;
}

// Stores whose every method records its arguments and returns nothing.
function spyStores() {
  const methods = ['create', 'update', 'findById', 'findByIds', 'listForOrganization'];
  const store = () => Object.fromEntries(methods.map((method) => [method, vi.fn(async () => [])]));
  return { customers: store(), orders: store(), tasks: store() };
}

function storeCalls(stores) {
  return Object.entries(stores).flatMap(([storeName, store]) =>
    Object.entries(store).flatMap(([method, fn]) => fn.mock.calls.map((args) => ({ call: `${storeName}.${method}`, args }))),
  );
}

describe('AI tool registry', () => {
  it('offers exactly the read-only list tools', () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual(['list_customers', 'list_orders', 'list_tasks']);
    expect(TOOL_DEFINITIONS.every((tool) => tool.readOnly === true)).toBe(true);
  });

  it('has no tool that creates, updates or deletes anything', () => {
    expect(TOOL_DEFINITIONS.filter((tool) => !tool.readOnly)).toEqual([]);
    expect(TOOL_DEFINITIONS.map((tool) => tool.name).filter((name) => /create|update|delete|remove|set/i.test(name))).toEqual([]);
  });

  it('describes each tool with a description and a closed input schema, and exposes no functions', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(Object.keys(tool).sort()).toEqual(['description', 'name', 'parameters', 'readOnly']);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false });
      expect(Object.keys(tool.parameters.properties)).toEqual(['limit']);
      expect(Object.isFrozen(tool)).toBe(true);
    }
    expect(Object.isFrozen(TOOL_DEFINITIONS)).toBe(true);
    // structuredClone throws on functions, so this proves the definitions are plain data.
    expect(() => structuredClone(TOOL_DEFINITIONS)).not.toThrow();
  });
});

describe('runTool', () => {
  it.each([
    ['list_customers', (records) => records.map((customer) => customer.name), ['Initech']],
    ['list_orders', (records) => records.map((order) => [order.description, order.customerName]), [['Initech supplies', 'Initech']]],
    [
      'list_tasks',
      (records) => records.map((task) => [task.title, task.customerName, task.orderDescription]),
      [['Call Initech', 'Initech', 'Initech supplies']],
    ],
  ])('%s returns only the given organization’s records', async (name, pick, expected) => {
    const stores = await seededStores();

    expect(pick(await runTool(stores, ACME, name))).toEqual(expected);
    expect(JSON.stringify(await runTool(stores, ACME, name))).not.toContain('Umbrella');
  });

  it.each(TOOL_DEFINITIONS.map((tool) => tool.name))('%s passes the organization to every store query it makes', async (name) => {
    const stores = await seededStores();
    const spied = Object.fromEntries(
      Object.entries(stores).map(([storeName, store]) => [
        storeName,
        Object.fromEntries(Object.entries(store).map(([method, fn]) => [method, typeof fn === 'function' ? vi.fn(fn) : fn])),
      ]),
    );

    await runTool(spied, ACME, name, { organizationId: GLOBEX });

    const calls = Object.values(spied).flatMap((store) => Object.values(store).filter(vi.isMockFunction).flatMap((fn) => fn.mock.calls));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([organizationId]) => organizationId === ACME)).toBe(true);
  });

  it.each(TOOL_DEFINITIONS.map((tool) => tool.name))('%s ignores an organization in its input', async (name) => {
    const stores = await seededStores();

    const records = await runTool(stores, ACME, name, { organizationId: GLOBEX });

    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain('Umbrella');
  });

  it('uses only list queries, never writes', async () => {
    const stores = spyStores();

    for (const { name } of TOOL_DEFINITIONS) {
      await runTool(stores, ACME, name);
    }

    expect(storeCalls(stores).map(({ call }) => call)).toEqual([
      'customers.listForOrganization',
      'orders.listForOrganization',
      'tasks.listForOrganization',
    ]);
  });

  it.each([
    ['no input', undefined, 20],
    ['null input', null, 20],
    ['an empty object', {}, 20],
    ['a limit', { limit: 5 }, 5],
    ['the largest limit', { limit: 50 }, 50],
  ])('reads %s as a list limit of %s', async (_, input, limit) => {
    const stores = spyStores();

    await runTool(stores, ACME, 'list_customers', input);

    expect(stores.customers.listForOrganization).toHaveBeenCalledWith(ACME, { limit });
  });

  it.each([
    ['a limit of 0', { limit: 0 }],
    ['a limit over 50', { limit: 51 }],
    ['a fractional limit', { limit: 1.5 }],
    ['a limit given as text', { limit: '10' }],
    ['an operator object as limit', { limit: { $gt: 0 } }],
    ['an array', [{ limit: 5 }]],
    ['text', 'all of them'],
    ['a number', 10],
  ])('refuses %s before touching a store', async (_, input) => {
    const stores = spyStores();

    for (const { name } of TOOL_DEFINITIONS) {
      await expect(runTool(stores, ACME, name, input)).rejects.toMatchObject({ name: 'AiToolError', code: 'INVALID_TOOL_INPUT' });
    }
    expect(storeCalls(stores)).toEqual([]);
  });

  it.each([
    ['a write operation', 'create_task'],
    ['a database command', 'dropDatabase'],
    ['an object prototype key', '__proto__'],
    ['an inherited method', 'constructor'],
    ['a different case', 'LIST_CUSTOMERS'],
    ['no name', undefined],
    ['a non-string name', { name: 'list_customers' }],
  ])('refuses %s as an unknown tool', async (_, name) => {
    const stores = spyStores();

    const error = await runTool(stores, ACME, name).catch((caught) => caught);

    expect(error).toBeInstanceOf(AiToolError);
    expect(error.code).toBe('UNKNOWN_TOOL');
    expect(storeCalls(stores)).toEqual([]);
  });
});
