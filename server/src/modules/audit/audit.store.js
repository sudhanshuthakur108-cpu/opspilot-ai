import { AuditLog } from './audit.model.js';

function toAuditLog(doc) {
  return {
    id: doc._id.toString(),
    actorType: doc.actorType,
    actorUserId: doc.actorUserId?.toString() ?? null,
    action: doc.action,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId?.toString() ?? null,
    details: doc.details ?? {},
    createdAt: doc.createdAt,
  };
}

// Every method takes the organization first and only touches that organization's entries.
// `organizationId` must come from the verified membership, never from the request. Use
// recordAuditEvent in audit.service.js rather than `create`, so the event is checked first.
export const auditLogStore = {
  // Pass `session` to write the entry in the same transaction as the change it records.
  async create(organizationId, { actorType, actorUserId, action, resourceType, resourceId, details }, { session } = {}) {
    const doc = await new AuditLog({ organizationId, actorType, actorUserId, action, resourceType, resourceId, details }).save({
      session,
    });
    return toAuditLog(doc.toObject({ flattenMaps: true }));
  },

  // Newest first. Ties on createdAt fall back to _id, which also grows over time.
  async listForOrganization(organizationId, { skip, limit }) {
    const docs = await AuditLog.find({ organizationId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
    return docs.map(toAuditLog);
  },
};
