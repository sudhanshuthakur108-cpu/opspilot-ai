import { describe, expect, it } from 'vitest';
import { HttpError } from '../../lib/httpError.js';
import { createMemoryApprovalStore } from '../../testing/memoryApprovalStore.js';
import { createMemoryCustomerStore } from '../../testing/memoryCustomerStore.js';
import { createMemoryOrderStore } from '../../testing/memoryOrderStore.js';
import { createMemoryTaskStore } from '../../testing/memoryTaskStore.js';
import { ACTION_NAMES, getAction } from './approval.actions.js';
import { APPROVAL_STATUSES, APPROVAL_TRANSITIONS, canTransition } from './approval.model.js';

const ACME = '1'.repeat(24);
const GLOBEX = '2'.repeat(24);

// Acme has Initech with an order and Hooli without one; Globex has Umbrella with an order.
async function seededStores() {
  const stores = { customers: createMemoryCustomerStore(), orders: createMemoryOrderStore(), tasks: createMemoryTaskStore() };
  const order = async (organizationId, customer) =>
    stores.orders.create(organizationId, { customerId: customer.id, description: `${customer.name} supplies`, status: 'pending', totalAmount: 1, currency: 'INR' });
  const initech = await stores.customers.create(ACME, { name: 'Initech' });
  const hooli = await stores.customers.create(ACME, { name: 'Hooli' });
  const umbrella = await stores.customers.create(GLOBEX, { name: 'Umbrella' });
  return { stores, initech, hooli, initechOrder: await order(ACME, initech), umbrella, umbrellaOrder: await order(GLOBEX, umbrella) };
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection');
}

describe('approval action registry', () => {
  it('allows exactly one action: create_task', () => {
    expect(ACTION_NAMES).toEqual(['create_task']);
    expect(Object.isFrozen(ACTION_NAMES)).toBe(true);
  });

  it.each(['create_customer', 'create_order', 'update_order', 'delete_everything', 'createTask', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '', 42, null, undefined, ['create_task']])(
    'refuses the action %j',
    (name) => {
      expect(() => getAction(name)).toThrow(HttpError);
      try {
        getAction(name);
      } catch (error) {
        expect(error).toMatchObject({ status: 400, code: 'UNKNOWN_ACTION', message: 'This action is not supported' });
      }
    },
  );
});

describe('create_task prepare', () => {
  it('returns the task fields in stored form, with defaults, and drops everything else', async () => {
    const { stores, initech, initechOrder } = await seededStores();

    const parameters = await getAction('create_task').prepare(stores, ACME, {
      title: '  Call Initech  ',
      description: '  ',
      customerId: initech.id,
      orderId: initechOrder.id,
      dueDate: '2026-10-12',
      organizationId: GLOBEX,
      collection: 'users',
      id: 'f'.repeat(24),
    });

    expect(parameters).toEqual({ title: 'Call Initech', status: 'todo', priority: 'medium', customerId: initech.id, orderId: initechOrder.id, dueDate: '2026-10-12' });
    expect(stores.tasks.records).toHaveLength(0);
  });

  it.each([
    ['another organization’s customer', ({ umbrella }) => ({ customerId: umbrella.id }), 404, 'CUSTOMER_NOT_FOUND'],
    ['another organization’s order', ({ umbrellaOrder }) => ({ orderId: umbrellaOrder.id }), 404, 'ORDER_NOT_FOUND'],
    ['an order of a different customer', ({ hooli, initechOrder }) => ({ customerId: hooli.id, orderId: initechOrder.id }), 400, 'VALIDATION_FAILED'],
    ['an invalid priority', () => ({ priority: 'urgent' }), 400, 'VALIDATION_FAILED'],
  ])('refuses %s', async (_, links, status, code) => {
    const seeded = await seededStores();

    const error = await rejection(getAction('create_task').prepare(seeded.stores, ACME, { title: 'Follow up', ...links(seeded) }));

    expect(error).toMatchObject({ status, code });
  });
});

describe('create_task execute', () => {
  it('creates the task through the task service, in the given organization', async () => {
    const { stores, initech, initechOrder } = await seededStores();

    const taskId = await getAction('create_task').execute(
      stores,
      ACME,
      { title: 'Call Initech', status: 'in_progress', priority: 'high', customerId: initech.id, orderId: initechOrder.id, dueDate: '2026-10-12' },
      { session: undefined },
    );

    expect(stores.tasks.records).toEqual([
      expect.objectContaining({ id: taskId, organizationId: ACME, title: 'Call Initech', status: 'in_progress', priority: 'high', customerId: initech.id }),
    ]);
  });

  it.each([
    ['a title that is no longer valid', () => ({ title: '' }), 'VALIDATION_FAILED'],
    ['a customer of another organization', ({ umbrella }) => ({ title: 'Call', customerId: umbrella.id }), 'CUSTOMER_NOT_FOUND'],
    ['an order of another organization', ({ umbrellaOrder }) => ({ title: 'Call', orderId: umbrellaOrder.id }), 'ORDER_NOT_FOUND'],
  ])('checks stored parameters again and refuses %s without creating anything', async (_, parameters, code) => {
    const seeded = await seededStores();

    const error = await rejection(getAction('create_task').execute(seeded.stores, ACME, parameters(seeded), { session: undefined }));

    expect(error).toMatchObject({ code });
    expect(seeded.stores.tasks.records).toHaveLength(0);
  });
});

describe('approval state machine', () => {
  const allowed = [
    ['pending', 'approved'],
    ['pending', 'rejected'],
    ['approved', 'executed'],
    ['approved', 'execution_failed'],
  ];

  it('allows only these status changes', () => {
    const every = APPROVAL_STATUSES.flatMap((from) => APPROVAL_STATUSES.map((to) => [from, to]));
    expect(every.filter(([from, to]) => canTransition(from, to))).toEqual(allowed);
    expect(Object.isFrozen(APPROVAL_TRANSITIONS)).toBe(true);
    expect(canTransition('__proto__', 'approved')).toBe(false);
  });

  it.each([
    ['rejected', 'approved'],
    ['executed', 'approved'],
    ['executed', 'rejected'],
    ['pending', 'executed'],
    ['pending', 'execution_failed'],
    ['execution_failed', 'approved'],
    ['approved', 'pending'],
  ])('refuses %s → %s in the store, before touching the record', async (from, to) => {
    const approvals = createMemoryApprovalStore();
    const approval = await approvals.create(ACME, { source: 'ai', action: 'create_task', summary: 'S', parameters: { title: 'T' }, requestedByUserId: 'a'.repeat(24) });
    approvals.records[0].status = from;

    await expect(approvals.transition(ACME, approval.id, { from, to })).rejects.toThrow(`An approval cannot change from "${from}" to "${to}"`);
    expect(approvals.records[0].status).toBe(from);
  });

  it('changes status only while the approval is still in the expected status, and only in its organization', async () => {
    const approvals = createMemoryApprovalStore();
    const { id } = await approvals.create(ACME, { source: 'ai', action: 'create_task', summary: 'S', parameters: { title: 'T' }, requestedByUserId: 'a'.repeat(24) });

    expect(await approvals.transition(GLOBEX, id, { from: 'pending', to: 'approved' })).toBeNull();
    expect(await approvals.transition(ACME, id, { from: 'pending', to: 'approved' })).toMatchObject({ status: 'approved' });
    expect(await approvals.transition(ACME, id, { from: 'pending', to: 'approved' })).toBeNull();
    expect(await approvals.transition(ACME, id, { from: 'pending', to: 'rejected' })).toBeNull();
  });
});
