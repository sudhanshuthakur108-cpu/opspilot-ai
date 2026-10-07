import { User } from './user.model.js';

const DUPLICATE_KEY_ERROR = 11000;

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
      if (error.code === DUPLICATE_KEY_ERROR) {
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

  async incrementTokenVersion(id) {
    await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
  },
};
