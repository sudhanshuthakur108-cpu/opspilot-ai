// Readable labels for audit log entries. Unknown values (from a newer server) are shown as sent.
const ACTION_LABELS = { 'organization.updated': 'Workspace settings updated' };
const RESOURCE_LABELS = { organization: 'Workspace' };

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
  return null;
}
