import { HttpError } from '../../lib/httpError.js';
import { redactConnectionStrings } from '../../lib/redact.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { getAction } from './approval.actions.js';
import { APPROVED, EXECUTED, EXECUTION_FAILED, PENDING, REJECTED, SUMMARY_MAX_LENGTH } from './approval.model.js';

const notFound = () => new HttpError(404, 'APPROVAL_NOT_FOUND', 'Approval not found');
const alreadyReviewed = () => new HttpError(409, 'APPROVAL_ALREADY_REVIEWED', 'This approval has already been reviewed');

// Checks a proposed action before it is saved: the action must be on the allowlist, the summary
// short text, and the parameters must pass the action's own validation for this organization.
// Returns { action, summary, parameters } ready to save; throws an HttpError otherwise.
export async function prepareProposal(stores, organizationId, { action, summary, parameters }) {
  const definition = getAction(action);
  const text = typeof summary === 'string' ? summary.trim() : '';
  if (text.length === 0 || text.length > SUMMARY_MAX_LENGTH) {
    throw new HttpError(400, 'VALIDATION_FAILED', `Summary must be between 1 and ${SUMMARY_MAX_LENGTH} characters`);
  }

  return { action, summary: text, parameters: await definition.prepare(stores, organizationId, parameters) };
}

// Saves prepared proposals as pending approvals, each with an `approval.proposed` event by the AI,
// all in one transaction. `requestedByUserId` is the signed-in user who asked the assistant.
export async function saveProposals({ approvals, auditLogs, withTransaction }, { organizationId, requestedByUserId }, proposals) {
  return withTransaction(async (session) => {
    const saved = [];
    for (const { action, summary, parameters } of proposals) {
      const approval = await approvals.create(organizationId, { source: 'ai', action, summary, parameters, requestedByUserId }, { session });
      await recordAuditEvent(
        auditLogs,
        { organizationId, actor: { type: 'ai' }, action: 'approval.proposed', resourceId: approval.id, details: { action, summary } },
        { session },
      );
      saved.push(approval);
    }
    return saved;
  });
}

// The approvals as the API returns them: people shown by email and linked records by name, all
// loaded through the organization; internal user and organization IDs are left out.
export async function toPublicApprovals({ users, customers, orders }, organizationId, list) {
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const userIds = unique(list.flatMap((approval) => [approval.requestedByUserId, approval.reviewedByUserId]));
  const customerIds = unique(list.map((approval) => approval.parameters.customerId));
  const orderIds = unique(list.map((approval) => approval.parameters.orderId));
  const [people, foundCustomers, foundOrders] = await Promise.all([
    userIds.length > 0 ? users.findByIds(userIds) : [],
    customerIds.length > 0 ? customers.findByIds(organizationId, customerIds) : [],
    orderIds.length > 0 ? orders.findByIds(organizationId, orderIds) : [],
  ]);
  const emails = new Map(people.map((user) => [user.id, user.email]));
  const customerNames = new Map(foundCustomers.map((customer) => [customer.id, customer.name]));
  const orderDescriptions = new Map(foundOrders.map((order) => [order.id, order.description]));

  return list.map((approval) => ({
    id: approval.id,
    source: approval.source,
    action: approval.action,
    status: approval.status,
    summary: approval.summary,
    parameters: {
      ...approval.parameters,
      customerName: customerNames.get(approval.parameters.customerId) ?? null,
      orderDescription: orderDescriptions.get(approval.parameters.orderId) ?? null,
    },
    requestedByEmail: emails.get(approval.requestedByUserId) ?? null,
    reviewedByEmail: emails.get(approval.reviewedByUserId) ?? null,
    reviewedAt: approval.reviewedAt,
    rejectionReason: approval.rejectionReason,
    result: approval.resultId ? { resourceType: approval.resultType, resourceId: approval.resultId } : null,
    failure: approval.failureCode ? { code: approval.failureCode, message: approval.failureMessage } : null,
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
  }));
}

// One page of the organization's approvals, newest first, optionally with one status only.
export async function listApprovals(deps, organizationId, { status, page, limit }) {
  // One extra approval tells whether there is another page.
  const records = await deps.approvals.listForOrganization(organizationId, { status, skip: (page - 1) * limit, limit: limit + 1 });

  return {
    approvals: await toPublicApprovals(deps, organizationId, records.slice(0, limit)),
    page,
    limit,
    hasMore: records.length > limit,
  };
}

// Rejects a pending approval. `reviewerUserId` must be the authenticated user's ID. The status
// change and its audit event are written together.
export async function rejectApproval({ approvals, auditLogs, withTransaction }, { organizationId, approvalId, reviewerUserId, reason }) {
  return withTransaction(async (session) => {
    const current = await approvals.findById(organizationId, approvalId, { session });
    if (!current) {
      throw notFound();
    }

    const changes = { reviewedByUserId: reviewerUserId, reviewedAt: new Date() };
    if (reason) changes.rejectionReason = reason;
    const rejected = await approvals.transition(organizationId, approvalId, { from: PENDING, to: REJECTED, changes }, { session });
    if (!rejected) {
      throw alreadyReviewed();
    }

    await recordAuditEvent(
      auditLogs,
      {
        organizationId,
        actor: { type: 'user', userId: reviewerUserId },
        action: 'approval.rejected',
        resourceId: approvalId,
        details: { action: rejected.action, reason },
      },
      { session },
    );
    return rejected;
  });
}

// Approves a pending approval and runs its stored action, in three steps:
//
// 1. Claim it: pending → approved, with its audit event. This conditional update is the only way
//    an action starts, so however many approve requests arrive, at most one runs the action.
// 2. Run the stored action, which validates its parameters again for this organization, and mark
//    the approval executed, with its audit event. All of this is one transaction.
// 3. If step 2 fails, none of it is kept: the approval is marked execution_failed, with its audit
//    event. The action is not retried; a person can ask the assistant for a new proposal.
//
// If writing the failure itself fails, the approval stays approved and is never run again.
// `reviewerUserId` must be the authenticated user's ID.
export async function approveApproval(deps, { organizationId, approvalId, reviewerUserId }) {
  const { approvals, auditLogs, withTransaction, customers, orders, tasks, logger } = deps;
  const actor = { type: 'user', userId: reviewerUserId };

  const approved = await withTransaction(async (session) => {
    const current = await approvals.findById(organizationId, approvalId, { session });
    if (!current) {
      throw notFound();
    }

    const claimed = await approvals.transition(
      organizationId,
      approvalId,
      { from: PENDING, to: APPROVED, changes: { reviewedByUserId: reviewerUserId, reviewedAt: new Date() } },
      { session },
    );
    if (!claimed) {
      throw alreadyReviewed();
    }

    await recordAuditEvent(
      auditLogs,
      { organizationId, actor, action: 'approval.approved', resourceId: approvalId, details: { action: claimed.action } },
      { session },
    );
    return claimed;
  });

  try {
    return await withTransaction(async (session) => {
      const definition = getAction(approved.action);
      const resultId = await definition.execute({ customers, orders, tasks }, organizationId, approved.parameters, { session });

      const changes = { resultType: definition.resultType, resultId, completedAt: new Date() };
      const executed = await approvals.transition(organizationId, approvalId, { from: APPROVED, to: EXECUTED, changes }, { session });
      if (!executed) {
        throw new Error('The approval changed while its action ran');
      }

      await recordAuditEvent(
        auditLogs,
        {
          organizationId,
          actor,
          action: 'approval.executed',
          resourceId: approvalId,
          details: { action: approved.action, resultType: definition.resultType, resultId },
        },
        { session },
      );
      return executed;
    });
  } catch (error) {
    // An HttpError carries a code and message that are safe to show, such as a customer that no
    // longer exists. Anything else is unexpected: it is logged, and the reviewer gets a fixed message.
    let failure = { code: error.code, message: error.message };
    if (!(error instanceof HttpError)) {
      logger.error('approved action failed', {
        approvalId,
        action: approved.action,
        error: { name: error.name, message: redactConnectionStrings(error.message) },
      });
      failure = { code: 'EXECUTION_ERROR', message: 'The change could not be made' };
    }

    return withTransaction(async (session) => {
      const changes = { failureCode: failure.code, failureMessage: failure.message, completedAt: new Date() };
      const failed = await approvals.transition(organizationId, approvalId, { from: APPROVED, to: EXECUTION_FAILED, changes }, { session });
      if (!failed) {
        throw new Error('The approval changed while its action ran');
      }

      await recordAuditEvent(
        auditLogs,
        {
          organizationId,
          actor,
          action: 'approval.execution_failed',
          resourceId: approvalId,
          details: { action: approved.action, failureCode: failure.code },
        },
        { session },
      );
      return failed;
    });
  }
}
