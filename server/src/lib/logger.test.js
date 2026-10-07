import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('writes info entries as one JSON line on stdout', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('request completed', { requestId: 'abc', status: 200 });

    expect(log).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(log.mock.calls[0][0]);
    expect(entry).toEqual({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      level: 'info',
      message: 'request completed',
      requestId: 'abc',
      status: 200,
    });
  });

  it('writes error entries on stderr', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('request failed', { requestId: 'abc' });

    expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({ level: 'error', requestId: 'abc' });
  });
});
