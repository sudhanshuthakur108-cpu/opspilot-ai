import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme', slug: 'acme', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };
const ORGANIZATION_URL = `/api/v1/organizations/${ACME.id}`;

const renamed = (name) => ({ id: ACME.id, name, slug: ACME.slug, createdAt: ACME.createdAt });

function mockServer({ organization = ACME, ...handlers } = {}) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [organization] }),
    [`PATCH ${ORGANIZATION_URL}`]: (init) => json(200, { organization: renamed(JSON.parse(init.body).name) }),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });
const nameField = () => screen.getByLabelText('Organization name');
const saveButton = () => screen.getByRole('button', { name: /^Sav/ });
const aboutPanel = () => within(screen.getByRole('region', { name: 'About this workspace' }));

// Signs in on the dashboard, then follows the sidebar link, as a user would.
async function openSettings(options) {
  const fetchMock = mockServer(options);
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'Settings' }));
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  return fetchMock;
}

function rename(name) {
  fireEvent.change(nameField(), { target: { value: name } });
  fireEvent.click(saveButton());
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

describe('Settings navigation', () => {
  it('opens from the sidebar as the current page, and Back returns to the dashboard', async () => {
    await openSettings();

    expect(window.location.pathname).toBe('/settings');
    expect(within(navigation()).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');

    window.history.back();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('opens straight to settings when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/settings');
    mockServer();

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
  });

  it('shows a loading screen until the workspace has loaded', async () => {
    window.history.replaceState(null, '', '/settings');
    mockServer({ 'GET /api/v1/organizations': () => new Promise(() => {}) });

    render(<App />);

    expect(await screen.findByText('Loading your workspaces…')).toBeTruthy();
    expect(screen.queryByLabelText('Organization name')).toBeNull();
  });
});

describe('Settings page', () => {
  it('shows the organization’s name, address, the user’s role and basic workspace information', async () => {
    const fetchMock = await openSettings();

    expect(nameField().value).toBe('Acme');
    expect(nameField().readOnly).toBe(false);
    const slugField = screen.getByLabelText('Workspace address');
    expect(slugField.value).toBe('acme');
    expect(slugField.readOnly).toBe(true);
    expect(screen.getByText('The address is set when the workspace is created and can’t be changed.')).toBeTruthy();

    expect(aboutPanel().getByText('Owner')).toBeTruthy();
    expect(aboutPanel().getByText('You can change workspace settings and view the audit log.')).toBeTruthy();
    expect(aboutPanel().getByText(USER.email)).toBeTruthy();
    expect(aboutPanel().getByText('Read-only')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'About this workspace' }).querySelector('time').getAttribute('dateTime')).toBe(
      ACME.createdAt,
    );
    expect(screen.getByRole('main').textContent).not.toContain(ACME.id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps Save disabled until the name changes', async () => {
    await openSettings();

    expect(saveButton().matches(':disabled')).toBe(true);
    fireEvent.change(nameField(), { target: { value: 'Acme Logistics' } });
    expect(saveButton().matches(':disabled')).toBe(false);
    fireEvent.change(nameField(), { target: { value: ' Acme ' } });
    expect(saveButton().matches(':disabled')).toBe(true);
  });

  it('saves the trimmed name, then shows it everywhere', async () => {
    const fetchMock = await openSettings();

    rename('  Acme Logistics  ');

    expect(await screen.findByText(/Settings saved/)).toBeTruthy();
    const [[, init]] = requestsTo(fetchMock, 'PATCH', ORGANIZATION_URL);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ name: 'Acme Logistics' });
    expect(nameField().value).toBe('Acme Logistics');
    expect(within(screen.getByRole('banner')).getByText('Acme Logistics')).toBeTruthy();
    expect(within(document.getElementById('dashboard-sidebar')).getByText('Acme Logistics')).toBeTruthy();
    expect(aboutPanel().getByText('Owner')).toBeTruthy();
    expect(saveButton().matches(':disabled')).toBe(true);
  });

  it('shows a saving state until the server answers', async () => {
    let finish;
    await openSettings({ [`PATCH ${ORGANIZATION_URL}`]: () => new Promise((resolve) => (finish = resolve)) });

    rename('Acme Logistics');

    expect(saveButton().textContent).toBe('Saving…');
    expect(saveButton().matches(':disabled')).toBe(true);
    expect(nameField().matches(':disabled')).toBe(true);

    finish(json(200, { organization: renamed('Acme Logistics') }));

    expect(await screen.findByText(/Settings saved/)).toBeTruthy();
    expect(saveButton().textContent).toBe('Save changes');
  });

  it.each([
    ['an empty name', '', 'Enter an organization name.'],
    ['a blank name', '   ', 'Enter an organization name.'],
    ['a name over 100 characters', 'a'.repeat(101), 'Use 100 characters or fewer.'],
  ])('rejects %s before calling the API, and focuses the field', async (_, name, error) => {
    const fetchMock = await openSettings();

    rename(name);

    expect(screen.getByText(error)).toBeTruthy();
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(nameField()));
    expect(requestsTo(fetchMock, 'PATCH', ORGANIZATION_URL)).toHaveLength(0);
  });

  it.each([
    ['refuses permission', () => apiError(403, 'FORBIDDEN'), 'You don’t have permission to change workspace settings.'],
    ['rejects the name', () => apiError(400, 'VALIDATION_FAILED'), 'This name can’t be used. Check it and try again.'],
    ['fails', () => apiError(500, 'INTERNAL_ERROR'), 'Something went wrong on our side. Please try again.'],
    ['cannot be reached', () => Promise.reject(new TypeError('Failed to fetch')), 'We couldn’t reach OpsPilot. Check your connection and try again.'],
  ])('keeps the name and explains when the server %s', async (_, handler, message) => {
    await openSettings({ [`PATCH ${ORGANIZATION_URL}`]: handler });

    rename('Acme Logistics');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(alert.textContent).not.toMatch(/server message|FORBIDDEN|INTERNAL_ERROR/);
    expect(nameField().value).toBe('Acme Logistics');
    expect(nameField().matches(':disabled')).toBe(false);
    expect(within(screen.getByRole('banner')).getByText('Acme')).toBeTruthy();
    expect(screen.queryByText(/Settings saved/)).toBeNull();
  });

  it('returns to sign-in when the session has expired', async () => {
    await openSettings({ [`PATCH ${ORGANIZATION_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    rename('Acme Logistics');

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('lets an admin change settings', async () => {
    await openSettings({ organization: { ...ACME, role: 'admin' } });

    expect(nameField().readOnly).toBe(false);
    expect(aboutPanel().getByText('Admin')).toBeTruthy();
    rename('Acme Logistics');
    expect(await screen.findByText(/Settings saved/)).toBeTruthy();
  });

  it('shows a member the settings read-only, with no way to save', async () => {
    const fetchMock = await openSettings({ organization: { ...ACME, role: 'member' } });

    expect(nameField().readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByText('Only owners and admins can change workspace settings.')).toBeTruthy();
    expect(aboutPanel().getByText('Member')).toBeTruthy();

    fireEvent.submit(nameField().closest('form'));

    expect(requestsTo(fetchMock, 'PATCH', ORGANIZATION_URL)).toHaveLength(0);
  });

  it('stores nothing in the browser and sends no user or role', async () => {
    const fetchMock = await openSettings();

    rename('Acme Logistics');
    await screen.findByText(/Settings saved/);

    const [[, init]] = requestsTo(fetchMock, 'PATCH', ORGANIZATION_URL);
    expect(init.body).not.toMatch(/role|userId|owner|slug|actor/);
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
