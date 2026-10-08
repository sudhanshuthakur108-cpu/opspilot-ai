import express from 'express';
import { createErrorHandler, notFound } from '../middleware/errors.js';
import { requestId } from '../middleware/requestId.js';
import { createRequireAuth } from '../modules/auth/auth.middleware.js';
import { createSessions } from '../modules/auth/session.js';
import { createRequireMembership, requireOrganizationRole } from '../modules/organizations/organization.middleware.js';
import { captureLogger } from './captureLogger.js';

// A small app with the real session, auth and membership middleware in front of two probe
// routes, for testing organization authorization before any real organization routes exist.
export function createMembershipTestApp({ users, memberships }) {
  const logs = captureLogger();
  const sessions = createSessions({ secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false });
  const requireAuth = createRequireAuth({ sessions, users });
  const requireMembership = createRequireMembership({ requireAuth, memberships });
  const reply = (req, res) => res.json({ membership: req.membership });

  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.get('/organizations/:organizationId/probe', requireMembership, reply);
  app.post('/organizations/:organizationId/managers-only', requireMembership, requireOrganizationRole('owner', 'admin'), reply);
  app.post('/organizations/:organizationId/owners-only', requireMembership, requireOrganizationRole('owner'), reply);
  app.use(notFound);
  app.use(createErrorHandler(logs));

  // Issues a real session token for `user`, as login would, and returns the cookie pair.
  async function sessionCookie(user) {
    let cookie;
    await sessions.start({ cookie: (name, value) => (cookie = `${name}=${value}`) }, user);
    return cookie;
  }

  return { app, logs, sessionCookie };
}
