export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
}

// Express recognizes error handlers by their four parameters, so `next` must stay.
export function errorHandler(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500;
  const isClientError = status >= 400 && status < 500 && err.expose === true;

  if (!isClientError) {
    console.error(err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    return;
  }

  res.status(status).json({
    error: { code: 'INVALID_REQUEST', message: err.message },
  });
}
