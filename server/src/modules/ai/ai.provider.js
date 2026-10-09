import { developmentProvider } from './development.provider.js';
import { createOpenAiProvider } from './openai.provider.js';

// The provider named by AI_PROVIDER (see config/ai.js), which has already rejected unknown names.
export function createAiProvider({ provider, openai }, { logger }) {
  if (provider === 'development') {
    return developmentProvider;
  }
  if (provider === 'openai') {
    return createOpenAiProvider({ ...openai, logger });
  }
  throw new Error(`Unknown AI provider "${provider}"`);
}
