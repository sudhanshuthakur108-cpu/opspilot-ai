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

// Tool results go to an outside AI service, so each record is reduced to an explicit list of fields.
// A field added to a store later is not sent until it is added here.
const pick = (fields) => (records) => records.map((record) => Object.fromEntries(fields.map((field) => [field, record[field] ?? null])));
const toCustomers = pick(['id', 'name', 'email', 'phone', 'createdAt']);
const toOrders = pick(['id', 'customerId', 'customerName', 'description', 'status', 'totalAmount', 'currency', 'createdAt']);
const toTasks = pick(['id', 'title', 'description', 'status', 'priority', 'dueDate', 'customerId', 'customerName', 'orderId', 'orderDescription', 'createdAt']);

// The only operations an AI provider can ask the server to run. Each one goes through the
// organization-scoped stores and services the HTTP routes use. All of them only read: a change is
// never run by a tool, only proposed (see ai.proposals.js) for a person to approve.
const TOOLS = [
  {
    name: 'list_customers',
    description: 'List the organization’s newest customers, with their email and phone when known.',
    readOnly: true,
    parameters: LIST_PARAMETERS,
    readInput: readListInput,
    run: async ({ customers }, organizationId, { limit }) => toCustomers(await customers.listForOrganization(organizationId, { limit })),
  },
  {
    name: 'list_orders',
    description: 'List the organization’s newest orders, with each order’s customer, status, amount and currency.',
    readOnly: true,
    parameters: LIST_PARAMETERS,
    readInput: readListInput,
    run: async (stores, organizationId, { limit }) => toOrders(await listOrders(stores, organizationId, { limit })),
  },
  {
    name: 'list_tasks',
    description: 'List the organization’s newest tasks, with status, priority, due date and any linked customer or order.',
    readOnly: true,
    parameters: LIST_PARAMETERS,
    readInput: readListInput,
    run: async (stores, organizationId, { limit }) => toTasks(await listTasks(stores, organizationId, { limit })),
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
