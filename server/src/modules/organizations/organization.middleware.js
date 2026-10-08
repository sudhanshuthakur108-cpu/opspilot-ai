import mongoose from 'mongoose';
import { HttpError } from '../../lib/httpError.js';
import { isRole } from './roles.js';

// Only what downstream authorization needs; never the full stored membership.
function toVerifiedMembership(membership) {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
  };
}

// Admits a request only when the signed-in user is a member of the organization in the
// `:organizationId` route parameter, and attaches that membership as `req.membership`.
// Runs `requireAuth` first, so the user always comes from the verified session.
// A non-member gets the same 404 as a missing organization, so existence is never revealed.
export function createRequireMembership({ requireAuth, memberships }) {
  async function checkMembership(req, res, next) {
    const { organizationId } = req.params;
    if (!mongoose.isObjectIdOrHexString(organizationId)) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Organization ID is not valid');
    }

    const membership = await memberships.find(organizationId, req.user.id);
    if (!membership) {
      throw new HttpError(404, 'NOT_FOUND', 'Organization not found');
    }

    req.membership = toVerifiedMembership(membership);
    next();
  }

  return [requireAuth, checkMembership];
}

// Use after the membership middleware: admits the request only when the verified membership
// has one of `allowedRoles`. A bad role list throws when the route is defined, not per request.
export function requireOrganizationRole(...allowedRoles) {
  if (allowedRoles.length === 0 || !allowedRoles.every(isRole)) {
    throw new Error(`requireOrganizationRole needs one or more known roles, got [${allowedRoles.join(', ')}]`);
  }

  return (req, res, next) => {
    if (!req.membership) {
      // The route is missing the membership middleware; fail closed.
      throw new Error('requireOrganizationRole must run after the membership middleware');
    }

    if (!allowedRoles.includes(req.membership.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }

    next();
  };
}
