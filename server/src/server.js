import { loadConfig } from './config/env.js';
import { connectDatabase, databaseState, disconnectDatabase, withTransaction } from './lib/database.js';
import { logger } from './lib/logger.js';
import { redactConnectionStrings } from './lib/redact.js';
import { customerStore } from './modules/customers/customer.store.js';
import { orderStore } from './modules/orders/order.store.js';
import { membershipStore } from './modules/organizations/membership.store.js';
import { organizationStore } from './modules/organizations/organization.store.js';
import { userStore } from './modules/users/user.store.js';
import { startServer } from './startServer.js';

// Hosting platforms wait a limited time after SIGTERM before killing the process.
const SHUTDOWN_TIMEOUT_MS = 10_000;

function errorFields(error) {
  return { name: error.name, message: redactConnectionStrings(error.message) };
}

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let shutdown;
try {
  ({ shutdown } = await startServer({
    config,
    logger,
    database: { connect: connectDatabase, state: databaseState, disconnect: disconnectDatabase, withTransaction },
    users: userStore,
    organizations: organizationStore,
    memberships: membershipStore,
    customers: customerStore,
    orders: orderStore,
  }));
} catch (error) {
  logger.error('startup failed', { error: errorFields(error) });
  process.exit(1);
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    setTimeout(() => {
      logger.error('shutdown timed out', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    shutdown(signal).then(
      () => process.exit(0),
      (error) => {
        logger.error('shutdown failed', { error: errorFields(error) });
        process.exit(1);
      },
    );
  });
}
