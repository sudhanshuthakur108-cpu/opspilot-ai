import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../lib/httpError.js';
import { captureLogger } from '../testing/captureLogger.js';
import { createErrorHandler } from './errors.js';
import { requestId } from './requestId.js';

function appThatFailsWith(error) {
  const logs = captureLogger();
  const app = express();

  app.use(requestId);
  app.get('/sync', () => {
    throw error;
  });
  app.get('/async', async () => {
    throw error;
  });
  app.use(createErrorHandler(logs));

  return { app, logs };
}

describe('centralized error handler', () => {
  it.each(['/sync', '/async'])('hides unexpected errors thrown from %s handlers', async (path) => {
    const error = new Error('connect failed for mongodb://admin:hunter2@db.internal');
    const { app, logs } = appThatFailsWith(error);

    const response = await request(app).get(path);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.text).not.toMatch(/hunter2|mongodb|stack|\.js/);

    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0]).toMatchObject({
      level: 'error',
      message: 'request failed',
      requestId: response.headers['x-request-id'],
      error: { name: 'Error', message: 'connect failed for mongodb://[redacted]' },
    });
    expect(logs.entries[0].error.stack).toContain('Error: connect failed');
    expect(JSON.stringify(logs.entries)).not.toContain('hunter2');
  });

  it('sends the code and message of an HttpError without logging it', async () => {
    const { app, logs } = appThatFailsWith(new HttpError(409, 'EMAIL_TAKEN', 'Email is already registered'));

    const response = await request(app).get('/sync');

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'EMAIL_TAKEN', message: 'Email is already registered' });
    expect(logs.entries).toHaveLength(0);
  });

  it('replaces the message of other client errors with a generic one', async () => {
    const error = Object.assign(new Error('internal detail from a dependency'), { status: 403 });
    const { app } = appThatFailsWith(error);

    const response = await request(app).get('/sync');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'The request could not be processed',
    });
    expect(response.text).not.toContain('internal detail');
  });
});
