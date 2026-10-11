import { describe, expect, it } from 'vitest';
import { readProxyConfig } from './proxy.js';

describe('readProxyConfig', () => {
  it.each(['development', 'test'])('trusts no proxy by default in %s', (nodeEnv) => {
    expect(readProxyConfig({}, nodeEnv)).toEqual({ trustProxy: 0, errors: [] });
    expect(readProxyConfig({ TRUST_PROXY: '' }, nodeEnv)).toEqual({ trustProxy: 0, errors: [] });
  });

  it('is required in production', () => {
    for (const env of [{}, { TRUST_PROXY: '' }]) {
      const { trustProxy, errors } = readProxyConfig(env, 'production');

      expect(trustProxy).toBeNull();
      expect(errors).toEqual(['TRUST_PROXY is required when NODE_ENV is production (the number of proxies in front of the app)']);
    }
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['5', 5],
  ])('reads TRUST_PROXY=%s as %i hops, in production too', (value, hops) => {
    expect(readProxyConfig({ TRUST_PROXY: value }, 'production')).toEqual({ trustProxy: hops, errors: [] });
    expect(readProxyConfig({ TRUST_PROXY: value }, 'development')).toEqual({ trustProxy: hops, errors: [] });
  });

  it.each(['true', 'false', 'yes', '6', '100', '-1', '1.5', ' 1', '1,2', 'loopback', '10.0.0.0/8'])(
    'rejects TRUST_PROXY=%s in every environment',
    (value) => {
      for (const nodeEnv of ['development', 'production']) {
        const { trustProxy, errors } = readProxyConfig({ TRUST_PROXY: value }, nodeEnv);

        expect(trustProxy).toBeNull();
        expect(errors).toEqual([`TRUST_PROXY must be a whole number of proxies from 0 to 5 (got "${value}")`]);
      }
    },
  );
});
