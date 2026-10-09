import { Router } from 'express';
import { requireOrganizationRole } from '../organizations/organization.middleware.js';
import { ADMIN, OWNER } from '../organizations/roles.js';
import { listAuditLogs } from './audit.service.js';
import { validateAuditLogQuery } from './audit.validation.js';

// Mounted at /organizations/:organizationId/audit-logs. `requireMembership` admits only members
// of that organization and sets `req.membership`, which is the only source of the organization.
// The log is read-only: entries are written by the server actions they record.
export function createAuditLogRouter({ requireMembership, auditLogs, users }) {
  const router = Router({ mergeParams: true });

  // GET /?page&limit → 200 { auditLogs: [{ id, actorType, actorEmail, action, resourceType,
  // resourceId, details, createdAt }], page, limit, hasMore }, newest first. Owners and admins only.
  router.get('/', requireMembership, requireOrganizationRole(OWNER, ADMIN), async (req, res) => {
    const result = await listAuditLogs({ auditLogs, users }, req.membership.organizationId, validateAuditLogQuery(req.query));

    res.set('Cache-Control', 'no-store').json(result);
  });

  return router;
}
