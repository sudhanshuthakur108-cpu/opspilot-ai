import { randomBytes } from 'node:crypto';

const newId = () => randomBytes(12).toString('hex');

// In-memory stand-ins for organization.store.js and membership.store.js with the same contracts
// (null for a duplicate slug or membership). `withTransaction` just runs the work, so nothing is
// rolled back on failure; rollback is covered against MongoDB by the integration tests.
export function createMemoryOrganizationStores() {
  const organizationRecords = new Map();
  const membershipRecords = new Map();

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
  };

  return { organizations, memberships, withTransaction: (work) => work(undefined) };
}
