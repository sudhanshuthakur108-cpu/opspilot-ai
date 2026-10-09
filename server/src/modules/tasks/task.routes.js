import { Router } from 'express';
import { createTask, listTasks, updateTask } from './task.service.js';
import { validateNewTask, validateTaskChanges, validateTaskId } from './task.validation.js';

// The list returns at most this many tasks, newest first. There is no paging yet.
export const TASK_LIST_LIMIT = 50;

// Mounted at /organizations/:organizationId/tasks. `requireMembership` admits only members of
// that organization and sets `req.membership`, which is the only source of the organization.
// `tasks`, `customers` and `orders` are the stores.
export function createTaskRouter({ requireMembership, tasks, customers, orders }) {
  const stores = { tasks, customers, orders };
  const router = Router({ mergeParams: true });

  // GET / → 200 { tasks: [{ id, title, description, status, priority, customerId, customerName,
  // orderId, orderDescription, dueDate, createdAt, updatedAt }] }
  router.get('/', requireMembership, async (req, res) => {
    const list = await listTasks(stores, req.membership.organizationId, { limit: TASK_LIST_LIMIT });

    res.set('Cache-Control', 'no-store').json({ tasks: list });
  });

  // POST / { title, description?, status?, priority?, customerId?, orderId?, dueDate? } → 201 { task }
  router.post('/', requireMembership, async (req, res) => {
    const task = await createTask(stores, req.membership.organizationId, validateNewTask(req.body));

    res.status(201).json({ task });
  });

  // PATCH /:taskId { status?, priority?, dueDate? } → 200 { task }
  router.patch('/:taskId', requireMembership, async (req, res) => {
    const taskId = validateTaskId(req.params.taskId);
    const task = await updateTask(stores, req.membership.organizationId, taskId, validateTaskChanges(req.body));

    res.json({ task });
  });

  return router;
}
