import express from 'express';
import helmet from 'helmet';
import { DEFAULT_CLIENT_ORIGIN } from './config/auth.js';
import { HttpError } from './lib/httpError.js';
import { logger as defaultLogger } from './lib/logger.js';
import { createErrorHandler, notFound } from './middleware/errors.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireSameOrigin } from './middleware/sameOrigin.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';

// The largest current body is a login or registration request, so 10 kB is ample.
const JSON_BODY_LIMIT = '10kb';

function authUnavailable(req, res, next) {
  next(new HttpError(503, 'AUTH_UNAVAILABLE', 'Authentication is unavailable because no database is configured'));
}

// `auth` ({ users, secret, secureCookie }) is omitted when the app runs without a database.
export function createApp({ logger = defaultLogger, databaseState, clientOrigin = DEFAULT_CLIENT_ORIGIN, auth } = {}) {
  const app = express();

  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  // Reject cross-site state-changing requests before doing any other work on them.
  app.use(requireSameOrigin(clientOrigin));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api/v1', createHealthRouter({ databaseState }));
  app.use('/api/v1/auth', auth ? createAuthRouter(auth) : authUnavailable);

  app.use(notFound);
  app.use(createErrorHandler(logger));

  return app;
}
