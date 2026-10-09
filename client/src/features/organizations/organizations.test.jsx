import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ORGANIZATIONS_URL = '/api/v1/organizations';

const signedIn = () => json(200, { user: USER });
const noOrganizations = () => json(200, { organizations: [] });
const created = () =>
  json(201, {
    organization: { id: 'c'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', createdAt: '2026-10-08T10:00:00.000Z' },
    membership: { id: 'd'.repeat(24), organizationId: 'c'.repeat(24), userId: USER.id, role: 'owner', createdAt: '2026-10-08T10:00:00.000Z' },
  });

function renderApp(handlers) {
  const fetchMock = mockApi({ 'GET /api/v1/auth/me': signedIn, ...handlers });
  render(<App />);
  return fetchMock;
}

async function renderOnboarding(handlers = {}) {
  const fetchMock = renderApp({ [`GET ${ORGANIZATIONS_URL}`]: noOrganizations, ...handlers });
  await screen.findByRole('heading', { name: 'Create your workspace' });
  return fetchMock;
}

function typeName(value) {
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
}

beforeEach(() => {
  vi.spyOn(Storage.prototype, 'setItem');
  vi.spyOn(console, 'log');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('after sign-in', () => {
  it('loads the user’s organizations once, identified only by the session cookie', async () => {
    const fetchMock = await renderOnboarding();

    const calls = requestsTo(fetchMock, 'GET', ORGANIZATIONS_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0][1].credentials).toBe('same-origin');
    expect(calls[0][1].body).toBeUndefined();
  });

  it('shows a loading state while organizations load', async () => {
    renderApp({ [`GET ${ORGANIZATIONS_URL}`]: () => new Promise(() => {}) });

    const label = await screen.findByText('Loading your workspaces…');
    expect(label.closest('[role="status"]')).toBeTruthy();
  });

  it('shows onboarding to a user without organizations', async () => {
    await renderOnboarding();

    expect(screen.getByText('Welcome to OpsPilot')).toBeTruthy();
    expect(screen.getByText('Set up your organization to start managing operations.')).toBeTruthy();
    expect(screen.getByLabelText('Organization name')).toBeTruthy();
    expect(screen.queryByLabelText(/slug/i)).toBeNull();
  });

  it('skips onboarding and shows the dashboard for the first organization', async () => {
    renderApp({
      [`GET ${ORGANIZATIONS_URL}`]: () =>
        json(200, {
          organizations: [
            { id: '1'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'owner', createdAt: '2026-10-08T09:00:00.000Z' },
            { id: '2'.repeat(24), name: 'Globex', slug: 'globex', role: 'member', createdAt: '2026-10-01T09:00:00.000Z' },
          ],
        }),
    });

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.queryByRole('heading', { name: 'Create your workspace' })).toBeNull();
    expect(within(screen.getByRole('banner')).getByText('Acme Logistics')).toBeTruthy();
    expect(screen.queryByText(/Globex/)).toBeNull();
  });

  it('returns to sign-in when the session has expired', async () => {
    renderApp({ [`GET ${ORGANIZATIONS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('explains a failed load and retries', async () => {
    let attempts = 0;
    const fetchMock = renderApp({
      [`GET ${ORGANIZATIONS_URL}`]: () => (++attempts === 1 ? apiError(503, 'AUTH_UNAVAILABLE') : noOrganizations()),
    });

    await screen.findByRole('heading', { name: 'We couldn’t load your workspaces' });
    expect(screen.getByText('OpsPilot is temporarily unavailable. Please try again shortly.')).toBeTruthy();
    expect(screen.queryByText(/AUTH_UNAVAILABLE|server message/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('heading', { name: 'Create your workspace' });
    expect(requestsTo(fetchMock, 'GET', ORGANIZATIONS_URL)).toHaveLength(2);
  });
});

describe('onboarding', () => {
  it.each([
    ['empty', '', 'Enter an organization name.'],
    ['only spaces', '    ', 'Enter an organization name.'],
    ['over 100 characters', 'a'.repeat(101), 'Use 100 characters or fewer.'],
    ['without letters or numbers', '!!! ???', 'Include at least one letter or number in the name.'],
  ])('rejects a name that is %s without calling the API', async (_, name, message) => {
    const fetchMock = await renderOnboarding();
    typeName(name);

    submit();

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByLabelText('Organization name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Organization name'));
    expect(requestsTo(fetchMock, 'POST', ORGANIZATIONS_URL)).toHaveLength(0);
  });

  it('previews the workspace address generated from the name', async () => {
    await renderOnboarding();

    typeName('  Acme Logistics, Inc. ');

    expect(screen.getByText('Workspace address: acme-logistics-inc')).toBeTruthy();
    expect(screen.getByLabelText('Organization name').getAttribute('aria-describedby')).toContain('organization-name-hint');
  });

  it('creates the organization with the trimmed name and generated slug, then shows its dashboard without reloading', async () => {
    const fetchMock = await renderOnboarding({ [`POST ${ORGANIZATIONS_URL}`]: created });
    typeName('  Acme Logistics ');

    submit();

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    const [[, init]] = requestsTo(fetchMock, 'POST', ORGANIZATIONS_URL);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ name: 'Acme Logistics', slug: 'acme-logistics' });

    expect(screen.getByRole('status').textContent).toBe('Acme Logistics is ready. You’re its owner.');
    expect(screen.getByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(within(screen.getByRole('banner')).getByText('Acme Logistics')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(requestsTo(fetchMock, 'GET', ORGANIZATIONS_URL)).toHaveLength(1);
  });

  it('locks the form while creating so it cannot be submitted twice', async () => {
    let finish;
    const fetchMock = await renderOnboarding({
      [`POST ${ORGANIZATIONS_URL}`]: () => new Promise((resolve) => (finish = resolve)),
    });
    typeName('Acme Logistics');

    submit();
    const pending = screen.getByRole('button', { name: 'Creating organization…' });
    fireEvent.click(pending);
    fireEvent.submit(pending.closest('form'));

    expect(pending.matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Organization name').matches(':disabled')).toBe(true);
    expect(requestsTo(fetchMock, 'POST', ORGANIZATIONS_URL)).toHaveLength(1);

    finish(created());
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  });

  it('explains a taken name and keeps what the user typed', async () => {
    await renderOnboarding({ [`POST ${ORGANIZATIONS_URL}`]: () => apiError(409, 'SLUG_UNAVAILABLE') });
    typeName('Acme Logistics');

    submit();

    expect(await screen.findByText('This workspace name is already in use. Try a different name.')).toBeTruthy();
    const input = screen.getByLabelText('Organization name');
    expect(input.value).toBe('Acme Logistics');
    expect(input.matches(':disabled')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(screen.queryByText(/SLUG_UNAVAILABLE|server message/)).toBeNull();
  });

  it('explains a name the server rejects', async () => {
    await renderOnboarding({ [`POST ${ORGANIZATIONS_URL}`]: () => apiError(400, 'VALIDATION_FAILED') });
    typeName('Acme Logistics');

    submit();

    expect(await screen.findByText('This name can’t be used for a workspace. Try a different name.')).toBeTruthy();
  });

  it.each([
    ['rate limited', () => apiError(429, 'RATE_LIMITED'), 'Too many requests. Wait a moment, then try again.'],
    ['unavailable', () => apiError(503, 'AUTH_UNAVAILABLE'), 'OpsPilot is temporarily unavailable. Please try again shortly.'],
    ['failing', () => apiError(500, 'INTERNAL_ERROR'), 'Something went wrong on our side. Please try again.'],
    [
      'unreachable',
      () => {
        throw new TypeError('Failed to fetch');
      },
      'We couldn’t reach OpsPilot. Check your connection and try again.',
    ],
  ])('explains when the server is %s and lets the user retry', async (_, handler, message) => {
    await renderOnboarding({ [`POST ${ORGANIZATIONS_URL}`]: handler });
    typeName('Acme Logistics');

    submit();

    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.getByLabelText('Organization name').value).toBe('Acme Logistics');
    expect(screen.getByRole('button', { name: 'Create organization' }).matches(':disabled')).toBe(false);
  });

  it('returns to sign-in when the session expires while creating', async () => {
    await renderOnboarding({ [`POST ${ORGANIZATIONS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });
    typeName('Acme Logistics');

    submit();

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('stores nothing in web storage and logs nothing', async () => {
    await renderOnboarding({ [`POST ${ORGANIZATIONS_URL}`]: created });
    typeName('Acme Logistics');
    submit();
    await screen.findByRole('heading', { name: 'Dashboard' });

    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});
