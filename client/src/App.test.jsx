import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', name: 'Ada Lovelace', createdAt: '2026-10-08T09:00:00.000Z' };
const PASSWORD = 'correct horse battery';
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const unauthenticated = () =>
  json(401, { error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: 'r1' } });

// Stubs fetch with handlers keyed by "METHOD path". Unexpected requests fail the test.
// Signed-in users belong to one organization unless a test says otherwise.
function mockApi(overrides) {
  const handlers = { 'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }), ...overrides };
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestsTo(fetchMock, method, url) {
  return fetchMock.mock.calls.filter(([calledUrl, init = {}]) => calledUrl === url && (init.method ?? 'GET') === method);
}

function fillIn(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function renderSignedOut(handlers = {}) {
  const fetchMock = mockApi({ 'GET /api/v1/auth/me': unauthenticated, ...handlers });
  render(<App />);
  await screen.findByRole('heading', { name: 'Welcome back' });
  return fetchMock;
}

beforeEach(() => {
  vi.spyOn(Storage.prototype, 'setItem');
  vi.spyOn(console, 'log');
  vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('startup', () => {
  it('shows a loading state while checking the session', () => {
    mockApi({ 'GET /api/v1/auth/me': () => new Promise(() => {}) });

    render(<App />);

    expect(screen.getByRole('status').textContent).toContain('Loading OpsPilot');
  });

  it('shows the sign-in screen when there is no session', async () => {
    const fetchMock = await renderSignedOut();

    expect(requestsTo(fetchMock, 'GET', '/api/v1/auth/me')).toHaveLength(1);
    expect(requestsTo(fetchMock, 'GET', '/api/v1/auth/me')[0][1].credentials).toBe('same-origin');
  });

  it('restores an existing session', async () => {
    mockApi({ 'GET /api/v1/auth/me': () => json(200, { user: USER }) });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getAllByText(USER.email).length).toBeGreaterThan(0);
  });

  it('falls back to sign-in with a notice when the session check fails', async () => {
    mockApi({
      'GET /api/v1/auth/me': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    render(<App />);

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('We couldn’t check whether you’re already signed in.')).toBeTruthy();
  });
});

describe('sign-in screen', () => {
  it('shows the brand, labelled fields and actions', async () => {
    await renderSignedOut();

    expect(screen.getAllByText(/OpsPilot/).length).toBeGreaterThan(0);
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(email.getAttribute('type')).toBe('email');
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(password.getAttribute('type')).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeTruthy();
  });

  it('explains empty fields without calling the API', async () => {
    const fetchMock = await renderSignedOut();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
    expect(requestsTo(fetchMock, 'POST', '/api/v1/auth/login')).toHaveLength(0);
  });

  it('rejects an obviously invalid email', async () => {
    const fetchMock = await renderSignedOut();
    fillIn('Email', 'ada@');
    fillIn('Password', PASSWORD);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address, like name@company.com.')).toBeTruthy();
    expect(requestsTo(fetchMock, 'POST', '/api/v1/auth/login')).toHaveLength(0);
  });

  it('clears a field error once the field is edited', async () => {
    await renderSignedOut();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    fillIn('Email', 'ada@example.com');

    expect(screen.queryByText('Enter your email address.')).toBeNull();
  });

  it('shows and hides the password', async () => {
    await renderSignedOut();
    const password = screen.getByLabelText('Password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.getAttribute('type')).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.getAttribute('type')).toBe('password');
  });

  it('signs in with the trimmed email and the password, then shows the dashboard', async () => {
    const fetchMock = await renderSignedOut({ 'POST /api/v1/auth/login': () => json(200, { user: USER }) });
    fillIn('Email', '  ada@example.com ');
    fillIn('Password', PASSWORD);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    const [[, init]] = requestsTo(fetchMock, 'POST', '/api/v1/auth/login');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@example.com', password: PASSWORD });
  });

  it('shows a generic error when the credentials are rejected and lets the user retry', async () => {
    await renderSignedOut({
      'POST /api/v1/auth/login': () =>
        json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect', requestId: 'r2' } }),
    });
    fillIn('Email', 'ada@example.com');
    fillIn('Password', PASSWORD);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Email or password is incorrect.');
    expect(alert.textContent).not.toContain(PASSWORD);
    expect(screen.getByLabelText('Email').value).toBe('ada@example.com');
    expect(screen.getByLabelText('Password').value).toBe('');
    expect(screen.getByLabelText('Password').matches(':disabled')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Password')));
    expect(screen.getByRole('button', { name: 'Sign in' }).matches(':disabled')).toBe(false);
  });

  it.each([
    ['rate limited', () => json(429, { error: { code: 'RATE_LIMITED', message: 'x' } }), 'Too many attempts. Wait a few minutes, then try again.'],
    [
      'unreachable',
      () => {
        throw new TypeError('Failed to fetch');
      },
      'We couldn’t reach OpsPilot. Check your connection and try again.',
    ],
    ['failing', () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } }), 'Something went wrong on our side. Please try again.'],
  ])('explains when the server is %s', async (_, handler, message) => {
    await renderSignedOut({ 'POST /api/v1/auth/login': handler });
    fillIn('Email', 'ada@example.com');
    fillIn('Password', PASSWORD);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });

  it('locks the form while signing in so it cannot be submitted twice', async () => {
    let finishLogin;
    const fetchMock = await renderSignedOut({
      'POST /api/v1/auth/login': () => new Promise((resolve) => (finishLogin = resolve)),
    });
    fillIn('Email', 'ada@example.com');
    fillIn('Password', PASSWORD);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const pending = screen.getByRole('button', { name: 'Signing in…' });
    fireEvent.click(pending);
    fireEvent.submit(pending.closest('form'));

    // The fieldset disables every control inside it, which `:disabled` reflects.
    expect(pending.matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Email').matches(':disabled')).toBe(true);
    expect(requestsTo(fetchMock, 'POST', '/api/v1/auth/login')).toHaveLength(1);

    finishLogin(json(200, { user: USER }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  });
});

describe('creating an account', () => {
  it('switches to sign-up and creates the account', async () => {
    const fetchMock = await renderSignedOut({ 'POST /api/v1/auth/register': () => json(201, { user: USER }) });

    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('Full name').getAttribute('autocomplete')).toBe('name');
    fillIn('Full name', '  Ada Lovelace ');
    fillIn('Email', 'ada@example.com');
    fillIn('Password', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Welcome back, Ada' })).toBeTruthy();
    const [[, init]] = requestsTo(fetchMock, 'POST', '/api/v1/auth/register');
    expect(JSON.parse(init.body)).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD });
  });

  it.each([
    ['missing', '', 'Enter your name.'],
    ['only spaces', '   ', 'Enter your name.'],
    ['one character', 'A', 'Use 2 to 80 characters, including at least one letter.'],
    ['without letters', '12', 'Use 2 to 80 characters, including at least one letter.'],
    ['over 80 characters', 'A'.repeat(81), 'Use 2 to 80 characters, including at least one letter.'],
  ])('asks for a name that is %s before calling the API, and focuses it', async (_, name, message) => {
    const fetchMock = await renderSignedOut();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fillIn('Full name', name);
    fillIn('Email', 'ada@example.com');
    fillIn('Password', PASSWORD);

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByLabelText('Full name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Full name'));
    expect(requestsTo(fetchMock, 'POST', '/api/v1/auth/register')).toHaveLength(0);
  });

  it('asks for a name only when creating an account', async () => {
    await renderSignedOut();

    expect(screen.queryByLabelText('Full name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByLabelText('Full name')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.queryByLabelText('Full name')).toBeNull();
  });

  it('asks for a longer password before calling the API', async () => {
    const fetchMock = await renderSignedOut();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fillIn('Email', 'ada@example.com');
    fillIn('Password', 'short');

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Use 8 to 128 characters.')).toBeTruthy();
    expect(requestsTo(fetchMock, 'POST', '/api/v1/auth/register')).toHaveLength(0);
  });

  it('can switch back to sign-in', async () => {
    await renderSignedOut();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });
});

describe('signed in', () => {
  async function renderSignedIn(handlers = {}) {
    const fetchMock = mockApi({ 'GET /api/v1/auth/me': () => json(200, { user: USER }), ...handlers });
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    return fetchMock;
  }

  it('signs out and returns to the sign-in screen', async () => {
    const fetchMock = await renderSignedIn({ 'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }) });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    const [[, init]] = requestsTo(fetchMock, 'POST', '/api/v1/auth/logout');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBeUndefined();
  });

  it('stays signed in and says so when signing out fails', async () => {
    await renderSignedIn({
      'POST /api/v1/auth/logout': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toBe('We couldn’t sign you out. Please try again.');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' }).disabled).toBe(false);
  });
});

describe('security', () => {
  it('never stores anything in web storage or logs during a sign-in and sign-out', async () => {
    await renderSignedOut({
      'POST /api/v1/auth/login': () => json(200, { user: USER }),
      'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    fillIn('Email', 'ada@example.com');
    fillIn('Password', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Welcome back' });

    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('keeps only the public user fields from the response', async () => {
    mockApi({ 'GET /api/v1/auth/me': () => json(200, { user: USER }) });
    render(<App />);

    await screen.findByRole('heading', { name: 'Dashboard' });

    expect(within(screen.getByRole('banner')).getByText(USER.email)).toBeTruthy();
    await waitFor(() => expect(document.cookie).toBe(''));
  });
});
