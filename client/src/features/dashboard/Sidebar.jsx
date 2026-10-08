import { useEffect, useRef } from 'react';
import { useAuth } from '../../auth/authContext.js';
import { Brand } from '../../components/Brand.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Link } from '../../components/Link.jsx';
import { NAV_SECTIONS } from './navigation.js';
import './Sidebar.css';

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member' };

function NavItem({ item, current, onNavigate }) {
  const content = (
    <>
      <Icon name={item.icon} />
      <span className="sidebar__label">{item.label}</span>
    </>
  );

  if (!item.href) {
    return (
      <span className="sidebar__link sidebar__link--upcoming" title={`${item.label} (coming soon)`}>
        {content}
        <span className="sidebar__soon">Soon</span>
      </span>
    );
  }

  return (
    <Link
      className="sidebar__link"
      href={item.href}
      title={item.label}
      aria-current={current ? 'page' : undefined}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

// Persistent on wide screens, a compact icon rail on medium ones and a drawer on small ones,
// where `open` shows it and `onClose` hides it again.
export function Sidebar({ id, organization, currentPage, open, onClose }) {
  const { user } = useAuth();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (open) closeButtonRef.current.focus();
  }, [open]);

  return (
    <div id={id} className={open ? 'sidebar sidebar--open' : 'sidebar'}>
      <div className="sidebar__top">
        <Brand />
        <button
          ref={closeButtonRef}
          type="button"
          className="icon-button sidebar__close"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="sidebar__workspace" title={organization.name}>
        <span className="sidebar__avatar" aria-hidden="true">
          {organization.name.charAt(0).toUpperCase()}
        </span>
        <span className="sidebar__workspace-details">
          <span className="sidebar__workspace-name">{organization.name}</span>
          <span className="sidebar__workspace-role">{ROLE_LABELS[organization.role] ?? organization.role}</span>
        </span>
      </div>

      <nav className="sidebar__nav" aria-label="Main">
        {NAV_SECTIONS.map((section) => {
          const titleId = section.title ? `nav-${section.id}` : undefined;
          return (
            <div key={section.id} className="sidebar__section">
              {section.title && (
                <p id={titleId} className="sidebar__section-title">
                  {section.title}
                </p>
              )}
              <ul className="sidebar__list" aria-labelledby={titleId}>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <NavItem item={item} current={item.id === currentPage} onNavigate={onClose} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Only shown in the drawer: small screens have no room for the email in the header. */}
      <p className="sidebar__account">
        <span className="sidebar__account-label">Signed in as</span>
        <span className="sidebar__account-email">{user.email}</span>
      </p>
    </div>
  );
}
