import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';
import './DashboardOverview.css';

// No customer, order or task records exist yet, so each card shows its empty state. Real
// counts replace them once those APIs are built.
const RECORD_CARDS = [
  {
    id: 'customers',
    title: 'Customers',
    icon: 'customers',
    emptyTitle: 'No customers yet',
    emptyText: 'Customers will appear here once you add them.',
  },
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
    <main id="dashboard-main" className="overview" tabIndex={-1}>
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
          This is the home for <strong className="overview__organization">{organization.name}</strong>. Customers,
          orders and tasks will show up here as your team adds them.
        </p>
      </div>

      <section className="overview__section" aria-labelledby="overview-title">
        <h2 id="overview-title" className="overview__section-title">
          Overview
        </h2>
        <ul className="overview__cards">
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
    </main>
  );
}
