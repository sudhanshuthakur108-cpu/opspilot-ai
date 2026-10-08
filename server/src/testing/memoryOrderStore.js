// In-memory stand-in for modules/orders/order.store.js with the same contract (scoped to one
// organization; newest first). `records` exposes stored data, including organizationId, to tests.
export function createMemoryOrderStore() {
  const records = [];

  // Increasing IDs, like ObjectIds, so ordering ties break the same way as in MongoDB. The "e"
  // prefix keeps them distinct from the other memory stores' IDs.
  let lastId = 0;
  const newId = () => `e${(++lastId).toString(16).padStart(23, '0')}`;

  const toOrder = ({ organizationId, updatedAt, ...order }) => ({ ...order });

  return {
    records,

    async create(organizationId, { customerId, description, status, totalAmount, currency }) {
      const now = new Date();
      const record = { id: newId(), organizationId, customerId, description, status, totalAmount, currency, createdAt: now, updatedAt: now };
      records.push(record);
      return toOrder(record);
    },

    async listForOrganization(organizationId, { limit }) {
      return records
        .filter((record) => record.organizationId === organizationId)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(toOrder);
    },
  };
}
