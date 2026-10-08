import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { json, mockApi } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };
const GLOBEX = { id: 'c'.repeat(24), name: 'Globex', slug: 'globex', role: 'member', createdAt: '2026-10-01T09:00:00.000Z' };
const UPCOMING_SECTIONS = ['Orders', 'Tasks', 'AI Assistant', 'Approvals', 'Audit Logs', 'Settings'];

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

  it('lists the upcoming sections as not yet available, without linking anywhere', async () => {
    await renderDashboard();

    expect(within(navigation()).getAllByRole('link').map((link) => link.textContent)).toEqual(['Dashboard', 'Customers']);
    expect(within(navigation()).queryAllByRole('button')).toHaveLength(0);
    for (const label of UPCOMING_SECTIONS) {
      const item = within(navigation()).getByText(label).closest('li');
      expect(item.textContent).toBe(`${label}Soon`);
      expect(item.querySelector('a, button, [tabindex]')).toBeNull();
    }
  });

  it('points to the Customers page instead of claiming there are no customers', async () => {
    await renderDashboard();
    const card = within(screen.getByRole('main')).getByRole('heading', { level: 3, name: 'Customers' }).closest('li');

    expect(within(card).queryByText(/no customers/i)).toBeNull();
    expect(within(card).getByRole('link', { name: 'View customers' }).getAttribute('href')).toBe('/customers');
  });

  it('shows an empty state for orders, tasks and activity instead of data', async () => {
    await renderDashboard();
    const main = within(screen.getByRole('main'));

    for (const [title, empty, explanation] of [
      ['Orders', 'No orders yet', 'Orders will appear here once your team starts recording them.'],
      ['Tasks', 'No tasks yet', 'Tasks will appear here once you create your first one.'],
    ]) {
      const card = main.getByRole('heading', { level: 3, name: title }).closest('li');
      expect(within(card).getByText(empty)).toBeTruthy();
      expect(within(card).getByText(explanation)).toBeTruthy();
    }

    const activity = main.getByRole('region', { name: 'Recent activity' });
    expect(within(activity).getByText('No activity yet')).toBeTruthy();
    expect(within(activity).getByText('Changes your team makes in this workspace will appear here.')).toBeTruthy();
  });

  it('presents the AI Assistant as coming next, with nothing to click', async () => {
    await renderDashboard();

    const card = within(screen.getByRole('main')).getByRole('heading', { level: 3, name: 'AI Assistant' }).closest('li');
    expect(within(card).getByText('Coming next')).toBeTruthy();
    expect(card.querySelector('a, button, input')).toBeNull();
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
