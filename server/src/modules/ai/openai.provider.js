import OpenAI, { APIError } from 'openai';
import { HttpError } from '../../lib/httpError.js';
import { AiToolError } from './ai.tools.js';
import { ASSISTANT_INSTRUCTIONS } from './assistant.instructions.js';

// One message may call the model at most this many times: up to three rounds of tool calls, then
// a last round with tools switched off, so the model has to answer.
export const MAX_MODEL_ROUNDS = 4;
export const MAX_TOOL_CALLS = 6;
// Keeps each tool result, and so the whole conversation sent back to the model, bounded.
export const TOOL_OUTPUT_MAX_LENGTH = 20_000;
const MAX_OUTPUT_TOKENS = 4000;
const REQUEST_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 45_000;

const notConfigured = Object.freeze({
  name: 'openai',
  async respond() {
    return { status: 'not_configured' };
  },
});

const providerFailed = () => new HttpError(502, 'AI_PROVIDER_ERROR', 'The assistant could not produce a reply');
const providerUnavailable = () =>
  new HttpError(503, 'AI_PROVIDER_UNAVAILABLE', 'The assistant is unavailable right now. Try again shortly.');

// SDK errors can quote the request, so only their classification is logged and the client gets a
// fixed message. Rate limits, timeouts and network or server failures are worth retrying; anything
// else (a rejected key, an unknown model, a bad request) needs the configuration fixed.
function toProviderError(error, logger) {
  if (!(error instanceof APIError)) {
    return error;
  }

  logger.error('openai request failed', {
    error: { name: error.constructor.name, status: error.status, type: error.type, code: error.code },
  });
  const transient = error.status === undefined || error.status === 429 || error.status >= 500;
  return transient ? providerUnavailable() : providerFailed();
}

function outputText(response) {
  return response.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text)
    .join('');
}

// Drops the oldest records from the end of the list until the JSON fits.
function toToolOutput(records) {
  let shown = records;
  let output = JSON.stringify({ records: shown });
  while (output.length > TOOL_OUTPUT_MAX_LENGTH && shown.length > 0) {
    shown = shown.slice(0, -1);
    output = JSON.stringify({ records: shown, truncated: true });
  }
  return output;
}

// The only way a model's tool call reaches data: by name through `runTool`, which checks the name
// and input and is already bound to the caller's organization. A refused call is reported back to
// the model so it can answer without that data; any other failure ends the request.
async function runToolCall(runTool, call) {
  let input;
  try {
    input = call.arguments ? JSON.parse(call.arguments) : undefined;
  } catch {
    return JSON.stringify({ error: 'Tool arguments must be a JSON object' });
  }

  try {
    return toToolOutput(await runTool(call.name, input));
  } catch (error) {
    if (error instanceof AiToolError) {
      return JSON.stringify({ error: error.message });
    }
    throw error;
  }
}

// Answers through the OpenAI Responses API. Requests are not stored by OpenAI (`store: false`), so
// each round resends the conversation so far, including any reasoning items, in encrypted form.
// Without an API key the provider only reports that it is not configured. `client` is for tests.
export function createOpenAiProvider({ apiKey, model, logger, client }) {
  if (!apiKey) {
    return notConfigured;
  }
  const openai = client ?? new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });

  async function createResponse(body, signal) {
    try {
      return await openai.responses.create(body, { signal });
    } catch (error) {
      throw toProviderError(error, logger);
    }
  }

  return {
    name: 'openai',

    async respond({ message, tools, runTool }) {
      const functionTools = tools.map(({ name, description, parameters }) => ({
        type: 'function',
        name,
        description,
        parameters,
        strict: false,
      }));
      const input = [{ role: 'user', content: message }];
      const deadline = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
      let toolCallCount = 0;

      for (let round = 1; round <= MAX_MODEL_ROUNDS; round += 1) {
        const lastRound = round === MAX_MODEL_ROUNDS;
        const response = await createResponse(
          {
            model,
            instructions: ASSISTANT_INSTRUCTIONS,
            input: [...input],
            tools: functionTools,
            tool_choice: lastRound ? 'none' : 'auto',
            store: false,
            include: ['reasoning.encrypted_content'],
            max_output_tokens: MAX_OUTPUT_TOKENS,
          },
          deadline,
        );
        if (!Array.isArray(response?.output)) {
          throw providerFailed();
        }

        const calls = response.output.filter((item) => item.type === 'function_call');
        if (calls.length === 0) {
          if (response.status !== 'completed') {
            logger.error('openai response not completed', { status: response.status, reason: response.incomplete_details?.reason });
            throw providerFailed();
          }
          return { status: 'completed', text: outputText(response) };
        }

        toolCallCount += calls.length;
        if (lastRound || toolCallCount > MAX_TOOL_CALLS) {
          logger.error('openai tool call limit reached', { round, toolCallCount });
          throw providerFailed();
        }

        input.push(...response.output);
        for (const call of calls) {
          input.push({ type: 'function_call_output', call_id: call.call_id, output: await runToolCall(runTool, call) });
        }
      }
    },
  };
}
