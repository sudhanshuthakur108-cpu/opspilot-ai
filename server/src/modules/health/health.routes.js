import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ok' });
});
