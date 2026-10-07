const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export async function fetchHealth({ signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/health`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Could not connect to the API. Is the server running?');
  }

  if (!response.ok) {
    throw new Error(`The API responded with HTTP ${response.status}.`);
  }

  const body = await response.json().catch(() => null);
  if (body?.status !== 'ok') {
    throw new Error('The API returned an unexpected response.');
  }

  return body;
}
