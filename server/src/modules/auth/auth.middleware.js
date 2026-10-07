import { HttpError } from '../../lib/httpError.js';

// Resolves the session cookie to the current user, or null. The user lookup is what lets
// logout (which bumps the token version) invalidate tokens that have not expired yet.
export async function findSessionUser(req, { sessions, users }) {
  const claims = await sessions.readClaims(req);
  if (!claims) {
    return null;
  }

  const user = await users.findById(claims.userId);
  return user && user.tokenVersion === claims.tokenVersion ? user : null;
}

export function createRequireAuth({ sessions, users }) {
  return async (req, res, next) => {
    const user = await findSessionUser(req, { sessions, users });
    if (!user) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    req.user = user;
    next();
  };
}
