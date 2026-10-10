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

// Changes the signed-in user's own name and returns the user as the server saved it.
export async function updateProfile({ name }) {
  const { user } = await apiRequest('/auth/me', { method: 'PATCH', body: { name } });
  return user;
}

export async function logout() {
  await apiRequest('/auth/logout', { method: 'POST' });
}
