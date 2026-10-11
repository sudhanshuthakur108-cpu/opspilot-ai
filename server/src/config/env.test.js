import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  const DEVELOPMENT_DEFAULTS = {
    nodeEnv: 'development',
    port: 3000,
    trustProxy: 0,
    clientOrigin: 'http://localhost:5173',
    database: { uri: null },
    auth: { jwtSecret: null },
    ai: { provider: 'development', openai: null },
  };

  it('uses development defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual(DEVELOPMENT_DEFAULTS);
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ NODE_ENV: '', PORT: '', MONGODB_URI: '', CLIENT_ORIGIN: '', JWT_SECRET: '', TRUST_PROXY: '' })).toEqual(
      DEVELOPMENT_DEFAULTS,
    );
  });

  it('reads valid values', () => {
    const jwtSecret = 'x'.repeat(32);

    expect(
      loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        CLIENT_ORIGIN: 'https://app.example.com',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/opspilot',
        JWT_SECRET: jwtSecret,
        TRUST_PROXY: '2',
      }),
    ).toEqual({
      nodeEnv: 'production',
      port: 8080,
      trustProxy: 2,
      clientOrigin: 'https://app.example.com',
      database: { uri: 'mongodb://127.0.0.1:27017/opspilot' },
      auth: { jwtSecret },
      ai: { provider: 'development', openai: null },
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

  it('stops production without TRUST_PROXY, even when everything else is valid', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://app.example.com',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/opspilot',
        JWT_SECRET: 'x'.repeat(32),
      }),
    ).toThrow(/^Invalid server configuration:\n- TRUST_PROXY is required when NODE_ENV is production/);
  });

  it('rejects a TRUST_PROXY that would trust any proxy chain', () => {
    expect(() => loadConfig({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY must be a whole number of proxies/);
  });

  it('reports every problem at once', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging', PORT: 'abc', MONGODB_URI: 'nope', AI_PROVIDER: 'gpt' })).toThrow(
      /NODE_ENV[\s\S]*PORT[\s\S]*MONGODB_URI[\s\S]*AI_PROVIDER/,
    );
  });

  it('reads the OpenAI settings when AI_PROVIDER is openai', () => {
    expect(loadConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-key', OPENAI_MODEL: 'gpt-5.4-nano' }).ai).toEqual({
      provider: 'openai',
      openai: { apiKey: 'sk-test-key', model: 'gpt-5.4-nano' },
    });
  });
});
