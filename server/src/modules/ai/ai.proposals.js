import { HttpError } from '../../lib/httpError.js';
import { SUMMARY_MAX_LENGTH } from '../approvals/approval.model.js';
import { prepareProposal } from '../approvals/approval.service.js';
import { DESCRIPTION_MAX_LENGTH, TASK_PRIORITIES, TASK_STATUSES, TITLE_MAX_LENGTH } from '../tasks/task.model.js';
import { AiToolError } from './ai.tools.js';

// Tools a model can use to propose a change. Calling one changes nothing: the server checks the
// proposal and saves it as a pending approval, which only an owner or admin can approve (see
// modules/approvals). Each tool maps to one action in approval.actions.js.
const PROPOSAL_TOOLS = [
  {
    name: 'propose_create_task',
    action: 'create_task',
    description:
      'Propose a new task for a person to review. Nothing is created: the proposal waits on the Approvals page until an owner or admin approves or rejects it.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          maxLength: SUMMARY_MAX_LENGTH,
          description: 'One short sentence for the reviewer saying what the task is for.',
        },
        title: { type: 'string', maxLength: TITLE_MAX_LENGTH },
        description: { type: 'string', maxLength: DESCRIPTION_MAX_LENGTH },
        customerId: {
          type: 'string',
          description: 'ID of a customer exactly as returned by a tool. Leave it out when the task is not for a customer.',
        },
        orderId: {
          type: 'string',
          description: 'ID of an order exactly as returned by list_orders. Leave it out when the task is not for an order.',
        },
        priority: { type: 'string', enum: TASK_PRIORITIES },
        status: { type: 'string', enum: TASK_STATUSES },
        dueDate: { type: 'string', description: 'A calendar date as YYYY-MM-DD, only when the user gave one.' },
      },
      required: ['summary', 'title'],
      additionalProperties: false,
    },
  },
];

const PROPOSAL_TOOLS_BY_NAME = new Map(PROPOSAL_TOOLS.map((tool) => [tool.name, tool]));

// What a provider may be told about the proposal tools: plain data, never functions.
export const PROPOSAL_TOOL_DEFINITIONS = Object.freeze(
  PROPOSAL_TOOLS.map(({ name, description, parameters }) => Object.freeze({ name, description, readOnly: false, parameters })),
);

export function isProposalTool(name) {
  return typeof name === 'string' && PROPOSAL_TOOLS_BY_NAME.has(name);
}

// Checks a proposal a model asked for, for `organizationId`, which must come from the verified
// membership; any organization in the input is ignored. Returns { action, summary, parameters }
// ready to save. Input that fails validation, including links to records the organization does
// not have, is refused with an AiToolError so the provider can tell the model.
export async function readProposal(stores, organizationId, name, input) {
  const tool = PROPOSAL_TOOLS_BY_NAME.get(name);
  if (!tool) {
    throw new AiToolError('UNKNOWN_TOOL', 'There is no tool with this name');
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new AiToolError('INVALID_TOOL_INPUT', 'Tool input must be an object');
  }

  const { summary, ...parameters } = input;
  try {
    return await prepareProposal(stores, organizationId, { action: tool.action, summary, parameters });
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) {
      throw new AiToolError('INVALID_PROPOSAL', error.message);
    }
    throw error;
  }
}
