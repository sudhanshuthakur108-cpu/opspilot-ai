import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errors.js';
import { healthRouter } from './modules/health/health.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());

  app.use('/api/v1/health', healthRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
