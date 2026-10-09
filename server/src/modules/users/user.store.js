import mongoose from 'mongoose';
import { isDuplicateKeyError } from '../../lib/database.js';
import { User } from './user.model.js';

// Plain objects keep Mongoose documents, and the password hash, out of route code.
function toUser(doc) {
  return {
    id: doc._id.toString(),
    email: doc.email,
    tokenVersion: doc.tokenVersion,
    createdAt: doc.createdAt,
  };
}

export const userStore = {
  // Returns null when the email is already registered (enforced by the unique index).
  async create({ email, passwordHash }) {
    try {
      return toUser(await User.create({ email, passwordHash }));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  },

  async findByEmailWithPassword(email) {
    const doc = await User.findOne({ email }).select('+passwordHash').lean();
    return doc && { ...toUser(doc), passwordHash: doc.passwordHash };
  },

  async findById(id) {
    const doc = await User.findById(id).lean();
    return doc && toUser(doc);
  },

  // For showing who did something, such as the actor of an audit log entry.
  async findByIds(ids) {
    // sanitizeFilter would neutralize `$in`; it is marked trusted because callers pass IDs read
    // from stored records, never from the request.
    const docs = await User.find({ _id: mongoose.trusted({ $in: ids }) }).lean();
    return docs.map(toUser);
  },

  async incrementTokenVersion(id) {
    await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
  },
};
