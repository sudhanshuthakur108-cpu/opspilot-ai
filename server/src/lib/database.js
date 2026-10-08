import mongoose from 'mongoose';

// The driver waits 30 seconds by default before giving up on finding a server.
// Ten is plenty for Atlas and makes a bad deployment fail quickly.
const SERVER_SELECTION_TIMEOUT_MS = 10_000;

const DUPLICATE_KEY_ERROR = 11000;

// `dbName` overrides the database named in the URI (used by integration tests).
export async function connectDatabase(uri, { serverSelectionTimeoutMS = SERVER_SELECTION_TIMEOUT_MS, dbName } = {}) {
  // Wraps any `$` operators found in query filters so request data cannot inject them.
  mongoose.set('sanitizeFilter', true);

  await mongoose.connect(uri, dbName ? { serverSelectionTimeoutMS, dbName } : { serverSelectionTimeoutMS });

  // Wait for declared indexes (such as the unique email index) before the server takes traffic.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
}

export function databaseState() {
  return mongoose.STATES[mongoose.connection.readyState] ?? 'unknown';
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function isDuplicateKeyError(error) {
  return error?.code === DUPLICATE_KEY_ERROR;
}

// Runs `work(session)` in a transaction: every write given the session is committed together,
// or none are if `work` throws. Transient errors are retried, so `work` may run more than once.
// Transactions need a replica set; Atlas clusters always are one.
export function withTransaction(work) {
  return mongoose.connection.transaction(work);
}
