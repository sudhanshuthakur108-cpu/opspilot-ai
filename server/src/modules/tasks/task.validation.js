import mongoose from 'mongoose';
import { HttpError } from '../../lib/httpError.js';
import { DESCRIPTION_MAX_LENGTH, TASK_PRIORITIES, TASK_STATUSES, TITLE_MAX_LENGTH } from './task.model.js';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function invalid(message) {
  return new HttpError(400, 'VALIDATION_FAILED', message);
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function readOptionalId(value, field) {
  if (isMissing(value)) {
    return undefined;
  }
  if (typeof value !== 'string' || !mongoose.isObjectIdOrHexString(value)) {
    throw invalid(`${field} ID is not valid`);
  }
  return value;
}

function readStatus(value) {
  if (!TASK_STATUSES.includes(value)) {
    throw invalid(`Status must be one of ${TASK_STATUSES.join(', ')}`);
  }
  return value;
}

function readPriority(value) {
  if (!TASK_PRIORITIES.includes(value)) {
    throw invalid(`Priority must be one of ${TASK_PRIORITIES.join(', ')}`);
  }
  return value;
}

// "YYYY-MM-DD" for a real calendar day (so not 2026-02-30), as a Date at midnight UTC.
function readDueDate(value) {
  const date = typeof value === 'string' && DATE_FORMAT.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw invalid('Due date must be a date like 2026-10-31');
  }
  return date;
}

// Body: { title, description?, status?, priority?, customerId?, orderId?, dueDate? }. Other
// fields are ignored, including any organizationId: the organization always comes from the
// route, checked against the caller's membership. Whether the customer and order belong to it is
// checked by createTask, not here.
export function validateNewTask(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (title.length === 0 || title.length > TITLE_MAX_LENGTH) {
    throw invalid(`Title must be between 1 and ${TITLE_MAX_LENGTH} characters`);
  }

  let description;
  if (!isMissing(body.description)) {
    if (typeof body.description !== 'string') {
      throw invalid('Description must be text');
    }
    description = body.description.trim() || undefined;
    if (description && description.length > DESCRIPTION_MAX_LENGTH) {
      throw invalid(`Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`);
    }
  }

  return {
    title,
    description,
    status: body.status === undefined ? 'todo' : readStatus(body.status),
    priority: body.priority === undefined ? 'medium' : readPriority(body.priority),
    customerId: readOptionalId(body.customerId, 'Customer'),
    orderId: readOptionalId(body.orderId, 'Order'),
    dueDate: isMissing(body.dueDate) ? undefined : readDueDate(body.dueDate),
  };
}

// Body: { status?, priority?, dueDate? }, with at least one of them; a null or empty dueDate
// clears it. Only these fields can change: the title, description, customer, order and
// organization of a task are fixed, and any of them in the body is ignored.
export function validateTaskChanges(body) {
  const changes = {};
  if (body?.status !== undefined) changes.status = readStatus(body.status);
  if (body?.priority !== undefined) changes.priority = readPriority(body.priority);
  if (body?.dueDate !== undefined) changes.dueDate = isMissing(body.dueDate) ? null : readDueDate(body.dueDate);

  if (Object.keys(changes).length === 0) {
    throw invalid('Send a status, priority or dueDate to change');
  }
  return changes;
}

export function validateTaskId(taskId) {
  if (!mongoose.isObjectIdOrHexString(taskId)) {
    throw invalid('Task ID is not valid');
  }
  return taskId;
}
