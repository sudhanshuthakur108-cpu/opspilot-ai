export const DEFAULT_CLIENT_ORIGIN = 'http://localhost:5173';

// HS256 keys should be at least 256 bits.
const MIN_JWT_SECRET_LENGTH = 32;

function isOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

// Authentication needs the database, so JWT_SECRET is only required (and only read)
// when MONGODB_URI is set. Errors never include the secret.
export function readAuthConfig(env, nodeEnv, { databaseEnabled }) {
  const errors = [];

  const clientOrigin = env.CLIENT_ORIGIN || (nodeEnv === 'production' ? null : DEFAULT_CLIENT_ORIGIN);
  if (!clientOrigin) {
    errors.push('CLIENT_ORIGIN is required when NODE_ENV is production');
  } else if (!isOrigin(clientOrigin)) {
    errors.push(`CLIENT_ORIGIN must be an origin like https://app.example.com, with no path (got "${clientOrigin}")`);
  } else if (nodeEnv === 'production' && !clientOrigin.startsWith('https://')) {
    errors.push('CLIENT_ORIGIN must use https in production');
  }

  const jwtSecret = databaseEnabled ? env.JWT_SECRET || null : null;
  if (databaseEnabled && (!jwtSecret || jwtSecret.length < MIN_JWT_SECRET_LENGTH)) {
    errors.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters when MONGODB_URI is set`);
  }

  return { clientOrigin, auth: { jwtSecret }, errors };
}
