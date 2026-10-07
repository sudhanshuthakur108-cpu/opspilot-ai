import { randomUUID } from 'node:crypto';

// Lets a proxy or client pass its own ID for tracing, but only short, plain values.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function requestId(req, res, next) {
  const incoming = req.get('X-Request-ID');

  req.id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-ID', req.id);

  next();
}
