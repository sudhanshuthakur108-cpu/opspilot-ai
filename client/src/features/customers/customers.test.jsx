import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { stubModalDialogs } from '../../testing/dialog.js';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'member', createdAt: '2026-10-08T09:30:00.000Z' };
const CUSTOMERS_URL = `/api/v1/organizations/${ACME.id}/customers`;
const INITECH = {
  id: 'd'.repeat(24),
  name: 'Initech',
  email: 'buyer@initech.example',
  phone: '+1 555 0100',
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
};
const HOOLI = { ...INITECH, id: 'e'.repeat(24), name: 'Hooli', email: null, phone: null, createdAt: '2026-10-01T10:00:00.000Z' };

const listed = (customers) => () => json(200, { customers });
const created = (customer) => () => json(201, { customer });

function mockServer(handlers) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }),
    [`GET ${CUSTOMERS_URL}`]: listed([]),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });

// Signs in on the dashboard, then follows the sidebar link, as a user would.
async function openCustomers(handlers = {}) {
  const fetchMock = mockServer(handlers);
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'Customers' }));
  await screen.findByRole('heading', { level: 1, name: 'Customers' });
  return fetchMock;
}

async function openForm(handlers) {
  const fetchMock = await openCustomers(handlers);
  const [addButton] = await screen.findAllByRole('button', { name: 'Add customer' });
  fireEvent.click(addButton);
  return { fetchMock, dialog: within(screen.getByRole('dialog', { name: 'Add customer' })) };
}

function fillIn(dialog, label, value) {
  fireEvent.change(dialog.getByLabelText(label), { target: { value } });
}

const submit = (dialog) => fireEvent.click(dialog.getByRole('button', { name: 'Add customer' }));
const tableRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

beforeAll(stubModalDialogs);

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

describe('Customers navigation', () => {
  it('opens from the sidebar as the current page, and the dashboard is still one click away', async () => {
    await openCustomers();

    expect(screen.getByRole('heading', { level: 1, name: 'Customers' })).toBeTruthy();
    expect(window.location.pathname).toBe('/customers');
    const customersLink = within(navigation()).getByRole('link', { name: 'Customers' });
    const dashboardLink = within(navigation()).getByRole('link', { name: 'Dashboard' });
    expect(customersLink.getAttribute('aria-current')).toBe('page');
    expect(dashboardLink.getAttribute('aria-current')).toBeNull();

    fireEvent.click(dashboardLink);

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('opens from the dashboard’s Customers card', async () => {
    mockServer();
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });

    fireEvent.click(screen.getByRole('link', { name: 'View customers' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeTruthy();
  });

  it('opens straight to Customers when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/customers');
    mockServer({ [`GET ${CUSTOMERS_URL}`]: listed([INITECH]) });

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeTruthy();
    expect(await screen.findByText('Initech')).toBeTruthy();
  });

  it('shows the dashboard for an address that is not a page', async () => {
    window.history.replaceState(null, '', '/tasks');
    mockServer();

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});

describe('Customers list', () => {
  it('shows a loading state while customers load', async () => {
    await openCustomers({ [`GET ${CUSTOMERS_URL}`]: () => new Promise(() => {}) });

    expect(screen.getByText('Loading customers…').getAttribute('role')).toBe('status');
  });

  it('asks for the current organization’s customers, identified only by the session cookie', async () => {
    const fetchMock = await openCustomers();
    await screen.findByText('No customers yet');

    const calls = requestsTo(fetchMock, 'GET', CUSTOMERS_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0][1].credentials).toBe('same-origin');
    expect(calls[0][1].body).toBeUndefined();
  });

  it('shows an empty state with a way to add the first customer', async () => {
    await openCustomers();

    expect(await screen.findByText('No customers yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add customer' })).toHaveLength(1);
  });

  it('lists customers from the API with their details', async () => {
    await openCustomers({ [`GET ${CUSTOMERS_URL}`]: listed([INITECH, HOOLI]) });
    await screen.findByRole('table');

    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Name', 'Email', 'Phone', 'Created']);

    const [initech, hooli] = tableRows();
    expect(within(initech).getByRole('rowheader').textContent).toBe('IInitech');
    expect(initech.textContent).toContain('buyer@initech.example');
    expect(initech.textContent).toContain('+1 555 0100');
    expect(initech.querySelector('time').getAttribute('datetime')).toBe(INITECH.createdAt);
    expect(within(hooli).getAllByText('Not provided')).toHaveLength(2);
    expect(screen.queryByText('No customers yet')).toBeNull();
  });

  it('explains a failed load and retries', async () => {
    let attempts = 0;
    const fetchMock = await openCustomers({
      [`GET ${CUSTOMERS_URL}`]: () => (++attempts === 1 ? apiError(503, 'SERVICE_UNAVAILABLE') : json(200, { customers: [INITECH] })),
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('We couldn’t load your customers');
    expect(alert.textContent).toContain('OpsPilot is temporarily unavailable. Please try again shortly.');
    expect(alert.textContent).not.toMatch(/SERVICE_UNAVAILABLE|server message/);

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Initech')).toBeTruthy();
    expect(requestsTo(fetchMock, 'GET', CUSTOMERS_URL)).toHaveLength(2);
  });

  it('returns to sign-in when the session has expired', async () => {
    await openCustomers({ [`GET ${CUSTOMERS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });
});

describe('Adding a customer', () => {
  it('opens a labelled form with the name field focused', async () => {
    const { dialog } = await openForm();

    expect(document.activeElement).toBe(dialog.getByLabelText('Name'));
    expect(dialog.getByLabelText(/^Email/).getAttribute('type')).toBe('email');
    expect(dialog.getByLabelText(/^Phone/).getAttribute('type')).toBe('tel');
  });

  it('requires a name before calling the API', async () => {
    const { fetchMock, dialog } = await openForm();
    fillIn(dialog, 'Name', '   ');

    submit(dialog);

    expect(dialog.getByText('Enter the customer’s name.')).toBeTruthy();
    expect(dialog.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(dialog.getByLabelText('Name'));
    expect(requestsTo(fetchMock, 'POST', CUSTOMERS_URL)).toHaveLength(0);
  });

  it('rejects an invalid email before calling the API', async () => {
    const { fetchMock, dialog } = await openForm();
    fillIn(dialog, 'Name', 'Initech');
    fillIn(dialog, /^Email/, 'buyer@');

    submit(dialog);

    expect(dialog.getByText('Enter a valid email address, like name@company.com.')).toBeTruthy();
    expect(document.activeElement).toBe(dialog.getByLabelText(/^Email/));
    expect(requestsTo(fetchMock, 'POST', CUSTOMERS_URL)).toHaveLength(0);
  });

  it('adds the customer to the top of the list without reloading it', async () => {
    const { fetchMock, dialog } = await openForm({
      [`GET ${CUSTOMERS_URL}`]: listed([HOOLI]),
      [`POST ${CUSTOMERS_URL}`]: created(INITECH),
    });
    fillIn(dialog, 'Name', '  Initech ');
    fillIn(dialog, /^Email/, ' buyer@initech.example ');
    fillIn(dialog, /^Phone/, ' +1 555 0100 ');

    submit(dialog);

    await screen.findByText('was added.', { exact: false });
    expect(screen.getByRole('status').textContent).toBe('Initech was added.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tableRows().map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['IInitech', 'HHooli']);

    const [[, init]] = requestsTo(fetchMock, 'POST', CUSTOMERS_URL);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ name: 'Initech', email: 'buyer@initech.example', phone: '+1 555 0100' });
    expect(requestsTo(fetchMock, 'GET', CUSTOMERS_URL)).toHaveLength(1);
  });

  it('adds the first customer from the empty state, sending only the fields given', async () => {
    const { fetchMock, dialog } = await openForm({ [`POST ${CUSTOMERS_URL}`]: created(HOOLI) });
    fillIn(dialog, 'Name', 'Hooli');

    submit(dialog);

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByText('No customers yet')).toBeNull();
    const [[, init]] = requestsTo(fetchMock, 'POST', CUSTOMERS_URL);
    expect(JSON.parse(init.body)).toEqual({ name: 'Hooli' });
  });

  it.each([
    ['rejects the details', () => apiError(400, 'VALIDATION_FAILED'), 'Check the customer’s details and try again.'],
    ['is failing', () => apiError(500, 'INTERNAL_ERROR'), 'Something went wrong on our side. Please try again.'],
    [
      'is unreachable',
      () => {
        throw new TypeError('Failed to fetch');
      },
      'We couldn’t reach OpsPilot. Check your connection and try again.',
    ],
  ])('explains when the server %s and keeps what was typed', async (_, handler, message) => {
    const { dialog } = await openForm({ [`POST ${CUSTOMERS_URL}`]: handler });
    fillIn(dialog, 'Name', 'Initech');
    fillIn(dialog, /^Email/, 'buyer@initech.example');

    submit(dialog);

    expect((await dialog.findByRole('alert')).textContent).toBe(message);
    expect(dialog.getByLabelText('Name').value).toBe('Initech');
    expect(dialog.getByLabelText(/^Email/).value).toBe('buyer@initech.example');
    expect(dialog.getByRole('button', { name: 'Add customer' }).matches(':disabled')).toBe(false);
    expect(screen.getByText('No customers yet')).toBeTruthy();
  });

  it('locks the form while saving, so it cannot be sent twice or dismissed', async () => {
    let finish;
    const { fetchMock, dialog } = await openForm({
      [`POST ${CUSTOMERS_URL}`]: () => new Promise((resolve) => (finish = resolve)),
    });
    fillIn(dialog, 'Name', 'Initech');

    submit(dialog);
    const pending = dialog.getByRole('button', { name: 'Adding…' });
    fireEvent.submit(pending.closest('form'));
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog').dispatchEvent(escape);

    expect(pending.matches(':disabled')).toBe(true);
    expect(dialog.getByLabelText('Name').matches(':disabled')).toBe(true);
    expect(dialog.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(requestsTo(fetchMock, 'POST', CUSTOMERS_URL)).toHaveLength(1);

    finish(json(201, { customer: INITECH }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it.each(['Cancel', 'Close'])('closes with %s without saving, and starts empty next time', async (button) => {
    const { fetchMock, dialog } = await openForm();
    fillIn(dialog, 'Name', 'Initech');

    fireEvent.click(dialog.getByRole('button', { name: button }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestsTo(fetchMock, 'POST', CUSTOMERS_URL)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Name').value).toBe('');
  });

  it('returns to sign-in when the session expires while saving', async () => {
    const { dialog } = await openForm({ [`POST ${CUSTOMERS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });
    fillIn(dialog, 'Name', 'Initech');

    submit(dialog);

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('never sends an organization or user ID in the body, and stores nothing in the browser', async () => {
    const { fetchMock, dialog } = await openForm({ [`POST ${CUSTOMERS_URL}`]: created(INITECH) });
    fillIn(dialog, 'Name', 'Initech');

    submit(dialog);
    await screen.findByRole('table');

    const [[, init]] = requestsTo(fetchMock, 'POST', CUSTOMERS_URL);
    expect(Object.keys(JSON.parse(init.body))).toEqual(['name']);
    expect(init.body).not.toContain(USER.id);
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
