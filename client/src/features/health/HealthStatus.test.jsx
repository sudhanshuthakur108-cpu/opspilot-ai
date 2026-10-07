import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HealthStatus from './HealthStatus.jsx';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HealthStatus', () => {
  it('shows a loading state while the request is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    render(<HealthStatus />);

    expect(screen.getByRole('status').textContent).toBe('Checking…');
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/health$/), expect.any(Object));
  });

  it('shows healthy when the API responds with status ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' })));

    render(<HealthStatus />);

    expect(await screen.findByText('Healthy')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('shows the HTTP status when the API responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));

    render(<HealthStatus />);

    expect(await screen.findByText('Unavailable')).toBeTruthy();
    expect(screen.getByText(/The API responded with HTTP 503/)).toBeTruthy();
  });

  it('treats an unexpected response body as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 })));

    render(<HealthStatus />);

    expect(await screen.findByText(/unexpected response/)).toBeTruthy();
  });

  it('recovers when the user checks again after a network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<HealthStatus />);

    expect(await screen.findByText(/Is the server running\?/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

    expect(screen.getByRole('status').textContent).toBe('Checking…');
    expect(await screen.findByText('Healthy')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
