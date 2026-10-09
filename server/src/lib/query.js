import { HttpError } from './httpError.js';

// A whole number from 1 to `max` in a query string, or `fallback` when the parameter is absent.
export function readWholeNumber(value, label, { fallback, max }) {
  if (value === undefined) {
    return fallback;
  }

  const number = typeof value === 'string' && /^\d{1,7}$/.test(value) ? Number(value) : NaN;
  if (!(number >= 1 && number <= max)) {
    throw new HttpError(400, 'VALIDATION_FAILED', `${label} must be a whole number from 1 to ${max}`);
  }
  return number;
}
