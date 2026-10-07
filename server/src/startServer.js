import { createApp } from './app.js';

function listen(app, port) {
  return new Promise((resolve, reject) => {
    // Express 5 passes startup errors (such as a port already in use) to this callback.
    const server = app.listen(port, (error) => (error ? reject(error) : resolve(server)));
  });
}

// Connects required dependencies before accepting traffic, so a server that is
// listening is never missing its database. Authentication is enabled with the database.
export async function startServer({ config, logger, database, users }) {
  const databaseEnabled = Boolean(config.database.uri);

  if (databaseEnabled) {
    await database.connect(config.database.uri);
    logger.info('database connected');
  } else {
    logger.info('database disabled: MONGODB_URI is not set');
  }

  const app = createApp({
    logger,
    clientOrigin: config.clientOrigin,
    databaseState: databaseEnabled ? database.state : undefined,
    auth: databaseEnabled
      ? { users, secret: config.auth.jwtSecret, secureCookie: config.nodeEnv === 'production' }
      : undefined,
  });
  const server = await listen(app, config.port);
  logger.info('server started', { port: server.address().port, nodeEnv: config.nodeEnv });

  let closing;
  function shutdown(signal) {
    closing ??= (async () => {
      logger.info('shutting down', { signal });
      // Stops new connections and waits for in-flight requests to finish.
      await new Promise((resolve) => server.close(resolve));
      if (databaseEnabled) {
        await database.disconnect();
      }
      logger.info('shutdown complete');
    })();
    return closing;
  }

  return { server, shutdown };
}
