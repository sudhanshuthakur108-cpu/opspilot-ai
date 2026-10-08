import mongoose from 'mongoose';

export const ORDER_STATUSES = Object.freeze(['pending', 'confirmed', 'completed', 'cancelled']);
export const DESCRIPTION_MAX_LENGTH = 500;
// Far above any real order, and well inside the range where numbers are exact.
export const TOTAL_AMOUNT_MAX = 1_000_000_000_000;
export const DEFAULT_CURRENCY = 'INR';
// An ISO 4217 code such as "INR"; order.validation.js also checks that the code exists.
export const CURRENCY_FORMAT = /^[A-Z]{3}$/;

const { ObjectId } = mongoose.Schema.Types;

const orderSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },
    // Always a customer of the same organization, checked before the order is created.
    customerId: { type: ObjectId, ref: 'Customer', required: true },
    description: { type: String, required: true, trim: true, maxlength: DESCRIPTION_MAX_LENGTH },
    status: { type: String, required: true, enum: ORDER_STATUSES },
    // In the currency's major unit (rupees, not paise), with no more decimals than it allows.
    totalAmount: { type: Number, required: true, min: 0, max: TOTAL_AMOUNT_MAX },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: CURRENCY_FORMAT,
      default: DEFAULT_CURRENCY,
    },
  },
  { timestamps: true },
);

// Serves the organization's newest-first list. Nothing queries orders by customer yet.
orderSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });

export const Order = mongoose.model('Order', orderSchema);
