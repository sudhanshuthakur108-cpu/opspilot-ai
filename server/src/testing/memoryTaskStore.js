// In-memory stand-in for modules/tasks/task.store.js with the same contract (scoped to one
// organization; newest first; due dates as "YYYY-MM-DD"). `records` exposes stored data,
// including organizationId, to tests.
export function createMemoryTaskStore() {
  const records = [];

  // Increasing IDs, like ObjectIds, so ordering ties break the same way as in MongoDB. The "a"
  // prefix keeps them distinct from the other memory stores' IDs.
  let lastId = 0;
  const newId = () => `a${(++lastId).toString(16).padStart(23, '0')}`;

  const toTask = ({ organizationId, dueDate, ...task }) => ({ ...task, dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null });

  return {
    records,

    async create(organizationId, { title, description, status, priority, customerId, orderId, dueDate }) {
      const now = new Date();
      const record = {
        id: newId(),
        organizationId,
        title,
        description: description ?? null,
        status,
        priority,
        customerId: customerId ?? null,
        orderId: orderId ?? null,
        dueDate: dueDate ?? null,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      return toTask(record);
    },

    async listForOrganization(organizationId, { limit }) {
      return records
        .filter((record) => record.organizationId === organizationId)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(toTask);
    },

    async update(organizationId, taskId, { status, priority, dueDate }) {
      const record = records.find((candidate) => candidate.id === taskId && candidate.organizationId === organizationId);
      if (!record) return null;
      if (status !== undefined) record.status = status;
      if (priority !== undefined) record.priority = priority;
      if (dueDate !== undefined) record.dueDate = dueDate;
      record.updatedAt = new Date();
      return toTask(record);
    },
  };
}
