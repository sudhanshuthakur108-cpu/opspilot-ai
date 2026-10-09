import mongoose from 'mongoose';
import { Order } from './order.model.js';

function toOrder(doc) {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    description: doc.description,
    status: doc.status,
    totalAmount: doc.totalAmount,
    currency: doc.currency,
    createdAt: doc.createdAt,
  };
}

// Every method takes the organization first and only touches that organization's orders.
// `organizationId` must come from the verified membership, never from the request.
export const orderStore = {
  // The caller must already have checked that the customer belongs to the organization
  // (see createOrder in order.service.js).
  async create(organizationId, { customerId, description, status, totalAmount, currency }) {
    const doc = await new Order({ organizationId, customerId, description, status, totalAmount, currency }).save();
    return toOrder(doc);
  },

  // The order only if it belongs to the organization; otherwise null.
  async findById(organizationId, orderId, { session } = {}) {
    const doc = await Order.findOne({ _id: orderId, organizationId }, null, { session }).lean();
    return doc && toOrder(doc);
  },

  // The organization's orders among `ids`, in no particular order. sanitizeFilter would
  // neutralize `$in`; it is marked trusted because callers pass IDs from stored records, never
  // from the request.
  async findByIds(organizationId, ids) {
    const docs = await Order.find({ organizationId, _id: mongoose.trusted({ $in: ids }) }).lean();
    return docs.map(toOrder);
  },

  // Newest first. Ties on createdAt fall back to _id, which also grows over time.
  async listForOrganization(organizationId, { limit }) {
    const docs = await Order.find({ organizationId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    return docs.map(toOrder);
  },
};
