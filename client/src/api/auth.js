import { ApiError, apiRequest } from './client.js';

// Returns the signed-in user, or null when there is no valid session.
export async function getCurrentUser() {
  try {
    const { user } = await apiRequest('/auth/me');
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function login({ email, password }) {
  const { user } = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
  return user;
}

export async function register({ name, email, password }) {
  const { user } = await apiRequest('/auth/register', { method: 'POST', body: { name, email, password } });
  return user;
}

export async function logout() {
  await apiRequest('/auth/logout', { method: 'POST' });
}
