import { useSyncExternalStore } from 'react';

// Page navigation with the History API. There are only a few pages, so a router library would
// be more than this needs.
function subscribe(onChange) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname) return;

  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  document.documentElement.scrollTop = 0;
  // pushState and replaceState do not fire popstate themselves.
  window.dispatchEvent(new PopStateEvent('popstate'));
}
