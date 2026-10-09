import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { json, mockApi } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };
const GLOBEX = { id: 'c'.repeat(24), name: 'Globex', slug: 'globex', role: 'member', createdAt: '2026-10-01T09:00:00.000Z' };

async function renderDashboard({ organizations = [ACME], ...handlers } = {}) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations }),
    ...handlers,
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return fetchMock;
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });
const menuButton = () => screen.getByRole('button', { name: 'Open navigation' });

beforeEach(() => {
  vi.spyOn(Storage.prototype, 'setItem');
  vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dashboard', () => {
  it('shows the page, the organization and the signed-in user in the header', async () => {
    await renderDashboard();

    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(header.getByText('Acme Logistics')).toBeTruthy();
    expect(header.getByText(USER.email)).toBeTruthy();
    expect(header.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Welcome back, ada' })).toBeTruthy();
  });

  it('shows the first organization and the user’s role in it when they belong to several', async () => {
    await renderDashboard({ organizations: [GLOBEX, ACME] });

    expect(within(screen.getByRole('banner')).getByText('Globex')).toBeTruthy();
    expect(screen.getByText('Member')).toBeTruthy();
    expect(screen.queryByText('Acme Logistics')).toBeNull();
  });

  it('marks Dashboard as the current page', async () => {
    await renderDashboard();

    const link = within(navigation()).getByRole('link', { name: 'Dashboard' });
    expect(link.getAttribute('aria-current')).toBe('page');
    // Already on the dashboard, so following the link does not reload the page.
    expect(fireEvent.click(link)).toBe(false);
  });

  it('links every section, with none marked as coming soon', async () => {
    await renderDashboard();

    expect(within(navigation()).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Dashboard', '/'],
      ['Customers', '/customers'],
      ['Orders', '/orders'],
      ['Tasks', '/tasks'],
      ['AI Assistant', '/assistant'],
      ['Approvals', '/approvals'],
      ['Audit Logs', '/audit-logs'],
      ['Settings', '/settings'],
    ]);
    expect(within(navigation()).queryByText('Soon')).toBeNull();
    expect(within(navigation()).queryAllByRole('button')).toHaveLength(0);
  });

  it.each([
    ['Customers', 'View customers', '/customers', /no customers/i],
    ['Orders', 'View orders', '/orders', /no orders/i],
    ['Tasks', 'View tasks', '/tasks', /no tasks/i],
  ])('points to the %s page instead of claiming it is empty', async (title, linkName, href, emptyClaim) => {
    await renderDashboard();
    const card = within(screen.getByRole('main')).getByRole('heading', { level: 3, name: title }).closest('li');

    expect(within(card).queryByText(emptyClaim)).toBeNull();
    expect(within(card).getByRole('link', { name: linkName }).getAttribute('href')).toBe(href);
  });

  it('points recent activity to the audit log instead of showing data', async () => {
    await renderDashboard();
    const activity = within(screen.getByRole('region', { name: 'Recent activity' }));

    expect(activity.getByText('Activity is kept in the audit log')).toBeTruthy();
    expect(activity.queryByText('No activity yet')).toBeNull();
    expect(activity.getByRole('link', { name: 'View audit log' }).getAttribute('href')).toBe('/audit-logs');
  });

  it('does not offer the audit log to a member, who cannot view it', async () => {
    await renderDashboard({ organizations: [GLOBEX] });
    const activity = within(screen.getByRole('region', { name: 'Recent activity' }));

    expect(activity.getByText(/Owners and admins can review them/)).toBeTruthy();
    expect(activity.queryByRole('link')).toBeNull();
  });

  it('links to the AI Assistant, saying its changes need approval and without claiming it can change anything', async () => {
    await renderDashboard();

    const card = within(screen.getByRole('main')).getByRole('heading', { level: 3, name: 'AI Assistant' }).closest('li');
    expect(within(card).getByText('Changes need approval')).toBeTruthy();
    expect(card.textContent).toContain('It can read your records and propose new tasks, but it can’t change anything until an owner or admin approves.');
    expect(within(card).getByRole('link', { name: 'Open AI Assistant' }).getAttribute('href')).toBe('/assistant');
  });

  it('shows no figures, since there are no records yet', async () => {
    await renderDashboard();

    expect(screen.getByRole('main').textContent).not.toMatch(/\d/);
  });

  it('identifies the user only by the session cookie and stores nothing in the browser', async () => {
    const fetchMock = await renderDashboard({ 'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }) });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Welcome back' });

    for (const [url, init = {}] of fetchMock.mock.calls) {
      expect(url).not.toContain(USER.id);
      expect(init.body).toBeUndefined();
    }
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('mobile navigation', () => {
  async function openMenu() {
    await renderDashboard();
    fireEvent.click(menuButton());
    return screen.getByRole('button', { name: 'Close navigation' });
  }

  it('opens the drawer, moves focus into it and shuts out the page behind', async () => {
    await renderDashboard();
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(menuButton().getAttribute('aria-controls'))).toBeTruthy();

    fireEvent.click(menuButton());

    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.getByRole('main').closest('[inert]')).toBeTruthy();
    expect(within(document.getElementById('dashboard-sidebar')).getByText(USER.email)).toBeTruthy();
  });

  it.each([
    ['its close button', (close) => fireEvent.click(close)],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['following a link', () => fireEvent.click(within(navigation()).getByRole('link', { name: 'Dashboard' }))],
  ])('closes with %s and returns focus to the menu button', async (_, close) => {
    const closeButton = await openMenu();

    close(closeButton);

    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menuButton());
    expect(screen.getByRole('main').closest('[inert]')).toBeNull();
  });
});
