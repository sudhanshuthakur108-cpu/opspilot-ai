import mongoose from 'mongoose';

export const TASK_STATUSES = Object.freeze(['todo', 'in_progress', 'completed']);
export const TASK_PRIORITIES = Object.freeze(['low', 'medium', 'high']);
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

const { ObjectId } = mongoose.Schema.Types;

const taskSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },
    title: { type: String, required: true, trim: true, maxlength: TITLE_MAX_LENGTH },
    description: { type: String, trim: true, maxlength: DESCRIPTION_MAX_LENGTH },
    status: { type: String, required: true, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, required: true, enum: TASK_PRIORITIES, default: 'medium' },
    // Optional links, always to records of the same organization (checked in task.service.js).
    customerId: { type: ObjectId, ref: 'Customer' },
    orderId: { type: ObjectId, ref: 'Order' },
    // A calendar day, stored as midnight UTC; the API exchanges it as "YYYY-MM-DD".
    dueDate: { type: Date },
  },
  { timestamps: true },
);

// Serves the organization's newest-first list. Updates find a task by _id and organizationId,
// which the built-in _id index already covers.
taskSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });

export const Task = mongoose.model('Task', taskSchema);
