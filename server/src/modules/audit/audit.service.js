import { ACTOR_TYPES, AUDIT_ACTIONS, DETAIL_MAX_LENGTH } from './audit.events.js';

// Records one audit event. Business actions call this explicitly for the changes worth keeping;
// nothing is logged automatically per request. `actor` is { type: 'user', userId } with the
// authenticated user's ID, or { type: 'ai' } or { type: 'system' }; it never comes from a request
// body. Only the details AUDIT_ACTIONS lists for the action are kept. A bad event is a programming
// error, so it throws; inside a transaction that also undoes the change being recorded.
export async function recordAuditEvent(auditLogs, { organizationId, actor, action, resourceId, details = {} }, { session } = {}) {
  const definition = Object.hasOwn(AUDIT_ACTIONS, action) ? AUDIT_ACTIONS[action] : null;
  if (!definition) {
    throw new Error(`Unknown audit action "${action}"`);
  }
  if (!ACTOR_TYPES.includes(actor?.type)) {
    throw new Error(`Unknown audit actor type "${actor?.type}"`);
  }
  if ((actor.type === 'user') !== Boolean(actor.userId)) {
    throw new Error('A user actor needs a user ID, and other actors must not have one');
  }

  const kept = {};
  for (const key of definition.details) {
    const value = details[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > DETAIL_MAX_LENGTH) {
      throw new Error(`Audit detail "${key}" must be text of at most ${DETAIL_MAX_LENGTH} characters`);
    }
    kept[key] = value;
  }

  return auditLogs.create(
    organizationId,
    {
      actorType: actor.type,
      actorUserId: actor.userId,
      action,
      resourceType: definition.resourceType,
      resourceId,
      details: kept,
    },
    { session },
  );
}

// One page of the organization's audit log, newest first. A user actor is shown by email,
// loaded by ID; internal user IDs are not returned.
export async function listAuditLogs({ auditLogs, users }, organizationId, { page, limit }) {
  // One extra entry tells whether there is another page.
  const records = await auditLogs.listForOrganization(organizationId, { skip: (page - 1) * limit, limit: limit + 1 });
  const entries = records.slice(0, limit);

  const userIds = [...new Set(entries.map((entry) => entry.actorUserId).filter(Boolean))];
  const actors = userIds.length > 0 ? await users.findByIds(userIds) : [];
  const emails = new Map(actors.map((user) => [user.id, user.email]));

  return {
    auditLogs: entries.map((entry) => ({
      id: entry.id,
      actorType: entry.actorType,
      actorEmail: emails.get(entry.actorUserId) ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      details: entry.details,
      createdAt: entry.createdAt,
    })),
    page,
    limit,
    hasMore: records.length > limit,
  };
}
