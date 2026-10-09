import { useSyncExternalStore } from 'react';

// The theme preference: 'light' or 'dark' once the person picks one, otherwise 'system', which
// follows the operating system. Only the preference is stored, in this browser. index.html applies
// the same rule before the app loads, so the first paint already has the right theme.
const STORAGE_KEY = 'opspilot-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const listeners = new Set();

function readPreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

const systemTheme = () => (window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light');
const resolve = (preference) => (preference === 'system' ? systemTheme() : preference);

let preference = readPreference();

function apply({ animate = false } = {}) {
  const root = document.documentElement;
  // Colors change together for a moment, then transitions are off again so they never slow
  // down ordinary interactions.
  if (animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 250);
  }
  root.dataset.theme = resolve(preference);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  const media = window.matchMedia?.(DARK_QUERY);
  const onSystemChange = () => {
    if (preference === 'system') apply();
  };
  media?.addEventListener('change', onSystemChange);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', onSystemChange);
  };
}

export function setThemePreference(next) {
  preference = next;
  try {
    if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the choice still applies
    // until the page is reloaded.
  }
  apply({ animate: true });
}

// { preference, theme }: what was chosen, and the theme actually shown.
export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => `${preference}:${resolve(preference)}`);
  const [chosen, theme] = current.split(':');
  return { preference: chosen, theme };
}

apply();
