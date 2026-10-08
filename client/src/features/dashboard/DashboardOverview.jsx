import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Link } from '../../components/Link.jsx';
import './DashboardOverview.css';

// Orders and tasks do not exist yet, so their cards show an empty state.
const RECORD_CARDS = [
  {
    id: 'orders',
    title: 'Orders',
    icon: 'orders',
    emptyTitle: 'No orders yet',
    emptyText: 'Orders will appear here once your team starts recording them.',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    icon: 'tasks',
    emptyTitle: 'No tasks yet',
    emptyText: 'Tasks will appear here once you create your first one.',
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
          This is the home for <strong className="overview__organization">{organization.name}</strong>. Start by
          adding your customers; orders and tasks are coming next.
        </p>
      </div>

      <section className="overview__section" aria-labelledby="overview-title">
        <h2 id="overview-title" className="overview__section-title">
          Overview
        </h2>
        <ul className="overview__cards">
          <li className="overview-card">
            <h3 className="overview-card__title">
              <span className="overview-card__icon">
                <Icon name="customers" />
              </span>
              Customers
            </h3>
            <p className="overview-card__text">Keep a record of the people and businesses your team works with.</p>
            <Link className="overview-card__link" href="/customers">
              View customers <span aria-hidden="true">→</span>
            </Link>
          </li>

          {RECORD_CARDS.map((card) => (
            <li key={card.id} className="overview-card">
              <h3 className="overview-card__title">
                <span className="overview-card__icon">
                  <Icon name={card.icon} />
                </span>
                {card.title}
              </h3>
              <EmptyState title={card.emptyTitle} description={card.emptyText} />
            </li>
          ))}

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
