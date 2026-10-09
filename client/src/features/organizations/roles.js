export const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member' };

export const roleLabel = (role) => ROLE_LABELS[role] ?? role;

// Owners and admins may change workspace settings and read the audit log. This only decides what
// the page offers; the server enforces the same rule.
export const canManageWorkspace = (role) => role === 'owner' || role === 'admin';
