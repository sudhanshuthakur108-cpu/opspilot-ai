import { HttpError } from '../lib/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF protection for cookie-authenticated requests. Browsers always send Origin on
// cross-site requests and on same-origin POST/PUT/PATCH/DELETE, so any state-changing
// request must name our client's origin. GET and HEAD routes must never change state.
export function requireSameOrigin(allowedOrigin) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    if (req.get('Origin') !== allowedOrigin) {
      next(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed'));
      return;
    }

    // Body-less requests (like logout) pass. req.is() alone treats "Content-Length: 0",
    // which browsers send for an empty POST, as having a body.
    const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length']) > 0;
    if (hasBody && !req.is('application/json')) {
      next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
      return;
    }

    next();
  };
}
