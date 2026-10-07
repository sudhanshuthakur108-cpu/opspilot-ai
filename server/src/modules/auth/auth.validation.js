import { HttpError } from '../../lib/httpError.js';
import { EMAIL_FORMAT, EMAIL_MAX_LENGTH, normalizeEmail } from '../users/user.model.js';

export const PASSWORD_MIN_LENGTH = 8;
// Caps the hashing work a single request can cause; long passphrases still fit.
export const PASSWORD_MAX_LENGTH = 128;

function invalid(message) {
  return new HttpError(400, 'VALIDATION_FAILED', message);
}

function readEmail(body) {
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_FORMAT.test(email)) {
    throw invalid('Enter a valid email address');
  }
  return email;
}

// Body: { email: string, password: string }
export function validateRegistration(body) {
  const email = readEmail(body);
  const password = body.password;

  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw invalid(`Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`);
  }

  return { email, password };
}

// Body: { email: string, password: string }. Only the shape is checked, so tightening the
// registration rules later cannot lock out existing users.
export function validateLogin(body) {
  const email = readEmail(body);
  const password = body.password;

  if (typeof password !== 'string' || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    throw invalid('Enter your password');
  }

  return { email, password };
}
