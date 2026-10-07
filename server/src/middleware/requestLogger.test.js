import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { captureLogger } from '../testing/captureLogger.js';

describe('request logging', () => {
  it('logs one structured entry per completed request', async () => {
    const logs = captureLogger();

    const response = await request(createApp({ logger: logs })).get('/api/v1/ready?verbose=1');

    await vi.waitFor(() => expect(logs.entries).toHaveLength(1));
    const [entry] = logs.entries;
    expect(Object.keys(entry).sort()).toEqual(
      ['durationMs', 'level', 'message', 'method', 'path', 'requestId', 'status'].sort(),
    );
    expect(entry).toMatchObject({
      level: 'info',
      message: 'request completed',
      requestId: response.headers['x-request-id'],
      method: 'GET',
      path: '/api/v1/ready',
      status: 200,
    });
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs failed requests with their status', async () => {
    const logs = captureLogger();

    await request(createApp({ logger: logs })).get('/missing');

    await vi.waitFor(() => expect(logs.entries).toHaveLength(1));
    expect(logs.entries[0]).toMatchObject({ path: '/missing', status: 404 });
  });

  it('never logs cookies, authorization headers, query strings or bodies', async () => {
    const logs = captureLogger();

    await request(createApp({ logger: logs }))
      .post('/api/v1/health?token=secret-query')
      .set('Cookie', 'session=secret-cookie')
      .set('Authorization', 'Bearer secret-token')
      .send({ password: 'secret-body' });

    await vi.waitFor(() => expect(logs.entries).toHaveLength(1));
    expect(JSON.stringify(logs.entries)).not.toMatch(/secret|password|cookie|authorization/i);
  });
});
