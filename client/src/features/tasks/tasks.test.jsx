import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { stubModalDialogs } from '../../testing/dialog.js';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'member', createdAt: '2026-10-08T09:30:00.000Z' };
const base = `/api/v1/organizations/${ACME.id}`;
const TASKS_URL = `${base}/tasks`;
const CUSTOMERS_URL = `${base}/customers`;
const ORDERS_URL = `${base}/orders`;

const customer = (id, name) => ({ id, name, email: null, phone: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' });
const INITECH = customer('c'.repeat(24), 'Initech');
const HOOLI = customer('d'.repeat(24), 'Hooli');
const order = (id, customerOf, description) => ({
  id,
  customerId: customerOf.id,
  customerName: customerOf.name,
  description,
  status: 'confirmed',
  totalAmount: 100,
  currency: 'INR',
  createdAt: '2026-10-02T10:00:00.000Z',
});
const INITECH_ORDER = order('e'.repeat(24), INITECH, 'Quarterly supplies');
const HOOLI_ORDER = order('9'.repeat(24), HOOLI, 'Server racks');

const task = (overrides) => ({
  id: '1'.repeat(24),
  title: 'Confirm delivery date',
  description: null,
  status: 'todo',
  priority: 'medium',
  customerId: null,
  customerName: null,
  orderId: null,
  orderDescription: null,
  dueDate: null,
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
  ...overrides,
});
const LINKED_TASK = task({
  description: 'Ask about the loading dock.',
  status: 'in_progress',
  priority: 'high',
  customerId: INITECH.id,
  customerName: 'Initech',
  orderId: INITECH_ORDER.id,
  orderDescription: 'Quarterly supplies',
  dueDate: '2026-10-31',
});

const listed = (key, items) => () => json(200, { [key]: items });

function mockServer(handlers) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }),
    [`GET ${TASKS_URL}`]: listed('tasks', []),
    [`GET ${CUSTOMERS_URL}`]: listed('customers', [INITECH, HOOLI]),
    [`GET ${ORDERS_URL}`]: listed('orders', [HOOLI_ORDER, INITECH_ORDER]),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });

// Signs in on the dashboard, then follows the sidebar link, as a user would.
async function openTasksFromSidebar(handlers = {}) {
  const fetchMock = mockServer(handlers);
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'Tasks' }));
  await screen.findByRole('heading', { level: 1, name: 'Tasks' });
  return fetchMock;
}

// Loads the page at its own address, so only this page's requests are made (the dashboard
// loads workspace data of its own).
async function openTasks(handlers = {}) {
  const fetchMock = mockServer(handlers);
  window.history.replaceState(null, '', '/tasks');
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Tasks' });
  return fetchMock;
}

async function openDialog(handlers) {
  const fetchMock = await openTasks(handlers);
  const [newTask] = await screen.findAllByRole('button', { name: 'New task' });
  fireEvent.click(newTask);
  return { fetchMock, dialog: within(screen.getByRole('dialog', { name: 'New task' })) };
}

// Opens the dialog and waits until the customers and orders have loaded into it.
async function openForm(handlers) {
  const opened = await openDialog(handlers);
  await waitFor(() => expect(opened.dialog.getByLabelText(/^Customer/).matches(':disabled')).toBe(false));
  return opened;
}

function fillIn(dialog, label, value) {
  fireEvent.change(dialog.getByLabelText(label), { target: { value } });
}

const optionsOf = (select) => within(select).getAllByRole('option').map((option) => [option.value, option.textContent]);
const submit = (dialog) => fireEvent.click(dialog.getByRole('button', { name: 'Create task' }));
const tableRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const statusSelect = (title) => screen.getByRole('combobox', { name: `Status of ${title}` });

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

describe('Tasks navigation', () => {
  it('opens from the sidebar as the current page, and Back returns to the dashboard', async () => {
    await openTasksFromSidebar();

    expect(window.location.pathname).toBe('/tasks');
    expect(within(navigation()).getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page');

    window.history.back();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(within(navigation()).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
  });

  it('keeps Customers and Orders reachable', async () => {
    await openTasks();

    fireEvent.click(within(navigation()).getByRole('link', { name: 'Customers' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeTruthy();

    fireEvent.click(within(navigation()).getByRole('link', { name: 'Orders' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Orders' })).toBeTruthy();
  });

  it('opens from the dashboard’s tasks needing attention', async () => {
    mockServer();
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });

    fireEvent.click(screen.getByRole('link', { name: 'All tasks' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
  });

  it('opens straight to Tasks when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/tasks');
    mockServer({ [`GET ${TASKS_URL}`]: listed('tasks', [task()]) });

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
    expect(await screen.findByText('Confirm delivery date')).toBeTruthy();
  });
});

describe('Tasks list', () => {
  it('shows a loading state while tasks load', async () => {
    await openTasks({ [`GET ${TASKS_URL}`]: () => new Promise(() => {}) });

    expect(screen.getByText('Loading tasks…').getAttribute('role')).toBe('status');
  });

  it('asks for the current organization’s tasks, identified only by the session cookie', async () => {
    const fetchMock = await openTasks();
    await screen.findByText('No tasks yet');

    const calls = requestsTo(fetchMock, 'GET', TASKS_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0][1].credentials).toBe('same-origin');
    expect(calls[0][1].body).toBeUndefined();
  });

  it('shows an empty state with a way to create the first task', async () => {
    await openTasks();

    expect(await screen.findByText('No tasks yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'New task' })).toHaveLength(1);
  });

  it('lists tasks with their customer, order, priority, status and dates', async () => {
    await openTasks({
      [`GET ${TASKS_URL}`]: listed('tasks', [LINKED_TASK, task({ id: '2'.repeat(24), title: 'Tidy the warehouse', priority: 'low' })]),
    });
    await screen.findByRole('table');

    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Task', 'Customer', 'Order', 'Priority', 'Status', 'Due', 'Created']);

    const [linked, standalone] = tableRows();
    expect(within(linked).getByRole('rowheader').textContent).toBe('Confirm delivery dateAsk about the loading dock.');
    const linkedCells = within(linked).getAllByRole('cell').map((cell) => cell.textContent);
    expect(linkedCells.slice(0, 3)).toEqual(['Initech', 'Quarterly supplies', 'High']);
    expect(statusSelect('Confirm delivery date').value).toBe('in_progress');
    expect(linked.querySelector('time[datetime="2026-10-31"]').textContent).toMatch(/31.*2026|2026.*31/);

    const standaloneCells = within(standalone).getAllByRole('cell').map((cell) => cell.textContent);
    // A missing value shows a dash, read out as "None".
    expect(standaloneCells.slice(0, 3)).toEqual(['—None', '—None', 'Low']);
    expect(standaloneCells[4]).toBe('—None');
    expect(optionsOf(statusSelect('Tidy the warehouse'))).toEqual([
      ['todo', 'To do'],
      ['in_progress', 'In progress'],
      ['completed', 'Completed'],
    ]);
  });

  it('explains a failed load and retries', async () => {
    let attempts = 0;
    const fetchMock = await openTasks({
      [`GET ${TASKS_URL}`]: () => (++attempts === 1 ? apiError(503, 'SERVICE_UNAVAILABLE') : json(200, { tasks: [task()] })),
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('We couldn’t load your tasks');
    expect(alert.textContent).toContain('OpsPilot is temporarily unavailable. Please try again shortly.');
    expect(alert.textContent).not.toMatch(/SERVICE_UNAVAILABLE|server message/);

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Confirm delivery date')).toBeTruthy();
    expect(requestsTo(fetchMock, 'GET', TASKS_URL)).toHaveLength(2);
  });

  it('returns to sign-in when the session has expired', async () => {
    await openTasks({ [`GET ${TASKS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });
});

describe('Changing a task’s status', () => {
  const TASK_URL = `${TASKS_URL}/${LINKED_TASK.id}`;

  it('sends only the new status, waits for the server, then shows the returned task', async () => {
    let finish;
    const fetchMock = await openTasks({
      [`GET ${TASKS_URL}`]: listed('tasks', [LINKED_TASK]),
      [`PATCH ${TASK_URL}`]: () => new Promise((resolve) => (finish = resolve)),
    });
    await screen.findByRole('table');

    fireEvent.change(statusSelect('Confirm delivery date'), { target: { value: 'completed' } });

    expect(statusSelect('Confirm delivery date').value).toBe('completed');
    expect(statusSelect('Confirm delivery date').matches(':disabled')).toBe(true);
    expect(screen.queryByText(/is now Completed/)).toBeNull();
    const [[, init]] = requestsTo(fetchMock, 'PATCH', TASK_URL);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ status: 'completed' });

    finish(json(200, { task: { ...LINKED_TASK, status: 'completed', updatedAt: '2026-10-09T10:00:00.000Z' } }));

    expect(await screen.findByText('“Confirm delivery date” is now Completed.')).toBeTruthy();
    expect(statusSelect('Confirm delivery date').value).toBe('completed');
    expect(statusSelect('Confirm delivery date').matches(':disabled')).toBe(false);
    expect(requestsTo(fetchMock, 'GET', TASKS_URL)).toHaveLength(1);
  });

  it.each([
    ['fails', () => apiError(500, 'INTERNAL_ERROR'), 'We couldn’t update “Confirm delivery date”. Something went wrong on our side. Please try again.'],
    ['no longer finds the task', () => apiError(404, 'TASK_NOT_FOUND'), '“Confirm delivery date” no longer exists.'],
  ])('keeps the old status and explains when the server %s', async (_, handler, message) => {
    await openTasks({ [`GET ${TASKS_URL}`]: listed('tasks', [LINKED_TASK]), [`PATCH ${TASK_URL}`]: handler });
    await screen.findByRole('table');

    fireEvent.change(statusSelect('Confirm delivery date'), { target: { value: 'completed' } });

    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(statusSelect('Confirm delivery date').value).toBe('in_progress');
    expect(statusSelect('Confirm delivery date').matches(':disabled')).toBe(false);
  });

  it('returns to sign-in when the session expires while saving', async () => {
    await openTasks({
      [`GET ${TASKS_URL}`]: listed('tasks', [LINKED_TASK]),
      [`PATCH ${TASK_URL}`]: () => apiError(401, 'UNAUTHENTICATED'),
    });
    await screen.findByRole('table');

    fireEvent.change(statusSelect('Confirm delivery date'), { target: { value: 'completed' } });

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });
});

describe('New task dialog', () => {
  it('opens on the title with defaults Medium and To do, and the optional fields empty', async () => {
    const { dialog } = await openForm();

    expect(document.activeElement).toBe(dialog.getByLabelText('Title'));
    expect(dialog.getByLabelText('Priority').value).toBe('medium');
    expect(dialog.getByLabelText('Status').value).toBe('todo');
    expect(dialog.getByLabelText(/^Description/).tagName).toBe('TEXTAREA');
    expect(dialog.getByLabelText(/^Due date/).getAttribute('type')).toBe('date');
    expect(dialog.getByLabelText(/^Customer/).value).toBe('');
    expect(dialog.getByLabelText(/^Order/).value).toBe('');
  });

  it('offers only the current organization’s customers and orders, from its own APIs', async () => {
    const { fetchMock, dialog } = await openForm();

    expect(optionsOf(dialog.getByLabelText(/^Customer/))).toEqual([
      ['', 'No customer'],
      [HOOLI.id, 'Hooli'],
      [INITECH.id, 'Initech'],
    ]);
    expect(optionsOf(dialog.getByLabelText(/^Order/))).toEqual([
      ['', 'No order'],
      [HOOLI_ORDER.id, 'Server racks — Hooli'],
      [INITECH_ORDER.id, 'Quarterly supplies — Initech'],
    ]);
    const linkRequests = fetchMock.mock.calls.filter(([url]) => /\/(customers|orders)$/.test(url));
    expect(linkRequests.map(([url]) => url).sort()).toEqual([CUSTOMERS_URL, ORDERS_URL]);
    expect(linkRequests.every(([, init]) => init.body === undefined)).toBe(true);
  });

  it('keeps the customer and order consistent with each other', async () => {
    const { dialog } = await openForm();

    fillIn(dialog, /^Order/, INITECH_ORDER.id);
    expect(dialog.getByLabelText(/^Customer/).value).toBe(INITECH.id);

    fireEvent.change(dialog.getByLabelText(/^Customer/), { target: { value: HOOLI.id } });
    expect(dialog.getByLabelText(/^Order/).value).toBe('');
    expect(optionsOf(dialog.getByLabelText(/^Order/))).toEqual([
      ['', 'No order'],
      [HOOLI_ORDER.id, 'Server racks — Hooli'],
    ]);
  });

  it('works without customers or orders, which just leave nothing to pick', async () => {
    const { fetchMock, dialog } = await openForm({
      [`GET ${CUSTOMERS_URL}`]: listed('customers', []),
      [`GET ${ORDERS_URL}`]: listed('orders', []),
      [`POST ${TASKS_URL}`]: () => json(201, { task: task() }),
    });

    expect(optionsOf(dialog.getByLabelText(/^Customer/))).toEqual([['', 'No customer']]);
    expect(optionsOf(dialog.getByLabelText(/^Order/))).toEqual([['', 'No order']]);
    expect(dialog.getByText('No orders yet.')).toBeTruthy();

    fillIn(dialog, 'Title', 'Confirm delivery date');
    submit(dialog);

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(JSON.parse(requestsTo(fetchMock, 'POST', TASKS_URL)[0][1].body)).toEqual({
      title: 'Confirm delivery date',
      status: 'todo',
      priority: 'medium',
    });
  });

  it('can be filled in while customers and orders load, with their fields disabled until then', async () => {
    const { dialog } = await openDialog({ [`GET ${CUSTOMERS_URL}`]: () => new Promise(() => {}) });

    expect(dialog.getByLabelText(/^Customer/).matches(':disabled')).toBe(true);
    expect(dialog.getByLabelText(/^Order/).matches(':disabled')).toBe(true);
    expect(dialog.getByText('Loading customers…')).toBeTruthy();
    expect(dialog.getByLabelText('Title').matches(':disabled')).toBe(false);
  });

  it('still creates a task when customers and orders cannot be loaded, and can retry them', async () => {
    let attempts = 0;
    const { dialog } = await openDialog({
      [`GET ${ORDERS_URL}`]: () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : json(200, { orders: [INITECH_ORDER] })),
    });

    const alert = await dialog.findByRole('alert');
    expect(alert.textContent).toContain('You can still create the task without them.');
    expect(dialog.getByRole('button', { name: 'Create task' }).matches(':disabled')).toBe(false);

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(dialog.getByLabelText(/^Order/).matches(':disabled')).toBe(false));
    expect(dialog.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['without a title', { Title: '   ' }, 'Give the task a title.', 'Title'],
    ['with a title over 200 characters', { Title: 'a'.repeat(201) }, 'Use 200 characters or fewer.', 'Title'],
    ['with a description over 2000 characters', { Title: 'Follow up', Description: 'a'.repeat(2001) }, 'Use 2000 characters or fewer.', /^Description/],
  ])('rejects a task %s before calling the API, and focuses the field', async (_, fields, message, focused) => {
    const { fetchMock, dialog } = await openForm();
    for (const [label, value] of Object.entries(fields)) fillIn(dialog, label === 'Description' ? /^Description/ : label, value);

    submit(dialog);

    expect(dialog.getByText(message)).toBeTruthy();
    expect(document.activeElement).toBe(dialog.getByLabelText(focused));
    expect(requestsTo(fetchMock, 'POST', TASKS_URL)).toHaveLength(0);
  });

  it('creates a linked task and adds it to the top of the list without reloading it', async () => {
    const existing = task({ id: '2'.repeat(24), title: 'Earlier task' });
    const { fetchMock, dialog } = await openForm({
      [`GET ${TASKS_URL}`]: listed('tasks', [existing]),
      [`POST ${TASKS_URL}`]: () => json(201, { task: LINKED_TASK }),
    });
    fillIn(dialog, 'Title', '  Confirm delivery date ');
    fillIn(dialog, /^Description/, ' Ask about the loading dock. ');
    fillIn(dialog, /^Order/, INITECH_ORDER.id);
    fillIn(dialog, 'Priority', 'high');
    fillIn(dialog, 'Status', 'in_progress');
    fillIn(dialog, /^Due date/, '2026-10-31');

    submit(dialog);

    expect(await screen.findByText('was added.', { exact: false })).toBeTruthy();
    expect(screen.getByText('was added.', { exact: false }).textContent).toBe('Task Confirm delivery date was added.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tableRows().map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'Confirm delivery dateAsk about the loading dock.',
      'Earlier task',
    ]);

    const [[, init]] = requestsTo(fetchMock, 'POST', TASKS_URL);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({
      title: 'Confirm delivery date',
      description: 'Ask about the loading dock.',
      status: 'in_progress',
      priority: 'high',
      customerId: INITECH.id,
      orderId: INITECH_ORDER.id,
      dueDate: '2026-10-31',
    });
    expect(requestsTo(fetchMock, 'GET', TASKS_URL)).toHaveLength(1);
  });

  it.each([
    ['rejects the details', () => apiError(400, 'VALIDATION_FAILED'), 'Check the task details and try again.'],
    ['is failing', () => apiError(500, 'INTERNAL_ERROR'), 'Something went wrong on our side. Please try again.'],
    [
      'is unreachable',
      () => {
        throw new TypeError('Failed to fetch');
      },
      'We couldn’t reach OpsPilot. Check your connection and try again.',
    ],
  ])('explains when the server %s and keeps what was entered', async (_, handler, message) => {
    const { dialog } = await openForm({ [`POST ${TASKS_URL}`]: handler });
    fillIn(dialog, 'Title', 'Confirm delivery date');
    fillIn(dialog, /^Customer/, INITECH.id);

    submit(dialog);

    expect((await dialog.findByRole('alert')).textContent).toBe(message);
    expect(dialog.getByLabelText('Title').value).toBe('Confirm delivery date');
    expect(dialog.getByLabelText(/^Customer/).value).toBe(INITECH.id);
    expect(dialog.getByRole('button', { name: 'Create task' }).matches(':disabled')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(dialog.getByLabelText('Title')));
  });

  it.each([
    ['CUSTOMER_NOT_FOUND', /^Customer/, 'This customer is no longer available. Choose another.'],
    ['ORDER_NOT_FOUND', /^Order/, 'This order is no longer available. Choose another.'],
  ])('points at the field when the server answers %s', async (code, field, message) => {
    const { dialog } = await openForm({
      [`POST ${TASKS_URL}`]: () => json(404, { error: { code, message: 'Not found', requestId: 'r1' } }),
    });
    fillIn(dialog, 'Title', 'Confirm delivery date');
    fillIn(dialog, /^Order/, INITECH_ORDER.id);

    submit(dialog);

    expect(await dialog.findByText(message)).toBeTruthy();
    expect(dialog.getByLabelText(field).getAttribute('aria-invalid')).toBe('true');
  });

  it('locks the form while creating, so it cannot be sent twice or dismissed', async () => {
    let finish;
    const { fetchMock, dialog } = await openForm({
      [`POST ${TASKS_URL}`]: () => new Promise((resolve) => (finish = resolve)),
    });
    fillIn(dialog, 'Title', 'Confirm delivery date');

    submit(dialog);
    const pending = dialog.getByRole('button', { name: 'Creating…' });
    fireEvent.submit(pending.closest('form'));
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog').dispatchEvent(escape);

    expect(pending.matches(':disabled')).toBe(true);
    expect(dialog.getByLabelText('Title').matches(':disabled')).toBe(true);
    expect(dialog.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(requestsTo(fetchMock, 'POST', TASKS_URL)).toHaveLength(1);

    finish(json(201, { task: task() }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it.each(['Cancel', 'Close'])('closes with %s without saving, and starts empty next time', async (button) => {
    const { fetchMock, dialog } = await openForm();
    fillIn(dialog, 'Title', 'Confirm delivery date');

    fireEvent.click(dialog.getByRole('button', { name: button }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestsTo(fetchMock, 'POST', TASKS_URL)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Title').value).toBe('');
  });

  it('returns to sign-in when the session expires while creating', async () => {
    const { dialog } = await openForm({ [`POST ${TASKS_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });
    fillIn(dialog, 'Title', 'Confirm delivery date');

    submit(dialog);

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('never sends an organization or user ID, and stores nothing in the browser', async () => {
    const { fetchMock, dialog } = await openForm({
      [`GET ${TASKS_URL}`]: listed('tasks', []),
      [`POST ${TASKS_URL}`]: () => json(201, { task: LINKED_TASK }),
      [`PATCH ${TASKS_URL}/${LINKED_TASK.id}`]: () => json(200, { task: { ...LINKED_TASK, status: 'completed' } }),
    });
    fillIn(dialog, 'Title', 'Confirm delivery date');
    fillIn(dialog, /^Order/, INITECH_ORDER.id);
    submit(dialog);
    await screen.findByRole('table');
    fireEvent.change(statusSelect('Confirm delivery date'), { target: { value: 'completed' } });
    await screen.findByText(/is now Completed/);

    for (const [, init = {}] of fetchMock.mock.calls) {
      if (!init.body) continue;
      expect(Object.keys(JSON.parse(init.body))).not.toContain('organizationId');
      expect(init.body).not.toContain(ACME.id);
      expect(init.body).not.toContain(USER.id);
    }
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
