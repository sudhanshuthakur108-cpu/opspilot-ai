import { Router } from 'express';
import { requireOrganizationRole } from '../organizations/organization.middleware.js';
import { ADMIN, OWNER } from '../organizations/roles.js';
import { approveApproval, listApprovals, rejectApproval, toPublicApprovals } from './approval.service.js';
import { validateApprovalId, validateApprovalQuery, validateRejection } from './approval.validation.js';

// Mounted at /organizations/:organizationId/approvals. `requireMembership` admits only members of
// that organization and sets `req.membership`, which is the only source of the organization and
// the reviewer. There is no route for creating an approval: only the server creates them, from AI
// proposals (see modules/ai).
//
// `approvals`, `auditLogs`, `users`, `customers`, `orders` and `tasks` are the stores;
// `withTransaction` comes from lib/database.js.
export function createApprovalRouter({ requireMembership, logger, ...stores }) {
  const deps = { ...stores, logger };
  const router = Router({ mergeParams: true });
  const reviewers = requireOrganizationRole(OWNER, ADMIN);

  // GET /?status&page&limit → 200 { approvals: [...], page, limit, hasMore }, newest first. Any member.
  router.get('/', requireMembership, async (req, res) => {
    const result = await listApprovals(deps, req.membership.organizationId, validateApprovalQuery(req.query));

    res.set('Cache-Control', 'no-store').json(result);
  });

  // POST /:approvalId/approve (no body) → 200 { approval }, with status "executed" or
  // "execution_failed". Only the stored proposal runs. Owners and admins only.
  router.post('/:approvalId/approve', requireMembership, reviewers, async (req, res) => {
    const { organizationId, userId } = req.membership;
    const approval = await approveApproval(deps, {
      organizationId,
      approvalId: validateApprovalId(req.params.approvalId),
      reviewerUserId: userId,
    });

    const [publicApproval] = await toPublicApprovals(deps, organizationId, [approval]);
    res.json({ approval: publicApproval });
  });

  // POST /:approvalId/reject { reason? } → 200 { approval }. Owners and admins only.
  router.post('/:approvalId/reject', requireMembership, reviewers, async (req, res) => {
    const { organizationId, userId } = req.membership;
    const approvalId = validateApprovalId(req.params.approvalId);
    const approval = await rejectApproval(deps, {
      organizationId,
      approvalId,
      reviewerUserId: userId,
      reason: validateRejection(req.body).reason,
    });

    const [publicApproval] = await toPublicApprovals(deps, organizationId, [approval]);
    res.json({ approval: publicApproval });
  });

  return router;
}
