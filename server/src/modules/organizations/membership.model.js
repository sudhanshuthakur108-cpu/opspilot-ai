import mongoose from 'mongoose';
import { ROLES } from './roles.js';

const { ObjectId } = mongoose.Schema.Types;

const membershipSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    role: { type: String, required: true, enum: ROLES },
  },
  { timestamps: true },
);

// One membership per user per organization; also serves "is this user a member of this org?" lookups.
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
// For listing the organizations a user belongs to.
membershipSchema.index({ userId: 1 });

export const Membership = mongoose.model('Membership', membershipSchema);
