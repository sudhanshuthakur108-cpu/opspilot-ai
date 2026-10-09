import { listOrders } from '../orders/order.service.js';
import { listTasks } from '../tasks/task.service.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// A tool request the server refuses. Raised for a request an AI provider makes, so it is not an
// HttpError: a provider can report it back to the model, and if it ever reaches the error handler
// the client only sees a generic 500.
export class AiToolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiToolError';
    this.code = code;
  }
}

const LIST_PARAMETERS = Object.freeze({
  type: 'object',
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_LIMIT,
      description: `How many of the newest records to return (default ${DEFAULT_LIMIT})`,
    },
  },
  additionalProperties: false,
});

// Tool input comes from the model, so it is checked like a request body. Only `limit` is read;
// anything else, such as an organizationId, is ignored.
function readListInput(input) {
  if (input === undefined || input === null) {
    return { limit: DEFAULT_LIMIT };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new AiToolError('INVALID_TOOL_INPUT', 'Tool input must be an object');
  }

  const { limit = DEFAULT_LIMIT } = input;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new AiToolError('INVALID_TOOL_INPUT', `limit must be a whole number from 1 to ${MAX_LIMIT}`);
  }
  return { limit };
}

// The only operations an AI provider can ask the server to run. Each one goes through the
// organization-scoped stores and services the HTTP routes use. All of them only read: a tool that
// changes data must not run directly but become a proposal that a person approves (planned).
const TOOLS = [
  {
    name: 'list_customers',
    description: 'List the organization’s newest customers, with their email and phone when known.',
    readOnly: true,
    parameters: LIST_PARAMETERS,
    readInput: readListInput,
    run: ({ customers }, organizationId, { limit }) => customers.listForOrganization(organizationId, { limit }),
  },
  {
    name: 'list_orders',
    description: 'List the organization’s newest orders, with each order’s customer, status, amount and currency.',
    readOnly: true,
    parameters: LIST_PARAMETERS,
    readInput: readListInput,
    run: (stores, organizationId, { limit }) => listOrders(stores, organizationId, { limit }),
  },
  {
    name: 'list_tasks',
    description: 'List the organization’s newest tasks, with status, priority, due date and any linked customer or order.',
    readOnly: true,
    parameters: LIST_PARAMETERS,
    readInput: readListInput,
    run: (stores, organizationId, { limit }) => listTasks(stores, organizationId, { limit }),
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

// What a provider may be told about the tools: never the functions that run them.
export const TOOL_DEFINITIONS = Object.freeze(
  TOOLS.map(({ name, description, readOnly, parameters }) => Object.freeze({ name, description, readOnly, parameters })),
);

// Runs one allowlisted tool for `organizationId`, which must come from the verified membership.
// `stores` are { customers, orders, tasks }.
export async function runTool(stores, organizationId, name, input) {
  const tool = typeof name === 'string' ? TOOLS_BY_NAME.get(name) : undefined;
  if (!tool) {
    throw new AiToolError('UNKNOWN_TOOL', 'There is no tool with this name');
  }
  if (!tool.readOnly) {
    throw new AiToolError('APPROVAL_REQUIRED', 'This tool changes data and needs approval first');
  }

  return tool.run(stores, organizationId, tool.readInput(input));
}
