import { apiRequest } from './client.js';

const approvalsPath = (organizationId) => `/organizations/${encodeURIComponent(organizationId)}/approvals`;

// One page of the organization's approvals, newest first: { approvals, page, limit, hasMore }.
// `status` limits it to one status, such as "pending". Any member may list them.
export async function listApprovals(organizationId, { status, limit } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return apiRequest(query ? `${approvalsPath(organizationId)}?${query}` : approvalsPath(organizationId));
}

// Approves a pending approval; the server then runs the change it stored. Nothing is sent: the
// change cannot be altered here. Resolves to the updated approval, whose status says whether the
// change was made ("executed") or failed ("execution_failed"). Owners and admins only.
export async function approveApproval(organizationId, approvalId) {
  const { approval } = await apiRequest(`${approvalsPath(organizationId)}/${encodeURIComponent(approvalId)}/approve`, {
    method: 'POST',
  });
  return approval;
}

// Rejects a pending approval, with an optional reason. Owners and admins only.
export async function rejectApproval(organizationId, approvalId, reason) {
  const { approval } = await apiRequest(`${approvalsPath(organizationId)}/${encodeURIComponent(approvalId)}/reject`, {
    method: 'POST',
    body: { reason },
  });
  return approval;
}
