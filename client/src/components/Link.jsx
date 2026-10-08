import { navigate } from '../routing.js';

// A normal link that switches pages without reloading. Modified clicks (new tab, new window)
// are left to the browser.
export function Link({ href, onClick, ...props }) {
  function handleClick(event) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(href);
  }

  return <a {...props} href={href} onClick={handleClick} />;
}
