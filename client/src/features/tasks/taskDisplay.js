// The statuses and priorities the server accepts, in the order a user would pick them.
export const TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

export const TASK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const labels = (options) => Object.fromEntries(options.map(({ value, label }) => [value, label]));
const STATUS_LABELS = labels(TASK_STATUSES);
const PRIORITY_LABELS = labels(TASK_PRIORITIES);

export const statusLabel = (status) => STATUS_LABELS[status] ?? status;
export const priorityLabel = (priority) => PRIORITY_LABELS[priority] ?? priority;

// Due dates are calendar days ("2026-10-31"), so they are shown in UTC: in local time, midnight
// UTC would be the previous day anywhere west of Greenwich.
const dueFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

export function formatDueDate(dueDate) {
  return dueFormat.format(new Date(`${dueDate}T00:00:00Z`));
}
