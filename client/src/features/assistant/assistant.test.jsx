import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import { apiError, json, mockApi, requestsTo } from '../../testing/mockApi.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme Logistics', slug: 'acme-logistics', role: 'member', createdAt: '2026-10-08T09:30:00.000Z' };
const ASSISTANT_URL = `/api/v1/organizations/${ACME.id}/ai/assistant`;

const AVAILABLE_TOOLS = [
  { name: 'list_customers', description: 'List customers', readOnly: true },
  { name: 'list_orders', description: 'List orders', readOnly: true },
  { name: 'list_tasks', description: 'List tasks', readOnly: true },
];
const reply = (overrides) => ({
  status: 'not_configured',
  text: null,
  provider: 'development',
  toolCalls: [],
  suggestedActions: [],
  requiresApproval: false,
  availableTools: AVAILABLE_TOOLS,
  requestId: 'req-123',
  ...overrides,
});
const replied = (overrides) => () => json(200, { reply: reply(overrides) });

function mockServer(handlers) {
  return mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }),
    [`POST ${ASSISTANT_URL}`]: replied(),
    ...handlers,
  });
}

const navigation = () => screen.getByRole('navigation', { name: 'Main' });
const messageField = () => screen.getByLabelText('Message');
const sendButton = () => screen.getByRole('button', { name: /^Send/ });
const responsePanel = () => within(screen.getByRole('region', { name: 'Response' }));

// Signs in on the dashboard, then follows the sidebar link, as a user would.
async function openAssistant(handlers = {}) {
  const fetchMock = mockServer(handlers);
  render(<App />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  fireEvent.click(within(navigation()).getByRole('link', { name: 'AI Assistant' }));
  await screen.findByRole('heading', { level: 1, name: 'AI Assistant' });
  return fetchMock;
}

function send(message) {
  fireEvent.change(messageField(), { target: { value: message } });
  fireEvent.click(sendButton());
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

describe('AI Assistant navigation', () => {
  it('opens from the sidebar as the current page, and Back returns to the dashboard', async () => {
    await openAssistant();

    expect(window.location.pathname).toBe('/assistant');
    expect(within(navigation()).getByRole('link', { name: 'AI Assistant' }).getAttribute('aria-current')).toBe('page');

    window.history.back();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(within(navigation()).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
  });

  it('opens from the dashboard’s AI Assistant card', async () => {
    mockServer();
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });

    fireEvent.click(screen.getByRole('link', { name: 'Open AI Assistant' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'AI Assistant' })).toBeTruthy();
  });

  it('opens straight to the assistant when the page is loaded at its address', async () => {
    window.history.replaceState(null, '', '/assistant');
    mockServer();

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'AI Assistant' })).toBeTruthy();
  });

  it('keeps the other pages reachable', async () => {
    await openAssistant({ [`GET /api/v1/organizations/${ACME.id}/tasks`]: () => json(200, { tasks: [] }) });

    fireEvent.click(within(navigation()).getByRole('link', { name: 'Tasks' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
  });
});

describe('AI Assistant page', () => {
  it('shows the message form and an empty response area, with no conversation history', async () => {
    const fetchMock = await openAssistant();

    expect(screen.getByText(/Ask about the customers, orders and tasks of/).textContent).toContain('Acme Logistics');
    expect(messageField().tagName).toBe('TEXTAREA');
    expect(screen.getByText('Up to 2000 characters.')).toBeTruthy();
    expect(responsePanel().getByText('Nothing asked yet')).toBeTruthy();
    expect(requestsTo(fetchMock, 'POST', ASSISTANT_URL)).toHaveLength(0);
  });

  it.each([
    ['an empty message', '', 'Enter a message.'],
    ['a blank message', '   \n ', 'Enter a message.'],
    ['a message over 2000 characters', 'a'.repeat(2001), 'Use 2000 characters or fewer.'],
  ])('rejects %s before calling the API, and focuses the field', async (_, message, error) => {
    const fetchMock = await openAssistant();

    send(message);

    expect(screen.getByText(error)).toBeTruthy();
    expect(messageField().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(messageField());
    expect(requestsTo(fetchMock, 'POST', ASSISTANT_URL)).toHaveLength(0);
  });

  it('sends only the trimmed message, and shows a loading state until the server answers', async () => {
    let finish;
    const fetchMock = await openAssistant({ [`POST ${ASSISTANT_URL}`]: () => new Promise((resolve) => (finish = resolve)) });

    send('  Which orders are still pending?  ');

    expect(sendButton().textContent).toBe('Sending…');
    expect(sendButton().matches(':disabled')).toBe(true);
    expect(messageField().matches(':disabled')).toBe(true);
    expect(responsePanel().getByText('Waiting for a response…').getAttribute('role')).toBe('status');
    const [[, init]] = requestsTo(fetchMock, 'POST', ASSISTANT_URL);
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ message: 'Which orders are still pending?' });

    finish(json(200, { reply: reply() }));

    expect(await responsePanel().findByText('No answer was generated')).toBeTruthy();
    expect(sendButton().textContent).toBe('Send');
    expect(messageField().matches(':disabled')).toBe(false);
  });

  it('shows the development response as no answer, not as something an AI said', async () => {
    await openAssistant();

    send('Which orders are still pending?');

    const panel = responsePanel();
    expect(await panel.findByText('No answer was generated')).toBeTruthy();
    expect(panel.getByText('Which orders are still pending?')).toBeTruthy();
    expect(panel.getByText(/No AI model is connected yet, so your message wasn’t sent to one/)).toBeTruthy();
    expect(panel.queryByText('Assistant')).toBeNull();

    const details = Object.fromEntries(
      [...screen.getByRole('region', { name: 'Response' }).querySelectorAll('dl > div')].map((row) => [
        row.querySelector('dt').textContent,
        row.querySelector('dd').textContent,
      ]),
    );
    expect(details).toEqual({
      Provider: 'Development (no AI model connected)',
      'Records read': 'None',
      'Can read': 'Customers, Orders, Tasks',
      'Suggested changes': 'None',
      'Needs approval': 'No',
      'Request ID': 'req-123',
    });
    expect(messageField().value).toBe('');
  });

  it('shows only the latest message and response', async () => {
    await openAssistant();

    send('First question');
    await responsePanel().findByText('First question');
    send('Second question');
    await responsePanel().findByText('Second question');

    expect(responsePanel().queryByText('First question')).toBeNull();
  });

  it('shows a completed reply as plain text, never as HTML', async () => {
    await openAssistant({
      [`POST ${ASSISTANT_URL}`]: replied({
        status: 'completed',
        text: '<img src=x onerror="alert(1)"> Two orders are pending.',
        provider: 'openai',
        toolCalls: [{ name: 'list_orders', readOnly: true }],
      }),
    });

    send('Which orders are still pending?');

    expect(await responsePanel().findByText('<img src=x onerror="alert(1)"> Two orders are pending.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Response' }).querySelector('img')).toBeNull();
    expect(responsePanel().getByText('Assistant')).toBeTruthy();
    expect(responsePanel().getByText('Orders')).toBeTruthy();
    expect(responsePanel().queryByText('No answer was generated')).toBeNull();
  });

  it.each([
    ['fails', () => apiError(500, 'INTERNAL_ERROR'), 'Something went wrong on our side. Please try again.'],
    ['cannot be reached', () => Promise.reject(new TypeError('Failed to fetch')), 'We couldn’t reach OpsPilot. Check your connection and try again.'],
    ['rejects the message', () => apiError(400, 'VALIDATION_FAILED'), 'Check your message and try again.'],
    ['gets no usable reply from the provider', () => apiError(502, 'AI_PROVIDER_ERROR'), 'The assistant couldn’t produce a reply. Please try again.'],
  ])('keeps the message and explains when the server %s', async (_, handler, message) => {
    await openAssistant({ [`POST ${ASSISTANT_URL}`]: handler });

    send('Which orders are still pending?');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(message);
    expect(alert.textContent).not.toMatch(/server message|INTERNAL_ERROR|AI_PROVIDER_ERROR/);
    expect(messageField().value).toBe('Which orders are still pending?');
    expect(messageField().matches(':disabled')).toBe(false);
    expect(document.activeElement).toBe(messageField());
    expect(responsePanel().getByText('Nothing asked yet')).toBeTruthy();
  });

  it('clears the error once a retry succeeds', async () => {
    let attempts = 0;
    await openAssistant({
      [`POST ${ASSISTANT_URL}`]: () => (++attempts === 1 ? apiError(503, 'SERVICE_UNAVAILABLE') : json(200, { reply: reply() })),
    });

    send('Which orders are still pending?');
    await screen.findByRole('alert');
    fireEvent.click(sendButton());

    expect(await responsePanel().findByText('No answer was generated')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('returns to sign-in when the session has expired', async () => {
    await openAssistant({ [`POST ${ASSISTANT_URL}`]: () => apiError(401, 'UNAUTHENTICATED') });

    send('Which orders are still pending?');

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('stores nothing in the browser', async () => {
    await openAssistant();

    send('Which orders are still pending?');
    await responsePanel().findByText('No answer was generated');

    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
