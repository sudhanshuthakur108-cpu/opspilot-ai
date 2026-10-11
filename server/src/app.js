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
import { createApprovalRouter } from './modules/approvals/approval.routes.js';
import { createAuditLogRouter } from './modules/audit/audit.routes.js';
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
// withTransaction }), and the `customers`, `orders`, `tasks`, `auditLogs` and `approvals` stores
// are omitted when the app runs without a database. Customer, order, task, audit log and AI routes
// need the organization stores for their membership check; order routes also need the customer
// store, task routes need the customer and order stores, and AI routes need all three record stores
// for their tools. Changing an organization's settings needs the audit log store, as every change is
// audited. AI proposals and the approval routes need the approval and audit log stores; without
// them the AI Assistant only reads.
// `aiProvider` answers AI Assistant messages (see modules/ai/ai.provider.js); it defaults to the
// development provider, which connects to no model.
// `trustProxy` is the number of proxies in front of the app (TRUST_PROXY, see config/proxy.js);
// it decides which X-Forwarded-For entry becomes `req.ip`, which the auth rate limit is keyed on.
export function createApp({
  logger = defaultLogger,
  trustProxy = 0,
  databaseState,
  clientOrigin = DEFAULT_CLIENT_ORIGIN,
  auth,
  organizationStores,
  customers,
  orders,
  tasks,
  auditLogs,
  approvals,
  aiProvider = developmentProvider,
} = {}) {
  const app = express();
  // Set before any middleware reads `req.ip`. `false` rather than 0 keeps express-rate-limit's
  // warning when X-Forwarded-For arrives but no proxy is trusted.
  app.set('trust proxy', trustProxy > 0 ? trustProxy : false);

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
      const requireMembership = createRequireMembership({ requireAuth, memberships: organizationStores.memberships });
      app.use('/api/v1/organizations', createOrganizationRouter({ requireAuth, requireMembership, ...organizationStores, auditLogs }));

      if (auditLogs) {
        app.use(
          '/api/v1/organizations/:organizationId/audit-logs',
          createAuditLogRouter({ requireMembership, auditLogs, users: auth.users }),
        );
      }
      if (customers) {
        app.use('/api/v1/organizations/:organizationId/customers', createCustomerRouter({ requireMembership, customers }));
      }
      if (customers && orders) {
        app.use('/api/v1/organizations/:organizationId/orders', createOrderRouter({ requireMembership, orders, customers }));
      }
      if (customers && orders && tasks) {
        app.use('/api/v1/organizations/:organizationId/tasks', createTaskRouter({ requireMembership, tasks, customers, orders }));

        const approvalStores =
          approvals && auditLogs ? { approvals, auditLogs, withTransaction: organizationStores.withTransaction } : undefined;
        app.use(
          '/api/v1/organizations/:organizationId/ai',
          createAiRouter({ requireMembership, provider: aiProvider, customers, orders, tasks, approvalStores }),
        );
        if (approvalStores) {
          app.use(
            '/api/v1/organizations/:organizationId/approvals',
            createApprovalRouter({ requireMembership, logger, ...approvalStores, users: auth.users, customers, orders, tasks }),
          );
        }
      }
    }
  } else {
    app.use(['/api/v1/auth', '/api/v1/organizations'], authUnavailable);
  }

  app.use(notFound);
  app.use(createErrorHandler(logger));

  return app;
}
