import { readWholeNumber } from '../../lib/query.js';

export const AUDIT_LOG_DEFAULT_LIMIT = 25;
export const AUDIT_LOG_MAX_LIMIT = 100;
// Pages are skipped in the database, so very deep pages are refused rather than scanned.
export const AUDIT_LOG_MAX_PAGE = 1000;

// Query: { page?, limit? }. Other parameters are ignored, including any organizationId: the
// organization always comes from the verified membership.
export function validateAuditLogQuery(query) {
  return {
    page: readWholeNumber(query?.page, 'Page', { fallback: 1, max: AUDIT_LOG_MAX_PAGE }),
    limit: readWholeNumber(query?.limit, 'Limit', { fallback: AUDIT_LOG_DEFAULT_LIMIT, max: AUDIT_LOG_MAX_LIMIT }),
  };
}
