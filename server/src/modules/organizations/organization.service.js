import { HttpError } from '../../lib/httpError.js';
import { OWNER } from './roles.js';

// Creates an organization with `ownerUserId` as its owner. Both writes share one transaction,
// so an organization is never left without its owner membership.
// `ownerUserId` must be the authenticated user's ID, never a value from the request body.
export async function createOrganizationWithOwner(
  { organizations, memberships, withTransaction },
  { name, slug, ownerUserId },
) {
  return withTransaction(async (session) => {
    const organization = await organizations.create({ name, slug }, { session });
    if (!organization) {
      // Thrown rather than returned so the transaction is aborted, not committed.
      throw new HttpError(409, 'SLUG_UNAVAILABLE', 'This organization address is already taken');
    }

    const membership = await memberships.create(
      { organizationId: organization.id, userId: ownerUserId, role: OWNER },
      { session },
    );
    if (!membership) {
      throw new Error('Owner membership was not created for a new organization');
    }

    return { organization, membership };
  });
}
