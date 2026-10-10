import { HttpError } from '../../lib/httpError.js';
import { EMAIL_FORMAT, EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, NAME_MIN_LENGTH, normalizeEmail, normalizeName } from '../users/user.model.js';

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

// Any script and common punctuation (spaces, hyphens, apostrophes, periods) are fine. A name
// needs at least one letter and no control characters.
function readName(body) {
  const name = typeof body?.name === 'string' ? normalizeName(body.name) : '';
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH || !/\p{L}/u.test(name) || /\p{Cc}/u.test(name)) {
    throw invalid(`Enter your name, ${NAME_MIN_LENGTH} to ${NAME_MAX_LENGTH} characters`);
  }
  return name;
}

// Body: { name: string, email: string, password: string }
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

  return { name: readName(body), email, password };
}

// Body: { name: string }. Only the name can change here, so any other field (an email, an ID,
// a role) is refused rather than ignored: a client sending one expects something to happen
// that will not. The account is always the signed-in user's.
export function validateProfileChanges(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('Send the changes as a JSON object');
  }
  const unexpected = Object.keys(body).filter((key) => key !== 'name');
  if (unexpected.length > 0) {
    throw invalid('Only your name can be changed');
  }
  return { name: readName(body) };
}

// Body: { email: string, password: string }. Only the shape is checked, so tightening the
// registration rules later (such as requiring a name) cannot lock out existing users.
export function validateLogin(body) {
  const email = readEmail(body);
  const password = body.password;

  if (typeof password !== 'string' || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    throw invalid('Enter your password');
  }

  return { email, password };
}
