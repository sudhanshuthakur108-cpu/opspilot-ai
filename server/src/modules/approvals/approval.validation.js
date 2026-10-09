import mongoose from 'mongoose';
import { HttpError } from '../../lib/httpError.js';
import { readWholeNumber } from '../../lib/query.js';
import { APPROVAL_STATUSES, REJECTION_REASON_MAX_LENGTH } from './approval.model.js';

export const APPROVAL_DEFAULT_LIMIT = 20;
export const APPROVAL_MAX_LIMIT = 50;
// Pages are skipped in the database, so very deep pages are refused rather than scanned.
export const APPROVAL_MAX_PAGE = 1000;

const invalid = (message) => new HttpError(400, 'VALIDATION_FAILED', message);

// Query: { status?, page?, limit? }. Other parameters are ignored, including any organizationId:
// the organization always comes from the verified membership.
export function validateApprovalQuery(query) {
  const status = query?.status;
  if (status !== undefined && !APPROVAL_STATUSES.includes(status)) {
    throw invalid(`Status must be one of ${APPROVAL_STATUSES.join(', ')}`);
  }

  return {
    status,
    page: readWholeNumber(query?.page, 'Page', { fallback: 1, max: APPROVAL_MAX_PAGE }),
    limit: readWholeNumber(query?.limit, 'Limit', { fallback: APPROVAL_DEFAULT_LIMIT, max: APPROVAL_MAX_LIMIT }),
  };
}

export function validateApprovalId(approvalId) {
  if (!mongoose.isObjectIdOrHexString(approvalId)) {
    throw invalid('Approval ID is not valid');
  }
  return approvalId;
}

// Body: { reason? }, trimmed, at most 200 characters; a missing, null or blank reason is no reason.
// Other fields are ignored, so the reviewer, actor and status always come from the server.
export function validateRejection(body) {
  const reason = body?.reason;
  if (reason === undefined || reason === null) {
    return { reason: undefined };
  }
  if (typeof reason !== 'string') {
    throw invalid('Reason must be text');
  }

  const trimmed = reason.trim();
  if (trimmed.length > REJECTION_REASON_MAX_LENGTH) {
    throw invalid(`Reason must be at most ${REJECTION_REASON_MAX_LENGTH} characters`);
  }
  return { reason: trimmed || undefined };
}
