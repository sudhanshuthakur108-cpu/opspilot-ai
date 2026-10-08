import { isDuplicateKeyError } from '../../lib/database.js';
import { Membership } from './membership.model.js';

function toMembership(doc) {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    userId: doc.userId.toString(),
    role: doc.role,
    createdAt: doc.createdAt,
  };
}

export const membershipStore = {
  // Returns null when the user already belongs to the organization (enforced by the unique index).
  // Pass `session` to make the insert part of a transaction.
  async create({ organizationId, userId, role }, { session } = {}) {
    try {
      return toMembership(await new Membership({ organizationId, userId, role }).save({ session }));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  },

  // The membership check behind organization access. `userId` must come from the
  // authenticated session, never from the request.
  async find(organizationId, userId) {
    const doc = await Membership.findOne({ organizationId, userId }).lean();
    return doc && toMembership(doc);
  },
};
