import { HttpError } from '../../lib/httpError.js';

export const MESSAGE_MAX_LENGTH = 2000;

// Body: { message: string }. Other fields are ignored, including any organizationId: the
// organization always comes from the route, checked against the caller's membership.
export function validateAssistantRequest(body) {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (message.length === 0 || message.length > MESSAGE_MAX_LENGTH) {
    throw new HttpError(400, 'VALIDATION_FAILED', `Message must be between 1 and ${MESSAGE_MAX_LENGTH} characters`);
  }
  return { message };
}
