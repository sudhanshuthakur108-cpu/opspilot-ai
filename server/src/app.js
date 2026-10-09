import express from 'express';
import helmet from 'helmet';
import { DEFAULT_CLIENT_ORIGIN } from './config/auth.js';
import { HttpError } from './lib/httpError.js';
import { logger as defaultLogger } from './lib/logger.js';
import { createErrorHandler, notFound } from './middleware/errors.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireSameOrigin } from './middleware/sameOrigin.js';
import { createAiRouter } from './modules/ai/ai.routes.js';
import { developmentProvider } from './modules/ai/development.provider.js';
import { createRequireAuth } from './modules/auth/auth.middleware.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createSessions } from './modules/auth/session.js';
import { createCustomerRouter } from './modules/customers/customer.routes.js';
import { createOrderRouter } from './modules/orders/order.routes.js';
import { createTaskRouter } from './modules/tasks/task.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createRequireMembership } from './modules/organizations/organization.middleware.js';
import { createOrganizationRouter } from './modules/organizations/organization.routes.js';

// The largest current body is a login or registration request, so 10 kB is ample.
const JSON_BODY_LIMIT = '10kb';

function authUnavailable(req, res, next) {
  next(new HttpError(503, 'AUTH_UNAVAILABLE', 'Authentication is unavailable because no database is configured'));
}

// `auth` ({ users, secret, secureCookie }), `organizationStores` ({ organizations, memberships,
// withTransaction }), and the `customers`, `orders` and `tasks` stores are omitted when the app
// runs without a database. Customer, order, task and AI routes need the organization stores for
// their membership check; order routes also need the customer store, task routes need the customer
// and order stores, and AI routes need all three record stores for their tools.
// `aiProvider` answers AI Assistant messages (see modules/ai/ai.provider.js); it defaults to the
// development provider, which connects to no model.
export function createApp({
  logger = defaultLogger,
  databaseState,
  clientOrigin = DEFAULT_CLIENT_ORIGIN,
  auth,
  organizationStores,
  customers,
  orders,
  tasks,
  aiProvider = developmentProvider,
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
      if (customers && orders && tasks) {
        app.use('/api/v1/organizations/:organizationId/tasks', createTaskRouter({ requireMembership, tasks, customers, orders }));
        app.use(
          '/api/v1/organizations/:organizationId/ai',
          createAiRouter({ requireMembership, provider: aiProvider, customers, orders, tasks }),
        );
      }
    }
  } else {
    app.use(['/api/v1/auth', '/api/v1/organizations'], authUnavailable);
  }

  app.use(notFound);
  app.use(createErrorHandler(logger));

  return app;
}
