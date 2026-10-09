import { Approval, canTransition } from './approval.model.js';

function toApproval(doc) {
  return {
    id: doc._id.toString(),
    source: doc.source,
    action: doc.action,
    status: doc.status,
    summary: doc.summary,
    parameters: { ...doc.parameters },
    requestedByUserId: doc.requestedByUserId.toString(),
    reviewedByUserId: doc.reviewedByUserId?.toString() ?? null,
    reviewedAt: doc.reviewedAt ?? null,
    rejectionReason: doc.rejectionReason ?? null,
    resultType: doc.resultType ?? null,
    resultId: doc.resultId?.toString() ?? null,
    failureCode: doc.failureCode ?? null,
    failureMessage: doc.failureMessage ?? null,
    completedAt: doc.completedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Every method takes the organization first and only touches that organization's approvals.
// `organizationId` must come from the verified membership, never from the request. Pass `session`
// to make a call part of a transaction.
export const approvalStore = {
  async create(organizationId, { source, action, summary, parameters, requestedByUserId }, { session } = {}) {
    const doc = await new Approval({ organizationId, source, action, summary, parameters, requestedByUserId }).save({ session });
    return toApproval(doc.toObject());
  },

  // The approval only if it belongs to the organization; otherwise null.
  async findById(organizationId, approvalId, { session } = {}) {
    const doc = await Approval.findOne({ _id: approvalId, organizationId }, null, { session }).lean();
    return doc && toApproval(doc);
  },

  // Newest first, optionally with one status only. Ties on createdAt fall back to _id.
  async listForOrganization(organizationId, { status, skip, limit }) {
    const filter = status ? { organizationId, status } : { organizationId };
    const docs = await Approval.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
    return docs.map(toApproval);
  },

  // Changes the status from `from` to `to` and sets `changes`, in one conditional update that
  // matches only while the approval is still in `from`: of two requests making the same change,
  // one gets null. Also null when the organization has no approval with this ID. A change that
  // APPROVAL_TRANSITIONS does not allow is a programming error and throws.
  async transition(organizationId, approvalId, { from, to, changes = {} }, { session } = {}) {
    if (!canTransition(from, to)) {
      throw new Error(`An approval cannot change from "${from}" to "${to}"`);
    }
    const doc = await Approval.findOneAndUpdate(
      { _id: approvalId, organizationId, status: from },
      { $set: { ...changes, status: to } },
      { session, returnDocument: 'after', runValidators: true },
    ).lean();
    return doc && toApproval(doc);
  },
};
