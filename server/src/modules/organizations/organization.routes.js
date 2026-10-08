import { Router } from 'express';
import { createOrganizationWithOwner } from './organization.service.js';
import { validateNewOrganization } from './organization.validation.js';

// `organizations` and `memberships` are the stores; `withTransaction` comes from lib/database.js.
export function createOrganizationRouter({ requireAuth, organizations, memberships, withTransaction }) {
  const router = Router();

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
