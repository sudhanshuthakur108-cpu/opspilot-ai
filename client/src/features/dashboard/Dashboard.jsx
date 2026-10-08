import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '../../components/AppHeader.jsx';
import { DashboardOverview } from './DashboardOverview.jsx';
import { Icon } from './Icon.jsx';
import { Sidebar } from './Sidebar.jsx';
import './Dashboard.css';

const SIDEBAR_ID = 'dashboard-sidebar';
// Where the sidebar stops being a drawer; matches the breakpoint in Sidebar.css.
const WIDE_SCREEN = '(min-width: 768px)';

// The signed-in app frame for one organization: sidebar, header and the dashboard itself.
export function Dashboard({ organization, justCreated }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  // While the drawer is open, Escape closes it, and so does widening the window until the
  // sidebar is always shown. Once it closes, focus goes back to the menu button.
  useEffect(() => {
    if (!menuOpen) return undefined;

    const menuButton = menuButtonRef.current;
    const wideScreen = window.matchMedia?.(WIDE_SCREEN);
    const close = () => setMenuOpen(false);
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('keydown', closeOnEscape);
    wideScreen?.addEventListener('change', close);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      wideScreen?.removeEventListener('change', close);
      menuButton.focus();
    };
  }, [menuOpen]);

  return (
    <div className={menuOpen ? 'dashboard dashboard--menu-open' : 'dashboard'}>
      <a className="skip-link" href="#dashboard-main">
        Skip to content
      </a>

      <Sidebar
        id={SIDEBAR_ID}
        organization={organization}
        currentPage="dashboard"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      {menuOpen && <div className="dashboard__backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />}

      {/* Inert while the drawer is open, so keyboard and screen reader users stay inside it. */}
      <div className="dashboard__body" inert={menuOpen}>
        <AppHeader className="dashboard-header">
          <div className="dashboard-header__start">
            <button
              ref={menuButtonRef}
              type="button"
              className="icon-button dashboard-header__menu"
              aria-label="Open navigation"
              aria-controls={SIDEBAR_ID}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <div className="dashboard-header__heading">
              <p className="dashboard-header__context">{organization.name}</p>
              <h1 className="dashboard-header__title">Dashboard</h1>
            </div>
          </div>
        </AppHeader>

        <DashboardOverview organization={organization} justCreated={justCreated} />
      </div>
    </div>
  );
}
