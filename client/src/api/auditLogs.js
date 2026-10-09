import { apiRequest } from './client.js';

// One page of the organization's audit log, newest first: { auditLogs, page, limit, hasMore }.
// Only owners and admins may read it; the server checks the signed-in user's membership and role.
export async function listAuditLogs(organizationId, { page = 1 } = {}) {
  const query = page > 1 ? `?page=${page}` : '';
  return apiRequest(`/organizations/${encodeURIComponent(organizationId)}/audit-logs${query}`);
}
