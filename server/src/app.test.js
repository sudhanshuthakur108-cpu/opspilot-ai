import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { captureLogger } from './testing/captureLogger.js';

const app = createApp({ logger: captureLogger() });

describe('GET /api/v1/health', () => {
  it('reports the process as alive', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('sends security headers and hides the framework', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('GET /api/v1/ready', () => {
  it('reports ready with no dependency checks yet', async () => {
    const response = await request(app).get('/api/v1/ready');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ status: 'ready', checks: {} });
  });
});

describe('unknown routes', () => {
  it('return a JSON 404 error with the request ID', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('return 404 for a method the route does not support', async () => {
    const response = await request(app).post('/api/v1/health').send({ ok: true });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('JSON request bodies', () => {
  it('rejects malformed JSON without echoing parser details', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body is not valid JSON',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it('rejects bodies over the 10 kB limit', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .send({ text: 'x'.repeat(11 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    });
  });

  it('rejects an unsupported charset', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
