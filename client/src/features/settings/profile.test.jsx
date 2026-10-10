import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', name: 'Ada Lovelace', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme', slug: 'acme', role: 'member', createdAt: '2026-10-08T09:30:00.000Z' };
const ME_URL = '/api/v1/auth/me';

// A server that remembers the saved name, so a later /auth/me (a reload) returns it.
function mockServer({ user = USER, ...handlers } = {}) {
  let current = { ...user };
  const fetchMock = mockApi({
    [`GET ${ME_URL}`]: () => json(200, { user: current }),
    'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }),
    [`PATCH ${ME_URL}`]: (init) => {
      current = { ...current, name: JSON.parse(init.body).name };
      return json(200, { user: current });
    },
    ...handlers,
  });
  return fetchMock;
}

async function openSettings(options) {
  const fetchMock = mockServer(options);
  window.history.replaceState(null, '', '/settings');
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  return fetchMock;
}

const profile = () => within(screen.getByRole('form', { name: 'Your profile' }));
const nameField = () => profile().getByLabelText('Full name');
const saveButton = () => profile().getByRole('button', { name: /^Sav/ });
const header = () => within(screen.getByRole('banner'));

function rename(name) {
  fireEvent.change(nameField(), { target: { value: name } });
  fireEvent.click(saveButton());
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

describe('Profile settings', () => {
  it('shows the account’s name and its email, which cannot be edited here', async () => {
    await openSettings();

    expect(nameField().value).toBe('Ada Lovelace');
    expect(nameField().getAttribute('autocomplete')).toBe('name');
    const email = profile().getByLabelText('Email address');
    expect(email.value).toBe('ada@example.com');
    expect(email.readOnly).toBe(true);
    expect(profile().getByText('Used to sign in. It can’t be changed here.')).toBeTruthy();
    expect(saveButton().matches(':disabled')).toBe(true);
  });

  it('keeps Save disabled until the name really changes', async () => {
    await openSettings();

    fireEvent.change(nameField(), { target: { value: '  Ada   Lovelace ' } });
    expect(saveButton().matches(':disabled')).toBe(true);
    fireEvent.change(nameField(), { target: { value: 'Ada King' } });
    expect(saveButton().matches(':disabled')).toBe(false);
  });

  it('saves the tidied name and shows it in the header and the dashboard greeting at once', async () => {
    const fetchMock = await openSettings();

    rename('  Grace   Hopper ');

    expect(await profile().findByText('Profile saved.')).toBeTruthy();
    const [[, init]] = requestsTo(fetchMock, 'PATCH', ME_URL);
    expect(JSON.parse(init.body)).toEqual({ name: 'Grace Hopper' });
    expect(init.credentials).toBe('same-origin');
    expect(nameField().value).toBe('Grace Hopper');
    expect(header().getByText('Grace')).toBeTruthy();

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Dashboard' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Welcome back, Grace' })).toBeTruthy();
    expect(requestsTo(fetchMock, 'GET', ME_URL)).toHaveLength(1);
  });

  it('shows the saved name again after a reload, as read from the server', async () => {
    const fetchMock = mockServer();
    window.history.replaceState(null, '', '/settings');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    rename('Grace Hopper');
    await profile().findByText('Profile saved.');

    cleanup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Settings' });

    expect(nameField().value).toBe('Grace Hopper');
    expect(header().getByText('Grace')).toBeTruthy();
    expect(requestsTo(fetchMock, 'GET', ME_URL)).toHaveLength(2);
  });

  it('shows a saving state, and sends one request however many times Save is clicked', async () => {
    let finish;
    const fetchMock = await openSettings({ [`PATCH ${ME_URL}`]: () => new Promise((resolve) => (finish = resolve)) });

    rename('Ada King');
    fireEvent.click(saveButton());

    expect(saveButton().textContent).toBe('Saving profile…');
    expect(saveButton().matches(':disabled')).toBe(true);
    expect(nameField().matches(':disabled')).toBe(true);
    expect(requestsTo(fetchMock, 'PATCH', ME_URL)).toHaveLength(1);

    finish(json(200, { user: { ...USER, name: 'Ada King' } }));

    expect(await profile().findByText('Profile saved.')).toBeTruthy();
    expect(saveButton().textContent).toBe('Save profile');
  });

  it.each([
    ['empty', '', 'Enter your name.'],
    ['only spaces', '   ', 'Enter your name.'],
    ['one character', 'A', 'Use 2 to 80 characters, including at least one letter.'],
    ['without letters', '42', 'Use 2 to 80 characters, including at least one letter.'],
    ['over 80 characters', 'A'.repeat(81), 'Use 2 to 80 characters, including at least one letter.'],
  ])('rejects a name that is %s before calling the API', async (_, name, message) => {
    const fetchMock = await openSettings();

    rename(name);

    expect(profile().getByText(message)).toBeTruthy();
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(nameField()));
    expect(requestsTo(fetchMock, 'PATCH', ME_URL)).toHaveLength(0);
  });

  it('asks an older account without a name to add one, then greets them by it', async () => {
    await openSettings({ user: { ...USER, name: null } });

    expect(profile().getByText(/Add your name so OpsPilot can greet you by it/)).toBeTruthy();
    expect(nameField().value).toBe('');
    expect(header().queryByText('Ada')).toBeNull();

    rename('Ada Lovelace');

    expect(await profile().findByText('Profile saved.')).toBeTruthy();
    expect(profile().queryByText(/Add your name/)).toBeNull();
    expect(header().getByText('Ada')).toBeTruthy();
  });

  it.each([
    ['rejects the name', () => apiError(400, 'VALIDATION_FAILED'), 'Use 2 to 80 characters, including at least one letter.'],
    ['fails', () => apiError(500, 'INTERNAL_ERROR'), 'We couldn’t save your profile. Something went wrong on our side. Please try again.'],
    ['cannot be reached', () => Promise.reject(new TypeError('Failed to fetch')), 'We couldn’t save your profile. We couldn’t reach OpsPilot. Check your connection and try again.'],
  ])('keeps the typed name and explains when the server %s', async (_, handler, message) => {
    await openSettings({ [`PATCH ${ME_URL}`]: handler });

    rename('Ada King');

    expect(await profile().findByText(message)).toBeTruthy();
    expect(nameField().value).toBe('Ada King');
    expect(nameField().matches(':disabled')).toBe(false);
    expect(header().getByText('Ada')).toBeTruthy();
    expect(profile().queryByText('Profile saved.')).toBeNull();
  });

  it('returns to sign-in when the session has expired', async () => {
    await openSettings({ [`PATCH ${ME_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    rename('Ada King');

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('is open to a member, who cannot change the workspace settings', async () => {
    await openSettings();

    expect(screen.getByLabelText('Organization name').readOnly).toBe(true);
    expect(nameField().readOnly).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });
});
