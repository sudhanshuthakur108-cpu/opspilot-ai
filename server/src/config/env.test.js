import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('uses development defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({ nodeEnv: 'development', port: 3000 });
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ NODE_ENV: '', PORT: '' })).toEqual({ nodeEnv: 'development', port: 3000 });
  });

  it('reads valid values', () => {
    expect(loadConfig({ NODE_ENV: 'production', PORT: '8080' })).toEqual({
      nodeEnv: 'production',
      port: 8080,
    });
  });

  it.each(['abc', '0', '70000', '30.5', '-1'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT must be a whole number between 1 and 65535/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV must be one of/);
  });

  it('reports every problem at once', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging', PORT: 'abc' })).toThrow(/NODE_ENV[\s\S]*PORT/);
  });
});
