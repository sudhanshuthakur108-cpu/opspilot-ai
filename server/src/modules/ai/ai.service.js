import { HttpError } from '../../lib/httpError.js';
import { TOOL_DEFINITIONS, runTool } from './ai.tools.js';

export const REPLY_MAX_LENGTH = 8000;

const AVAILABLE_TOOLS = TOOL_DEFINITIONS.map(({ name, description, readOnly }) => ({ name, description, readOnly }));

// Provider output is untrusted, like request input: anything other than the two known shapes is
// treated as a provider failure.
function readProviderResult(result) {
  if (result?.status === 'not_configured') {
    return { status: 'not_configured', text: null };
  }

  const text = typeof result?.text === 'string' ? result.text.trim() : '';
  if (result?.status !== 'completed' || text.length === 0 || text.length > REPLY_MAX_LENGTH) {
    throw new HttpError(502, 'AI_PROVIDER_ERROR', 'The assistant could not produce a reply');
  }
  return { status: 'completed', text };
}

// Passes one message to the provider. The provider can only run allowlisted read-only tools, and
// only for `organizationId`, which must come from the verified membership: it is bound here, so
// nothing the provider or the request supplies can change it.
export async function askAssistant({ provider, stores }, organizationId, { message }) {
  const toolCalls = [];
  async function runToolForOrganization(name, input) {
    const result = await runTool(stores, organizationId, name, input);
    toolCalls.push({ name, readOnly: true });
    return result;
  }

  const { status, text } = readProviderResult(
    await provider.respond({ message, tools: TOOL_DEFINITIONS, runTool: runToolForOrganization }),
  );

  return {
    status,
    text,
    provider: provider.name,
    toolCalls,
    // Proposed data changes will be listed here, each needing a person's approval (planned).
    suggestedActions: [],
    requiresApproval: false,
    availableTools: AVAILABLE_TOOLS,
  };
}
