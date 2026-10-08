import mongoose from 'mongoose';
import { EMAIL_FORMAT, EMAIL_MAX_LENGTH } from '../users/user.model.js';

export const NAME_MAX_LENGTH = 120;
export const PHONE_MAX_LENGTH = 40;

const { ObjectId } = mongoose.Schema.Types;

const customerSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },
    // Not unique: different organizations can have customers with the same address, and no
    // rule yet says two customers of one organization cannot share one.
    email: { type: String, trim: true, lowercase: true, maxlength: EMAIL_MAX_LENGTH, match: EMAIL_FORMAT },
    phone: { type: String, trim: true, maxlength: PHONE_MAX_LENGTH },
  },
  { timestamps: true },
);

// Every customer query is scoped to one organization; this also serves the newest-first list.
customerSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });

export const Customer = mongoose.model('Customer', customerSchema);
