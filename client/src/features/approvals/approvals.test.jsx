import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };
const APPROVALS_URL = `/api/v1/organizations/${ACME.id}/approvals`;
const PENDING_URL = `${APPROVALS_URL}?status=pending&limit=50`;
const RECENT_URL = `${APPROVALS_URL}?limit=20`;
const APPROVAL_ID = 'c'.repeat(24);
const APPROVE_URL = `${APPROVALS_URL}/${APPROVAL_ID}/approve`;
const REJECT_URL = `${APPROVALS_URL}/${APPROVAL_ID}/reject`;

const proposal = (overrides) => ({
  id: APPROVAL_ID,
  source: 'ai',
  action: 'create_task',
  status: 'pending',
  summary: 'Follow up on the pending Initech order',
  parameters: {
    title: 'Call Initech about their order',
    description: 'Confirm the delivery date.',
    status: 'todo',
    priority: 'high',
    customerId: 'd'.repeat(24),
    orderId: 'e'.repeat(24),
    dueDate: '2026-10-12',
    customerName: 'Initech',
    orderDescription: 'Initech supplies',
  },
  requestedByEmail: 'grace@example.com',
  reviewedByEmail: null,
  reviewedAt: null,
  rejectionReason: null,
  result: null,
  failure: null,
  createdAt: '2026-10-09T10:15:00.000Z',
  updatedAt: '2026-10-09T10:15:00.000Z',
  ...overrides,
});
// Dates are shown in the reader's locale, so expectations use the same formats as the page.
const dueText = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2026-10-12T00:00:00Z'));
const requestedText = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-10-09T10:15:00.000Z'));

const reviewed = (status, overrides) => proposal({ status, reviewedByEmail: 'ada@example.com', reviewedAt: '2026-10-09T11:00:00.000Z', ...overrides });
const page = (approvals, hasMore = false) => () => json(200, { approvals, page: 1, limit: 20, hasMore });

function mockServer({ organization = ACME, ...handlers } = {}) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [organization] }),
    [`GET ${PENDING_URL}`]: page([proposal()]),
    [`GET ${RECENT_URL}`]: page([proposal()]),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });
const waiting = () => within(screen.getByRole('region', { name: 'Waiting for approval' }));
const reviewedPanel = () => within(screen.getByRole('region', { name: 'Recently reviewed' }));
const card = () => screen.getByRole('article', { name: /Create task/ });

// Signs in on the dashboard, then follows the sidebar link, as a user would.
async function openApprovalsFromSidebar(options) {
  const fetchMock = mockServer(options);
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'Approvals' }));
  await screen.findByRole('heading', { level: 1, name: 'Approvals' });
  return fetchMock;
}

// Loads the page at its own address, so only this page's requests are made (the dashboard
// loads workspace data of its own).
async function openApprovals(options) {
  const fetchMock = mockServer(options);
  window.history.replaceState(null, '', '/approvals');
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Approvals' });
  return fetchMock;
}

// The card's fields as { label: value }.
function details(article) {
  return Object.fromEntries(
    [...article.querySelectorAll('dl > div')].map((row) => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]),
  );
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

describe('Approvals navigation', () => {
  it('opens from the sidebar as the current page, and Back returns to the dashboard', async () => {
    await openApprovalsFromSidebar();

    expect(window.location.pathname).toBe('/approvals');
    expect(within(navigation()).getByRole('link', { name: 'Approvals' }).getAttribute('aria-current')).toBe('page');

    window.history.back();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });

  it('opens straight to approvals when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/approvals');
    mockServer();

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Approvals' })).toBeTruthy();
    expect(await screen.findByRole('article', { name: /Create task/ })).toBeTruthy();
  });
});

describe('Approvals list', () => {
  it('loads the waiting proposals and recent decisions, showing a loading state first', async () => {
    let finish;
    const fetchMock = await openApprovals({ [`GET ${PENDING_URL}`]: () => new Promise((resolve) => (finish = resolve)) });

    expect(screen.getByText('Loading approvals…').getAttribute('role')).toBe('status');
    finish(page([proposal()])());
    await screen.findByRole('article', { name: /Create task/ });
    expect(requestsTo(fetchMock, 'GET', PENDING_URL)).toHaveLength(1);
    expect(requestsTo(fetchMock, 'GET', RECENT_URL)).toHaveLength(1);
  });

  it('shows what approving would create, field by field, not raw data', async () => {
    await openApprovals();

    const article = await waiting().findByRole('article', { name: 'Create task: Call Initech about their order' });
    expect(details(article)).toEqual({
      Title: 'Call Initech about their order',
      Description: 'Confirm the delivery date.',
      Customer: 'Initech',
      Order: 'Initech supplies',
      Priority: 'High',
      Status: 'To do',
      Due: dueText,
    });
    expect(within(article).getByText('Pending')).toBeTruthy();
    expect(within(article).getByText('Proposed by the AI Assistant')).toBeTruthy();
    expect(article.textContent).toContain('“Follow up on the pending Initech order”');
    expect(article.textContent).toContain(`Requested by grace@example.com on ${requestedText}`);
    expect(article.textContent).not.toMatch(/[{}]|customerId|create_task|d{24}/);
    expect(within(article).getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(within(article).getByRole('button', { name: 'Reject' })).toBeTruthy();
  });

  it('names missing links instead of hiding them, and says when there is no due date', async () => {
    await openApprovals({
      [`GET ${PENDING_URL}`]: page([
        proposal({ parameters: { title: 'Plan the review', status: 'in_progress', priority: 'low', customerId: 'd'.repeat(24), customerName: null, orderDescription: null } }),
      ]),
    });

    const article = await screen.findByRole('article', { name: /Create task/ });
    expect(details(article)).toEqual({
      Title: 'Plan the review',
      Customer: 'Not found in this workspace',
      Order: 'None',
      Priority: 'Low',
      Status: 'In progress',
      Due: 'No due date',
    });
  });

  it('shows record text as plain text, never as HTML', async () => {
    await openApprovals({
      [`GET ${PENDING_URL}`]: page([proposal({ summary: '<img src=x onerror="alert(1)">', parameters: { ...proposal().parameters, title: '<b>Bold</b>' } })]),
    });

    await screen.findByRole('article', { name: /Create task/ });
    expect(screen.getByRole('main').querySelector('img, b')).toBeNull();
    expect(screen.getAllByText(/<b>Bold<\/b>/).length).toBeGreaterThan(0);
  });

  it('explains an empty list and links to the assistant', async () => {
    await openApprovals({ [`GET ${PENDING_URL}`]: page([]), [`GET ${RECENT_URL}`]: page([]) });

    expect(await waiting().findByText('No approvals waiting')).toBeTruthy();
    expect(waiting().getByRole('link', { name: 'Open AI Assistant' }).getAttribute('href')).toBe('/assistant');
    expect(reviewedPanel().getByText('No decisions yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve|reject/i })).toBeNull();
  });

  it('lists recent decisions with their outcome and no review controls', async () => {
    await openApprovals({
      [`GET ${PENDING_URL}`]: page([]),
      [`GET ${RECENT_URL}`]: page([
        reviewed('executed', { id: '1'.repeat(24), result: { resourceType: 'task', resourceId: 'f'.repeat(24) } }),
        reviewed('rejected', { id: '2'.repeat(24), rejectionReason: 'Not this quarter' }),
        reviewed('execution_failed', { id: '3'.repeat(24), failure: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' } }),
      ]),
    });

    const articles = await reviewedPanel().findAllByRole('article');
    expect(articles.map((article) => within(article).getByText(/^(Executed|Rejected|Failed)$/).textContent)).toEqual(['Executed', 'Rejected', 'Failed']);
    expect(articles[0].textContent).toContain('The task was created.');
    expect(within(articles[0]).getByRole('link', { name: 'View tasks' }).getAttribute('href')).toBe('/tasks');
    expect(articles[1].textContent).toContain('Reason: Not this quarter');
    expect(articles[2].textContent).toContain('could not be created: Customer not found. Nothing was changed.');
    expect(screen.queryByRole('button', { name: /approve|reject/i })).toBeNull();
  });

  it('shows a member what is waiting without review controls', async () => {
    await openApprovals({ organization: { ...ACME, role: 'member' } });

    await screen.findByRole('article', { name: /Create task/ });
    expect(screen.getByText(/Only owners and admins can approve or reject proposals/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve|reject/i })).toBeNull();
  });

  it('cannot review a kind of change it does not know how to show', async () => {
    await openApprovals({ [`GET ${PENDING_URL}`]: page([proposal({ action: 'archive_order', parameters: { orderId: 'e'.repeat(24) } })]) });

    const article = await screen.findByRole('article', { name: 'archive_order' });
    expect(article.textContent).toContain('can’t be reviewed here');
    expect(within(article).queryByRole('button')).toBeNull();
  });

  it('explains a failure to load and loads again on retry', async () => {
    let attempts = 0;
    await openApprovals({ [`GET ${PENDING_URL}`]: () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : page([proposal()])()) });

    expect(await screen.findByText('We couldn’t load approvals')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('article', { name: /Create task/ })).toBeTruthy();
  });
});

describe('Approving', () => {
  it('waits for the server, then shows the task as created and moves the card to recent decisions', async () => {
    let finish;
    const fetchMock = await openApprovals({ [`POST ${APPROVE_URL}`]: () => new Promise((resolve) => (finish = resolve)) });
    const article = await screen.findByRole('article', { name: /Create task/ });

    fireEvent.click(within(article).getByRole('button', { name: 'Approve' }));

    expect(within(article).getByRole('button', { name: 'Approving…' }).matches(':disabled')).toBe(true);
    expect(within(article).getByRole('button', { name: 'Reject' }).matches(':disabled')).toBe(true);
    expect(waiting().getByRole('article', { name: /Create task/ })).toBe(article);
    expect(screen.queryByText(/was created/)).toBeNull();
    const [[, init]] = requestsTo(fetchMock, 'POST', APPROVE_URL);
    expect(init.body).toBeUndefined();

    finish(json(200, { approval: reviewed('executed', { result: { resourceType: 'task', resourceId: 'f'.repeat(24) } }) }));

    const notice = await screen.findByText(/Approved\. The task “Call Initech about their order” was created\./);
    expect(notice.getAttribute('role')).toBe('status');
    expect(within(notice).getByRole('link', { name: 'View tasks' }).getAttribute('href')).toBe('/tasks');
    await waitFor(() => expect(document.activeElement).toBe(notice));
    expect(waiting().getByText('No approvals waiting')).toBeTruthy();
    expect(reviewedPanel().getByText('Executed')).toBeTruthy();
  });

  it('sends one request however many times Approve is clicked', async () => {
    let finish;
    const fetchMock = await openApprovals({ [`POST ${APPROVE_URL}`]: () => new Promise((resolve) => (finish = resolve)) });
    const article = await screen.findByRole('article', { name: /Create task/ });

    const approveButton = within(article).getByRole('button', { name: 'Approve' });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);
    fireEvent.click(within(article).getByRole('button', { name: 'Approving…' }));
    finish(json(200, { approval: reviewed('executed') }));

    await screen.findByText(/Approved\. The task/);
    expect(requestsTo(fetchMock, 'POST', APPROVE_URL)).toHaveLength(1);
  });

  it('says so when the approved change could not be made', async () => {
    await openApprovals({
      [`POST ${APPROVE_URL}`]: () => json(200, { approval: reviewed('execution_failed', { failure: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } }) }),
    });
    fireEvent.click(within(await screen.findByRole('article', { name: /Create task/ })).getByRole('button', { name: 'Approve' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Approved, but the task “Call Initech about their order” could not be created: Order not found. Nothing was changed.');
    expect(reviewedPanel().getByText('Failed')).toBeTruthy();
    expect(screen.queryByText(/was created\./)).toBeNull();
  });

  it.each([
    ['already reviewed by someone else', () => apiError(409, 'APPROVAL_ALREADY_REVIEWED'), 'Someone has already reviewed this proposal, so nothing was changed. The list has been refreshed.', true],
    ['gone', () => apiError(404, 'APPROVAL_NOT_FOUND'), 'This proposal no longer exists. The list has been refreshed.', true],
    ['not allowed', () => apiError(403, 'FORBIDDEN'), 'Only owners and admins can approve or reject proposals.', false],
    ['unreachable', () => Promise.reject(new TypeError('Failed to fetch')), 'We couldn’t approve this proposal. We couldn’t reach OpsPilot. Check your connection and try again.', false],
    ['failing', () => apiError(500, 'INTERNAL_ERROR'), 'We couldn’t approve this proposal. Something went wrong on our side. Please try again.', false],
  ])('explains when the proposal is %s, without claiming anything was created', async (_, handler, message, reloads) => {
    const fetchMock = await openApprovals({ [`POST ${APPROVE_URL}`]: handler });
    fireEvent.click(within(await screen.findByRole('article', { name: /Create task/ })).getByRole('button', { name: 'Approve' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(alert.textContent).not.toMatch(/server message|APPROVAL_|FORBIDDEN/);
    expect(screen.queryByText(/was created\./)).toBeNull();
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', PENDING_URL)).toHaveLength(reloads ? 2 : 1));
    if (!reloads) {
      expect(within(card()).getByRole('button', { name: 'Approve' }).matches(':disabled')).toBe(false);
    }
  });

  it('returns to sign-in when the session has expired', async () => {
    await openApprovals({ [`POST ${APPROVE_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });
    fireEvent.click(within(await screen.findByRole('article', { name: /Create task/ })).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });
});

describe('Rejecting', () => {
  async function startRejecting(options) {
    const fetchMock = await openApprovals(options);
    const article = await screen.findByRole('article', { name: /Create task/ });
    fireEvent.click(within(article).getByRole('button', { name: 'Reject' }));
    return { fetchMock, article };
  }

  it('asks for an optional reason, sends it, and shows the proposal as rejected', async () => {
    const { fetchMock, article } = await startRejecting({
      [`POST ${REJECT_URL}`]: () => json(200, { approval: reviewed('rejected', { rejectionReason: 'Not this quarter' }) }),
    });

    const reason = within(article).getByLabelText(/Reason/);
    expect(document.activeElement).toBe(reason);
    fireEvent.change(reason, { target: { value: '  Not this quarter  ' } });
    fireEvent.click(within(article).getByRole('button', { name: 'Reject proposal' }));

    expect(await screen.findByText('Rejected. The task “Call Initech about their order” was not created.')).toBeTruthy();
    const [[, init]] = requestsTo(fetchMock, 'POST', REJECT_URL);
    expect(JSON.parse(init.body)).toEqual({ reason: 'Not this quarter' });
    expect(reviewedPanel().getByText('Rejected')).toBeTruthy();
    expect(requestsTo(fetchMock, 'POST', APPROVE_URL)).toHaveLength(0);
  });

  it('rejects without a reason', async () => {
    const { fetchMock, article } = await startRejecting({ [`POST ${REJECT_URL}`]: () => json(200, { approval: reviewed('rejected') }) });

    fireEvent.click(within(article).getByRole('button', { name: 'Reject proposal' }));

    await screen.findByText(/was not created/);
    expect(JSON.parse(requestsTo(fetchMock, 'POST', REJECT_URL)[0][1].body)).toEqual({});
  });

  it('refuses a reason over 200 characters before calling the API', async () => {
    const { fetchMock, article } = await startRejecting();

    fireEvent.change(within(article).getByLabelText(/Reason/), { target: { value: 'a'.repeat(201) } });
    fireEvent.click(within(article).getByRole('button', { name: 'Reject proposal' }));

    expect(within(article).getByText('Use 200 characters or fewer.')).toBeTruthy();
    expect(requestsTo(fetchMock, 'POST', REJECT_URL)).toHaveLength(0);
  });

  it('can be cancelled, leaving the proposal waiting', async () => {
    const { article } = await startRejecting();

    fireEvent.click(within(article).getByRole('button', { name: 'Cancel' }));

    expect(within(article).getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(within(article).queryByLabelText(/Reason/)).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });

  it('explains a failed rejection and keeps the reason', async () => {
    const { article } = await startRejecting({ [`POST ${REJECT_URL}`]: () => apiError(500, 'INTERNAL_ERROR') });

    fireEvent.change(within(article).getByLabelText(/Reason/), { target: { value: 'Duplicate' } });
    fireEvent.click(within(article).getByRole('button', { name: 'Reject proposal' }));

    expect((await screen.findByRole('alert')).textContent).toBe('We couldn’t reject this proposal. Something went wrong on our side. Please try again.');
    expect(within(card()).getByLabelText(/Reason/).value).toBe('Duplicate');
  });
});
