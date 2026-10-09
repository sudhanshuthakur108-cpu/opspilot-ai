import { apiRequest } from './client.js';

// Sends one message to the organization's AI Assistant and returns the server's structured reply:
// { status, text, provider, toolCalls, suggestedActions, requiresApproval, availableTools,
// requestId }. Only the message is sent; the server takes the organization from the route and
// checks the signed-in user's membership.
export async function askAssistant(organizationId, message) {
  const { reply } = await apiRequest(`/organizations/${encodeURIComponent(organizationId)}/ai/assistant`, {
    method: 'POST',
    body: { message },
  });
  return reply;
}
