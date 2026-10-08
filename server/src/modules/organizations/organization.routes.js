import { Router } from 'express';
import { createOrganizationWithOwner, listOrganizationsForUser } from './organization.service.js';
import { validateNewOrganization } from './organization.validation.js';

// `organizations` and `memberships` are the stores; `withTransaction` comes from lib/database.js.
export function createOrganizationRouter({ requireAuth, organizations, memberships, withTransaction }) {
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

  return router;
}
