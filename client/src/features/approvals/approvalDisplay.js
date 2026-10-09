// Readable labels for approvals. Unknown values (from a newer server) are shown as sent.
const ACTION_LABELS = { create_task: 'Create task' };
const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
  execution_failed: 'Failed',
};

export const actionLabel = (action) => ACTION_LABELS[action] ?? action;
export const approvalStatusLabel = (status) => STATUS_LABELS[status] ?? status;

// Actions this version of the page knows how to show in full. Others can't be reviewed here.
export const canDisplayAction = (action) => Object.hasOwn(ACTION_LABELS, action);
