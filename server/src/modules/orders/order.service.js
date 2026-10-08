import { HttpError } from '../../lib/httpError.js';

// Creates an order for one of the organization's own customers. The customer is looked up by
// organization as well as ID, so another organization's customer is treated exactly like one
// that does not exist.
export async function createOrder({ customers, orders }, organizationId, input) {
  const customer = await customers.findById(organizationId, input.customerId);
  if (!customer) {
    throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
  }

  const order = await orders.create(organizationId, input);
  return { ...order, customerName: customer.name };
}

// The organization's newest orders, each with its customer's current name. Customers are
// loaded through the same organization, never by ID alone.
export async function listOrders({ customers, orders }, organizationId, { limit }) {
  const list = await orders.listForOrganization(organizationId, { limit });
  if (list.length === 0) {
    return [];
  }

  const customerIds = [...new Set(list.map((order) => order.customerId))];
  const found = await customers.findByIds(organizationId, customerIds);
  const names = new Map(found.map((customer) => [customer.id, customer.name]));
  return list.map((order) => ({ ...order, customerName: names.get(order.customerId) ?? null }));
}
