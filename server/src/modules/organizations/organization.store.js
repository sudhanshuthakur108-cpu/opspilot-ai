import mongoose from 'mongoose';
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

  async findById(id, { session } = {}) {
    const doc = await Organization.findById(id, null, { session }).lean();
    return doc && toOrganization(doc);
  },

  // Returns the renamed organization, or null when there is none with this ID.
  async updateName(id, name, { session } = {}) {
    const doc = await Organization.findByIdAndUpdate(id, { $set: { name } }, { session, returnDocument: 'after', runValidators: true }).lean();
    return doc && toOrganization(doc);
  },

  // Newest first. Ties on createdAt fall back to _id, which also grows over time.
  async findByIds(ids) {
    // sanitizeFilter would neutralize `$in`; it is marked trusted because callers pass IDs
    // from the user's own memberships, never from the request.
    const docs = await Organization.find({ _id: mongoose.trusted({ $in: ids }) })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return docs.map(toOrganization);
  },
};
