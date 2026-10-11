// The most proxies TRUST_PROXY may name. A sanity bound against typos and "trust everything"
// values, not a recommendation: the right number is the real proxy chain, measured after deploying.
export const MAX_TRUST_PROXY_HOPS = 5;

// TRUST_PROXY is the number of proxies in front of the app, so Express can take the client's IP
// from that many X-Forwarded-For entries (counted from the right) and no further. 0 trusts none,
// and is the default outside production, where the app runs without a proxy. Production must set
// it explicitly: guessing too low makes every client share one rate-limit key, and guessing too
// high lets clients choose their own IP. `true` is refused because it trusts any chain at all.
export function readProxyConfig(env, nodeEnv) {
  const value = env.TRUST_PROXY || null;

  if (value === null) {
    return nodeEnv === 'production'
      ? { trustProxy: null, errors: ['TRUST_PROXY is required when NODE_ENV is production (the number of proxies in front of the app)'] }
      : { trustProxy: 0, errors: [] };
  }

  const hops = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(hops >= 0 && hops <= MAX_TRUST_PROXY_HOPS)) {
    return {
      trustProxy: null,
      errors: [`TRUST_PROXY must be a whole number of proxies from 0 to ${MAX_TRUST_PROXY_HOPS} (got "${value}")`],
    };
  }

  return { trustProxy: hops, errors: [] };
}
