import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { startServer } from './startServer.js';
import { captureLogger } from './testing/captureLogger.js';
import { createMemoryCustomerStore } from './testing/memoryCustomerStore.js';
import { createMemoryOrderStore } from './testing/memoryOrderStore.js';
import { createMemoryOrganizationStores } from './testing/memoryOrganizationStores.js';
import { createMemoryUserStore } from './testing/memoryUserStore.js';
import { signUp } from './testing/signUp.js';

const DATABASE_URI = 'mongodb://app-user:pw-secret@db.example.com/opspilot';
const CLIENT_ORIGIN = 'http://localhost:5173';

function configWith(uri) {
  return {
    nodeEnv: 'test',
    port: 0,
    clientOrigin: CLIENT_ORIGIN,
    database: { uri },
    auth: { jwtSecret: uri ? 'test-secret-that-is-at-least-32-chars' : null },
  };
}

function fakeDatabase() {
  let state = 'disconnected';
  const { withTransaction } = createMemoryOrganizationStores();
  return {
    withTransaction,
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

function start(uri, { database = fakeDatabase(), logger = captureLogger() } = {}) {
  const { organizations, memberships } = createMemoryOrganizationStores();
  return startServer({
    config: configWith(uri),
    logger,
    database,
    users: createMemoryUserStore(),
    organizations,
    memberships,
    customers: createMemoryCustomerStore(),
    orders: createMemoryOrderStore(),
  });
}

describe('startServer with a database', () => {
  it('connects before listening and reports readiness from the connection state', async () => {
    const database = fakeDatabase();
    const logs = captureLogger();

    const { server, shutdown } = await start(DATABASE_URI, { database, logger: logs });

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

  it('enables authentication', async () => {
    const { server, shutdown } = await start(DATABASE_URI);

    const response = await request(server)
      .post('/api/v1/auth/register')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: 'ada@example.com', password: 'correct horse battery' });

    expect(response.status).toBe(201);
    await shutdown('SIGTERM');
  });

  it('enables organization creation', async () => {
    const { server, shutdown } = await start(DATABASE_URI);
    const { cookie } = await signUp(server, { origin: CLIENT_ORIGIN });

    const response = await request(server)
      .post('/api/v1/organizations')
      .set('Origin', CLIENT_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Acme', slug: 'acme' });

    expect(response.status).toBe(201);
    await shutdown('SIGTERM');
  });

  it('enables customer routes for organization members', async () => {
    const { server, shutdown } = await start(DATABASE_URI);
    const { cookie } = await signUp(server, { origin: CLIENT_ORIGIN });
    const created = await request(server)
      .post('/api/v1/organizations')
      .set('Origin', CLIENT_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Acme', slug: 'acme' });

    const response = await request(server)
      .post(`/api/v1/organizations/${created.body.organization.id}/customers`)
      .set('Origin', CLIENT_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Initech' });

    expect(response.status).toBe(201);
    await shutdown('SIGTERM');
  });

  it('enables order routes for organization members', async () => {
    const { server, shutdown } = await start(DATABASE_URI);
    const { cookie } = await signUp(server, { origin: CLIENT_ORIGIN });
    const created = await request(server)
      .post('/api/v1/organizations')
      .set('Origin', CLIENT_ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'Acme', slug: 'acme' });

    const response = await request(server).get(`/api/v1/organizations/${created.body.organization.id}/orders`).set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ orders: [] });
    await shutdown('SIGTERM');
  });

  it('does not start listening when the database connection fails', async () => {
    const database = fakeDatabase();
    database.connect.mockRejectedValue(new Error('connection refused'));
    const logs = captureLogger();

    await expect(start(DATABASE_URI, { database, logger: logs })).rejects.toThrow('connection refused');
    expect(logs.entries.map((entry) => entry.message)).not.toContain('server started');
  });

  it('closes the server before disconnecting, and only once', async () => {
    const database = fakeDatabase();
    const { server, shutdown } = await start(DATABASE_URI, { database });
    database.disconnect.mockImplementation(async () => {
      expect(server.listening).toBe(false);
    });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(server.listening).toBe(false);
    expect(database.disconnect).toHaveBeenCalledTimes(1);
  });

  it('never logs the connection string', async () => {
    const logs = captureLogger();
    const { server, shutdown } = await start(DATABASE_URI, { logger: logs });

    await request(server).get('/api/v1/ready');
    await shutdown('SIGTERM');

    await vi.waitFor(() => expect(logs.entries.some((entry) => entry.message === 'request completed')).toBe(true));
    expect(JSON.stringify(logs.entries)).not.toMatch(/pw-secret|db\.example\.com/);
  });
});

describe('startServer without a database', () => {
  it('runs with readiness that has no database check and authentication unavailable', async () => {
    const database = fakeDatabase();
    const logs = captureLogger();

    const { server, shutdown } = await start(null, { database, logger: logs });

    expect(database.connect).not.toHaveBeenCalled();
    expect(logs.entries[0].message).toBe('database disabled: MONGODB_URI is not set');

    const ready = await request(server).get('/api/v1/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', checks: {} });

    const me = await request(server).get('/api/v1/auth/me');
    expect(me.status).toBe(503);
    expect(me.body.error.code).toBe('AUTH_UNAVAILABLE');

    const organizations = await request(server)
      .post('/api/v1/organizations')
      .set('Origin', CLIENT_ORIGIN)
      .send({ name: 'Acme', slug: 'acme' });
    expect(organizations.status).toBe(503);
    expect(organizations.body.error.code).toBe('AUTH_UNAVAILABLE');

    const customers = await request(server).get(`/api/v1/organizations/${'a'.repeat(24)}/customers`);
    expect(customers.status).toBe(503);
    expect(customers.body.error.code).toBe('AUTH_UNAVAILABLE');

    const orders = await request(server).get(`/api/v1/organizations/${'a'.repeat(24)}/orders`);
    expect(orders.status).toBe(503);
    expect(orders.body.error.code).toBe('AUTH_UNAVAILABLE');

    await shutdown('SIGTERM');
    expect(database.disconnect).not.toHaveBeenCalled();
    expect(server.listening).toBe(false);
  });
});
