import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../app.js';
import { captureLogger } from './captureLogger.js';
import { createMemoryApprovalStore } from './memoryApprovalStore.js';
import { createMemoryAuditLogStore } from './memoryAuditLogStore.js';
import { createMemoryCustomerStore } from './memoryCustomerStore.js';
import { createMemoryOrderStore } from './memoryOrderStore.js';
import { createMemoryOrganizationStores } from './memoryOrganizationStores.js';
import { createMemoryTaskStore } from './memoryTaskStore.js';
import { createMemoryUserStore } from './memoryUserStore.js';
import { signUp } from './signUp.js';

export const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';

// A stand-in AI provider whose behavior each test sets with `provider.script`, a function given
// what a real provider gets ({ message, tools, runTool }). By default it answers without tools.
export function scriptedProvider() {
  const provider = { name: 'test', script: async () => ({ status: 'completed', text: 'Done.' }) };
  provider.respond = vi.fn((input) => provider.script(input));
  return provider;
}

// The full app with in-memory stores, including approvals and the audit log. Ada owns Acme, with
// the customers Initech (with the order "Initech supplies") and Hooli (no orders); Grace owns
// Globex, with Umbrella and "Umbrella supplies". Everything is created through the API.
export async function createApprovalTestApp({ aiProvider = scriptedProvider(), tasks = createMemoryTaskStore() } = {}) {
  const users = createMemoryUserStore();
  const organizationStores = createMemoryOrganizationStores();
  const customers = createMemoryCustomerStore();
  const orders = createMemoryOrderStore();
  const auditLogs = createMemoryAuditLogStore();
  const approvals = createMemoryApprovalStore();
  const logs = captureLogger();
  const app = createApp({
    logger: logs,
    clientOrigin: ORIGIN,
    auth: { users, secret: SECRET, secureCookie: false },
    organizationStores,
    customers,
    orders,
    tasks,
    auditLogs,
    approvals,
    aiProvider,
  });

  const post = (path, cookie, body) => {
    const req = request(app).post(`/api/v1${path}`).set('Origin', ORIGIN);
    return (cookie ? req.set('Cookie', cookie) : req).send(body);
  };
  const get = (path, cookie) => {
    const req = request(app).get(`/api/v1${path}`);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  async function ownerOf(email, slug, customerName, extraCustomer) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
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
    const other = extraCustomer
      ? (await post(`/organizations/${organizationId}/customers`, cookie, { name: extraCustomer })).body.customer
      : null;
    return { user, cookie, organizationId, customer, order, other };
  }

  const ada = await ownerOf('ada@example.com', 'acme', 'Initech', 'Hooli');
  const grace = await ownerOf('grace@example.com', 'globex', 'Umbrella');

  // Signs up another user and adds them to `organizationId` with `role`.
  async function joinAs(organizationId, email, role) {
    const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
    await organizationStores.memberships.create({ organizationId, userId: user.id, role });
    return { user, cookie };
  }

  return {
    app,
    provider: aiProvider,
    logs,
    post,
    get,
    joinAs,
    ada,
    grace,
    stores: { users, ...organizationStores, customers, orders, tasks, auditLogs, approvals },
  };
}
