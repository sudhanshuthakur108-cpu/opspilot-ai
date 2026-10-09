import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase, withTransaction } from '../../lib/database.js';
import { scriptedProvider } from '../../testing/approvalTestApp.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { signUp } from '../../testing/signUp.js';
import { AuditLog } from '../audit/audit.model.js';
import { auditLogStore } from '../audit/audit.store.js';
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
import { Approval } from './approval.model.js';
import { approvalStore } from './approval.store.js';

// AI proposals and the approval lifecycle against MongoDB, with the real stores and transactions.
// Runs only when MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';

describe.skipIf(!uri)('approvals against MongoDB', () => {
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

  beforeEach(async ({ skip }) => {
    if (!transactionsAvailable) skip();
    await Promise.all([User, Organization, Membership, Customer, Order, Task, AuditLog, Approval].map((model) => model.deleteMany({})));
  });

  // Ada owns Acme with Initech and its order; Grace owns Globex with Umbrella and its order.
  async function setup({ approvals = approvalStore } = {}) {
    const provider = scriptedProvider();
    const app = createApp({
      logger: captureLogger(),
      clientOrigin: ORIGIN,
      auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
      organizationStores: { organizations: organizationStore, memberships: membershipStore, withTransaction },
      customers: customerStore,
      orders: orderStore,
      tasks: taskStore,
      auditLogs: auditLogStore,
      approvals,
      aiProvider: provider,
    });
    const post = (path, cookie, body) => request(app).post(`/api/v1${path}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

    async function ownerOf(email, slug, customerName) {
      const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
      const organizationId = (await post('/organizations', cookie, { name: slug, slug })).body.organization.id;
      const customer = (await post(`/organizations/${organizationId}/customers`, cookie, { name: customerName })).body.customer;
      const order = (
        await post(`/organizations/${organizationId}/orders`, cookie, { customerId: customer.id, description: `${customerName} supplies`, status: 'pending', totalAmount: 100 })
      ).body.order;
      return { user, cookie, organizationId, customer, order };
    }

    // Has the assistant propose a task linked to the owner's customer and order.
    async function propose(owner, title = 'Call about the order') {
      provider.script = async ({ runTool }) => {
        await runTool('propose_create_task', { summary: 'Follow up', title, customerId: owner.customer.id, orderId: owner.order.id, dueDate: '2026-10-12' });
        return { status: 'completed', text: 'Waiting for approval.' };
      };
      const response = await post(`/organizations/${owner.organizationId}/ai/assistant`, owner.cookie, { message: 'Create a task' });
      return response.body.reply.suggestedActions[0].approvalId;
    }

    const approve = (user, approvalId, organizationId = user.organizationId) => post(`/organizations/${organizationId}/approvals/${approvalId}/approve`, user.cookie);
    const reject = (user, approvalId, body) => post(`/organizations/${user.organizationId}/approvals/${approvalId}/reject`, user.cookie, body);

    return { app, post, propose, approve, reject, ada: await ownerOf('ada@example.com', 'acme', 'Initech'), grace: await ownerOf('grace@example.com', 'globex', 'Umbrella') };
  }

  const auditActions = async (resourceId) =>
    (await AuditLog.find({ resourceId }).sort({ createdAt: 1, _id: 1 }).lean()).map((entry) => [entry.action, entry.actorType]);

  it('persists an AI proposal as a pending approval in the caller’s organization, without creating a task', async () => {
    const { propose, ada } = await setup();

    const approvalId = await propose(ada);

    const stored = await Approval.findById(approvalId).lean();
    expect(stored).toMatchObject({ source: 'ai', action: 'create_task', status: 'pending', summary: 'Follow up' });
    expect(stored.organizationId.toString()).toBe(ada.organizationId);
    expect(stored.requestedByUserId.toString()).toBe(ada.user.id);
    expect(stored.parameters).toEqual({
      title: 'Call about the order',
      status: 'todo',
      priority: 'medium',
      customerId: ada.customer.id,
      orderId: ada.order.id,
      dueDate: '2026-10-12',
    });
    expect(await Task.countDocuments()).toBe(0);
    const [entry] = await AuditLog.find({ resourceId: approvalId }).lean();
    expect(entry).toMatchObject({ action: 'approval.proposed', actorType: 'ai', resourceType: 'approval' });
    expect(entry.actorUserId).toBeUndefined();
  });

  it('creates exactly one task on approval, in the same organization, and records the lifecycle', async () => {
    const { propose, approve, ada } = await setup();
    const approvalId = await propose(ada);

    const response = await approve(ada, approvalId);

    expect(response.status).toBe(200);
    expect(response.body.approval.status).toBe('executed');
    const tasks = await Task.find().lean();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].organizationId.toString()).toBe(ada.organizationId);
    expect(tasks[0]).toMatchObject({ title: 'Call about the order', status: 'todo', priority: 'medium' });
    expect(tasks[0].customerId.toString()).toBe(ada.customer.id);
    expect(tasks[0].dueDate.toISOString()).toBe('2026-10-12T00:00:00.000Z');

    const stored = await Approval.findById(approvalId).lean();
    expect(stored).toMatchObject({ status: 'executed', resultType: 'task' });
    expect(stored.resultId.toString()).toBe(tasks[0]._id.toString());
    expect(stored.reviewedByUserId.toString()).toBe(ada.user.id);
    expect(await auditActions(approvalId)).toEqual([
      ['approval.proposed', 'ai'],
      ['approval.approved', 'user'],
      ['approval.executed', 'user'],
    ]);
  });

  it('creates no second task when approve requests arrive together or again later', async () => {
    const { propose, approve, ada } = await setup();
    const approvalId = await propose(ada);

    const together = await Promise.all([1, 2, 3, 4, 5].map(() => approve(ada, approvalId)));
    const later = await approve(ada, approvalId);

    expect(together.map((response) => response.status).sort()).toEqual([200, 409, 409, 409, 409]);
    expect(later.status).toBe(409);
    expect(await Task.countDocuments()).toBe(1);
    expect(await auditActions(approvalId)).toEqual([
      ['approval.proposed', 'ai'],
      ['approval.approved', 'user'],
      ['approval.executed', 'user'],
    ]);
  });

  it('creates no task on rejection, and cannot be approved afterwards', async () => {
    const { propose, approve, reject, ada } = await setup();
    const approvalId = await propose(ada);

    const rejected = await reject(ada, approvalId, { reason: 'Not now' });
    const approvedAfter = await approve(ada, approvalId);

    expect(rejected.status).toBe(200);
    expect(approvedAfter.status).toBe(409);
    expect(await Approval.findById(approvalId).lean()).toMatchObject({ status: 'rejected', rejectionReason: 'Not now' });
    expect(await Task.countDocuments()).toBe(0);
    expect(await auditActions(approvalId)).toEqual([
      ['approval.proposed', 'ai'],
      ['approval.rejected', 'user'],
    ]);
  });

  it('keeps approvals isolated between organizations', async () => {
    const { app, propose, approve, ada, grace } = await setup();
    const graceApproval = await propose(grace);
    await propose(ada, 'Ada’s own task');

    const throughOwn = await approve(ada, graceApproval);
    const throughTheirs = await approve(ada, graceApproval, grace.organizationId);
    const listed = await request(app).get(`/api/v1/organizations/${ada.organizationId}/approvals?organizationId=${grace.organizationId}`).set('Cookie', ada.cookie);

    expect(throughOwn.status).toBe(404);
    expect(throughTheirs.status).toBe(404);
    expect(listed.body.approvals.map((approval) => approval.parameters.title)).toEqual(['Ada’s own task']);
    expect(await Approval.findById(graceApproval).lean()).toMatchObject({ status: 'pending' });
    expect(await approvalStore.findById(ada.organizationId, graceApproval)).toBeNull();
    expect(await Task.countDocuments()).toBe(0);
  });

  it('marks a proposal whose links no longer pass as execution_failed, creating nothing', async () => {
    const { propose, approve, ada, grace } = await setup();
    const approvalId = await propose(ada);
    await Approval.updateOne({ _id: approvalId }, { $set: { 'parameters.customerId': grace.customer.id, 'parameters.orderId': grace.order.id } });

    const response = await approve(ada, approvalId);

    expect(response.status).toBe(200);
    expect(response.body.approval).toMatchObject({ status: 'execution_failed', failure: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' } });
    expect(await Task.countDocuments()).toBe(0);
    expect(await Approval.findById(approvalId).lean()).toMatchObject({ status: 'execution_failed', failureCode: 'CUSTOMER_NOT_FOUND' });
    expect(await auditActions(approvalId)).toEqual([
      ['approval.proposed', 'ai'],
      ['approval.approved', 'user'],
      ['approval.execution_failed', 'user'],
    ]);
  });

  it('rolls the task back when the approval cannot be marked executed, and records the failure instead', async () => {
    const failingStore = {
      ...approvalStore,
      async transition(organizationId, approvalId, change, options) {
        if (change.to === 'executed') throw new Error('write failed');
        return approvalStore.transition(organizationId, approvalId, change, options);
      },
    };
    const { propose, approve, ada } = await setup({ approvals: failingStore });
    const approvalId = await propose(ada);

    const response = await approve(ada, approvalId);

    expect(response.status).toBe(200);
    expect(response.body.approval).toMatchObject({ status: 'execution_failed', failure: { code: 'EXECUTION_ERROR' } });
    expect(await Task.countDocuments()).toBe(0);
    expect(await auditActions(approvalId)).toEqual([
      ['approval.proposed', 'ai'],
      ['approval.approved', 'user'],
      ['approval.execution_failed', 'user'],
    ]);
  });

  it('refuses a status change outside the state machine in the store', async () => {
    const { propose, ada } = await setup();
    const approvalId = await propose(ada);

    await expect(approvalStore.transition(ada.organizationId, approvalId, { from: 'pending', to: 'executed' })).rejects.toThrow(
      'An approval cannot change from "pending" to "executed"',
    );
    expect(await Approval.findById(approvalId).lean()).toMatchObject({ status: 'pending' });
  });
});
