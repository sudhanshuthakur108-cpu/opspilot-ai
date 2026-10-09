import { Router } from 'express';
import { requireOrganizationRole } from './organization.middleware.js';
import { createOrganizationWithOwner, listOrganizationsForUser, renameOrganization } from './organization.service.js';
import { validateNewOrganization, validateOrganizationChanges } from './organization.validation.js';
import { ADMIN, OWNER } from './roles.js';

// `organizations` and `memberships` are the stores; `withTransaction` comes from lib/database.js.
// `requireMembership` comes from organization.middleware.js. Changing an organization needs the
// `auditLogs` store, since every change is audited; without it that route is not added.
export function createOrganizationRouter({ requireAuth, requireMembership, organizations, memberships, withTransaction, auditLogs }) {
  const router = Router();

  // GET / → 200 { organizations: [{ id, name, slug, role, createdAt }] }, newest first.
  // Only the signed-in user's organizations; the user is never taken from the request.
  router.get('/', requireAuth, async (req, res) => {
    const userOrganizations = await listOrganizationsForUser({ organizations, memberships }, req.user.id);

    res.set('Cache-Control', 'no-store').json({ organizations: userOrganizations });
  });

  // POST / { name, slug } → 201 { organization, membership }. The signed-in user becomes the owner.
  router.post('/', requireAuth, async (req, res) => {
    const { organization, membership } = await createOrganizationWithOwner(
      { organizations, memberships, withTransaction },
      { ...validateNewOrganization(req.body), ownerUserId: req.user.id },
    );

    res.status(201).json({ organization, membership });
  });

  if (auditLogs) {
    // PATCH /:organizationId { name } → 200 { organization: { id, name, slug, createdAt } }.
    // Owners and admins only. The organization is the verified membership's, and the audit
    // event names the signed-in user as the actor.
    router.patch('/:organizationId', requireMembership, requireOrganizationRole(OWNER, ADMIN), async (req, res) => {
      const organization = await renameOrganization(
        { organizations, auditLogs, withTransaction },
        {
          organizationId: req.membership.organizationId,
          name: validateOrganizationChanges(req.body).name,
          actorUserId: req.membership.userId,
        },
      );

      res.json({ organization });
    });
  }

  return router;
}
