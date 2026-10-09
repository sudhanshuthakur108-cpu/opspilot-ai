import { apiRequest } from './client.js';

const tasksPath = (organizationId) => `/organizations/${encodeURIComponent(organizationId)}/tasks`;

// The organization's tasks, newest first (at most 50), with linked customer names and order
// descriptions. The server checks that the signed-in user belongs to the organization.
export async function listTasks(organizationId) {
  const { tasks } = await apiRequest(tasksPath(organizationId));
  return tasks;
}

// Optional fields (description, customerId, orderId, dueDate) are left undefined when not given.
// A customer or order must belong to the organization; the server checks this too.
export async function createTask(organizationId, { title, description, status, priority, customerId, orderId, dueDate }) {
  const { task } = await apiRequest(tasksPath(organizationId), {
    method: 'POST',
    body: { title, description, status, priority, customerId, orderId, dueDate },
  });
  return task;
}

// Only the status, priority and due date of a task can change.
export async function updateTask(organizationId, taskId, { status, priority, dueDate }) {
  const { task } = await apiRequest(`${tasksPath(organizationId)}/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: { status, priority, dueDate },
  });
  return task;
}
