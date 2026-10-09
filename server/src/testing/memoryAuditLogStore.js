// In-memory stand-in for modules/audit/audit.store.js with the same contract (scoped to one
// organization; newest first). `records` exposes stored data, including organizationId, to tests.
export function createMemoryAuditLogStore() {
  const records = [];

  // Increasing IDs, like ObjectIds, so ordering ties break the same way as in MongoDB. The "d"
  // prefix keeps them distinct from the other memory stores' IDs.
  let lastId = 0;
  const newId = () => `d${(++lastId).toString(16).padStart(23, '0')}`;

  const toAuditLog = ({ organizationId, ...entry }) => ({ ...entry, details: { ...entry.details } });

  return {
    records,

    async create(organizationId, { actorType, actorUserId, action, resourceType, resourceId, details }) {
      const record = {
        id: newId(),
        organizationId,
        actorType,
        actorUserId: actorUserId ?? null,
        action,
        resourceType,
        resourceId: resourceId ?? null,
        details: { ...details },
        createdAt: new Date(),
      };
      records.push(record);
      return toAuditLog(record);
    },

    async listForOrganization(organizationId, { skip, limit }) {
      return records
        .filter((record) => record.organizationId === organizationId)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(skip, skip + limit)
        .map(toAuditLog);
    },
  };
}
