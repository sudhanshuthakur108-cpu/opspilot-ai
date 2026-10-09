import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENAI_MODEL, readAiConfig } from './ai.js';

const KEY = 'sk-test-not-a-real-key-1234567890';

describe('readAiConfig', () => {
  it.each([
    ['nothing is set', {}],
    ['AI_PROVIDER is empty', { AI_PROVIDER: '' }],
    ['AI_PROVIDER is development', { AI_PROVIDER: 'development' }],
  ])('uses the development provider when %s', (_, env) => {
    expect(readAiConfig(env)).toEqual({ ai: { provider: 'development', openai: null }, errors: [] });
  });

  it('ignores OpenAI settings unless AI_PROVIDER is openai', () => {
    expect(readAiConfig({ OPENAI_API_KEY: KEY, OPENAI_MODEL: 'gpt-5.4-nano' })).toEqual({
      ai: { provider: 'development', openai: null },
      errors: [],
    });
  });

  it('reads the key and model for the OpenAI provider', () => {
    expect(readAiConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: KEY, OPENAI_MODEL: 'gpt-5.4-nano' })).toEqual({
      ai: { provider: 'openai', openai: { apiKey: KEY, model: 'gpt-5.4-nano' } },
      errors: [],
    });
  });

  it('defaults the model to a small, low-latency one', () => {
    expect(readAiConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: KEY }).ai.openai.model).toBe(DEFAULT_OPENAI_MODEL);
    expect(DEFAULT_OPENAI_MODEL).toBe('gpt-5.4-mini');
  });

  it.each([
    ['missing', {}],
    ['empty', { OPENAI_API_KEY: '' }],
  ])('accepts the OpenAI provider with the key %s, as not configured rather than an error', (_, env) => {
    expect(readAiConfig({ AI_PROVIDER: 'openai', ...env })).toEqual({
      ai: { provider: 'openai', openai: { apiKey: null, model: DEFAULT_OPENAI_MODEL } },
      errors: [],
    });
  });

  it.each(['gpt', 'OpenAI', 'mock', 'anthropic'])('rejects AI_PROVIDER=%s', (provider) => {
    const { errors } = readAiConfig({ AI_PROVIDER: provider, OPENAI_API_KEY: KEY });

    expect(errors).toEqual([`AI_PROVIDER must be one of development, openai (got "${provider}")`]);
    expect(errors.join('')).not.toContain(KEY);
  });
});
