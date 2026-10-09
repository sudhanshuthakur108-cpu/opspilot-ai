import { readAiConfig } from './ai.js';
import { readAuthConfig } from './auth.js';
import { readDatabaseConfig } from './database.js';

const NODE_ENVS = ['development', 'test', 'production'];
const DEFAULT_PORT = 3000;

export function loadConfig(env = process.env) {
  const errors = [];

  const nodeEnv = env.NODE_ENV || 'development';
  if (!NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')} (got "${nodeEnv}")`);
  }

  const portValue = env.PORT || String(DEFAULT_PORT);
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || port < 1 || port > 65535) {
    errors.push(`PORT must be a whole number between 1 and 65535 (got "${portValue}")`);
  }

  const { database, errors: databaseErrors } = readDatabaseConfig(env, nodeEnv);
  errors.push(...databaseErrors);

  const {
    clientOrigin,
    auth,
    errors: authErrors,
  } = readAuthConfig(env, nodeEnv, { databaseEnabled: Boolean(database.uri) });
  errors.push(...authErrors);

  const { ai, errors: aiErrors } = readAiConfig(env);
  errors.push(...aiErrors);

  if (errors.length > 0) {
    throw new Error(`Invalid server configuration:\n- ${errors.join('\n- ')}`);
  }

  return Object.freeze({
    nodeEnv,
    port,
    clientOrigin,
    database: Object.freeze(database),
    auth: Object.freeze(auth),
    ai: Object.freeze(ai),
  });
}
