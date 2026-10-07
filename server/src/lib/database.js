import mongoose from 'mongoose';

// The driver waits 30 seconds by default before giving up on finding a server.
// Ten is plenty for Atlas and makes a bad deployment fail quickly.
const SERVER_SELECTION_TIMEOUT_MS = 10_000;

export async function connectDatabase(uri, { serverSelectionTimeoutMS = SERVER_SELECTION_TIMEOUT_MS } = {}) {
  // Wraps any `$` operators found in query filters so request data cannot inject them.
  mongoose.set('sanitizeFilter', true);

  await mongoose.connect(uri, { serverSelectionTimeoutMS });
}

export function databaseState() {
  return mongoose.STATES[mongoose.connection.readyState] ?? 'unknown';
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
