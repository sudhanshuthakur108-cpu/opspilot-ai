import { HttpError } from '../../lib/httpError.js';
import { saveProposals } from '../approvals/approval.service.js';
import { PROPOSAL_TOOL_DEFINITIONS, isProposalTool, readProposal } from './ai.proposals.js';
import { AiToolError, TOOL_DEFINITIONS, runTool } from './ai.tools.js';

export const REPLY_MAX_LENGTH = 8000;
export const MAX_PROPOSALS_PER_MESSAGE = 3;

const describeTools = (tools) => tools.map(({ name, description, readOnly }) => ({ name, description, readOnly }));
const READ_ONLY_TOOLS = TOOL_DEFINITIONS;
const ALL_TOOLS = Object.freeze([...TOOL_DEFINITIONS, ...PROPOSAL_TOOL_DEFINITIONS]);

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

// What the model is told after a proposal is accepted, so it does not claim the change was made.
const PROPOSAL_ACCEPTED = Object.freeze({
  status: 'pending_approval',
  note: 'Saved for review. Nothing has been created or changed. An owner or admin must approve it on the Approvals page first.',
});

// Passes one message to the provider, for `organizationId` and `userId`, which must come from the
// verified membership: they are bound here, so nothing the provider or the request supplies can
// change them. The provider can run allowlisted read-only tools, and, when `approvalStores` is
// given ({ approvals, auditLogs, withTransaction }), propose changes. A proposal never runs: it is
// checked, and once the provider has answered, saved as a pending approval for a person to decide.
export async function askAssistant({ provider, stores, approvalStores }, { organizationId, userId }, { message }) {
  const tools = approvalStores ? ALL_TOOLS : READ_ONLY_TOOLS;
  const toolCalls = [];
  const proposals = [];

  async function runToolForOrganization(name, input) {
    if (!approvalStores || !isProposalTool(name)) {
      const result = await runTool(stores, organizationId, name, input);
      toolCalls.push({ name, readOnly: true });
      return result;
    }

    if (proposals.length >= MAX_PROPOSALS_PER_MESSAGE) {
      throw new AiToolError('PROPOSAL_LIMIT', `At most ${MAX_PROPOSALS_PER_MESSAGE} changes can be proposed per message`);
    }
    proposals.push(await readProposal(stores, organizationId, name, input));
    toolCalls.push({ name, readOnly: false });
    return PROPOSAL_ACCEPTED;
  }

  const { status, text } = readProviderResult(await provider.respond({ message, tools, runTool: runToolForOrganization }));

  // Saved only with a completed reply, so a failed request leaves no proposal behind.
  const saved =
    status === 'completed' && proposals.length > 0
      ? await saveProposals(approvalStores, { organizationId, requestedByUserId: userId }, proposals)
      : [];

  return {
    status,
    text,
    provider: provider.name,
    toolCalls,
    suggestedActions: saved.map((approval) => ({
      approvalId: approval.id,
      action: approval.action,
      status: approval.status,
      summary: approval.summary,
      parameters: approval.parameters,
    })),
    requiresApproval: saved.length > 0,
    availableTools: describeTools(tools),
  };
}
