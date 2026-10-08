import { apiRequest } from './client.js';

const customersPath = (organizationId) => `/organizations/${encodeURIComponent(organizationId)}/customers`;

// The organization's customers, newest first (at most 50). The server checks that the
// signed-in user belongs to the organization.
export async function listCustomers(organizationId) {
  const { customers } = await apiRequest(customersPath(organizationId));
  return customers;
}

// `email` and `phone` are optional; leave them undefined when not given.
export async function createCustomer(organizationId, { name, email, phone }) {
  const { customer } = await apiRequest(customersPath(organizationId), {
    method: 'POST',
    body: { name, email, phone },
  });
  return customer;
}
