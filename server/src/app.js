import express from 'express';
import helmet from 'helmet';
import { logger as defaultLogger } from './lib/logger.js';
import { createErrorHandler, notFound } from './middleware/errors.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createHealthRouter } from './modules/health/health.routes.js';

// No current route accepts a body, so this only needs to fit small JSON payloads.
const JSON_BODY_LIMIT = '10kb';

export function createApp({ logger = defaultLogger, databaseState } = {}) {
  const app = express();

  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api/v1', createHealthRouter({ databaseState }));

  app.use(notFound);
  app.use(createErrorHandler(logger));

  return app;
}
