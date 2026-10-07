import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('uses development defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({ nodeEnv: 'development', port: 3000, database: { uri: null } });
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ NODE_ENV: '', PORT: '', MONGODB_URI: '' })).toEqual({
      nodeEnv: 'development',
      port: 3000,
      database: { uri: null },
    });
  });

  it('reads valid values', () => {
    expect(
      loadConfig({ NODE_ENV: 'production', PORT: '8080', MONGODB_URI: 'mongodb://127.0.0.1:27017/opspilot' }),
    ).toEqual({
      nodeEnv: 'production',
      port: 8080,
      database: { uri: 'mongodb://127.0.0.1:27017/opspilot' },
    });
  });

  it.each(['abc', '0', '70000', '30.5', '-1'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT must be a whole number between 1 and 65535/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV must be one of/);
  });

  it('includes database problems', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/MONGODB_URI is required/);
  });

  it('reports every problem at once', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging', PORT: 'abc', MONGODB_URI: 'nope' })).toThrow(
      /NODE_ENV[\s\S]*PORT[\s\S]*MONGODB_URI/,
    );
  });
});
