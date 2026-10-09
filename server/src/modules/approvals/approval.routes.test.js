import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ORIGIN, createApprovalTestApp } from '../../testing/approvalTestApp.js';
import { createMemoryTaskStore } from '../../testing/memoryTaskStore.js';

const LEAK_PATTERN = /organizationId|userId|_id|__v|password|tokenVersion/;
const MISSING_ID = 'f'.repeat(24);

// Has the assistant propose one task as `user` and returns the new approval's ID. `input` may be
// a function of the test app, for IDs that only exist after setup.
async function propose(t, user, input = { summary: 'Plan the review', title: 'Quarterly review' }) {
  t.provider.script = async ({ runTool }) => {
    await runTool('propose_create_task', typeof input === 'function' ? input(t) : input);
    return { status: 'completed', text: 'Waiting for approval.' };
  };
  const response = await t.post(`/organizations/${user.organizationId}/ai/assistant`, user.cookie, { message: 'Create a task' });
  if (response.status !== 200) throw new Error(`Proposal failed with HTTP ${response.status}: ${response.text}`);
  return response.body.reply.suggestedActions[0].approvalId;
}

const setup = (options) => createApprovalTestApp(options);

const approve = (t, user, approvalId, organizationId = user.organizationId) =>
  t.post(`/organizations/${organizationId}/approvals/${approvalId}/approve`, user.cookie);
const reject = (t, user, approvalId, body, organizationId = user.organizationId) =>
  t.post(`/organizations/${organizationId}/approvals/${approvalId}/reject`, user.cookie, body);
const list = (t, user, query = '', organizationId = user.organizationId) => t.get(`/organizations/${organizationId}/approvals${query}`, user.cookie);
const tasksOf = (t, organizationId) => t.stores.tasks.records.filter((task) => task.organizationId === organizationId);
const auditActions = (t) => t.stores.auditLogs.records.map((entry) => entry.action);

describe('GET /api/v1/organizations/:organizationId/approvals', () => {
  it('lists the organization’s approvals newest first, with readable links and no internal IDs', async () => {
    const t = await setup();
    const first = await propose(t, t.ada, ({ ada }) => ({
      summary: 'Follow up on the order',
      title: 'Call Initech',
      customerId: ada.customer.id,
      orderId: ada.order.id,
      dueDate: '2026-10-12',
    }));
    const second = await propose(t, t.ada);
    await propose(t, t.grace);

    const response = await list(t, t.ada);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ page: 1, limit: 20, hasMore: false });
    expect(response.body.approvals.map((approval) => approval.id)).toEqual([second, first]);
    expect(response.body.approvals[1]).toEqual({
      id: first,
      source: 'ai',
      action: 'create_task',
      status: 'pending',
      summary: 'Follow up on the order',
      parameters: {
        title: 'Call Initech',
        status: 'todo',
        priority: 'medium',
        customerId: t.ada.customer.id,
        orderId: t.ada.order.id,
        dueDate: '2026-10-12',
        customerName: 'Initech',
        orderDescription: 'Initech supplies',
      },
      requestedByEmail: 'ada@example.com',
      reviewedByEmail: null,
      reviewedAt: null,
      rejectionReason: null,
      result: null,
      failure: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(response.text).not.toMatch(LEAK_PATTERN);
    expect(response.text).not.toContain('Umbrella');
  });

  it.each(['owner', 'admin', 'member'])('lets an organization %s list approvals', async (role) => {
    const t = await setup();
    await propose(t, t.ada);
    const person = await t.joinAs(t.ada.organizationId, `${role}@example.com`, role);

    const response = await list(t, { ...person, organizationId: t.ada.organizationId });

    expect(response.status).toBe(200);
    expect(response.body.approvals).toHaveLength(1);
  });

  it('filters by status and pages through the list', async () => {
    const t = await setup();
    const ids = [];
    for (let n = 0; n < 3; n += 1) ids.push(await propose(t, t.ada, { summary: `Task ${n}`, title: `Task ${n}` }));
    await reject(t, t.ada, ids[0], {});

    const pending = await list(t, t.ada, '?status=pending');
    const rejected = await list(t, t.ada, '?status=rejected');
    const firstPage = await list(t, t.ada, '?limit=2');
    const secondPage = await list(t, t.ada, '?limit=2&page=2');

    expect(pending.body.approvals.map((approval) => approval.id)).toEqual([ids[2], ids[1]]);
    expect(rejected.body.approvals.map((approval) => approval.id)).toEqual([ids[0]]);
    expect(firstPage.body).toMatchObject({ page: 1, limit: 2, hasMore: true });
    expect(secondPage.body).toMatchObject({ page: 2, limit: 2, hasMore: false });
    expect(secondPage.body.approvals.map((approval) => approval.id)).toEqual([ids[0]]);
  });

  it.each([
    ['an unknown status', '?status=done', 'Status must be one of pending, approved, rejected, executed, execution_failed'],
    ['a repeated status', '?status=pending&status=rejected', 'Status must be one of pending, approved, rejected, executed, execution_failed'],
    ['a limit over 50', '?limit=51', 'Limit must be a whole number from 1 to 50'],
    ['a page of 0', '?page=0', 'Page must be a whole number from 1 to 1000'],
    ['a page over 1000', '?page=1001', 'Page must be a whole number from 1 to 1000'],
  ])('rejects %s', async (_, query, message) => {
    const t = await setup();

    const response = await list(t, t.ada, query);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message });
  });

  it.each([
    ['query', (req, otherId) => req.query({ organizationId: otherId })],
    ['headers', (req, otherId) => req.set('X-Organization-Id', otherId)],
  ])('lists only the route’s organization whatever the %s says', async (_, tamper) => {
    const t = await setup();
    await propose(t, t.grace);

    const response = await tamper(
      request(t.app).get(`/api/v1/organizations/${t.ada.organizationId}/approvals`).set('Cookie', t.ada.cookie),
      t.grace.organizationId,
    );

    expect(response.status).toBe(200);
    expect(response.body.approvals).toEqual([]);
  });

  it('gives a non-member the same 404 as a missing organization, and a signed-out user 401', async () => {
    const t = await setup();
    await propose(t, t.grace);

    const foreign = await list(t, t.ada, '', t.grace.organizationId);
    const missing = await list(t, t.ada, '', MISSING_ID);
    const signedOut = await list(t, { cookie: undefined }, '', t.ada.organizationId);

    expect([foreign.status, missing.status, signedOut.status]).toEqual([404, 404, 401]);
    expect(foreign.body.error.code).toBe('NOT_FOUND');
    expect(foreign.text).not.toContain('Quarterly review');
  });
});

describe('POST /api/v1/organizations/:organizationId/approvals/:approvalId/approve', () => {
  it('runs the stored proposal once: creates the task, marks the approval executed and audits each step', async () => {
    const t = await setup();
    const approvalId = await propose(t, t.ada, ({ ada }) => ({
      summary: 'Follow up on the order',
      title: 'Call Initech',
      description: 'Confirm the delivery date.',
      customerId: ada.customer.id,
      orderId: ada.order.id,
      priority: 'high',
      dueDate: '2026-10-12',
    }));
    expect(tasksOf(t, t.ada.organizationId)).toHaveLength(0);

    const response = await approve(t, t.ada, approvalId);

    expect(response.status).toBe(200);
    const [task] = tasksOf(t, t.ada.organizationId);
    expect(response.body.approval).toMatchObject({
      id: approvalId,
      status: 'executed',
      reviewedByEmail: 'ada@example.com',
      reviewedAt: expect.any(String),
      result: { resourceType: 'task', resourceId: task.id },
      failure: null,
    });
    expect(response.text).not.toMatch(LEAK_PATTERN);
    expect(t.stores.tasks.records).toHaveLength(1);
    expect(task).toMatchObject({
      organizationId: t.ada.organizationId,
      title: 'Call Initech',
      description: 'Confirm the delivery date.',
      status: 'todo',
      priority: 'high',
      customerId: t.ada.customer.id,
      orderId: t.ada.order.id,
    });
    expect(task.dueDate.toISOString()).toBe('2026-10-12T00:00:00.000Z');

    const listed = await t.get(`/organizations/${t.ada.organizationId}/tasks`, t.ada.cookie);
    expect(listed.body.tasks.map((listedTask) => listedTask.title)).toEqual(['Call Initech']);

    expect(t.stores.auditLogs.records.map(({ action, actorType, actorUserId, resourceId, details }) => ({ action, actorType, actorUserId, resourceId, details }))).toEqual([
      { action: 'approval.proposed', actorType: 'ai', actorUserId: null, resourceId: approvalId, details: { action: 'create_task', summary: 'Follow up on the order' } },
      { action: 'approval.approved', actorType: 'user', actorUserId: t.ada.user.id, resourceId: approvalId, details: { action: 'create_task' } },
      {
        action: 'approval.executed',
        actorType: 'user',
        actorUserId: t.ada.user.id,
        resourceId: approvalId,
        details: { action: 'create_task', resultType: 'task', resultId: task.id },
      },
    ]);
  });

  it('lets an admin approve', async () => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);
    const admin = await t.joinAs(t.ada.organizationId, 'admin@example.com', 'admin');

    const response = await approve(t, { ...admin, organizationId: t.ada.organizationId }, approvalId);

    expect(response.status).toBe(200);
    expect(response.body.approval).toMatchObject({ status: 'executed', reviewedByEmail: 'admin@example.com' });
  });

  it('refuses a member with 403 and changes nothing', async () => {
    const t = await setup();
    const member = await t.joinAs(t.ada.organizationId, 'member@example.com', 'member');
    const approvalId = await propose(t, { ...member, organizationId: t.ada.organizationId });

    const approved = await approve(t, { ...member, organizationId: t.ada.organizationId }, approvalId);
    const rejected = await reject(t, { ...member, organizationId: t.ada.organizationId }, approvalId, { reason: 'No' });

    for (const response of [approved, rejected]) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect(t.stores.approvals.records[0].status).toBe('pending');
    expect(t.stores.tasks.records).toHaveLength(0);
    expect(auditActions(t)).toEqual(['approval.proposed']);
  });

  it('runs only once, however many approve requests arrive together', async () => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);

    const responses = await Promise.all([1, 2, 3].map(() => approve(t, t.ada, approvalId)));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict.body.error).toMatchObject({ code: 'APPROVAL_ALREADY_REVIEWED', message: 'This approval has already been reviewed' });
    expect(t.stores.tasks.records).toHaveLength(1);
    expect(auditActions(t)).toEqual(['approval.proposed', 'approval.approved', 'approval.executed']);
  });

  it.each([
    ['executed', async (t, id) => approve(t, t.ada, id)],
    ['rejected', async (t, id) => reject(t, t.ada, id, {})],
  ])('cannot approve or reject an approval that was already %s', async (_, review) => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);
    await review(t, approvalId);
    const tasksBefore = t.stores.tasks.records.length;

    const approved = await approve(t, t.ada, approvalId);
    const rejected = await reject(t, t.ada, approvalId, {});

    for (const response of [approved, rejected]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('APPROVAL_ALREADY_REVIEWED');
    }
    expect(t.stores.tasks.records).toHaveLength(tasksBefore);
  });

  it('applies only the stored proposal, ignoring anything sent with the request', async () => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);

    const response = await request(t.app)
      .post(`/api/v1/organizations/${t.ada.organizationId}/approvals/${approvalId}/approve?organizationId=${t.grace.organizationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', t.ada.cookie)
      .set('X-Organization-Id', t.grace.organizationId)
      .send({
        organizationId: t.grace.organizationId,
        title: 'Something else',
        parameters: { title: 'Something else', customerId: t.grace.customer.id },
        action: 'delete_everything',
        status: 'executed',
        actorType: 'ai',
        reviewedByUserId: t.grace.user.id,
      });

    expect(response.status).toBe(200);
    expect(t.stores.tasks.records.map((task) => [task.organizationId, task.title, task.customerId])).toEqual([
      [t.ada.organizationId, 'Quarterly review', null],
    ]);
    expect(t.stores.auditLogs.records.filter((entry) => entry.actorType === 'user').map((entry) => entry.actorUserId)).toEqual([
      t.ada.user.id,
      t.ada.user.id,
    ]);
  });

  it('gives another organization’s approval the same 404 as a missing one, through either route', async () => {
    const t = await setup();
    const graceApproval = await propose(t, t.grace);

    const throughOwnOrganization = await approve(t, t.ada, graceApproval);
    const throughTheirOrganization = await approve(t, t.ada, graceApproval, t.grace.organizationId);
    const rejectedThroughOwn = await reject(t, t.ada, graceApproval, {});
    const missing = await approve(t, t.ada, MISSING_ID);

    expect(throughOwnOrganization.status).toBe(404);
    expect(throughOwnOrganization.body.error).toMatchObject({ code: 'APPROVAL_NOT_FOUND', message: 'Approval not found' });
    expect(rejectedThroughOwn.body.error.code).toBe('APPROVAL_NOT_FOUND');
    expect(missing.body.error.code).toBe('APPROVAL_NOT_FOUND');
    expect(throughTheirOrganization.status).toBe(404);
    expect(throughTheirOrganization.body.error.code).toBe('NOT_FOUND');
    expect(t.stores.approvals.records[0].status).toBe('pending');
    expect(t.stores.tasks.records).toHaveLength(0);
  });

  it.each([
    ['without a session', (t) => approve(t, { cookie: undefined }, t.stores.approvals.records[0].id, t.ada.organizationId), 401, 'UNAUTHENTICATED'],
    ['from another origin', (t) => request(t.app).post(`/api/v1/organizations/${t.ada.organizationId}/approvals/${t.stores.approvals.records[0].id}/approve`).set('Origin', 'https://evil.example').set('Cookie', t.ada.cookie), 403, 'ORIGIN_NOT_ALLOWED'],
    ['with a malformed approval ID', (t) => approve(t, t.ada, 'not-an-id'), 400, 'VALIDATION_FAILED'],
  ])('refuses a request %s', async (_, send, status, code) => {
    const t = await setup();
    await propose(t, t.ada);

    const response = await send(t);

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(t.stores.tasks.records).toHaveLength(0);
  });
});

describe('approval execution failures', () => {
  it.each([
    ['a title that is no longer valid', (approval) => (approval.parameters.title = ''), 'VALIDATION_FAILED', 'Title must be between 1 and 200 characters'],
    ['another organization’s customer', (approval, t) => (approval.parameters.customerId = t.grace.customer.id), 'CUSTOMER_NOT_FOUND', 'Customer not found'],
    ['another organization’s order', (approval, t) => (approval.parameters.orderId = t.grace.order.id), 'ORDER_NOT_FOUND', 'Order not found'],
    [
      'an order of a different customer',
      (approval, t) => Object.assign(approval.parameters, { customerId: t.ada.other.id, orderId: t.ada.order.id }),
      'VALIDATION_FAILED',
      'The order belongs to a different customer',
    ],
    ['an action that is not on the allowlist', (approval) => (approval.action = 'delete_everything'), 'UNKNOWN_ACTION', 'This action is not supported'],
  ])('checks the stored proposal again, and records %s as a failed execution without changing anything', async (_, tamper, code, message) => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);
    tamper(t.stores.approvals.records[0], t);

    const response = await approve(t, t.ada, approvalId);

    expect(response.status).toBe(200);
    expect(response.body.approval).toMatchObject({ status: 'execution_failed', result: null, failure: { code, message } });
    expect(t.stores.tasks.records).toHaveLength(0);
    expect(auditActions(t)).toEqual(['approval.proposed', 'approval.approved', 'approval.execution_failed']);
    expect(t.stores.auditLogs.records.at(-1)).toMatchObject({ actorType: 'user', actorUserId: t.ada.user.id, details: { action: expect.any(String), failureCode: code } });

    const again = await approve(t, t.ada, approvalId);
    expect(again.status).toBe(409);
    expect(t.stores.tasks.records).toHaveLength(0);
  });

  it('records an unexpected failure with a fixed message, logs it, and does not retry', async () => {
    const tasks = createMemoryTaskStore();
    let attempts = 0;
    tasks.create = async () => {
      attempts += 1;
      throw new Error('connection to mongodb://user:secret@db.example.com lost');
    };
    const t = await setup({ tasks });
    const approvalId = await propose(t, t.ada);

    const response = await approve(t, t.ada, approvalId);

    expect(response.status).toBe(200);
    expect(response.body.approval).toMatchObject({
      status: 'execution_failed',
      failure: { code: 'EXECUTION_ERROR', message: 'The change could not be made' },
    });
    expect(response.text).not.toMatch(/mongodb|secret|connection/);
    expect(attempts).toBe(1);
    const logged = t.logs.entries.find((entry) => entry.message === 'approved action failed');
    expect(logged).toMatchObject({ approvalId, action: 'create_task' });
    expect(JSON.stringify(logged)).not.toContain('secret');
  });
});

describe('POST /api/v1/organizations/:organizationId/approvals/:approvalId/reject', () => {
  it('rejects a pending approval with a reason, creates nothing, and audits the decision', async () => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);

    const response = await reject(t, t.ada, approvalId, { reason: '  Not needed this quarter  ' });

    expect(response.status).toBe(200);
    expect(response.body.approval).toMatchObject({
      id: approvalId,
      status: 'rejected',
      rejectionReason: 'Not needed this quarter',
      reviewedByEmail: 'ada@example.com',
      result: null,
    });
    expect(t.stores.tasks.records).toHaveLength(0);
    expect(t.stores.auditLogs.records.at(-1)).toMatchObject({
      action: 'approval.rejected',
      actorType: 'user',
      actorUserId: t.ada.user.id,
      resourceType: 'approval',
      resourceId: approvalId,
      details: { action: 'create_task', reason: 'Not needed this quarter' },
    });
  });

  it.each([
    ['no body', undefined],
    ['an empty body', {}],
    ['a blank reason', { reason: '   ' }],
    ['a null reason', { reason: null }],
  ])('accepts %s as no reason', async (_, body) => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);

    const response = await reject(t, t.ada, approvalId, body);

    expect(response.status).toBe(200);
    expect(response.body.approval).toMatchObject({ status: 'rejected', rejectionReason: null });
    expect(t.stores.auditLogs.records.at(-1).details).toEqual({ action: 'create_task' });
  });

  it.each([
    ['a reason over 200 characters', { reason: 'a'.repeat(201) }, 'Reason must be at most 200 characters'],
    ['a non-text reason', { reason: { text: 'no' } }, 'Reason must be text'],
  ])('refuses %s and leaves the approval pending', async (_, body, message) => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);

    const response = await reject(t, t.ada, approvalId, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message });
    expect(t.stores.approvals.records[0].status).toBe('pending');
  });

  it('ignores a reviewer, actor or status sent in the body', async () => {
    const t = await setup();
    const approvalId = await propose(t, t.ada);

    await reject(t, t.ada, approvalId, { reviewedByUserId: t.grace.user.id, actorType: 'ai', status: 'executed', organizationId: t.grace.organizationId });

    expect(t.stores.approvals.records[0]).toMatchObject({ status: 'rejected', reviewedByUserId: t.ada.user.id, organizationId: t.ada.organizationId });
    expect(t.stores.auditLogs.records.at(-1)).toMatchObject({ actorType: 'user', actorUserId: t.ada.user.id });
  });
});
