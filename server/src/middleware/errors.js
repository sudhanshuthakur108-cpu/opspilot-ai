import { HttpError } from '../lib/httpError.js';

// Errors raised by Express's body parser, identified by their `type`.
// Their own messages can echo parser internals, so we send fixed messages instead.
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
  'charset.unsupported': { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request body encoding is not supported' },
  'encoding.unsupported': { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request body encoding is not supported' },
};

function toErrorResponse(err) {
  if (err instanceof HttpError) {
    return { status: err.status, code: err.code, message: err.message };
  }

  const status = err.status ?? err.statusCode;
  if (status >= 400 && status < 500) {
    const known = BODY_PARSER_ERRORS[err.type];
    return known
      ? { status, ...known }
      : { status, code: 'INVALID_REQUEST', message: 'The request could not be processed' };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}

export function notFound(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
}

export function createErrorHandler(logger) {
  // Express recognizes error handlers by their four parameters, so `next` must stay.
  return function errorHandler(err, req, res, next) {
    if (res.headersSent) {
      next(err);
      return;
    }

    const { status, code, message } = toErrorResponse(err);

    if (status >= 500) {
      // Log selected fields only: some errors carry request data (e.g. parser errors keep the raw body).
      logger.error('request failed', {
        requestId: req.id,
        error: { name: err.name, message: err.message, stack: err.stack },
      });
    }

    res.status(status).json({ error: { code, message, requestId: req.id } });
  };
}
