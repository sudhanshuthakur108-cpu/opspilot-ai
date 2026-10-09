import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { json, mockApi } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };

function mockServer(handlers = {}) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });
const waitingPanel = () => within(screen.getByRole('region', { name: 'Waiting for approval' }));

async function openApprovals() {
  const fetchMock = mockServer();
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'Approvals' }));
  await screen.findByRole('heading', { level: 1, name: 'Approvals' });
  return fetchMock;
}

beforeEach(() => {
  vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Approvals navigation', () => {
  it('opens from the sidebar as the current page, and Back returns to the dashboard', async () => {
    await openApprovals();

    expect(window.location.pathname).toBe('/approvals');
    expect(within(navigation()).getByRole('link', { name: 'Approvals' }).getAttribute('aria-current')).toBe('page');

    window.history.back();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('opens straight to approvals when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/approvals');
    mockServer();

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Approvals' })).toBeTruthy();
  });
});

describe('Approvals page', () => {
  it('says nothing is waiting, and why', async () => {
    await openApprovals();

    expect(waitingPanel().getByText('No approvals waiting')).toBeTruthy();
    expect(waitingPanel().getByText(/Approval requests will appear here when the AI Assistant can propose changes/)).toBeTruthy();
    expect(screen.getByText(/Today the AI Assistant has read-only access/)).toBeTruthy();
  });

  it('shows no approval records or actions, and asks the server for none', async () => {
    const fetchMock = await openApprovals();

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: /approve|reject/i })).toBeNull();
    expect(screen.getByRole('main').textContent).not.toMatch(/\d+ (pending|approvals?)/i);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/auth/me', '/api/v1/organizations']);
  });

  it('marks how approvals will work as planned, not as something that works today', async () => {
    await openApprovals();

    const howItWorks = within(screen.getByRole('region', { name: /How approvals will work/ }));
    expect(howItWorks.getByText('Planned')).toBeTruthy();
    expect(howItWorks.getAllByRole('listitem')).toHaveLength(3);
    expect(howItWorks.getByText('Only approved changes are applied')).toBeTruthy();
    expect(console.error).not.toHaveBeenCalled();
  });
});
