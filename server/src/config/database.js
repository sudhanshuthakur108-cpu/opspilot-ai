const MONGODB_URI_FORMAT = /^mongodb(\+srv)?:\/\/\S+$/;

// The database is optional in development and test so the app runs without credentials,
// but production must have one. Error messages never include the URI: it usually holds a password.
export function readDatabaseConfig(env, nodeEnv) {
  const uri = env.MONGODB_URI || null;
  const errors = [];

  if (!uri && nodeEnv === 'production') {
    errors.push('MONGODB_URI is required when NODE_ENV is production');
  } else if (uri && !MONGODB_URI_FORMAT.test(uri)) {
    errors.push('MONGODB_URI must be a connection string starting with mongodb:// or mongodb+srv://');
  }

  return { database: { uri }, errors };
}
