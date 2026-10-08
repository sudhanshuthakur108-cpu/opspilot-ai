import { AppHeader } from '../../components/AppHeader.jsx';
import './SignedInScreen.css';

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member' };

// Temporary home for signed-in users with at least one organization, until the dashboard exists.
export function SignedInScreen({ organizations, createdOrganizationId }) {
  const created = organizations.find((organization) => organization.id === createdOrganizationId);

  return (
    <div className="app-shell">
      <AppHeader />

      <main className="app-main">
        <div className="home">
          {created && (
            <p className="alert alert--success home__notice" role="status">
              <strong>{created.name}</strong> is ready. You’re its owner.
            </p>
          )}

          <div className="home__header">
            <p className="eyebrow">{created ? 'Workspace created' : 'Welcome back'}</p>
            <h1 className="page-title">Your workspaces</h1>
          </div>

          <ul className="panel org-list" aria-label="Your organizations">
            {organizations.map((organization) => (
              <li key={organization.id} className="org-list__item">
                <span className="org-list__avatar" aria-hidden="true">
                  {organization.name.charAt(0).toUpperCase()}
                </span>
                <span className="org-list__details">
                  <span className="org-list__name">{organization.name}</span>
                  <span className="org-list__slug">{organization.slug}</span>
                </span>
                <span className={`role-badge role-badge--${organization.role}`}>
                  {ROLE_LABELS[organization.role] ?? organization.role}
                </span>
              </li>
            ))}
          </ul>

          <section className="home__next" aria-labelledby="next-title">
            <h2 id="next-title" className="home__next-title">
              Operations dashboard
            </h2>
            <p>Coming next. Your workspace’s day-to-day operations will live here.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
