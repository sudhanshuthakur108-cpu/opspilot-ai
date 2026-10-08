import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { stubModalDialogs } from '../../testing/dialog.js';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'member', createdAt: '2026-10-08T09:30:00.000Z' };
const ORDERS_URL = `/api/v1/organizations/${ACME.id}/orders`;
const CUSTOMERS_URL = `/api/v1/organizations/${ACME.id}/customers`;

const customer = (id, name) => ({ id, name, email: null, phone: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' });
const INITECH = customer('c'.repeat(24), 'Initech');
const HOOLI = customer('d'.repeat(24), 'Hooli');

const order = (overrides) => ({
  id: 'e'.repeat(24),
  customerId: INITECH.id,
  customerName: 'Initech',
  description: 'Quarterly supplies',
  status: 'pending',
  totalAmount: 1250.5,
  currency: 'INR',
  createdAt: '2026-10-07T10:00:00.000Z',
  ...overrides,
});

const ordersListed = (orders) => () => json(200, { orders });
const customersListed = (customers) => () => json(200, { customers });

function mockServer(handlers) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }),
    [`GET ${ORDERS_URL}`]: ordersListed([]),
    [`GET ${CUSTOMERS_URL}`]: customersListed([INITECH, HOOLI]),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });

// Signs in on the dashboard, then follows the sidebar link, as a user would.
async function openOrders(handlers = {}) {
  const fetchMock = mockServer(handlers);
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'Orders' }));
  await screen.findByRole('heading', { level: 1, name: 'Orders' });
  return fetchMock;
}

async function openDialog(handlers) {
  const fetchMock = await openOrders(handlers);
  const [newOrder] = await screen.findAllByRole('button', { name: 'New order' });
  fireEvent.click(newOrder);
  return { fetchMock, dialog: within(screen.getByRole('dialog', { name: 'New order' })) };
}

// Opens the dialog and waits until the customers have loaded into the form.
async function openForm(handlers) {
  const opened = await openDialog(handlers);
  await opened.dialog.findByLabelText('Customer');
  return opened;
}

function fillIn(dialog, label, value) {
  fireEvent.change(dialog.getByLabelText(label), { target: { value } });
}

function fillValidOrder(dialog) {
  fillIn(dialog, 'Customer', INITECH.id);
  fillIn(dialog, 'Description', 'Quarterly supplies');
  fillIn(dialog, 'Total amount', '1250.50');
}

const submit = (dialog) => fireEvent.click(dialog.getByRole('button', { name: 'Create order' }));
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

describe('Orders navigation', () => {
  it('opens from the sidebar as the current page, with Dashboard and Customers still reachable', async () => {
    await openOrders();

    expect(screen.getByRole('heading', { level: 1, name: 'Orders' })).toBeTruthy();
    expect(window.location.pathname).toBe('/orders');
    expect(within(navigation()).getByRole('link', { name: 'Orders' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(within(navigation()).getByRole('link', { name: 'Customers' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeTruthy();

    fireEvent.click(within(navigation()).getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('opens from the dashboard’s Orders card', async () => {
    mockServer();
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });

    fireEvent.click(screen.getByRole('link', { name: 'View orders' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Orders' })).toBeTruthy();
  });

  it('opens straight to Orders when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/orders');
    mockServer({ [`GET ${ORDERS_URL}`]: ordersListed([order()]) });

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Orders' })).toBeTruthy();
    expect(await screen.findByText('Quarterly supplies')).toBeTruthy();
  });
});

describe('Orders list', () => {
  it('shows a loading state while orders load', async () => {
    await openOrders({ [`GET ${ORDERS_URL}`]: () => new Promise(() => {}) });

    expect(screen.getByText('Loading orders…').getAttribute('role')).toBe('status');
  });

  it('asks for the current organization’s orders, identified only by the session cookie', async () => {
    const fetchMock = await openOrders();
    await screen.findByText('No orders yet');

    const calls = requestsTo(fetchMock, 'GET', ORDERS_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0][1].credentials).toBe('same-origin');
    expect(calls[0][1].body).toBeUndefined();
  });

  it('shows an empty state with a way to create the first order', async () => {
    await openOrders();

    expect(await screen.findByText('No orders yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'New order' })).toHaveLength(1);
  });

  it('lists orders from the API with the customer, readable status and formatted amount', async () => {
    await openOrders({
      [`GET ${ORDERS_URL}`]: ordersListed([
        order(),
        order({ id: 'f'.repeat(24), customerName: 'Hooli', description: 'Server racks', status: 'confirmed', totalAmount: 99.99, currency: 'USD' }),
        order({ id: '1'.repeat(24), description: 'Gift boxes', status: 'completed', totalAmount: 5000, currency: 'JPY' }),
        order({ id: '2'.repeat(24), description: 'Cancelled sample', status: 'cancelled', totalAmount: 0 }),
      ]),
    });
    await screen.findByRole('table');

    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Customer', 'Description', 'Status', 'Amount', 'Created']);

    const cells = tableRows().map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    const customers = tableRows().map((row) => within(row).getByRole('rowheader').textContent);
    expect(customers).toEqual(['Initech', 'Hooli', 'Initech', 'Initech']);
    expect(cells.map(([description, status]) => [description, status])).toEqual([
      ['Quarterly supplies', 'Pending'],
      ['Server racks', 'Confirmed'],
      ['Gift boxes', 'Completed'],
      ['Cancelled sample', 'Cancelled'],
    ]);
    expect(cells[0][2]).toBe('₹1,250.50');
    expect(cells[1][2]).toMatch(/\$99\.99/);
    expect(cells[2][2]).toMatch(/¥5,000$/);
    expect(cells[3][2]).toBe('₹0.00');
    expect(tableRows()[0].querySelector('time').getAttribute('datetime')).toBe('2026-10-07T10:00:00.000Z');
  });

  it('explains a failed load and retries', async () => {
    let attempts = 0;
    const fetchMock = await openOrders({
      [`GET ${ORDERS_URL}`]: () => (++attempts === 1 ? apiError(503, 'SERVICE_UNAVAILABLE') : json(200, { orders: [order()] })),
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('We couldn’t load your orders');
    expect(alert.textContent).toContain('OpsPilot is temporarily unavailable. Please try again shortly.');
    expect(alert.textContent).not.toMatch(/SERVICE_UNAVAILABLE|server message/);

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Quarterly supplies')).toBeTruthy();
    expect(requestsTo(fetchMock, 'GET', ORDERS_URL)).toHaveLength(2);
  });

  it('returns to sign-in when the session has expired', async () => {
    await openOrders({ [`GET ${ORDERS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });
});

describe('New order dialog', () => {
  it('offers only the current organization’s customers, as returned by its customers API', async () => {
    const { fetchMock, dialog } = await openForm();

    const options = within(dialog.getByLabelText('Customer')).getAllByRole('option');
    expect(options.map((option) => [option.value, option.textContent])).toEqual([
      ['', 'Choose a customer'],
      [HOOLI.id, 'Hooli'],
      [INITECH.id, 'Initech'],
    ]);
    const customerRequests = fetchMock.mock.calls.filter(([url]) => url.includes('/customers'));
    expect(customerRequests.map(([url]) => url)).toEqual([CUSTOMERS_URL]);
    expect(customerRequests[0][1].body).toBeUndefined();
  });

  it('starts on the customer field, with status Pending and currency INR', async () => {
    const { dialog } = await openForm();

    await waitFor(() => expect(document.activeElement).toBe(dialog.getByLabelText('Customer')));
    expect(dialog.getByLabelText('Status').value).toBe('pending');
    expect(within(dialog.getByLabelText('Status')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Pending',
      'Confirmed',
      'Completed',
      'Cancelled',
    ]);
    expect(dialog.getByLabelText('Currency').value).toBe('INR');
    expect(dialog.getByLabelText('Total amount').getAttribute('inputmode')).toBe('decimal');
  });

  it('shows a loading state while customers load', async () => {
    const { dialog } = await openDialog({ [`GET ${CUSTOMERS_URL}`]: () => new Promise(() => {}) });

    expect(dialog.getByText('Loading customers…').getAttribute('role')).toBe('status');
    expect(dialog.queryByRole('button', { name: 'Create order' })).toBeNull();
  });

  it('explains when customers cannot be loaded and retries', async () => {
    let attempts = 0;
    const { dialog } = await openDialog({
      [`GET ${CUSTOMERS_URL}`]: () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : json(200, { customers: [INITECH] })),
    });

    const alert = await dialog.findByRole('alert');
    expect(alert.textContent).toContain('We couldn’t load your customers');

    fireEvent.click(dialog.getByRole('button', { name: 'Try again' }));

    expect(await dialog.findByLabelText('Customer')).toBeTruthy();
  });

  it('explains that a customer is needed first and leads to Customers', async () => {
    const { dialog } = await openDialog({ [`GET ${CUSTOMERS_URL}`]: customersListed([]) });

    expect(await dialog.findByText('Add a customer first')).toBeTruthy();
    expect(dialog.queryByLabelText('Customer')).toBeNull();
    const link = dialog.getByRole('link', { name: 'Go to Customers' });
    await waitFor(() => expect(document.activeElement).toBe(link));

    fireEvent.click(link);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeTruthy();
    expect(window.location.pathname).toBe('/customers');
  });

  it('requires a customer, a description and an amount before calling the API', async () => {
    const { fetchMock, dialog } = await openForm();

    submit(dialog);

    expect(dialog.getByText('Choose a customer.')).toBeTruthy();
    expect(dialog.getByText('Describe the order.')).toBeTruthy();
    expect(dialog.getByText('Enter the total amount.')).toBeTruthy();
    expect(dialog.getByLabelText('Customer').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(dialog.getByLabelText('Customer'));
    expect(requestsTo(fetchMock, 'POST', ORDERS_URL)).toHaveLength(0);
  });

  it.each([
    ['a negative amount', { 'Total amount': '-5' }, 'Enter an amount like 1250 or 1250.50.'],
    ['text as the amount', { 'Total amount': 'twelve' }, 'Enter an amount like 1250 or 1250.50.'],
    ['too many decimal places', { 'Total amount': '12.345' }, 'Use at most 2 decimal places.'],
    ['decimals in a currency without them', { 'Total amount': '10.5', Currency: 'jpy' }, 'JPY amounts can’t have decimals.'],
    ['an unknown currency', { Currency: 'XYZ' }, 'Enter a currency code, like INR.'],
    ['a currency that is not a code', { Currency: '₹' }, 'Enter a currency code, like INR.'],
  ])('rejects %s before calling the API', async (_, fields, message) => {
    const { fetchMock, dialog } = await openForm();
    fillValidOrder(dialog);
    for (const [label, value] of Object.entries(fields)) fillIn(dialog, label, value);

    submit(dialog);

    expect(dialog.getByText(message)).toBeTruthy();
    expect(requestsTo(fetchMock, 'POST', ORDERS_URL)).toHaveLength(0);
  });

  it('creates the order and adds it to the top of the list without reloading it', async () => {
    const existing = order({ id: 'f'.repeat(24), customerName: 'Hooli', description: 'Earlier order' });
    const created = order({ status: 'confirmed', currency: 'USD', totalAmount: 1250.5 });
    const { fetchMock, dialog } = await openForm({
      [`GET ${ORDERS_URL}`]: ordersListed([existing]),
      [`POST ${ORDERS_URL}`]: () => json(201, { order: created }),
    });
    fillValidOrder(dialog);
    fillIn(dialog, 'Description', '  Quarterly supplies ');
    fillIn(dialog, 'Status', 'confirmed');
    fillIn(dialog, 'Currency', ' usd ');

    submit(dialog);

    await screen.findByText('was added.', { exact: false });
    expect(screen.getByRole('status').textContent).toBe('Order for Initech was added.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tableRows().map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Quarterly supplies', 'Earlier order']);

    const [[, init]] = requestsTo(fetchMock, 'POST', ORDERS_URL);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({
      customerId: INITECH.id,
      description: 'Quarterly supplies',
      status: 'confirmed',
      totalAmount: 1250.5,
      currency: 'USD',
    });
    expect(requestsTo(fetchMock, 'GET', ORDERS_URL)).toHaveLength(1);
  });

  it('creates the first order from the empty state in INR by default', async () => {
    const { fetchMock, dialog } = await openForm({ [`POST ${ORDERS_URL}`]: () => json(201, { order: order() }) });
    fillValidOrder(dialog);

    submit(dialog);

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByText('No orders yet')).toBeNull();
    const [[, init]] = requestsTo(fetchMock, 'POST', ORDERS_URL);
    expect(JSON.parse(init.body)).toMatchObject({ status: 'pending', currency: 'INR', totalAmount: 1250.5 });
  });

  it.each([
    ['rejects the details', () => apiError(400, 'VALIDATION_FAILED'), 'Check the order details and try again.'],
    ['is failing', () => apiError(500, 'INTERNAL_ERROR'), 'Something went wrong on our side. Please try again.'],
    [
      'is unreachable',
      () => {
        throw new TypeError('Failed to fetch');
      },
      'We couldn’t reach OpsPilot. Check your connection and try again.',
    ],
  ])('explains when the server %s and keeps what was entered', async (_, handler, message) => {
    const { dialog } = await openForm({ [`POST ${ORDERS_URL}`]: handler });
    fillValidOrder(dialog);

    submit(dialog);

    expect((await dialog.findByRole('alert')).textContent).toBe(message);
    expect(dialog.getByLabelText('Customer').value).toBe(INITECH.id);
    expect(dialog.getByLabelText('Description').value).toBe('Quarterly supplies');
    expect(dialog.getByLabelText('Total amount').value).toBe('1250.50');
    expect(dialog.getByRole('button', { name: 'Create order' }).matches(':disabled')).toBe(false);
  });

  it('points at the customer when the server no longer finds it in the organization', async () => {
    const { dialog } = await openForm({
      [`POST ${ORDERS_URL}`]: () => json(404, { error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found', requestId: 'r1' } }),
    });
    fillValidOrder(dialog);

    submit(dialog);

    expect(await dialog.findByText('This customer is no longer available. Choose another.')).toBeTruthy();
    expect(dialog.getByLabelText('Customer').getAttribute('aria-invalid')).toBe('true');
    expect(dialog.queryByText('Customer not found')).toBeNull();
  });

  it('locks the form while creating, so it cannot be sent twice or dismissed', async () => {
    let finish;
    const { fetchMock, dialog } = await openForm({
      [`POST ${ORDERS_URL}`]: () => new Promise((resolve) => (finish = resolve)),
    });
    fillValidOrder(dialog);

    submit(dialog);
    const pending = dialog.getByRole('button', { name: 'Creating…' });
    fireEvent.submit(pending.closest('form'));
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog').dispatchEvent(escape);

    expect(pending.matches(':disabled')).toBe(true);
    expect(dialog.getByLabelText('Customer').matches(':disabled')).toBe(true);
    expect(dialog.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(requestsTo(fetchMock, 'POST', ORDERS_URL)).toHaveLength(1);

    finish(json(201, { order: order() }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it.each(['Cancel', 'Close'])('closes with %s without saving, and starts empty next time', async (button) => {
    const { fetchMock, dialog } = await openForm();
    fillValidOrder(dialog);

    fireEvent.click(dialog.getByRole('button', { name: button }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestsTo(fetchMock, 'POST', ORDERS_URL)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'New order' }));
    const reopened = within(screen.getByRole('dialog'));
    expect((await reopened.findByLabelText('Customer')).value).toBe('');
    expect(reopened.getByLabelText('Description').value).toBe('');
  });

  it('returns to sign-in when the session expires while creating', async () => {
    const { dialog } = await openForm({ [`POST ${ORDERS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });
    fillValidOrder(dialog);

    submit(dialog);

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('never sends an organization or user ID in the body, and stores nothing in the browser', async () => {
    const { fetchMock, dialog } = await openForm({ [`POST ${ORDERS_URL}`]: () => json(201, { order: order() }) });
    fillValidOrder(dialog);

    submit(dialog);
    await screen.findByRole('table');

    const [[, init]] = requestsTo(fetchMock, 'POST', ORDERS_URL);
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(['currency', 'customerId', 'description', 'status', 'totalAmount']);
    expect(init.body).not.toContain(ACME.id);
    expect(init.body).not.toContain(USER.id);
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
