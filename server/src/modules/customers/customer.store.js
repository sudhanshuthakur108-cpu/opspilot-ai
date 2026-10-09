import mongoose from 'mongoose';
import { Customer } from './customer.model.js';

function toCustomer(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Every method takes the organization first and only touches that organization's customers.
// `organizationId` must come from the verified membership, never from the request.
export const customerStore = {
  async create(organizationId, { name, email, phone }) {
    return toCustomer(await new Customer({ organizationId, name, email, phone }).save());
  },

  // The customer only if it belongs to the organization; otherwise null.
  async findById(organizationId, customerId, { session } = {}) {
    const doc = await Customer.findOne({ _id: customerId, organizationId }, null, { session }).lean();
    return doc && toCustomer(doc);
  },

  // The organization's customers among `ids`, in no particular order. sanitizeFilter would
  // neutralize `$in`; it is marked trusted because callers pass IDs from stored records, never
  // from the request.
  async findByIds(organizationId, ids) {
    const docs = await Customer.find({ organizationId, _id: mongoose.trusted({ $in: ids }) }).lean();
    return docs.map(toCustomer);
  },

  // Newest first. Ties on createdAt fall back to _id, which also grows over time.
  async listForOrganization(organizationId, { limit }) {
    const docs = await Customer.find({ organizationId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    return docs.map(toCustomer);
  },
};
