import { Router } from 'express';

export const healthRouter = Router();

// Liveness: the process is up and handling requests.
healthRouter.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ok' });
});

// Readiness: every dependency the API needs is available. There are none yet;
// the database check belongs here once MongoDB is added, returning 503 when it fails.
healthRouter.get('/ready', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ready', checks: {} });
});
