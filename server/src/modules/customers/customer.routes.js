import { Router } from 'express';
import { validateNewCustomer } from './customer.validation.js';

// The list returns at most this many customers, newest first. There is no paging yet.
export const CUSTOMER_LIST_LIMIT = 50;

// Mounted at /organizations/:organizationId/customers. `requireMembership` admits only members
// of that organization and sets `req.membership`, which is the only source of the organization.
// `customers` is the customer store.
export function createCustomerRouter({ requireMembership, customers }) {
  const router = Router({ mergeParams: true });

  // GET / → 200 { customers: [{ id, name, email, phone, createdAt, updatedAt }] }
  router.get('/', requireMembership, async (req, res) => {
    const list = await customers.listForOrganization(req.membership.organizationId, { limit: CUSTOMER_LIST_LIMIT });

    res.set('Cache-Control', 'no-store').json({ customers: list });
  });

  // POST / { name, email?, phone? } → 201 { customer }
  router.post('/', requireMembership, async (req, res) => {
    const customer = await customers.create(req.membership.organizationId, validateNewCustomer(req.body));

    res.status(201).json({ customer });
  });

  return router;
}
