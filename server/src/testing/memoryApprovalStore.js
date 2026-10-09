import { canTransition } from '../modules/approvals/approval.model.js';

// In-memory stand-in for modules/approvals/approval.store.js with the same contract (scoped to
// one organization; newest first; conditional status changes). `records` exposes stored data,
// including organizationId, to tests.
export function createMemoryApprovalStore() {
  const records = [];

  // Increasing IDs, like ObjectIds, so ordering ties break the same way as in MongoDB. The "b"
  // prefix keeps them distinct from the other memory stores' IDs.
  let lastId = 0;
  const newId = () => `b${(++lastId).toString(16).padStart(23, '0')}`;

  const toApproval = ({ organizationId, ...approval }) => ({ ...approval, parameters: { ...approval.parameters } });
  const find = (organizationId, approvalId) =>
    records.find((candidate) => candidate.id === approvalId && candidate.organizationId === organizationId);

  return {
    records,

    async create(organizationId, { source, action, summary, parameters, requestedByUserId }) {
      const now = new Date();
      const record = {
        id: newId(),
        organizationId,
        source,
        action,
        status: 'pending',
        summary,
        parameters: { ...parameters },
        requestedByUserId,
        reviewedByUserId: null,
        reviewedAt: null,
        rejectionReason: null,
        resultType: null,
        resultId: null,
        failureCode: null,
        failureMessage: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      return toApproval(record);
    },

    async findById(organizationId, approvalId) {
      const record = find(organizationId, approvalId);
      return record ? toApproval(record) : null;
    },

    async listForOrganization(organizationId, { status, skip, limit }) {
      return records
        .filter((record) => record.organizationId === organizationId && (!status || record.status === status))
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(skip, skip + limit)
        .map(toApproval);
    },

    // Checks and changes the status with no await in between, so it is atomic like the real one.
    async transition(organizationId, approvalId, { from, to, changes = {} }) {
      if (!canTransition(from, to)) {
        throw new Error(`An approval cannot change from "${from}" to "${to}"`);
      }
      const record = find(organizationId, approvalId);
      if (!record || record.status !== from) return null;
      Object.assign(record, changes, { status: to, updatedAt: new Date() });
      return toApproval(record);
    },
  };
}
