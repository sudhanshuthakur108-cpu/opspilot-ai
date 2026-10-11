import { describe, expect, it } from 'vitest';
import config from './vercel.json';

// Vercel serves files from dist/ first, then tries these rewrites in order and uses the first match.
describe('vercel.json', () => {
  it('proxies the API to the backend before the single-page fallback', () => {
    const [api, ...rest] = config.rewrites;

    expect(api.source).toBe('/api/:path*');
    expect(api.destination).toMatch(/^https:\/\/[a-z0-9.-]+\/api\/:path\*$/i);
    expect(rest).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
  });

  it('sends the security headers on every path', () => {
    const [rule] = config.headers;
    const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));

    expect(rule.source).toBe('/(.*)');
    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    // The inline theme script in index.html runs only while no script policy is set; adding
    // default-src or script-src needs its hash (see docs/ARCHITECTURE.md, section 7).
    expect(headers['Content-Security-Policy']).not.toMatch(/default-src|script-src/);
  });
});
