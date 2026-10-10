import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { json, mockApi } from './testing/mockApi.js';
import { setThemePreference } from './theme.js';

const USER = { id: 'a'.repeat(24), email: 'ada@example.com', name: 'Ada Lovelace', createdAt: '2026-10-08T09:00:00.000Z' };
const ACME = { id: 'b'.repeat(24), name: 'Acme', slug: 'acme', role: 'owner', createdAt: '2026-10-08T09:30:00.000Z' };

// A stand-in for the browser's dark-mode media query, which jsdom does not have.
function stubSystemTheme(dark) {
  const listeners = new Set();
  const query = {
    matches: dark,
    addEventListener: (type, listener) => listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', (media) => (media === '(prefers-color-scheme: dark)' ? query : { matches: false, addEventListener() {}, removeEventListener() {} }));
  return {
    change(nextDark) {
      query.matches = nextDark;
      listeners.forEach((listener) => listener());
    },
  };
}

async function openSettings() {
  mockApi({
    'GET /api/v1/auth/me': () => json(200, { user: USER }),
    'GET /api/v1/organizations': () => json(200, { organizations: [ACME] }),
  });
  window.history.replaceState(null, '', '/settings');
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
}

const appearance = () => within(screen.getByRole('region', { name: 'Appearance' }));
const theme = () => document.documentElement.dataset.theme;

beforeEach(() => {
  window.localStorage.clear();
  setThemePreference('system');
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setThemePreference('system');
  window.localStorage.clear();
});

describe('theme', () => {
  it('follows the system preference until the person picks a theme', async () => {
    const system = stubSystemTheme(true);
    setThemePreference('system');
    await openSettings();

    expect(theme()).toBe('dark');
    expect(appearance().getByRole('radio', { name: /System/ }).checked).toBe(true);

    system.change(false);

    expect(theme()).toBe('light');
  });

  it('switches from the header and remembers the choice in this browser', async () => {
    stubSystemTheme(false);
    await openSettings();
    const toggle = within(screen.getByRole('banner')).getByRole('button', { name: 'Switch to dark theme' });

    fireEvent.click(toggle);

    expect(theme()).toBe('dark');
    expect(window.localStorage.getItem('opspilot-theme')).toBe('dark');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
    expect(appearance().getByRole('radio', { name: /Dark/ }).checked).toBe(true);
  });

  it('lets Settings choose light, dark or the system theme again', async () => {
    stubSystemTheme(true);
    await openSettings();

    fireEvent.click(appearance().getByRole('radio', { name: /Light/ }));
    expect(theme()).toBe('light');
    expect(window.localStorage.getItem('opspilot-theme')).toBe('light');

    fireEvent.click(appearance().getByRole('radio', { name: /System/ }));
    expect(theme()).toBe('dark');
    expect(window.localStorage.getItem('opspilot-theme')).toBeNull();
  });

  it('keeps working when the browser refuses to store the choice', async () => {
    stubSystemTheme(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage is disabled');
    });
    await openSettings();

    fireEvent.click(appearance().getByRole('radio', { name: /Dark/ }));

    expect(theme()).toBe('dark');
  });
});
