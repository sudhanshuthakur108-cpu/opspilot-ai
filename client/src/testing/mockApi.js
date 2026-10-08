import { vi } from 'vitest';

export function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function apiError(status, code) {
  return json(status, { error: { code, message: `server message for ${code}`, requestId: 'test-request' } });
}

// Stubs fetch with handlers keyed by "METHOD path". Unexpected requests fail the test.
export function mockApi(handlers) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function requestsTo(fetchMock, method, url) {
  return fetchMock.mock.calls.filter(([calledUrl, init = {}]) => calledUrl === url && (init.method ?? 'GET') === method);
}
