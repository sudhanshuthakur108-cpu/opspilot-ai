// In-memory stand-ins for organization.store.js and membership.store.js with the same contracts
// (null for a duplicate slug or membership; newest-first ordering). `withTransaction` just runs
// the work, so nothing is rolled back on failure; rollback is covered against MongoDB by the
// integration tests.
export function createMemoryOrganizationStores() {
  const organizationRecords = new Map();
  const membershipRecords = new Map();

  // Increasing IDs, like ObjectIds, so ordering ties break the same way as in MongoDB.
  let lastId = 0;
  const newId = () => (++lastId).toString(16).padStart(24, '0');

  const organizations = {
    records: organizationRecords,

    async create({ name, slug }) {
      if ([...organizationRecords.values()].some((record) => record.slug === slug)) {
        return null;
      }
      const record = { id: newId(), name, slug, createdAt: new Date() };
      organizationRecords.set(record.id, record);
      return { ...record };
    },

    async findById(id) {
      const record = organizationRecords.get(id);
      return record ? { ...record } : null;
    },

    async findByIds(ids) {
      return ids
        .map((id) => organizationRecords.get(id))
        .filter(Boolean)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .map((record) => ({ ...record }));
    },
  };

  const memberships = {
    records: membershipRecords,

    async create({ organizationId, userId, role }) {
      const exists = [...membershipRecords.values()].some(
        (record) => record.organizationId === organizationId && record.userId === userId,
      );
      if (exists) {
        return null;
      }
      const record = { id: newId(), organizationId, userId, role, createdAt: new Date() };
      membershipRecords.set(record.id, record);
      return { ...record };
    },

    async find(organizationId, userId) {
      const record = [...membershipRecords.values()].find(
        (candidate) => candidate.organizationId === organizationId && candidate.userId === userId,
      );
      return record ? { ...record } : null;
    },

    async listForUser(userId) {
      return [...membershipRecords.values()]
        .filter((record) => record.userId === userId)
        .map((record) => ({ ...record }));
    },
  };

  return { organizations, memberships, withTransaction: (work) => work(undefined) };
}
