import { HttpError } from '../../lib/httpError.js';

// Loads the customer and order a new task would link to, checking that both belong to the
// organization. Both are looked up by organization as well as ID, so another organization's
// records are treated exactly like ones that do not exist. When both are given, the order must
// be for that customer.
export async function findTaskLinks({ customers, orders }, organizationId, { customerId, orderId }, { session } = {}) {
  const customer = customerId ? await customers.findById(organizationId, customerId, { session }) : null;
  if (customerId && !customer) {
    throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
  }

  const order = orderId ? await orders.findById(organizationId, orderId, { session }) : null;
  if (orderId && !order) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');
  }
  if (customer && order && order.customerId !== customer.id) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The order belongs to a different customer');
  }

  return { customer, order };
}

// Creates a task after checking its links with findTaskLinks. Pass `session` to make the checks
// and the insert part of a transaction.
export async function createTask(stores, organizationId, input, { session } = {}) {
  const { customer, order } = await findTaskLinks(stores, organizationId, input, { session });

  const task = await stores.tasks.create(organizationId, input, { session });
  return { ...task, customerName: customer?.name ?? null, orderDescription: order?.description ?? null };
}

// Adds each task's customer name and order description, loaded through the same organization,
// never by ID alone.
async function withLinkedNames({ customers, orders }, organizationId, list) {
  const customerIds = [...new Set(list.map((task) => task.customerId).filter(Boolean))];
  const orderIds = [...new Set(list.map((task) => task.orderId).filter(Boolean))];
  const [foundCustomers, foundOrders] = await Promise.all([
    customerIds.length > 0 ? customers.findByIds(organizationId, customerIds) : [],
    orderIds.length > 0 ? orders.findByIds(organizationId, orderIds) : [],
  ]);

  const customerNames = new Map(foundCustomers.map((customer) => [customer.id, customer.name]));
  const orderDescriptions = new Map(foundOrders.map((order) => [order.id, order.description]));
  return list.map((task) => ({
    ...task,
    customerName: customerNames.get(task.customerId) ?? null,
    orderDescription: orderDescriptions.get(task.orderId) ?? null,
  }));
}

// The organization's newest tasks.
export async function listTasks(stores, organizationId, { limit }) {
  const list = await stores.tasks.listForOrganization(organizationId, { limit });
  return withLinkedNames(stores, organizationId, list);
}

// Changes the status, priority or due date of one of the organization's tasks. Another
// organization's task gets the same 404 as one that does not exist.
export async function updateTask(stores, organizationId, taskId, changes) {
  const task = await stores.tasks.update(organizationId, taskId, changes);
  if (!task) {
    throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
  }

  const [withNames] = await withLinkedNames(stores, organizationId, [task]);
  return withNames;
}
