import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Link } from '../../components/Link.jsx';
import { canManageWorkspace } from '../organizations/roles.js';
import './DashboardOverview.css';

// Cards for the pages that exist. They link there rather than show counts.
const PAGE_CARDS = [
  {
    href: '/customers',
    title: 'Customers',
    icon: 'customers',
    text: 'Keep a record of the people and businesses your team works with.',
    linkText: 'View customers',
  },
  {
    href: '/orders',
    title: 'Orders',
    icon: 'orders',
    text: 'Record what your customers have ordered and track each order’s status.',
    linkText: 'View orders',
  },
  {
    href: '/tasks',
    title: 'Tasks',
    icon: 'tasks',
    text: 'Track the work your team needs to do, for a customer or order or on its own.',
    linkText: 'View tasks',
  },
  {
    href: '/assistant',
    title: 'AI Assistant',
    icon: 'assistant',
    badge: 'Read-only',
    text: 'Ask questions about your customers, orders and tasks. It can read your records but can’t change them.',
    linkText: 'Open AI Assistant',
  },
];

export function DashboardOverview({ organization, justCreated }) {
  const { user } = useAuth();
  // Accounts have no display name yet, so greet by the first part of the email address.
  const greetingName = user.email.split('@')[0];

  return (
    <div className="overview">
      {justCreated && (
        <p className="alert alert--success overview__notice" role="status">
          <strong>{organization.name}</strong> is ready. You’re its owner.
        </p>
      )}

      <div className="overview__welcome">
        <h2 className="overview__greeting">
          {justCreated ? 'Welcome' : 'Welcome back'}, {greetingName}
        </h2>
        <p className="lead">
          This is the home for <strong className="overview__organization">{organization.name}</strong>. Keep track
          of your customers, their orders and the work your team does for them.
        </p>
      </div>

      <section className="overview__section" aria-labelledby="overview-title">
        <h2 id="overview-title" className="overview__section-title">
          Overview
        </h2>
        <ul className="overview__cards">
          {PAGE_CARDS.map((card) => (
            <li key={card.href} className="overview-card">
              <div className="overview-card__header">
                <h3 className="overview-card__title">
                  <span className="overview-card__icon">
                    <Icon name={card.icon} />
                  </span>
                  {card.title}
                </h3>
                {card.badge && <span className="status-badge">{card.badge}</span>}
              </div>
              <p className="overview-card__text">{card.text}</p>
              <Link className="overview-card__link" href={card.href}>
                {card.linkText} <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="overview__section overview-panel" aria-labelledby="activity-title">
        <h2 id="activity-title" className="overview__section-title">
          Recent activity
        </h2>
        <EmptyState
          icon="activity"
          title="Activity is kept in the audit log"
          description={
            canManageWorkspace(organization.role)
              ? 'Important workspace changes, such as a new workspace name, are recorded there with who made them and when.'
              : 'Important workspace changes are recorded with who made them and when. Owners and admins can review them.'
          }
        >
          {canManageWorkspace(organization.role) && (
            <Link className="button button--secondary button--small" href="/audit-logs">
              View audit log
            </Link>
          )}
        </EmptyState>
      </section>
    </div>
  );
}
