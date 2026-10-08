import { HttpError } from '../../lib/httpError.js';
import { EMAIL_FORMAT, EMAIL_MAX_LENGTH, normalizeEmail } from '../users/user.model.js';
import { NAME_MAX_LENGTH, PHONE_MAX_LENGTH } from './customer.model.js';

function invalid(message) {
  return new HttpError(400, 'VALIDATION_FAILED', message);
}

// Missing, null and blank all mean "not given"; anything other than a string is rejected.
function readOptionalText(value, field) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw invalid(`${field} must be text`);
  }
  return value.trim() || undefined;
}

// Body: { name: string, email?: string, phone?: string }. Other fields are ignored, including
// any organizationId: the organization always comes from the route, checked against the
// caller's membership. Applies the model's rules so requests fail here rather than in the database.
export function validateNewCustomer(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    throw invalid(`Name must be between 1 and ${NAME_MAX_LENGTH} characters`);
  }

  let email = readOptionalText(body.email, 'Email');
  if (email !== undefined) {
    email = normalizeEmail(email);
    if (email.length > EMAIL_MAX_LENGTH || !EMAIL_FORMAT.test(email)) {
      throw invalid('Enter a valid email address');
    }
  }

  const phone = readOptionalText(body.phone, 'Phone');
  if (phone !== undefined && phone.length > PHONE_MAX_LENGTH) {
    throw invalid(`Phone must be at most ${PHONE_MAX_LENGTH} characters`);
  }

  return { name, email, phone };
}
