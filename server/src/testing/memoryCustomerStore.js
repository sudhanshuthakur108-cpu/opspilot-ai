// In-memory stand-in for modules/customers/customer.store.js with the same contract (scoped to
// one organization; newest first). `records` exposes stored data, including organizationId, to tests.
export function createMemoryCustomerStore() {
  const records = [];

  // Increasing IDs, like ObjectIds, so ordering ties break the same way as in MongoDB. The "c"
  // prefix keeps them distinct from the memory organization store's IDs.
  let lastId = 0;
  const newId = () => `c${(++lastId).toString(16).padStart(23, '0')}`;

  const toCustomer = ({ organizationId, ...customer }) => ({ ...customer });

  return {
    records,

    async create(organizationId, { name, email, phone }) {
      const now = new Date();
      const record = { id: newId(), organizationId, name, email: email ?? null, phone: phone ?? null, createdAt: now, updatedAt: now };
      records.push(record);
      return toCustomer(record);
    },

    async findById(organizationId, customerId) {
      const record = records.find((candidate) => candidate.id === customerId && candidate.organizationId === organizationId);
      return record ? toCustomer(record) : null;
    },

    async findByIds(organizationId, ids) {
      return records
        .filter((record) => record.organizationId === organizationId && ids.includes(record.id))
        .map(toCustomer);
    },

    async listForOrganization(organizationId, { limit }) {
      return records
        .filter((record) => record.organizationId === organizationId)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(toCustomer);
    },
  };
}
