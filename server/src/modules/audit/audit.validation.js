import { HttpError } from '../../lib/httpError.js';

export const AUDIT_LOG_DEFAULT_LIMIT = 25;
export const AUDIT_LOG_MAX_LIMIT = 100;
// Pages are skipped in the database, so very deep pages are refused rather than scanned.
export const AUDIT_LOG_MAX_PAGE = 1000;

function readWholeNumber(value, label, { fallback, max }) {
  if (value === undefined) {
    return fallback;
  }

  const number = typeof value === 'string' && /^\d{1,7}$/.test(value) ? Number(value) : NaN;
  if (!(number >= 1 && number <= max)) {
    throw new HttpError(400, 'VALIDATION_FAILED', `${label} must be a whole number from 1 to ${max}`);
  }
  return number;
}

// Query: { page?, limit? }. Other parameters are ignored, including any organizationId: the
// organization always comes from the verified membership.
export function validateAuditLogQuery(query) {
  return {
    page: readWholeNumber(query?.page, 'Page', { fallback: 1, max: AUDIT_LOG_MAX_PAGE }),
    limit: readWholeNumber(query?.limit, 'Limit', { fallback: AUDIT_LOG_DEFAULT_LIMIT, max: AUDIT_LOG_MAX_LIMIT }),
  };
}
