import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '../../components/AppHeader.jsx';
import { Icon } from '../../components/Icon.jsx';
import { navigate, usePathname } from '../../routing.js';
import { CustomersPage } from '../customers/CustomersPage.jsx';
import { OrdersPage } from '../orders/OrdersPage.jsx';
import { DashboardOverview } from './DashboardOverview.jsx';
import { Sidebar } from './Sidebar.jsx';
import './Dashboard.css';

const SIDEBAR_ID = 'dashboard-sidebar';
// Where the sidebar stops being a drawer; matches the breakpoint in Sidebar.css.
const WIDE_SCREEN = '(min-width: 768px)';

// Pages by path; `id` matches the sidebar entries in navigation.js.
const PAGES = {
  '/': { id: 'dashboard', title: 'Dashboard' },
  '/customers': { id: 'customers', title: 'Customers' },
  '/orders': { id: 'orders', title: 'Orders' },
};

// The signed-in app frame for one organization: sidebar, header and the current page.
export function Dashboard({ organization, justCreated }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const pathname = usePathname();
  const page = PAGES[pathname];

  // An unknown address falls back to the dashboard.
  useEffect(() => {
    if (!page) navigate('/', { replace: true });
  }, [page]);

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
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <Sidebar
        id={SIDEBAR_ID}
        organization={organization}
        currentPage={page?.id}
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
              <h1 className="dashboard-header__title">{page?.title ?? 'Dashboard'}</h1>
            </div>
          </div>
        </AppHeader>

        <main id="main-content" className="dashboard__main" tabIndex={-1}>
          {page?.id === 'customers' && <CustomersPage organization={organization} />}
          {page?.id === 'orders' && <OrdersPage organization={organization} />}
          {(!page || page.id === 'dashboard') && (
            <DashboardOverview organization={organization} justCreated={justCreated} />
          )}
        </main>
      </div>
    </div>
  );
}
