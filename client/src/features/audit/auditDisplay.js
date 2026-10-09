// Readable labels for audit log entries. Unknown values (from a newer server) are shown as sent.
const ACTION_LABELS = {
  'organization.updated': 'Workspace settings updated',
  'approval.proposed': 'Change proposed',
  'approval.approved': 'Change approved',
  'approval.rejected': 'Change rejected',
  'approval.executed': 'Approved change made',
  'approval.execution_failed': 'Approved change failed',
};
const RESOURCE_LABELS = { organization: 'Workspace', approval: 'Approval' };
const PROPOSED_ACTION_LABELS = { create_task: 'Create task' };
const RESULT_LABELS = { task: 'Task created' };

const proposedAction = (action) => PROPOSED_ACTION_LABELS[action] ?? action;

export const actionLabel = (action) => ACTION_LABELS[action] ?? action;
export const resourceLabel = (resourceType) => RESOURCE_LABELS[resourceType] ?? resourceType;

// `currentEmail` is the signed-in user's, so their own entries can say so.
export function actorLabel({ actorType, actorEmail }, currentEmail) {
  if (actorType === 'ai') return 'AI Assistant';
  if (actorType === 'system') return 'OpsPilot';
  if (!actorEmail) return 'Former user';
  return actorEmail === currentEmail ? `${actorEmail} (you)` : actorEmail;
}

// A sentence describing what changed, or null when the entry has no details worth showing.
export function describeDetails({ action, details }) {
  if (action === 'organization.updated' && details.previousName && details.name) {
    return `Name changed from “${details.previousName}” to “${details.name}”`;
  }
  if (!details.action) {
    return null;
  }
  if (action === 'approval.proposed') {
    return details.summary ? `${proposedAction(details.action)}: “${details.summary}”` : proposedAction(details.action);
  }
  if (action === 'approval.rejected' && details.reason) {
    return `${proposedAction(details.action)}. Reason: “${details.reason}”`;
  }
  if (action === 'approval.executed') {
    return `${proposedAction(details.action)}. ${RESULT_LABELS[details.resultType] ?? 'Done'}`;
  }
  if (action === 'approval.execution_failed') {
    return `${proposedAction(details.action)}. Failed (${details.failureCode ?? 'unknown error'}); nothing was changed`;
  }
  return proposedAction(details.action);
}
