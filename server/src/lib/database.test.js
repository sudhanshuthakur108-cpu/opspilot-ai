import { afterAll, describe, expect, it } from 'vitest';
import { connectDatabase, databaseState, disconnectDatabase } from './database.js';
import { redactConnectionStrings } from './redact.js';

// Port 1 on localhost refuses connections, so this exercises the real driver's
// failure path without needing a MongoDB server or credentials.
const UNREACHABLE_URI = 'mongodb://app-user:pw-secret@127.0.0.1:1/opspilot-test';

afterAll(async () => {
  await disconnectDatabase();
});

describe('database connection', () => {
  it('starts disconnected', () => {
    expect(databaseState()).toBe('disconnected');
  });

  it('reports connecting while a connection attempt is in progress, then fails', async () => {
    const attempt = connectDatabase(UNREACHABLE_URI, { serverSelectionTimeoutMS: 300 });

    expect(databaseState()).toBe('connecting');

    const error = await attempt.catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(databaseState()).toBe('disconnected');
    expect(redactConnectionStrings(error.message)).not.toContain('pw-secret');
  });

  it('can disconnect when no connection is open', async () => {
    await expect(disconnectDatabase()).resolves.toBeUndefined();
    expect(databaseState()).toBe('disconnected');
  });
});
