import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', name: 'Ada Lovelace', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };
const GLOBEX = { id: 'c'.repeat(24), name: 'Globex', slug: 'globex', role: 'member', createdAt: '2026-10-01T09:00:00.000Z' };
const base = (organization) => `/api/v1/organizations/${organization.id}`;

const customer = (n) => ({ id: `cust${n}`, name: `Customer ${n}`, email: null, phone: null, createdAt: '2026-10-08T10:00:00.000Z' });
const order = (n, status) => ({
  id: `order${n}`,
  customerId: 'cust1',
  customerName: 'Initech',
  description: `Order ${n}`,
  status,
  totalAmount: 1250,
  currency: 'INR',
  createdAt: '2026-10-08T10:00:00.000Z',
});
const task = (n, overrides) => ({
  id: `task${n}`,
  title: `Task ${n}`,
  description: null,
  status: 'todo',
  priority: 'medium',
  customerId: null,
  customerName: null,
  orderId: null,
  orderDescription: null,
  dueDate: null,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
  ...overrides,
});

// The dashboard's own requests for `organization`, answering with an empty workspace unless
// `data` says otherwise.
function workspaceHandlers(organization, { customers = [], orders = [], tasks = [], approvals = [], auditLogs = [] } = {}) {
  return {
    [`GET ${base(organization)}/customers`]: () => json(200, { customers }),
    [`GET ${base(organization)}/orders`]: () => json(200, { orders }),
    [`GET ${base(organization)}/tasks`]: () => json(200, { tasks }),
    [`GET ${base(organization)}/approvals?status=pending&limit=50`]: () => json(200, { approvals, page: 1, limit: 50, hasMore: false }),
    [`GET ${base(organization)}/audit-logs`]: () => json(200, { auditLogs, page: 1, limit: 25, hasMore: false }),
  };
}

async function renderDashboard({ organizations = [ACME], user = USER, data, ...handlers } = {}) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => json(200, { user }),
    'GET /api/v1/organizations': () => json(200, { organizations }),
    ...workspaceHandlers(organizations[0], data),
    ...handlers,
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return fetchMock;
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });
const menuButton = () => screen.getByRole('button', { name: 'Open navigation' });
const stats = () => within(screen.getByRole('list', { name: 'Workspace at a glance' }));
const stat = (label) => stats().getByRole('link', { name: new RegExp(`^${label}`) });
const panel = (name) => within(screen.getByRole('region', { name }));

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
    expect(header.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeTruthy();
  });

  it.each([
    ['Sudhanshu Thakur', 'Welcome back, Sudhanshu'],
    ['Ada Lovelace', 'Welcome back, Ada'],
    ['  Grace   Brewster Hopper ', 'Welcome back, Grace'],
    ['Zoé', 'Welcome back, Zoé'],
  ])('greets an account named %j by first name', async (name, greeting) => {
    await renderDashboard({ user: { ...USER, name } });

    expect(screen.getByRole('heading', { level: 2, name: greeting })).toBeTruthy();
    expect(within(screen.getByRole('banner')).getByText(greeting.split(', ')[1])).toBeTruthy();
  });

  it.each([
    ['no name at all', { id: USER.id, email: 'ada.lovelace@example.com', createdAt: USER.createdAt }],
    ['a null name', { ...USER, email: 'ada.lovelace@example.com', name: null }],
  ])('greets an older account with %s without guessing a name from the email', async (_, user) => {
    await renderDashboard({ user });

    expect(screen.getByRole('heading', { level: 2, name: 'Welcome back' })).toBeTruthy();
    expect(within(screen.getByRole('main')).queryByText(/Ada|ada\.lovelace/)).toBeNull();
    expect(within(screen.getByRole('banner')).getByText('ada.lovelace@example.com')).toBeTruthy();
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

describe('dashboard figures', () => {
  it('counts what the workspace’s APIs return, and nothing else', async () => {
    await renderDashboard({
      data: {
        customers: [customer(1), customer(2)],
        orders: [order(1, 'pending'), order(2, 'confirmed'), order(3, 'completed')],
        tasks: [task(1), task(2, { status: 'in_progress', dueDate: '2020-01-01' }), task(3, { status: 'completed' })],
        approvals: [{ id: 'approval1' }],
      },
    });

    await waitFor(() => expect(stat('Customers').textContent).toBe('Customers2In this workspace'));
    expect(stat('Open orders').textContent).toBe('Open orders2Pending or confirmed');
    expect(stat('Open tasks').textContent).toBe('Open tasks21 overdue');
    expect(stat('Awaiting approval').textContent).toBe('Awaiting approval1AI proposals to review');
    expect(stat('Customers').getAttribute('href')).toBe('/customers');
    expect(stat('Awaiting approval').getAttribute('href')).toBe('/approvals');
  });

  it('says a count is at least the number shown when a list is full', async () => {
    await renderDashboard({ data: { customers: Array.from({ length: 50 }, (_, n) => customer(n)) } });

    await waitFor(() => expect(stat('Customers').textContent).toBe('Customers50+Counting the newest 50'));
  });

  it('shows an empty workspace as empty, with a checklist built from its real records', async () => {
    await renderDashboard({ data: { customers: [customer(1)] } });

    const setup = within(await screen.findByRole('region', { name: 'Set up your workspace' }));
    expect(setup.getByText('1 of 3 done')).toBeTruthy();
    expect(setup.getByRole('link', { name: 'Add a customer' }).getAttribute('href')).toBe('/customers');
    expect(setup.getByRole('link', { name: 'Record an order' }).getAttribute('href')).toBe('/orders');
    expect(panel('Tasks needing attention').getByText('No tasks yet')).toBeTruthy();
    expect(panel('Recent orders').getByText('No orders yet')).toBeTruthy();
    expect(stat('Open orders').textContent).toContain('0');
  });

  it('keeps the other sections when one fails to load, and retries', async () => {
    let attempts = 0;
    await renderDashboard({
      [`GET ${base(ACME)}/orders`]: () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : json(200, { orders: [order(1, 'pending')] })),
    });

    expect(await panel('Recent orders').findByText('We couldn’t load orders')).toBeTruthy();
    expect(stat('Open orders').textContent).toContain('Unavailable');
    expect(stat('Customers').textContent).toBe('Customers0In this workspace');

    fireEvent.click(panel('Recent orders').getByRole('button', { name: 'Try again' }));

    expect(await panel('Recent orders').findByText('Order 1')).toBeTruthy();
  });
});

describe('dashboard sections', () => {
  it('lists open tasks with the most urgent first, leaving out completed ones', async () => {
    await renderDashboard({
      data: {
        tasks: [
          task(1, { title: 'No due date', priority: 'high' }),
          task(2, { title: 'Overdue', dueDate: '2020-01-01', customerName: 'Initech' }),
          task(3, { title: 'Later', dueDate: '2999-01-01' }),
          task(4, { title: 'Done already', status: 'completed', dueDate: '2019-01-01' }),
        ],
      },
    });

    const items = await panel('Tasks needing attention').findAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.overview-list__title').textContent)).toEqual(['Overdue', 'Later', 'No due date']);
    expect(items[0].textContent).toContain('Initech');
    expect(items[0].textContent).toMatch(/Overdue ·/);
    expect(panel('Tasks needing attention').getByRole('link', { name: 'All tasks' }).getAttribute('href')).toBe('/tasks');
  });

  it('shows the newest orders with their status and amount', async () => {
    await renderDashboard({ data: { orders: [order(1, 'pending')] } });

    const [item] = await panel('Recent orders').findAllByRole('listitem');
    expect(item.textContent).toContain('Order 1');
    expect(item.textContent).toContain('Initech');
    expect(item.textContent).toContain('Pending');
    expect(item.textContent).toMatch(/1,250/);
  });

  it('shows an owner the latest audit log entries', async () => {
    await renderDashboard({
      data: {
        auditLogs: [
          {
            id: 'log1',
            actorType: 'ai',
            actorEmail: null,
            action: 'approval.proposed',
            resourceType: 'approval',
            resourceId: 'x',
            details: {},
            createdAt: '2026-10-09T10:15:00.000Z',
          },
        ],
      },
    });

    const activity = panel('Recent activity');
    expect(await activity.findByText('Change proposed')).toBeTruthy();
    expect(activity.getByText(/AI Assistant/)).toBeTruthy();
    expect(activity.getByRole('link', { name: 'View audit log' }).getAttribute('href')).toBe('/audit-logs');
  });

  it('does not offer or request the audit log for a member, who cannot view it', async () => {
    const fetchMock = await renderDashboard({ organizations: [GLOBEX] });
    const activity = panel('Recent activity');

    expect(activity.getByText(/Owners and admins can review them/)).toBeTruthy();
    expect(activity.queryByRole('link')).toBeNull();
    expect(requestsTo(fetchMock, 'GET', `${base(GLOBEX)}/audit-logs`)).toHaveLength(0);
  });

  it('introduces the AI Assistant without claiming it can change anything, and points to waiting approvals', async () => {
    await renderDashboard({ data: { approvals: [{ id: 'approval1' }, { id: 'approval2' }] } });

    const assistant = panel('AI Assistant');
    expect(assistant.getByText('Changes need approval')).toBeTruthy();
    expect(assistant.getByText(/It can read your records and propose new tasks, but it can’t change anything until an owner or admin approves\./)).toBeTruthy();
    expect(assistant.getByRole('link', { name: 'Open AI Assistant' }).getAttribute('href')).toBe('/assistant');
    const pending = await assistant.findByRole('link', { name: /2 proposals are waiting for review/ });
    expect(pending.getAttribute('href')).toBe('/approvals');
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
