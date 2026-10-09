export const AI_PROVIDERS = Object.freeze(['development', 'openai']);
// A small, low-latency model; set OPENAI_MODEL to use another.
export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';

// The OpenAI settings are only read when AI_PROVIDER=openai. A missing key is not an error: the
// assistant then replies that it is not configured, so the app stays usable without one. Error
// messages never include the key.
export function readAiConfig(env) {
  const errors = [];

  const provider = env.AI_PROVIDER || 'development';
  if (!AI_PROVIDERS.includes(provider)) {
    errors.push(`AI_PROVIDER must be one of ${AI_PROVIDERS.join(', ')} (got "${provider}")`);
  }

  const openai =
    provider === 'openai'
      ? Object.freeze({ apiKey: env.OPENAI_API_KEY || null, model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL })
      : null;

  return { ai: { provider, openai }, errors };
}
