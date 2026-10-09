// Who can cause an audit event. A "user" event always names the user, taken from the
// authenticated session; "ai" and "system" events never do.
export const ACTOR_TYPES = Object.freeze(['user', 'ai', 'system']);

export const RESOURCE_TYPES = Object.freeze(['organization']);

// Longest text kept for one detail of an event.
export const DETAIL_MAX_LENGTH = 200;

// Every action the audit log can record, with the kind of resource it applies to and the only
// details that may be stored with it. Details not listed here are dropped, so request bodies,
// prompts, tokens and other secrets cannot reach the log by accident.
export const AUDIT_ACTIONS = Object.freeze({
  'organization.updated': { resourceType: 'organization', details: ['previousName', 'name'] },
});
