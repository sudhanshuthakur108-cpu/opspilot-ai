import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errors.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('errorHandler', () => {
  it('hides details of unexpected errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockResponse();

    errorHandler(new Error('database password is wrong'), {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
  });

  it('passes through client errors that are safe to expose', () => {
    const res = mockResponse();
    const error = Object.assign(new Error('request entity too large'), { status: 413, expose: true });

    errorHandler(error, {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_REQUEST', message: 'request entity too large' },
    });
  });
});
