import { Router } from 'express';
import { askAssistant } from './ai.service.js';
import { validateAssistantRequest } from './ai.validation.js';

// Mounted at /organizations/:organizationId/ai. `requireMembership` admits only members of that
// organization and sets `req.membership`, which is the only source of the organization.
// `provider` answers messages (see ai.provider.js); `customers`, `orders` and `tasks`
// are the stores its tools read from.
export function createAiRouter({ requireMembership, provider, customers, orders, tasks }) {
  const stores = { customers, orders, tasks };
  const router = Router({ mergeParams: true });

  // POST /assistant { message } → 200 { reply: { status, text, provider, toolCalls,
  // suggestedActions, requiresApproval, availableTools, requestId } }
  router.post('/assistant', requireMembership, async (req, res) => {
    const input = validateAssistantRequest(req.body);
    const reply = await askAssistant({ provider, stores }, req.membership.organizationId, input);

    res.set('Cache-Control', 'no-store').json({ reply: { ...reply, requestId: req.id } });
  });

  return router;
}
