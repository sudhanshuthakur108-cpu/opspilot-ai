import { isDuplicateKeyError } from '../../lib/database.js';
import { Organization } from './organization.model.js';

function toOrganization(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    createdAt: doc.createdAt,
  };
}

export const organizationStore = {
  // Returns null when the slug is already taken (enforced by the unique index).
  // Pass `session` to make the insert part of a transaction.
  async create({ name, slug }, { session } = {}) {
    try {
      return toOrganization(await new Organization({ name, slug }).save({ session }));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  },

  async findById(id) {
    const doc = await Organization.findById(id).lean();
    return doc && toOrganization(doc);
  },
};
