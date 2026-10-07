export function requestLogger(logger) {
  return (req, res, next) => {
    const startedAt = performance.now();

    res.on('finish', () => {
      logger.info('request completed', {
        requestId: req.id,
        method: req.method,
        // originalUrl survives router mounting; the query string is dropped because it can carry tokens.
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Number((performance.now() - startedAt).toFixed(1)),
      });
    });

    next();
  };
}
