import { Router } from 'express';

// `databaseState` is omitted when the app runs without a database (development and test only).
export function createHealthRouter({ databaseState } = {}) {
  const router = Router();

  // Liveness: the process is up and handling requests.
  router.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });

  // Readiness: every dependency the API needs is available.
  router.get('/ready', (req, res) => {
    const checks = {};
    if (databaseState) {
      checks.database = databaseState();
    }

    const ready = Object.values(checks).every((state) => state === 'connected');

    res
      .status(ready ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ status: ready ? 'ready' : 'not_ready', checks });
  });

  return router;
}
