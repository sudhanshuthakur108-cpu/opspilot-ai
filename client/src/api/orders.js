import { apiRequest } from './client.js';

const ordersPath = (organizationId) => `/organizations/${encodeURIComponent(organizationId)}/orders`;

// The organization's orders, newest first (at most 50), each with its customer's name. The
// server checks that the signed-in user belongs to the organization.
export async function listOrders(organizationId) {
  const { orders } = await apiRequest(ordersPath(organizationId));
  return orders;
}

// `customerId` must be one of the organization's customers; the server checks this too.
export async function createOrder(organizationId, { customerId, description, status, totalAmount, currency }) {
  const { order } = await apiRequest(ordersPath(organizationId), {
    method: 'POST',
    body: { customerId, description, status, totalAmount, currency },
  });
  return order;
}
