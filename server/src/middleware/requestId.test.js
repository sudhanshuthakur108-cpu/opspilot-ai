import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { captureLogger } from '../testing/captureLogger.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const app = createApp({ logger: captureLogger() });

describe('request IDs', () => {
  it('generates a random UUID when none is sent', async () => {
    const first = await request(app).get('/api/v1/health');
    const second = await request(app).get('/api/v1/health');

    expect(first.headers['x-request-id']).toMatch(UUID);
    expect(second.headers['x-request-id']).toMatch(UUID);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('keeps a valid incoming request ID', async () => {
    const response = await request(app).get('/api/v1/health').set('X-Request-ID', 'trace-42_A.b');

    expect(response.headers['x-request-id']).toBe('trace-42_A.b');
  });

  it.each([
    ['too long', 'a'.repeat(65)],
    ['containing spaces', 'id with spaces'],
    ['containing markup', '<script>alert(1)</script>'],
    ['containing separators', 'abc;def,ghi'],
    ['empty', ''],
  ])('replaces an incoming ID that is %s', async (_, incoming) => {
    const response = await request(app).get('/api/v1/health').set('X-Request-ID', incoming);

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('uses the same ID in error responses', async () => {
    const response = await request(app).get('/nope').set('X-Request-ID', 'trace-404');

    expect(response.headers['x-request-id']).toBe('trace-404');
    expect(response.body.error.requestId).toBe('trace-404');
  });
});
