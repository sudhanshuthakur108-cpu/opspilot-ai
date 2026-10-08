import express from 'express';
import helmet from 'helmet';
import { DEFAULT_CLIENT_ORIGIN } from './config/auth.js';
import { HttpError } from './lib/httpError.js';
import { logger as defaultLogger } from './lib/logger.js';
import { createErrorHandler, notFound } from './middleware/errors.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireSameOrigin } from './middleware/sameOrigin.js';
import { createRequireAuth } from './modules/auth/auth.middleware.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createSessions } from './modules/auth/session.js';
import { createCustomerRouter } from './modules/customers/customer.routes.js';
import { createOrderRouter } from './modules/orders/order.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createRequireMembership } from './modules/organizations/organization.middleware.js';
import { createOrganizationRouter } from './modules/organizations/organization.routes.js';

// The largest current body is a login or registration request, so 10 kB is ample.
const JSON_BODY_LIMIT = '10kb';

function authUnavailable(req, res, next) {
  next(new HttpError(503, 'AUTH_UNAVAILABLE', 'Authentication is unavailable because no database is configured'));
}

// `auth` ({ users, secret, secureCookie }), `organizationStores` ({ organizations, memberships,
// withTransaction }), `customers` and `orders` (the customer and order stores) are omitted when
// the app runs without a database. Customer and order routes need the organization stores for
// their membership check, and order routes also need the customer store.
export function createApp({
  logger = defaultLogger,
  databaseState,
  clientOrigin = DEFAULT_CLIENT_ORIGIN,
  auth,
  organizationStores,
  customers,
  orders,
} = {}) {
  const app = express();

  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  // Reject cross-site state-changing requests before doing any other work on them.
  app.use(requireSameOrigin(clientOrigin));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api/v1', createHealthRouter({ databaseState }));

  if (auth) {
    const sessions = createSessions({ secret: auth.secret, secureCookie: auth.secureCookie });
    const requireAuth = createRequireAuth({ sessions, users: auth.users });

    app.use('/api/v1/auth', createAuthRouter({ users: auth.users, sessions, requireAuth }));
    if (organizationStores) {
      app.use('/api/v1/organizations', createOrganizationRouter({ requireAuth, ...organizationStores }));

      const requireMembership = createRequireMembership({ requireAuth, memberships: organizationStores.memberships });
      if (customers) {
        app.use('/api/v1/organizations/:organizationId/customers', createCustomerRouter({ requireMembership, customers }));
      }
      if (customers && orders) {
        app.use('/api/v1/organizations/:organizationId/orders', createOrderRouter({ requireMembership, orders, customers }));
      }
    }
  } else {
    app.use(['/api/v1/auth', '/api/v1/organizations'], authUnavailable);
  }

  app.use(notFound);
  app.use(createErrorHandler(logger));

  return app;
}
