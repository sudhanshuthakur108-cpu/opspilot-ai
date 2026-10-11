import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

// Runs the real entry point with only the variables given here.
function runServer(env, { timeout = 10_000 } = {}) {
  return spawnSync(process.execPath, ['src/server.js'], {
    cwd: SERVER_DIR,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    encoding: 'utf8',
    timeout,
  });
}

describe('server entry point', () => {
  it('exits with status 1 when production has no database configured', () => {
    const result = runServer({ NODE_ENV: 'production' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MONGODB_URI is required when NODE_ENV is production');
    expect(result.stderr).toContain('TRUST_PROXY is required when NODE_ENV is production');
    expect(result.stdout).not.toContain('server started');
  });

  it('exits with status 1 for a malformed URI without printing it', () => {
    const result = runServer({ NODE_ENV: 'production', MONGODB_URI: 'postgres://app-user:pw-secret@db.example.com/x' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MONGODB_URI must be a connection string');
    expect(result.stdout + result.stderr).not.toMatch(/pw-secret|db\.example\.com/);
  });

  // Waits out the 10-second server selection timeout, so it gets a longer limit.
  it('logs why each database server was unreachable, without the credentials', { timeout: 30_000 }, () => {
    const result = runServer(
      { MONGODB_URI: 'mongodb://app-user:pw-secret@127.0.0.1:1/opspilot', JWT_SECRET: 'x'.repeat(32) },
      { timeout: 25_000 },
    );

    expect(result.status).toBe(1);
    const failure = JSON.parse(result.stderr.split('\n').find((line) => line.includes('"startup failed"')));
    expect(failure.error.name).toBe('MongooseServerSelectionError');
    expect(failure.error.servers).toEqual([
      { address: '127.0.0.1:1', type: 'Unknown', error: { name: 'MongoNetworkError', message: expect.any(String) } },
    ]);
    expect(result.stdout + result.stderr).not.toContain('pw-secret');
  });
});
