import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../../lib/httpError.js';
import { askAssistant } from './ai.service.js';
import { validateAssistantRequest } from './ai.validation.js';

// Assistant messages allowed per user in each window. With the OpenAI provider every message can
// make several paid model calls, so this caps what one account can spend.
export const MESSAGE_LIMIT = 20;
export const MESSAGE_WINDOW_MS = 15 * 60 * 1000;

// Mounted at /organizations/:organizationId/ai. `requireMembership` admits only members of that
// organization and sets `req.membership`, which is the only source of the organization and user.
// `provider` answers messages (see ai.provider.js); `customers`, `orders` and `tasks` are the
// stores its tools read from. With `approvalStores` ({ approvals, auditLogs, withTransaction }),
// the assistant can also propose changes for approval; without them it only reads.
export function createAiRouter({ requireMembership, provider, customers, orders, tasks, approvalStores }) {
  const stores = { customers, orders, tasks };
  const router = Router({ mergeParams: true });

  // Counted per signed-in user rather than per IP, so it does not depend on TRUST_PROXY and users
  // behind one address do not share a limit. Runs after the membership check, so requests that are
  // refused there never count. The store is in memory: counts are per instance and reset on restart.
  const limitMessages = rateLimit({
    windowMs: MESSAGE_WINDOW_MS,
    limit: MESSAGE_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.membership.userId,
    handler: (req, res, next) =>
      next(new HttpError(429, 'RATE_LIMITED', 'Too many assistant messages. Try again later.')),
  });

  // POST /assistant { message } → 200 { reply: { status, text, provider, toolCalls,
  // suggestedActions, requiresApproval, availableTools, requestId } }
  router.post('/assistant', requireMembership, limitMessages, async (req, res) => {
    const input = validateAssistantRequest(req.body);
    const { organizationId, userId } = req.membership;
    const reply = await askAssistant({ provider, stores, approvalStores }, { organizationId, userId }, input);

    res.set('Cache-Control', 'no-store').json({ reply: { ...reply, requestId: req.id } });
  });

  return router;
}
