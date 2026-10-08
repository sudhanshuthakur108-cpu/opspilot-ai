import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Link } from '../../components/Link.jsx';
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
          This is the home for <strong className="overview__organization">{organization.name}</strong>. Add your
          customers, then record their orders; tasks are coming next.
        </p>
      </div>

      <section className="overview__section" aria-labelledby="overview-title">
        <h2 id="overview-title" className="overview__section-title">
          Overview
        </h2>
        <ul className="overview__cards">
          {PAGE_CARDS.map((card) => (
            <li key={card.href} className="overview-card">
              <h3 className="overview-card__title">
                <span className="overview-card__icon">
                  <Icon name={card.icon} />
                </span>
                {card.title}
              </h3>
              <p className="overview-card__text">{card.text}</p>
              <Link className="overview-card__link" href={card.href}>
                {card.linkText} <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}

          <li className="overview-card">
            <h3 className="overview-card__title">
              <span className="overview-card__icon">
                <Icon name="tasks" />
              </span>
              Tasks
            </h3>
            <EmptyState title="No tasks yet" description="Tasks will appear here once you create your first one." />
          </li>

          <li className="overview-card overview-card--upcoming">
            <div className="overview-card__header">
              <h3 className="overview-card__title">
                <span className="overview-card__icon">
                  <Icon name="assistant" />
                </span>
                AI Assistant
              </h3>
              <span className="status-badge">Coming next</span>
            </div>
            <p className="overview-card__text">
              Summaries of your operations and suggested next steps, based on your workspace’s own records.
            </p>
          </li>
        </ul>
      </section>

      <section className="overview__section overview-panel" aria-labelledby="activity-title">
        <h2 id="activity-title" className="overview__section-title">
          Recent activity
        </h2>
        <EmptyState
          icon="activity"
          title="No activity yet"
          description="Changes your team makes in this workspace will appear here."
        />
      </section>
    </div>
  );
}
