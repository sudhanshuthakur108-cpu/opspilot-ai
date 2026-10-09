import { Task } from './task.model.js';

function toTask(doc) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    customerId: doc.customerId?.toString() ?? null,
    orderId: doc.orderId?.toString() ?? null,
    dueDate: doc.dueDate ? doc.dueDate.toISOString().slice(0, 10) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Every method takes the organization first and only touches that organization's tasks.
// `organizationId` must come from the verified membership, never from the request.
export const taskStore = {
  // The caller must already have checked that any customer or order belongs to the organization
  // (see createTask in task.service.js). Pass `session` to make the insert part of a transaction.
  async create(organizationId, { title, description, status, priority, customerId, orderId, dueDate }, { session } = {}) {
    const doc = await new Task({ organizationId, title, description, status, priority, customerId, orderId, dueDate }).save({ session });
    return toTask(doc);
  },

  // Newest first. Ties on createdAt fall back to _id, which also grows over time.
  async listForOrganization(organizationId, { limit }) {
    const docs = await Task.find({ organizationId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    return docs.map(toTask);
  },

  // Applies `changes` ({ status?, priority?, dueDate? }; a null dueDate clears it) and returns the
  // updated task, or null when the organization has no task with this ID.
  async update(organizationId, taskId, { status, priority, dueDate }) {
    const set = {};
    if (status !== undefined) set.status = status;
    if (priority !== undefined) set.priority = priority;
    if (dueDate) set.dueDate = dueDate;

    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (dueDate === null) update.$unset = { dueDate: 1 };

    const doc = await Task.findOneAndUpdate({ _id: taskId, organizationId }, update, { new: true, runValidators: true }).lean();
    return doc && toTask(doc);
  },
};
