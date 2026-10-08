import { Router } from 'express';
import { createOrder, listOrders } from './order.service.js';
import { validateNewOrder } from './order.validation.js';

// The list returns at most this many orders, newest first. There is no paging yet.
export const ORDER_LIST_LIMIT = 50;

// Mounted at /organizations/:organizationId/orders. `requireMembership` admits only members
// of that organization and sets `req.membership`, which is the only source of the organization.
// `orders` and `customers` are the stores.
export function createOrderRouter({ requireMembership, orders, customers }) {
  const router = Router({ mergeParams: true });

  // GET / → 200 { orders: [{ id, customerId, customerName, description, status, totalAmount, currency, createdAt }] }
  router.get('/', requireMembership, async (req, res) => {
    const list = await listOrders({ customers, orders }, req.membership.organizationId, { limit: ORDER_LIST_LIMIT });

    res.set('Cache-Control', 'no-store').json({ orders: list });
  });

  // POST / { customerId, description, status, totalAmount, currency? } → 201 { order }
  router.post('/', requireMembership, async (req, res) => {
    const order = await createOrder({ customers, orders }, req.membership.organizationId, validateNewOrder(req.body));

    res.status(201).json({ order });
  });

  return router;
}
