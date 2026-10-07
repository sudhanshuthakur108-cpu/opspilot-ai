import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { startServer } from './startServer.js';
import { captureLogger } from './testing/captureLogger.js';

const DATABASE_URI = 'mongodb://app-user:pw-secret@db.example.com/opspilot';

function configWith(uri) {
  return { nodeEnv: 'test', port: 0, database: { uri } };
}

function fakeDatabase() {
  let state = 'disconnected';
  return {
    connect: vi.fn(async () => {
      state = 'connected';
    }),
    state: () => state,
    setState: (next) => {
      state = next;
    },
    disconnect: vi.fn(async () => {
      state = 'disconnected';
    }),
  };
}

describe('startServer with a database', () => {
  it('connects before listening and reports readiness from the connection state', async () => {
    const database = fakeDatabase();
    const logs = captureLogger();

    const { server, shutdown } = await startServer({ config: configWith(DATABASE_URI), logger: logs, database });

    expect(database.connect).toHaveBeenCalledWith(DATABASE_URI);
    expect(logs.entries.map((entry) => entry.message)).toEqual(['database connected', 'server started']);

    const ready = await request(server).get('/api/v1/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', checks: { database: 'connected' } });

    database.setState('disconnected');
    const notReady = await request(server).get('/api/v1/ready');
    expect(notReady.status).toBe(503);
    expect(notReady.body).toEqual({ status: 'not_ready', checks: { database: 'disconnected' } });

    const health = await request(server).get('/api/v1/health');
    expect(health.status).toBe(200);

    await shutdown('SIGTERM');
  });

  it('does not start listening when the database connection fails', async () => {
    const database = fakeDatabase();
    database.connect.mockRejectedValue(new Error('connection refused'));
    const logs = captureLogger();

    await expect(
      startServer({ config: configWith(DATABASE_URI), logger: logs, database }),
    ).rejects.toThrow('connection refused');
    expect(logs.entries.map((entry) => entry.message)).not.toContain('server started');
  });

  it('closes the server before disconnecting, and only once', async () => {
    const database = fakeDatabase();
    const { server, shutdown } = await startServer({
      config: configWith(DATABASE_URI),
      logger: captureLogger(),
      database,
    });
    database.disconnect.mockImplementation(async () => {
      expect(server.listening).toBe(false);
    });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(server.listening).toBe(false);
    expect(database.disconnect).toHaveBeenCalledTimes(1);
  });

  it('never logs the connection string', async () => {
    const logs = captureLogger();
    const { server, shutdown } = await startServer({
      config: configWith(DATABASE_URI),
      logger: logs,
      database: fakeDatabase(),
    });

    await request(server).get('/api/v1/ready');
    await shutdown('SIGTERM');

    await vi.waitFor(() => expect(logs.entries.some((entry) => entry.message === 'request completed')).toBe(true));
    expect(JSON.stringify(logs.entries)).not.toMatch(/pw-secret|db\.example\.com/);
  });
});

describe('startServer without a database', () => {
  it('runs with readiness that has no database check', async () => {
    const database = fakeDatabase();
    const logs = captureLogger();

    const { server, shutdown } = await startServer({ config: configWith(null), logger: logs, database });

    expect(database.connect).not.toHaveBeenCalled();
    expect(logs.entries[0].message).toBe('database disabled: MONGODB_URI is not set');

    const ready = await request(server).get('/api/v1/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', checks: {} });

    await shutdown('SIGTERM');
    expect(database.disconnect).not.toHaveBeenCalled();
    expect(server.listening).toBe(false);
  });
});
