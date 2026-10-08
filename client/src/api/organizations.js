import { apiRequest } from './client.js';

// The signed-in user's organizations, each with their role. The user comes from the session
// cookie on the server; nothing identifying the user is sent from here.
export async function listOrganizations() {
  const { organizations } = await apiRequest('/organizations');
  return organizations;
}

// Returns the new organization with the caller's role in it (always owner).
export async function createOrganization({ name, slug }) {
  const { organization, membership } = await apiRequest('/organizations', {
    method: 'POST',
    body: { name, slug },
  });
  return { ...organization, role: membership.role };
}
