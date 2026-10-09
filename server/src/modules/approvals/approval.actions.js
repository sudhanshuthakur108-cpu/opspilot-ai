import { HttpError } from '../../lib/httpError.js';
import { createTask, findTaskLinks } from '../tasks/task.service.js';
import { validateNewTask } from '../tasks/task.validation.js';

// Task input as a proposal stores it: what the task API accepts, with the due date as "YYYY-MM-DD"
// and absent fields left out.
function toStoredTask({ title, description, status, priority, customerId, orderId, dueDate }) {
  const stored = { title, description, status, priority, customerId, orderId, dueDate: dueDate?.toISOString().slice(0, 10) };
  return Object.fromEntries(Object.entries(stored).filter(([, value]) => value !== undefined));
}

// Every action a proposal can ask for. Each one validates with the target module's own rules and
// runs through that module's service, so there is one implementation of each change.
//
// - prepare(stores, organizationId, parameters): checks the parameters, including that linked
//   records belong to the organization, and returns them in the form to store.
// - execute(stores, organizationId, parameters, { session }): checks the stored parameters again
//   and makes the change, returning the ID of the created resource (of type `resultType`).
//
// Nothing outside this file can add an action, and an AI provider never sees these functions.
const ACTIONS = {
  create_task: {
    resultType: 'task',
    async prepare(stores, organizationId, parameters) {
      const input = validateNewTask(parameters);
      await findTaskLinks(stores, organizationId, input);
      return toStoredTask(input);
    },
    async execute(stores, organizationId, parameters, { session }) {
      const task = await createTask(stores, organizationId, validateNewTask(parameters), { session });
      return task.id;
    },
  },
};

export const ACTION_NAMES = Object.freeze(Object.keys(ACTIONS));

// The action with this name. Any other name, including a prototype key like "__proto__", is
// refused.
export function getAction(name) {
  if (typeof name !== 'string' || !Object.hasOwn(ACTIONS, name)) {
    throw new HttpError(400, 'UNKNOWN_ACTION', 'This action is not supported');
  }
  return ACTIONS[name];
}
