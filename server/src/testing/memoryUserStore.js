import { randomBytes } from 'node:crypto';

// In-memory stand-in for modules/users/user.store.js, with the same contract
// (including returning null for a duplicate email). `records` exposes stored data to tests.
export function createMemoryUserStore() {
  const records = new Map();

  // Like the real store, an account without a name (created before names existed) has name null.
  const withoutHash = ({ passwordHash, ...user }) => ({ ...user, name: user.name ?? null });

  return {
    records,

    async create({ email, name, passwordHash }) {
      if ([...records.values()].some((record) => record.email === email)) {
        return null;
      }
      const record = {
        id: randomBytes(12).toString('hex'),
        email,
        name: name ?? null,
        passwordHash,
        tokenVersion: 0,
        createdAt: new Date(),
      };
      records.set(record.id, record);
      return withoutHash(record);
    },

    async findByEmailWithPassword(email) {
      const record = [...records.values()].find((candidate) => candidate.email === email);
      return record ? { ...record, name: record.name ?? null } : null;
    },

    async findById(id) {
      const record = records.get(id);
      return record ? withoutHash(record) : null;
    },

    async findByIds(ids) {
      return ids.map((id) => records.get(id)).filter(Boolean).map(withoutHash);
    },

    async updateName(id, name) {
      const record = records.get(id);
      if (!record) return null;
      record.name = name;
      return withoutHash(record);
    },

    async incrementTokenVersion(id) {
      records.get(id).tokenVersion += 1;
    },
  };
}
