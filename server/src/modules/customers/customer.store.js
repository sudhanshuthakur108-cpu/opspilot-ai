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

  // Newest first. Ties on createdAt fall back to _id, which also grows over time.
  async listForOrganization(organizationId, { limit }) {
    const docs = await Customer.find({ organizationId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    return docs.map(toCustomer);
  },
};
