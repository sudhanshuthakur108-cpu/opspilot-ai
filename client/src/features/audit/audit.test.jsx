import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };
const AUDIT_URL = `/api/v1/organizations/${ACME.id}/audit-logs`;

const entry = (overrides) => ({
  id: 'd'.repeat(24),
  actorType: 'user',
  actorEmail: 'ada@example.com',
  action: 'organization.updated',
  resourceType: 'organization',
  resourceId: ACME.id,
  details: { previousName: 'Acme', name: 'Acme Logistics' },
  createdAt: '2026-10-09T10:15:00.000Z',
  ...overrides,
});
const page = (auditLogs, { page: number = 1, hasMore = false } = {}) => () => json(200, { auditLogs, page: number, limit: 25, hasMore });

function mockServer({ organization = ACME, ...handlers } = {}) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [organization] }),
    [`GET ${AUDIT_URL}`]: page([entry()]),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });
const table = () => screen.getByRole('table');

// Signs in on the dashboard, then follows the sidebar link, as a user would.
async function openAuditLogs(options) {
  const fetchMock = mockServer(options);
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'Audit Logs' }));
  await screen.findByRole('heading', { level: 1, name: 'Audit Logs' });
  return fetchMock;
}

// Each body row as { Time, Actor, Action, Resource, Details } text.
function rows() {
  const headers = within(table())
    .getAllByRole('columnheader')
    .map((header) => header.textContent);
  return within(table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => Object.fromEntries([...row.children].map((cell, index) => [headers[index], cell.textContent])));
}

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

describe('Audit Logs navigation', () => {
  it('opens from the sidebar as the current page, and Back returns to the dashboard', async () => {
    await openAuditLogs();

    expect(window.location.pathname).toBe('/audit-logs');
    expect(within(navigation()).getByRole('link', { name: 'Audit Logs' }).getAttribute('aria-current')).toBe('page');

    window.history.back();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('opens from the dashboard’s activity panel', async () => {
    mockServer();
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });

    fireEvent.click(screen.getByRole('link', { name: 'View audit log' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Audit Logs' })).toBeTruthy();
  });

  it('opens straight to the audit log when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/audit-logs');
    mockServer();

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Audit Logs' })).toBeTruthy();
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});

describe('Audit Logs page', () => {
  it('shows a loading state while entries load', async () => {
    await openAuditLogs({ [`GET ${AUDIT_URL}`]: () => new Promise(() => {}) });

    expect(screen.getByText('Loading the audit log…').getAttribute('role')).toBe('status');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows entries with readable labels for the time, actor, action, resource and details', async () => {
    const fetchMock = await openAuditLogs();

    await screen.findByRole('table');
    expect(rows()).toEqual([
      {
        Time: expect.stringMatching(/2026/),
        Actor: 'ada@example.com (you)',
        Action: 'Workspace settings updated',
        Resource: 'Workspace',
        Details: 'Name changed from “Acme” to “Acme Logistics”',
      },
    ]);
    expect(table().querySelector('time').getAttribute('dateTime')).toBe('2026-10-09T10:15:00.000Z');
    expect(table().textContent).not.toContain('organization.updated');
    expect(table().textContent).not.toContain(ACME.id);
    expect(requestsTo(fetchMock, 'GET', AUDIT_URL)).toHaveLength(1);
  });

  it('labels other people, the AI, the system, former users and unknown actions', async () => {
    await openAuditLogs({
      [`GET ${AUDIT_URL}`]: page([
        entry({ id: '1'.repeat(24), actorEmail: 'grace@example.com' }),
        entry({ id: '2'.repeat(24), actorType: 'ai', actorEmail: null }),
        entry({ id: '3'.repeat(24), actorType: 'system', actorEmail: null }),
        entry({ id: '4'.repeat(24), actorEmail: null }),
        entry({ id: '5'.repeat(24), action: 'task.archived', resourceType: 'task', details: {} }),
      ]),
    });

    await screen.findByRole('table');
    expect(rows().map(({ Actor, Action, Resource, Details }) => ({ Actor, Action, Resource, Details }))).toEqual([
      { Actor: 'grace@example.com', Action: 'Workspace settings updated', Resource: 'Workspace', Details: 'Name changed from “Acme” to “Acme Logistics”' },
      { Actor: 'AI Assistant', Action: 'Workspace settings updated', Resource: 'Workspace', Details: 'Name changed from “Acme” to “Acme Logistics”' },
      { Actor: 'OpsPilot', Action: 'Workspace settings updated', Resource: 'Workspace', Details: 'Name changed from “Acme” to “Acme Logistics”' },
      { Actor: 'Former user', Action: 'Workspace settings updated', Resource: 'Workspace', Details: 'Name changed from “Acme” to “Acme Logistics”' },
      { Actor: 'ada@example.com (you)', Action: 'task.archived', Resource: 'task', Details: '—None' },
    ]);
  });

  it('keeps the server’s newest-first order', async () => {
    await openAuditLogs({
      [`GET ${AUDIT_URL}`]: page([
        entry({ id: '2'.repeat(24), details: { previousName: 'Second', name: 'Third' }, createdAt: '2026-10-09T12:00:00.000Z' }),
        entry({ id: '1'.repeat(24), details: { previousName: 'First', name: 'Second' }, createdAt: '2026-10-09T11:00:00.000Z' }),
      ]),
    });

    await screen.findByRole('table');
    expect(rows().map((row) => row.Details)).toEqual(['Name changed from “Second” to “Third”', 'Name changed from “First” to “Second”']);
  });

  it('shows details as plain text, never as HTML', async () => {
    await openAuditLogs({ [`GET ${AUDIT_URL}`]: page([entry({ details: { previousName: 'Acme', name: '<img src=x onerror="alert(1)">' } })]) });

    await screen.findByRole('table');
    expect(table().querySelector('img')).toBeNull();
    expect(rows()[0].Details).toBe('Name changed from “Acme” to “<img src=x onerror="alert(1)">”');
  });

  it('explains an empty log without making up entries', async () => {
    await openAuditLogs({ [`GET ${AUDIT_URL}`]: page([]) });

    expect(await screen.findByText('No activity recorded yet')).toBeTruthy();
    expect(screen.getByText(/Activity will appear here when important workspace actions occur/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('loads older entries on request, skipping any already shown', async () => {
    const fetchMock = await openAuditLogs({
      [`GET ${AUDIT_URL}`]: page([entry({ id: '3'.repeat(24), details: { previousName: 'B', name: 'C' } })], { hasMore: true }),
      [`GET ${AUDIT_URL}?page=2`]: page(
        [entry({ id: '3'.repeat(24), details: { previousName: 'B', name: 'C' } }), entry({ id: '2'.repeat(24), details: { previousName: 'A', name: 'B' } })],
        { page: 2 },
      ),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Load older entries' }));

    expect(await screen.findByText('Name changed from “A” to “B”')).toBeTruthy();
    expect(rows().map((row) => row.Details)).toEqual(['Name changed from “B” to “C”', 'Name changed from “A” to “B”']);
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();
    expect(requestsTo(fetchMock, 'GET', `${AUDIT_URL}?page=2`)).toHaveLength(1);
  });

  it('keeps the shown entries when older ones fail to load', async () => {
    await openAuditLogs({
      [`GET ${AUDIT_URL}`]: page([entry()], { hasMore: true }),
      [`GET ${AUDIT_URL}?page=2`]: () => apiError(500, 'INTERNAL_ERROR'),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Load older entries' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'We couldn’t load older entries. Something went wrong on our side. Please try again.',
    );
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Load older entries' }).matches(':disabled')).toBe(false);
  });

  it('explains a failure and loads again on retry', async () => {
    let attempts = 0;
    await openAuditLogs({ [`GET ${AUDIT_URL}`]: () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : page([entry()])()) });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('We couldn’t load the audit log')).toBeTruthy();
    expect(within(alert).getByText('Something went wrong on our side. Please try again.')).toBeTruthy();
    expect(alert.textContent).not.toMatch(/server message|INTERNAL_ERROR/);

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tells a member the log is for owners and admins, without requesting it', async () => {
    const fetchMock = await openAuditLogs({ organization: { ...ACME, role: 'member' } });

    expect(screen.getByText('Only owners and admins can view the audit log')).toBeTruthy();
    expect(requestsTo(fetchMock, 'GET', AUDIT_URL)).toHaveLength(0);
  });

  it('shows the same message when the server refuses access', async () => {
    await openAuditLogs({ [`GET ${AUDIT_URL}`]: () => apiError(403, 'FORBIDDEN') });

    expect(await screen.findByText('Only owners and admins can view the audit log')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('returns to sign-in when the session has expired', async () => {
    await openAuditLogs({ [`GET ${AUDIT_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('stores nothing in the browser', async () => {
    await openAuditLogs();
    await screen.findByRole('table');

    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
